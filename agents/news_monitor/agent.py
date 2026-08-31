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
from agents.news_monitor import classify as classify_mod
from agents.news_monitor.sources import gdelt as gdelt_src

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
    conn, client: gdelt_src.GdeltClient, locality: dict[str, Any]
) -> int:
    """Search GDELT for this locality across both categories and store the hits."""
    stored = 0
    for category in CATEGORIES:
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
            log.warning("[%s/%s] GDELT fetch failed: %s", locality["slug"], category, exc)
            continue

        for article in articles:
            db.upsert_news_mention(
                conn,
                {
                    **article,
                    "locality_id": locality["id"],
                    "h3_cell": locality["h3_cell"],
                    "category": category,
                    "source_name": gdelt_src.SOURCE_NAME,
                },
            )
            stored += 1

        log.info("[%s/%s] %d mentions", locality["slug"], category, len(articles))

    return stored


# ---------------------------------------------------------------------------
# Phase 2 — classify
# ---------------------------------------------------------------------------


def classify_pending(
    conn, classifier: classify_mod.Classifier, *, limit: int = 500
) -> ClassifyResult:
    """Judge every unclassified mention.

    Only ever touches rows with `classified_at IS NULL`, which makes the whole
    phase resumable and stops a weekly re-fetch from paying to re-judge headlines
    that were already decided.
    """
    result = ClassifyResult(classifier=classifier.name)

    for mention in db.unclassified_mentions(conn, limit=limit):
        judgement = classifier.classify(
            title=mention["title"],
            locality=mention["locality"],
            city=mention["city"],
            category=mention["category"],
        )
        if judgement is None:
            # The classifier declined to decide. The row stays unclassified and
            # is excluded from every count — being unsure costs recall, guessing
            # would cost correctness.
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

    # The most recent incident is the freshest thing this envelope knows. With no
    # incidents, the fetch itself is the only vintage there is.
    vintage = (
        incidents[0]["published_at"]
        if incidents and incidents[0]["published_at"]
        else now
    )

    envelope = DataEnvelope(
        category=Category(category),
        source_name=gdelt_src.SOURCE_NAME,
        source_url=gdelt_src.SOURCE_URL,
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
