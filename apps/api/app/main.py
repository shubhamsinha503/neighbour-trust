"""Neighbour Trust API.

Phase 1 surface area is deliberately small: list localities, and serve the air
quality envelope for one. The composite Trust Score, the other five categories
and the Q&A endpoint are Phase 2/3 — see docs/build-roadmap.md.

Run from the repo root:
    uvicorn apps.api.app.main:app --reload
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agents.common import db  # noqa: E402
from apps.api.app.verdict import build_verdict  # noqa: E402

app = FastAPI(
    title="Neighbour Trust API",
    version="0.1.0",
    description="Sourced, confidence-tagged neighbourhood data for Bengaluru and Gurugram.",
)

# The Next.js dev server. Production origins get added at deploy time rather than
# wildcarded here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
    """Liveness, a real database round-trip, and ingestion freshness.

    The DB round-trip is here because a health check that doesn't touch the
    database reports green while every request 500s. Ingestion freshness is here
    for the subtler failure: once the scheduler runs unattended, a dead job is
    invisible from the outside — stale rows keep serving happily, and "the data
    looks a bit old" is indistinguishable from "the job has been crashing for
    nine days". `stale` flips when the last successful run is older than the
    hourly cadence allows for.
    """
    try:
        with db.connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM locality").fetchone()["n"]
            last = db.last_successful_ingest(conn, category="air_quality")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unavailable: {exc}") from exc

    ingest: dict[str, Any] = {"last_success": None, "age_minutes": None, "stale": True}
    if last is not None and last["finished_at"] is not None:
        age = datetime.now(timezone.utc) - last["finished_at"]
        ingest = {
            "last_success": last["finished_at"].isoformat(),
            "age_minutes": round(age.total_seconds() / 60),
            "localities_ok": last["localities_ok"],
            "localities_skipped": last["localities_skipped"],
            # Two missed hourly runs. One is a blip; two is a pattern.
            "stale": age > timedelta(hours=2, minutes=30),
        }

    return {"status": "ok", "localities": count, "air_quality_ingest": ingest}


@app.get("/api/v1/localities", response_model=list[Locality])
def get_localities() -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.list_localities(conn)


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

    payload = envelope["payload"]
    return {
        "locality": locality,
        "category": envelope["category"],
        "source_name": envelope["source_name"],
        "source_url": envelope["source_url"],
        "fetched_at": envelope["fetched_at"].isoformat(),
        "data_vintage": envelope["data_vintage"].isoformat(),
        "h3_cell": envelope["h3_cell"],
        "confidence": envelope["confidence"],
        "payload": payload,
        "verdict": build_verdict(payload, envelope["confidence"]),
    }
