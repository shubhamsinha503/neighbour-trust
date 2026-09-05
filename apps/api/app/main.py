"""Neighbour Trust API.

Phase 1 surface area is deliberately small: list localities, and serve the air
quality envelope for one. The composite Trust Score, the other five categories
and the Q&A endpoint are Phase 2/3 — see docs/build-roadmap.md.

Run from the repo root:
    uvicorn apps.api.app.main:app --reload
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agents.common import db, freshness  # noqa: E402
from agents.orchestrator import agent as orchestrator  # noqa: E402
from apps.api.app.schools_verdict import build_verdict as build_schools_verdict  # noqa: E402
from apps.api.app.verdict import build_verdict  # noqa: E402

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
        description="How many of the six categories hold data here. Shown on the "
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


@app.get("/healthz")
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


@app.get("/debug/classification")
def get_classification_state() -> dict[str, Any]:
    """Where every news mention sits in the classify pipeline.

    Operational, not part of the public API. It exists because the pipeline has
    three independent nullable columns — classifier, classified_at,
    is_locality_specific — and their combinations distinguish "never judged"
    from "queued for re-judgement" from "verdict destroyed". Guessing which one
    a symptom means, from run logs, produced two wrong diagnoses in a row.
    """
    with db.connect() as conn:
        return db.classification_state(conn)


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


class ReportResponse(BaseModel):
    locality: Locality
    trust_score: TrustScoreOut
    verdict: str
    biggest_watchout: Optional[dict[str, Any]] = None
    flags: list[Flag] = []
    disagreements: list[ReportDisagreement]
    categories: list[ReportCategory]
    sources_used: list[str]
    generated_at: str


@app.get("/debug/report/{slug}")
def debug_report(slug: str) -> dict[str, Any]:
    """Build one report and return the traceback if it raises.

    Operational, and added while every /report was returning 500 with no way to
    see why from outside the process. A stack trace beats another round of
    reasoning about which field might be missing — that approach has been wrong
    twice today.

    Returns the failure as data rather than raising, so the answer survives the
    trip through the error handler.
    """
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
        "sources_used": report.sources_used,
        "generated_at": report.generated_at.isoformat(),
    }
