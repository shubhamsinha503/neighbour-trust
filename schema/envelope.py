"""Shared data envelope every category agent returns.

Mirrors the agent specification in docs/strategy.md ("Agent specification, per
category"). Every agent — schools, crime, air_quality, water, power,
infrastructure — returns a DataEnvelope wrapping its category-specific payload,
so the orchestrator can merge outputs from six different sources uniformly
regardless of how different their underlying data looks.

This is a Phase 0 starting point, not a finished contract — expect to adjust
field names once real API responses are in hand.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Confidence(str, Enum):
    """How much weight the UI and the orchestrator should give this data point.

    HIGH / MEDIUM / LOW describe official-data quality (recency + granularity).
    COMMUNITY_ESTIMATED means there's no reliable official source yet and the
    value leans on resident reports and/or the news-monitoring agent instead.
    Never silently upgrade a community-estimated value to look like official data.
    """

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    COMMUNITY_ESTIMATED = "community_estimated"


class Category(str, Enum):
    SCHOOLS = "schools"
    CRIME = "crime"
    AIR_QUALITY = "air_quality"
    WATER = "water"
    POWER = "power"
    INFRASTRUCTURE = "infrastructure"


class DataEnvelope(BaseModel):
    """Common wrapper returned by every category agent."""

    category: Category
    source_name: str
    source_url: Optional[str] = None
    fetched_at: datetime = Field(..., description="When the agent last pulled this data.")
    data_vintage: datetime = Field(
        ..., description="How old the underlying data actually is — not when it was fetched. "
        "A UDISE+ record fetched today might still be 18 months stale; that staleness is what "
        "the confidence tag and the UI's 'last updated' line should reflect."
    )
    h3_cell: str = Field(..., description="H3 index (resolution 9 recommended) this data point is keyed to.")
    confidence: Confidence
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Category-specific fields — validate against the matching *Payload model below "
        "before writing to Postgres.",
    )


# ---- Category-specific payloads (see docs/strategy.md for source lists per category) ----


class SchoolsPayload(BaseModel):
    name: str
    board: Optional[str] = None
    distance_km: Optional[float] = None
    pupil_teacher_ratio: Optional[float] = None
    infra_score: Optional[float] = None
    pass_rate: Optional[float] = None


class CrimePayload(BaseModel):
    official_crime_rate_district: Optional[float] = Field(
        None, description="Always district-level per NCRB — never present as locality-specific."
    )
    resident_reports_90d_count: int = 0
    blended_safety_perception_score: Optional[float] = None


class AirQualityPayload(BaseModel):
    current_aqi: float
    pm2_5: Optional[float] = None
    pm10: Optional[float] = None
    nearest_station_km: Optional[float] = None
    trend_30d: Optional[list[float]] = None


class WaterPayload(BaseModel):
    reported_supply_frequency: Optional[str] = None
    groundwater_trend: Optional[str] = None
    tanker_dependency_pct: Optional[float] = None


class PowerPayload(BaseModel):
    avg_outage_hours_per_week_reported: Optional[float] = None
    official_data_available: bool = False


class InfraProject(BaseModel):
    name: str
    type: str
    expected_completion: Optional[str] = None
    source: str
    confidence: Confidence


class InfrastructurePayload(BaseModel):
    nearby_rera_projects: list[InfraProject] = Field(default_factory=list)
    upcoming_infra_within_5km: list[InfraProject] = Field(default_factory=list)
    builder_track_record_score: Optional[float] = None
