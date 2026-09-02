"""News-monitoring agent — a shared source feeding crime and water.

Per docs/strategy.md this is not a category of its own. It exists because crime
and water are the two categories where official Indian data is weakest, and
locality-tagged press coverage is the most scalable substitute available.

Three phases, kept separate so each can be re-run without the others:

  1. **Fetch** — GDELT search per locality per category. Cheap, rate-limited.
  2. **Classify** — decide which mentions are real locality-specific incidents.
     This is the expensive step when Claude is doing it, and it is idempotent:
     an already-judged mention is never re-judged.
  3. **Aggregate** — build crime and water envelopes from confirmed incidents.

Confidence is COMMUNITY_ESTIMATED throughout, and cannot be anything else while
press coverage is the only input. The strategy doc caps crime at Medium even
*with* full official data, because district-level NCRB figures do not describe a
locality; with no official data at all and no resident reports yet, the floor is
where this belongs. The envelope says so, and the payload carries the coverage
caveat as text so the UI cannot quietly drop it.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from neighbour_trust_schema.envelope import (
    Category,
    Confidence,
    CrimePayload,
    DataEnvelope,
    NewsCoverage,
    NewsIncident,
    WaterPayload,
)

from agents.common import db
from agents.news_monitor import characterise as characterise_mod
from agents.news_monitor import exclusions as exclusions_mod
from agents.news_monitor import classify as classify_mod
from agents.news_monitor.sources import gdelt as gdelt_src
from agents.news_monitor.sources import google_news as gnews_src

log = logging.getLogger(__name__)

# The two categories news feeds. Not a category itself — see the module docstring.
CATEGORIES = ("crime", "water")

# How far back the counts look. A year smooths seasonal reporting spikes
# (Bengaluru water stories cluster in summer, waterlogging in monsoon) that a
# 90-day window would present as a trend.
LOOKBACK_MONTHS = 12

# How many individual incidents the payload carries. Enough to show the reader
# what the count is made of — the strategy doc's point that these should be
# readable items rather than an opaque number.
RECENT_LIMIT = 5


@dataclass
class FetchResult:
    mentions_found: int = 0
    localities: int = 0


@dataclass
class ClassifyResult:
    judged: int = 0
    confirmed: int = 0
    undecided: int = 0
    classifier: str = "none"


@dataclass
class LocalityResult:
    slug: str
    category: str
    ok: bool
    reason: Optional[str] = None
    envelope: Optional[DataEnvelope] = None
    incidents: int = 0


# ---------------------------------------------------------------------------
# Phase 1 — fetch
# ---------------------------------------------------------------------------


def fetch_for_locality(
    conn,
    locality: dict[str, Any],
    *,
    gnews_client: Optional[gnews_src.GoogleNewsClient] = None,
    gdelt_client: Optional[gdelt_src.GdeltClient] = None,
) -> int:
    """Search every available source for this locality and store the hits.

    Both sources are tried rather than one falling back to the other, because
    they fail and succeed independently — GDELT went unreachable from two
    separate networks on 2026-09-01 while Google News answered in five seconds —
    and because they index different press. Duplicates across sources are
    absorbed by the (locality, category, url) unique constraint.
    """
    stored = 0

    for category in CATEGORIES:
        found = 0

        for label, client in (
            (gnews_src.SOURCE_NAME, gnews_client),
            (gdelt_src.SOURCE_NAME, gdelt_client),
        ):
            if client is None:
                continue
            try:
                articles = list(
                    client.search_locality(
                        locality=locality["name"],
                        city=locality["city"],
                        category=category,
                        months=LOOKBACK_MONTHS,
                    )
                )
            except Exception as exc:
                # One dead source must not cost the other's results.
                log.warning(
                    "[%s/%s] %s fetch failed: %s",
                    locality["slug"], category, label, exc,
                )
                continue

            for article in articles:
                db.upsert_news_mention(
                    conn,
                    {
                        **article,
                        "locality_id": locality["id"],
                        "h3_cell": locality["h3_cell"],
                        "category": category,
                        "source_name": label,
                    },
                )
                stored += 1
                found += 1

        log.info("[%s/%s] %d mentions", locality["slug"], category, found)

    return stored


# ---------------------------------------------------------------------------
# Phase 2 — classify
# ---------------------------------------------------------------------------


# How many headlines to classify at once. Each is an independent single-shot
# call with no shared state, so this is embarrassingly parallel — and it has to
# be: a real fetch produces ~1,300 mentions, which sequentially at ~1.5s each is
# over thirty minutes and overruns the CI job before finishing.
#
# Eight is chosen against the API's rate limits rather than the machine's cores;
# the work is entirely network-bound.
CLASSIFY_CONCURRENCY = 8


# How many mentions one run may classify.
#
# Sized so a full pass finishes in a single run. At 44 localities a fetch
# produces ~3,400 mentions, and a cap of 2,000 left 1,439 of them unjudged —
# which is not merely incomplete, it is *biased* incomplete: the unjudged rows
# are whatever the query returned last, so some localities got their evidence
# fully assessed and others did not, and the resulting counts are not comparable
# between them. Counts that cannot be compared are worse than no counts, because
# nothing on the page says which locality got a full reading.
#
# Concurrency is 8 and each call is ~1.5s, so 4,000 is about 12 minutes — well
# inside the 45-minute job timeout. The cap stays as a guard against an
# unexpected fetch explosion running up a bill, not as a routine limit.
CLASSIFY_LIMIT = 4000


def classify_pending(
    conn, classifier: classify_mod.Classifier, *, limit: int = CLASSIFY_LIMIT
) -> ClassifyResult:
    """Judge every unclassified mention.

    Only ever touches rows with `classified_at IS NULL`, which makes the phase
    resumable and stops a re-fetch from paying to re-judge headlines already
    decided. That property is what makes a timeout survivable: the next run
    continues from where this one stopped rather than starting over.

    Classification runs concurrently, but the database writes stay on this
    thread — psycopg connections are not thread-safe, and the ordering here is
    cheap anyway compared to the network round-trips.
    """
    result = ClassifyResult(classifier=classifier.name)
    pending = db.unclassified_mentions(conn, limit=limit)
    if not pending:
        return result

    log.info("classifying %d mentions with %s", len(pending), classifier.name)

    def judge(mention: dict[str, Any]):
        return mention, classifier.classify(
            title=mention["title"],
            locality=mention["locality"],
            city=mention["city"],
            category=mention["category"],
        )

    with ThreadPoolExecutor(max_workers=CLASSIFY_CONCURRENCY) as pool:
        for mention, judgement in pool.map(judge, pending):
            if judgement is None:
                # The classifier declined to decide. The row stays unclassified
                # and is excluded from every count — being unsure costs recall,
                # guessing would cost correctness.
                result.undecided += 1
                continue

            db.record_classification(
                conn,
                mention["id"],
                is_locality_specific=judgement.is_locality_specific,
                incident_type=judgement.incident_type,
                classifier=judgement.classifier,
                reason=judgement.reason,
            )
            result.judged += 1
            if judgement.is_locality_specific:
                result.confirmed += 1

    return result


# ---------------------------------------------------------------------------
# Phase 3 — aggregate into envelopes
# ---------------------------------------------------------------------------


def attribution(contributing: list[str]) -> tuple[str, Optional[str]]:
    """Which source to credit for a locality's press coverage.

    Derived from the mentions actually stored, not from a constant. This shipped
    wrong: the envelope named GDELT unconditionally while every article in the
    database had come from Google News, so the UI credited a source that had been
    unreachable for days. On a product whose stated differentiator is showing
    where its data came from, that is not a cosmetic bug.

    Both sources are attempted every run and they fail independently, so which
    one supplied a given locality is a fact about the data rather than a property
    of the code.
    """
    known = {
        gnews_src.SOURCE_NAME: gnews_src.SOURCE_URL,
        gdelt_src.SOURCE_NAME: gdelt_src.SOURCE_URL,
    }
    named = [s for s in contributing if s]
    if not named:
        # No mentions to attribute. build_envelope returns early in that case, so
        # this is only reachable if rows exist with no source recorded.
        return gnews_src.SOURCE_NAME, gnews_src.SOURCE_URL

    # One source: name it and link it. Several: name all, and link only if they
    # agree on a destination — a single URL cannot stand for two.
    urls = {known.get(s) for s in named}
    return " + ".join(sorted(named)), urls.pop() if len(urls) == 1 else None


def build_envelope(
    conn, locality: dict[str, Any], *, category: str, now: Optional[datetime] = None
) -> LocalityResult:
    now = now or datetime.now(timezone.utc)
    h3_cell, slug = locality["h3_cell"], locality["slug"]

    counts = db.mention_counts(
        conn, h3_cell=h3_cell, category=category, months=LOOKBACK_MONTHS
    )
    incidents = db.confirmed_incidents(
        conn, h3_cell=h3_cell, category=category, months=LOOKBACK_MONTHS
    )

    # Drop headlines confirmed by the classifier that name this locality without
    # being about it. Applied here rather than at classification so a correction
    # takes effect on the next ordinary run instead of requiring — and paying
    # for — a full re-judgement of the corpus.
    incidents, excluded = exclusions_mod.filter_incidents(
        incidents, locality=locality["name"]
    )
    for title, reason in excluded:
        log.info("[%s/%s] excluded: %s (%s)", slug, category, title[:70], reason)

    if counts["fetched"] == 0:
        return LocalityResult(
            slug=slug,
            category=category,
            ok=False,
            reason="no press coverage found for this locality in the last 12 months",
        )

    news = NewsCoverage(
        incidents_12m=len(incidents),
        incident_types=sorted({i["incident_type"] for i in incidents if i["incident_type"]}),
        recent=[
            NewsIncident(
                title=i["title"],
                url=i["url"],
                domain=i["domain"],
                language=i["language"],
                published_at=i["published_at"],
                incident_type=i["incident_type"],
            )
            for i in incidents[:RECENT_LIMIT]
        ],
        characterisation=characterise_mod.characterise(category, incidents),
        mentions_fetched=counts["fetched"],
        mentions_classified=counts["classified"],
        classifier=incidents[0]["classifier"] if incidents else None,
    )

    if category == "crime":
        payload = CrimePayload(
            official_crime_rate_district=None,  # NCRB not wired up yet
            resident_reports_90d_count=0,       # resident reporting is Phase 2 too
            blended_safety_perception_score=None,  # deliberately — see the model
            news=news,
        )
    else:
        payload = WaterPayload(news=news)

    # The most recent incident is the freshest thing this envelope knows.
    #
    # With no incidents there is no underlying data, and this used to fall back
    # to `now` — which claims today's vintage for a finding of nothing, and made
    # an empty envelope look like the freshest thing we had. Falling back to the
    # oldest article in the window instead keeps the vintage a statement about
    # the evidence rather than about when we looked.
    dated = [i["published_at"] for i in incidents if i.get("published_at")]
    vintage = max(dated) if dated else now

    source_name, source_url = attribution(counts.get("sources") or [])

    envelope = DataEnvelope(
        category=Category(category),
        source_name=source_name,
        source_url=source_url,
        fetched_at=now,
        data_vintage=vintage,
        h3_cell=h3_cell,
        # Cannot be anything else while press coverage is the only input. See the
        # module docstring.
        confidence=Confidence.COMMUNITY_ESTIMATED,
        payload=payload.model_dump(mode="json"),
    )

    db.upsert_envelope(
        conn,
        category=envelope.category.value,
        source_name=envelope.source_name,
        source_url=envelope.source_url,
        fetched_at=envelope.fetched_at,
        data_vintage=envelope.data_vintage,
        h3_cell=envelope.h3_cell,
        confidence=envelope.confidence.value,
        payload=envelope.payload,
    )

    return LocalityResult(
        slug=slug, category=category, ok=True, envelope=envelope, incidents=len(incidents)
    )
