"""Neighbour Trust API.

Phase 1 surface area is deliberately small: list localities, and serve the air
quality envelope for one. The composite Trust Score, the other five categories
and the Q&A endpoint are Phase 2/3 — see docs/build-roadmap.md.

Run from the repo root:
    uvicorn apps.api.app.main:app --reload
"""

from __future__ import annotations

import hmac
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agents.common import db, freshness  # noqa: E402
from agents.orchestrator import agent as orchestrator  # noqa: E402
from agents.orchestrator import score as score_mod  # noqa: E402
from apps.api.app.schools_verdict import build_verdict as build_schools_verdict  # noqa: E402
from apps.api.app.verdict import build_verdict  # noqa: E402
from apps.api.app.accounts import router as accounts_router  # noqa: E402
from apps.api.app.locality_requests import router as locality_requests_router  # noqa: E402

app = FastAPI(
    title="Neighbour Trust API",
    version="0.1.0",
    description="Sourced, confidence-tagged neighbourhood data for Bengaluru and Gurugram.",
)

# Allowed browser origins. Local dev origins are always permitted; production
# ones come from CORS_ALLOWED_ORIGINS (comma-separated) so deploying to a new
# domain is an environment variable rather than a code change — one less thing to
# forget at 2am, and one less reason to reach for a wildcard.
_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
_EXTRA_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# Accounts: shortlist, notes, compare. Called by the web app's server only —
# see apps/api/app/accounts.py for why the browser never reaches these.
app.include_router(accounts_router)
# Anonymous "please cover this place" requests. See locality_requests.py.
app.include_router(locality_requests_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_ORIGINS + _EXTRA_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Response models — the API's contract, mirroring packages/schema.
# ---------------------------------------------------------------------------


class Locality(BaseModel):
    slug: str
    name: str
    city: str
    state: str
    pincode: Optional[str] = None
    h3_cell: str
    lat: float
    lon: float
    categories_with_data: int = Field(
        0,
        description="How many categories hold data here. Shown on the "
        "index so a visitor can see what a locality offers before opening it, "
        "rather than discovering it is thin after a click.",
    )


class CoverageStats(BaseModel):
    """What this deployment actually holds. Every field is a row count.

    The home page states its own coverage from this rather than from constants,
    so the claim on the page cannot drift from the database behind it.
    """

    localities: int
    cities: int
    schools: int
    air_readings: int
    air_since: Optional[date] = None
    headlines_screened: int
    incidents_confirmed: int
    sources: int
    source_names: list[str] = []
    categories_live: int
    last_update: Optional[datetime] = None


class Verdict(BaseModel):
    headline: str
    eyebrow: str
    band_label: str
    score: int = Field(..., ge=0, le=100, description="0-100 category score for the meter.")
    trend_direction: Optional[str] = None
    caveat: str


class AirQualityResponse(BaseModel):
    """One category envelope plus the presentation layer the card needs.

    `envelope` is the stored DataEnvelope verbatim — same shape every agent
    writes. `verdict` is derived, never stored, so changing the copy never means
    a backfill.
    """

    locality: Locality
    category: str
    source_name: str
    source_url: Optional[str] = None
    fetched_at: str
    data_vintage: str
    h3_cell: str
    confidence: str
    # True when the reading is past its freshness window: real, dated, and no
    # longer a description of current air. The card leads with the date and the
    # Trust Score excludes it. Defaults false so a caller that ignores the field
    # sees the ordinary case.
    historical: bool = False
    historical_note: Optional[str] = None
    payload: dict[str, Any]
    verdict: Verdict


class NoDataResponse(BaseModel):
    locality: Locality
    category: str
    available: bool = False
    reason: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


# HEAD as well as GET, because that is how uptime monitors ask.
#
# FastAPI's @app.get registers GET alone — unlike plain Starlette, it does not
# add HEAD — so a HEAD probe got 405 with `Allow: GET`. UptimeRobot uses HEAD by
# default, which meant the first monitor pointed at this endpoint reported the
# service down while it was serving every real request in under a second. An
# uptime check that reports a healthy service as down is worse than none: it
# trains you to ignore the alert that matters.
#
# HEAD costs the same as GET here — Starlette discards the body — so the health
# check still does its real database round-trip either way.
@app.api_route("/healthz", methods=["GET", "HEAD"])
def healthz() -> dict[str, Any]:
    """Liveness, a real database round-trip, and per-category ingestion health.

    Three failure modes, each invisible to the one above it:

      1. The service is up but the database is unreachable — a health check that
         never touches the DB reports green while every request 500s.
      2. The scheduler has stopped. Stale rows keep serving happily, so from the
         outside "the data looks a bit old" is indistinguishable from "the job
         has been crashing for nine days".
      3. **The scheduler is running fine and storing nothing.** On 2026-08-31 the
         air quality job completed cleanly with `localities_ok: 0`, because the
         upstream CPCB feed had stopped publishing and every locality was
         correctly skipped. The earlier version of this endpoint reported
         `stale: false` throughout — it measured whether a run had *finished*,
         not whether it had *produced* anything.

    `stale` now keys off the last run that actually stored data, and `last_run`
    is reported separately so a productive-but-old system can be told apart from
    a busy-but-empty one.
    """
    # Every category with a scheduled agent behind it.
    #
    # "crime" was missing, so the news agent — which writes both crime and water
    # — was invisible here. Two news runs were triggered without any way to see
    # from /healthz whether either had happened, which is precisely the question
    # this endpoint exists to answer. The news agent records its runs under
    # "crime"; "water" comes from the same pass and would double-count it.
    categories = ("air_quality", "schools", "crime")
    try:
        with db.connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM locality").fetchone()["n"]
            health = {
                category: _ingest_health(conn, category)
                for category in categories
            }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unavailable: {exc}") from exc

    degraded = [name for name, info in health.items() if info["stale"]]
    return {
        # Still 200 with degraded categories named, rather than 503: the API is
        # serving correctly, and an uptime check should distinguish "this service
        # is down" from "an upstream data source stopped".
        "status": "degraded" if degraded else "ok",
        "degraded_categories": degraded,
        "localities": count,
        "ingest": health,
    }


# How old the last data-producing run may be before a category counts as stale.
# Two missed cycles each: one is a blip, two is a pattern.
_STALE_AFTER = {
    "air_quality": timedelta(hours=2, minutes=30),
    "schools": timedelta(days=15),
    # News runs daily at 04:23 UTC. A flat 24 hours would flip this to stale in
    # the minutes before each run and clear it again straight after, so the
    # threshold carries a day of headroom: it should fire when a run has actually
    # been missed, not when one is merely due.
    "crime": timedelta(days=2),
}


def _ingest_health(conn: Any, category: str) -> dict[str, Any]:
    productive = db.last_productive_ingest(conn, category=category)
    latest = db.last_ingest_run(conn, category=category)
    now = datetime.now(timezone.utc)
    threshold = _STALE_AFTER.get(category, timedelta(days=1))

    info: dict[str, Any] = {
        "last_productive_run": None,
        "age_minutes": None,
        "stale": True,
        "last_run": None,
    }

    if productive is not None and productive["finished_at"] is not None:
        age = now - productive["finished_at"]
        info["last_productive_run"] = productive["finished_at"].isoformat()
        info["age_minutes"] = round(age.total_seconds() / 60)
        info["localities_ok"] = productive["localities_ok"]
        info["stale"] = age > threshold

    if latest is not None:
        info["last_run"] = {
            "started_at": latest["started_at"].isoformat(),
            "status": latest["status"],
            "localities_ok": latest["localities_ok"],
            "localities_skipped": latest["localities_skipped"],
            "error": latest["error"],
        }
        # Running but producing nothing is its own diagnosis, and the most
        # confusing one to hit without a name for it.
        if latest["status"] == "ok" and latest["localities_ok"] == 0:
            info["note"] = (
                "Most recent run completed but stored nothing — every locality was "
                "skipped. Usually means the upstream feed has stopped publishing."
            )

    return info


@app.get("/api/v1/stats", response_model=CoverageStats)
def get_stats() -> dict[str, Any]:
    """Coverage figures for the home page. Cheap — ten counts on indexed tables."""
    with db.connect() as conn:
        return db.coverage_stats(conn)


# The /debug endpoints are operational tools, not public API. They were
# reachable by anyone who could reach the service, and /debug/report returned a
# server-side stack trace (absolute paths, module chain, the database driver
# error). Now they require DEBUG_TOKEN: unset means the endpoints are disabled
# and answer 404 like any unknown path, so nothing is exposed by default; set
# it (and send it as `x-debug-token`) to use them.
def _require_debug_access(request: Request) -> None:
    token = os.environ.get("DEBUG_TOKEN", "")
    supplied = request.headers.get("x-debug-token", "")
    # A 404 rather than 401/403: an operator with the token knows the path, and
    # anyone without it learns nothing about whether the endpoint exists.
    if not token or not hmac.compare_digest(supplied, token):
        raise HTTPException(status_code=404, detail="Not Found")


@app.get("/debug/classification")
def get_classification_state(request: Request) -> dict[str, Any]:
    """Where every news mention sits in the classify pipeline.

    Operational, not part of the public API — gated by DEBUG_TOKEN. It exists
    because the pipeline has three independent nullable columns — classifier,
    classified_at, is_locality_specific — and their combinations distinguish
    "never judged" from "queued for re-judgement" from "verdict destroyed".
    Guessing which one a symptom means, from run logs, produced two wrong
    diagnoses in a row.
    """
    _require_debug_access(request)
    with db.connect() as conn:
        return db.classification_state(conn)


class LocalitySummary(BaseModel):
    """One locality, with enough of its report to answer a search.

    Exists so a search result can state what the place is like rather than only
    name it. Listing forty-four names and making someone click to find out is a
    directory; the product is supposed to answer the question they typed.
    """

    slug: str
    name: str
    city: str
    state: str
    pincode: Optional[str] = None
    # Sent so the browser can match a reader's own position against the list it
    # already has, without their coordinates ever reaching this server. Omitting
    # these was also a quiet trap: the frontend's Locality type carries lat/lon
    # and defaulted them to 0, so every locality on the index believed it was in
    # the Atlantic off West Africa.
    lat: float
    lon: float
    categories_with_data: int = 0
    score: Optional[int] = Field(
        None, description="None when too few categories can be scored — shown as "
        "such rather than as a zero or a blank."
    )
    scored_categories: list[str] = Field(
        default_factory=list,
        description=(
            "Labels of the categories actually behind `score`, in report order. "
            "Sent because the search card has to say what the number covers, and "
            "the alternative was the frontend guessing — which it did, with a "
            "hardcoded 'air+schools' that contradicted every locality page once "
            "safety and connectivity began to count."
        ),
    )
    top_flag: Optional[Flag] = Field(
        None, description="The most serious thing found here, if anything was."
    )


@app.get("/api/v1/localities/summary", response_model=list[LocalitySummary])
def get_locality_summaries() -> list[dict[str, Any]]:
    """Every locality with its score and worst flag.

    Builds each report rather than storing a summary: the scoring rules and flag
    thresholds change often, and a stored copy would drift from the reports it
    claims to summarise. Cached at the edge instead — see the frontend's
    revalidate — so the cost is paid once every few minutes rather than per
    visitor.
    """
    out: list[dict[str, Any]] = []
    with db.connect() as conn:
        coverage = db.coverage_by_cell(conn)
        for locality in db.list_localities(conn):
            report = orchestrator.build_report(conn, locality)
            flags = report.flags
            out.append(
                {
                    "slug": locality["slug"],
                    "name": locality["name"],
                    "city": locality["city"],
                    "state": locality["state"],
                    "pincode": locality.get("pincode"),
                    "lat": locality["lat"],
                    "lon": locality["lon"],
                    "categories_with_data": coverage.get(locality["h3_cell"], 0),
                    "score": report.trust_score.score,
                    # From the same report object the locality page renders, so
                    # the two views cannot disagree about how the number was
                    # built.
                    "scored_categories": [
                        score_mod.LABELS.get(c.category, c.category)
                        for c in report.trust_score.categories
                        if c.counted
                    ],
                    "top_flag": flags[0] if flags else None,
                }
            )
    return out


@app.get("/api/v1/localities", response_model=list[Locality])
def get_localities() -> list[dict[str, Any]]:
    with db.connect() as conn:
        localities = db.list_localities(conn)
        coverage = db.coverage_by_cell(conn)
    for locality in localities:
        locality["categories_with_data"] = coverage.get(locality["h3_cell"], 0)
    return localities


@app.get(
    "/api/v1/localities/{slug}/air-quality",
    response_model=AirQualityResponse,
    responses={404: {"model": NoDataResponse}},
)
def get_air_quality(slug: str) -> dict[str, Any]:
    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")

        envelope = db.latest_envelope(conn, category="air_quality", h3_cell=locality["h3_cell"])

    if envelope is None:
        # A deliberate 404 with an explanation rather than an empty 200. "We have
        # no data here" is a real answer this product is supposed to give out
        # loud, and the frontend renders it as such.
        raise HTTPException(
            status_code=404,
            detail={
                "locality": locality,
                "category": "air_quality",
                "available": False,
                "reason": (
                    "No air quality data stored for this locality yet. "
                    "Run: python -m agents.air_quality.run"
                ),
            },
        )

    # Staleness is the one property of a stored value that changes with nobody
    # writing to it, so it is evaluated here rather than trusted from write time.
    # See agents/common/freshness.py.
    fresh = freshness.evaluate(
        category="air_quality",
        stored_confidence=envelope["confidence"],
        data_vintage=envelope["data_vintage"],
    )
    if fresh.withhold:
        raise HTTPException(
            status_code=404,
            detail={
                "locality": locality,
                "category": "air_quality",
                "available": False,
                "reason": fresh.reason,
            },
        )

    payload = envelope["payload"]
    confidence = fresh.confidence.value
    return {
        "locality": locality,
        "category": envelope["category"],
        "source_name": envelope["source_name"],
        "source_url": envelope["source_url"],
        "fetched_at": envelope["fetched_at"].isoformat(),
        "data_vintage": envelope["data_vintage"].isoformat(),
        "h3_cell": envelope["h3_cell"],
        "confidence": confidence,
        # A reading past its freshness window is served with its date rather
        # than withheld: CPCB stopping publication should not blank the card for
        # 19 localities that have a real, dated measurement. The flag is what
        # tells the frontend to lead with the date, and what keeps the value out
        # of the Trust Score.
        "historical": fresh.historical,
        "historical_note": fresh.reason if fresh.historical else None,
        "payload": payload,
        "verdict": build_verdict(payload, confidence),
    }


class SchoolsVerdict(BaseModel):
    headline: str
    eyebrow: str
    score: int = Field(..., ge=0, le=100)
    caveat: str
    quality_disclaimer: str


class SchoolsResponse(BaseModel):
    locality: Locality
    category: str
    source_name: str
    source_url: Optional[str] = None
    fetched_at: str
    data_vintage: str
    h3_cell: str
    confidence: str
    payload: dict[str, Any]
    verdict: SchoolsVerdict


@app.get(
    "/api/v1/localities/{slug}/schools",
    response_model=SchoolsResponse,
    responses={404: {"model": NoDataResponse}},
)
def get_schools(slug: str) -> dict[str, Any]:
    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")

        envelope = db.latest_envelope(conn, category="schools", h3_cell=locality["h3_cell"])

    if envelope is None:
        # As with air quality, a 404 carrying an explanation rather than an empty
        # 200. For schools this is load-bearing: a locality can legitimately have
        # no publishable figure because coverage was measured to be unreliable
        # there, and that is a finding to state rather than an absence to hide.
        raise HTTPException(
            status_code=404,
            detail={
                "locality": locality,
                "category": "schools",
                "available": False,
                "reason": (
                    "No schools data stored for this locality yet. "
                    "Run: python -m agents.schools.run"
                ),
            },
        )

    fresh = freshness.evaluate(
        category="schools",
        stored_confidence=envelope["confidence"],
        data_vintage=envelope["data_vintage"],
    )

    payload = envelope["payload"]
    confidence = fresh.confidence.value
    return {
        "locality": locality,
        "category": envelope["category"],
        "source_name": envelope["source_name"],
        "source_url": envelope["source_url"],
        "fetched_at": envelope["fetched_at"].isoformat(),
        "data_vintage": envelope["data_vintage"].isoformat(),
        "h3_cell": envelope["h3_cell"],
        "confidence": confidence,
        "payload": payload,
        "verdict": build_schools_verdict(payload, confidence),
    }


class ConnectivityResponse(BaseModel):
    """What is already built near a locality.

    No verdict block, unlike air quality and schools. The agent computes the
    score with the distances in hand and the card reads the payload directly —
    there is no second interpretation layer to add, and inventing one here would
    put the same number behind two different pieces of code.
    """

    locality: Locality
    category: str
    source_name: str
    source_url: Optional[str] = None
    fetched_at: str
    data_vintage: str
    h3_cell: str
    confidence: str
    payload: dict[str, Any]


@app.get(
    "/api/v1/localities/{slug}/connectivity",
    response_model=ConnectivityResponse,
    responses={404: {"model": NoDataResponse}},
)
def get_connectivity(slug: str) -> dict[str, Any]:
    """The connectivity envelope, including every mapped feature.

    The features are what let the card re-measure from an address the reader
    types. Without them the only distance obtainable is the one measured from
    the locality centroid, which is a point nobody lives at.
    """
    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")

        envelope = db.latest_envelope(
            conn, category="infrastructure", h3_cell=locality["h3_cell"]
        )

    if envelope is None:
        # "Not mapped" rather than "nothing here" — the distinction the whole
        # category guard exists to preserve. Three localities in outer Gurugram
        # genuinely have too little in OpenStreetMap to describe.
        raise HTTPException(
            status_code=404,
            detail={
                "locality": locality,
                "category": "infrastructure",
                "available": False,
                "reason": (
                    "OpenStreetMap has too little mapped around this locality to "
                    "describe it. That is a gap in the map rather than an empty "
                    "neighbourhood, so we show nothing instead of a low score."
                ),
            },
        )

    fresh = freshness.evaluate(
        category="infrastructure",
        stored_confidence=envelope["confidence"],
        data_vintage=envelope["data_vintage"],
    )

    return {
        "locality": locality,
        "category": envelope["category"],
        "source_name": envelope["source_name"],
        "source_url": envelope["source_url"],
        "fetched_at": envelope["fetched_at"].isoformat(),
        "data_vintage": envelope["data_vintage"].isoformat(),
        "h3_cell": envelope["h3_cell"],
        "confidence": fresh.confidence.value,
        "payload": envelope["payload"],
    }


# ---------------------------------------------------------------------------
# The locality report — the composite view, and the actual product.
# ---------------------------------------------------------------------------


class ReportCategory(BaseModel):
    category: str
    label: str
    score: Optional[int] = None
    confidence: Optional[str] = None
    weight: float
    available: bool
    counted: bool = Field(
        ..., description="Whether this category contributed to the Trust Score."
    )
    is_baseline: bool = Field(
        False,
        description="True when `score` is the no-reports baseline rather than a "
        "measurement. The card must label it as such; it never reaches the "
        "Trust Score.",
    )
    status: str
    summary: str = ""
    source_name: Optional[str] = None
    data_vintage: Optional[str] = None


class ReportDisagreement(BaseModel):
    category: str
    headline: str
    detail: str
    severity: str


class Flag(BaseModel):
    """Something specific found in this locality, raised out of the category grid.

    Not a score. See agents/orchestrator/flags.py — a flag fires only on the
    presence of something, never on its absence, so a locality nobody reports on
    is never awarded a clean bill of health for being ignored.
    """

    category: str
    severity: str = Field(
        ..., description='"serious" or "notable" — how much weight to give it, '
        "not a measurement."
    )
    headline: str
    detail: str


class TrustScoreOut(BaseModel):
    score: Optional[int] = Field(
        None, description="None when too few categories have data to justify one number."
    )
    coverage_pct: int = Field(
        ..., description="Share of total category weight that produced the score."
    )
    categories_counted: int
    categories_total: int
    reason_unavailable: Optional[str] = None
    # Points subtracted for reported power problems. Power has no card of its
    # own, so this is exposed to keep the number explicable: whenever it is
    # non-zero there is also a power flag saying the same thing in words.
    power_penalty: int = 0
    power_penalty_reason: Optional[str] = None


class ReportResponse(BaseModel):
    locality: Locality
    trust_score: TrustScoreOut
    verdict: str
    biggest_watchout: Optional[dict[str, Any]] = None
    flags: list[Flag] = []
    disagreements: list[ReportDisagreement]
    categories: list[ReportCategory]
    # Infrastructure the local press reports as planned, under way or newly
    # opened. Headlines rather than a summary, and never a score: press
    # attention tracks media-market size, so counting what is coming would
    # credit a well-covered neighbourhood with more planned than an identical
    # one nobody writes about.
    upcoming: list[dict[str, Any]] = []
    sources_used: list[str]
    generated_at: str


@app.get("/debug/report/{slug}")
def debug_report(slug: str, request: Request) -> dict[str, Any]:
    """Build one report and return the traceback if it raises.

    Operational, gated by DEBUG_TOKEN, and added while every /report was
    returning 500 with no way to see why from outside the process. A stack
    trace beats another round of reasoning about which field might be missing —
    that approach has been wrong twice today. The trace only reaches an operator
    who holds the token; without it this path is 404.

    Returns the failure as data rather than raising, so the answer survives the
    trip through the error handler.
    """
    _require_debug_access(request)
    import traceback

    try:
        with db.connect() as conn:
            locality = db.get_locality(conn, slug)
            if locality is None:
                return {"ok": False, "error": f"unknown locality: {slug}"}
            report = orchestrator.build_report(conn, locality)
    except Exception as exc:
        return {
            "ok": False,
            "stage": "build_report",
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc().splitlines()[-12:],
        }

    # Serialisation is the other candidate: the response model is strict about
    # shapes the dataclass is not.
    try:
        ReportResponse(
            locality=report.locality,
            trust_score={
                "score": report.trust_score.score,
                "coverage_pct": report.trust_score.coverage_pct,
                "categories_counted": report.trust_score.categories_counted,
                "categories_total": report.trust_score.categories_total,
                "reason_unavailable": report.trust_score.reason_unavailable,
                "power_penalty": report.trust_score.power_penalty,
                "power_penalty_reason": report.trust_score.power_penalty_reason,
            },
            verdict=report.verdict,
            biggest_watchout=report.biggest_watchout,
            flags=report.flags,
            disagreements=[
                {"category": d.category, "headline": d.headline,
                 "detail": d.detail, "severity": d.severity}
                for d in report.disagreements
            ],
            categories=report.categories,
            upcoming=report.upcoming,
            sources_used=report.sources_used,
            generated_at=report.generated_at.isoformat(),
        )
    except Exception as exc:
        return {
            "ok": False,
            "stage": "response_model",
            "error": f"{type(exc).__name__}: {exc}"[:1500],
            "flags": report.flags[:3],
            "biggest_watchout": report.biggest_watchout,
        }

    return {"ok": True, "flags": len(report.flags)}


@app.get("/api/v1/localities/{slug}/report", response_model=ReportResponse)
def get_report(slug: str) -> dict[str, Any]:
    """Everything known about one locality, merged and reconciled.

    Assembled per request rather than stored: weights, copy and reconciliation
    rules change often, and a stored composite would need a backfill each time
    and would drift from the envelopes it came from.
    """
    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")
        report = orchestrator.build_report(conn, locality)

    trust = report.trust_score
    return {
        "locality": report.locality,
        "trust_score": {
            "score": trust.score,
            "coverage_pct": trust.coverage_pct,
            "categories_counted": trust.categories_counted,
            "categories_total": trust.categories_total,
            "reason_unavailable": trust.reason_unavailable,
        },
        "verdict": report.verdict,
        "biggest_watchout": report.biggest_watchout,
        "flags": report.flags,
        "disagreements": [
            {
                "category": d.category,
                "headline": d.headline,
                "detail": d.detail,
                "severity": d.severity,
            }
            for d in report.disagreements
        ],
        "categories": report.categories,
        "upcoming": report.upcoming,
        "sources_used": report.sources_used,
        "generated_at": report.generated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Questions — docs/build-roadmap.md Phase 3, "the retrieval-grounded Q&A agent
# answering buyer questions against the stored dataset with citations".
# ---------------------------------------------------------------------------


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=400)


class Citation(BaseModel):
    id: int
    kind: str
    text: str
    label: Optional[str] = None
    url: Optional[str] = None
    vintage: Optional[str] = None


class AskResponse(BaseModel):
    """`answerable: false` is a complete answer, returned with a 200.

    Most localities here hold two of five categories, so "we have no data on
    that" is the right reply to a large share of honest questions — and it is
    not an error for the caller to handle.
    """

    answerable: bool
    answer: str
    citations: list[Citation] = []
    model: Optional[str] = None


# The only endpoint here that spends money per request, and the first one that
# accepts a body from a stranger. Both limits are in-process rather than Redis:
# the API runs as one instance, and a limiter that resets on redeploy costs at
# most one extra window of spend, which is cheaper than the dependency.
#
# The per-client window stops one person hammering it. The daily ceiling is the
# one that matters: it bounds what a bot rotating addresses can cost, and when
# it trips the endpoint says so plainly instead of degrading quietly.
_ASK_PER_CLIENT = int(os.environ.get("ASK_PER_CLIENT_PER_HOUR", "20"))
_ASK_PER_DAY = int(os.environ.get("ASK_PER_DAY", "500"))
# A ceiling that does not depend on the client key. The per-client window keys
# on x-forwarded-for, which a caller hitting the API directly can spoof to get a
# fresh bucket every request — so the per-minute and per-day caps below, which
# count every accepted call regardless of who it claims to be, are what actually
# bound the spend. Sized so a real burst of visitors is fine and an unthrottled
# scripted caller is stopped within a minute.
_ASK_GLOBAL_PER_MINUTE = int(os.environ.get("ASK_GLOBAL_PER_MINUTE", "30"))
_ask_hits: dict[str, list[float]] = {}
_ask_recent: list[float] = []
_ask_day: dict[str, Any] = {"date": None, "count": 0}
_qa_client: Any = None


def _ask_allowed(client_key: str) -> Optional[str]:
    """None when the request may proceed, otherwise the reason it may not.

    Two of the three limits (per-minute, per-day) are global and cannot be
    lifted by varying the client key. The per-client window is best-effort on
    top of them, so a single honest visitor is throttled sooner than the global
    cap would.
    """
    import time

    now = time.time()
    today = datetime.now(timezone.utc).date()
    if _ask_day["date"] != today:
        _ask_day.update(date=today, count=0)
    if _ask_day["count"] >= _ASK_PER_DAY:
        return "Questions are paused for today — we cap how many we answer per day. Try again tomorrow."

    _ask_recent[:] = [t for t in _ask_recent if now - t < 60]
    if len(_ask_recent) >= _ASK_GLOBAL_PER_MINUTE:
        return "We're answering a lot of questions right now. Please try again in a minute."

    recent = [t for t in _ask_hits.get(client_key, []) if now - t < 3600]
    if len(recent) >= _ASK_PER_CLIENT:
        _ask_hits[client_key] = recent
        return "That is a lot of questions in an hour. Please try again a little later."

    recent.append(now)
    _ask_hits[client_key] = recent
    _ask_recent.append(now)
    _ask_day["count"] += 1
    return None


def _get_qa_client() -> Any:
    global _qa_client
    if _qa_client is None:
        from agents.orchestrator import qa

        _qa_client = qa.build_client()
    return _qa_client


@app.post("/api/v1/localities/{slug}/ask", response_model=AskResponse)
def ask_question(slug: str, body: AskRequest, request: Request) -> dict[str, Any]:
    """Answer one question about one locality, from that locality's record only.

    Every citation in the response refers to a source actually assembled for
    this request — `qa.validate` removes any the model invented before this
    returns. Questions are not stored: nothing here needs them, and a question
    like "is it safe for a single woman" says more about the asker than about
    the neighbourhood.
    """
    from agents.orchestrator import qa

    # Behind the proxy the socket address is the proxy, so the forwarded header
    # is the only per-person key available. It is spoofable — which is why the
    # per-minute and per-day caps in _ask_allowed are global and do not depend
    # on this value; this key only sharpens throttling for an honest visitor.
    forwarded = request.headers.get("x-forwarded-for", "")
    client_key = forwarded.split(",")[0].strip() or (
        request.client.host if request.client else "unknown"
    )
    refusal = _ask_allowed(client_key)
    if refusal:
        raise HTTPException(status_code=429, detail=refusal)

    try:
        client = _get_qa_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Questions are not available right now.") from exc

    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")
        answer = qa.ask(conn, locality, body.question, client)

    return answer.as_dict()
