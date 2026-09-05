"""Shared data envelope every category agent returns.

Mirrors the agent specification in docs/strategy.md ("Agent specification, per
category"). Every agent — schools, crime, air_quality, water, power,
infrastructure — returns a DataEnvelope wrapping its category-specific payload,
so the orchestrator can merge outputs from six different sources uniformly
regardless of how different their underlying data looks.

Status: the envelope core (category, source_name, source_url, fetched_at,
data_vintage, h3_cell, confidence, payload) is unchanged from the Phase 0
starting point and is backed by a real Postgres table
(infra/migrations/001_init.sql). Only the payloads of categories with a live
agent have been adjusted against real responses — air_quality and schools.
crime, water, power and infrastructure are still untested drafts.
"""

from __future__ import annotations

from datetime import date, datetime
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
    h3_cell: str = Field(..., description="H3 index (resolution 9) this data point is keyed to.")
    confidence: Confidence
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Category-specific fields — validate against the matching *Payload model below "
        "before writing to Postgres.",
    )


# ---- Category-specific payloads (see docs/strategy.md for source lists per category) ----


class SchoolsPayload(BaseModel):
    """One school. Unchanged from the Phase 0 draft — the fields UDISE actually
    provides line up with it, with the single exception noted on pass_rate."""

    name: str
    board: Optional[str] = None
    distance_km: Optional[float] = None
    pupil_teacher_ratio: Optional[float] = None
    infra_score: Optional[float] = None
    pass_rate: Optional[float] = Field(
        None,
        description="Board pass rate. Always None from UDISE — the dataset carries no "
        "exam outcomes at all, so this stays unpopulated until a state-board source is "
        "added. Kept in the model rather than deleted because its absence is exactly "
        "what caps schools confidence below High.",
    )

    # Added once real UDISE records were in hand — all present in the source and
    # all things a buyer asks about a school before anything else.
    udise_code: Optional[str] = None
    management: Optional[str] = Field(
        None, description="Government / private / aided. The single field buyers filter on hardest."
    )
    school_category: Optional[str] = None
    total_students: Optional[int] = None
    total_teachers: Optional[int] = None
    proxy_score: Optional[float] = Field(
        None, description="0-100 composite of pupil-teacher ratio and classroom adequacy. "
        "Explicitly NOT a quality ranking — see agents/schools/scoring.py."
    )


class SchoolsAreaPayload(BaseModel):
    """Schools *around a locality* — the envelope payload for the schools category.

    Air quality is one measurement per locality; schools is many records per
    locality, so the envelope carries an aggregate plus the nearest few rather
    than a single reading. SchoolsPayload above still describes one school and is
    what the `schools` list is made of.
    """

    schools_within_2km: int = 0
    schools_within_5km: int = 0
    presence_source: Optional[str] = Field(
        None,
        description="Which source the counts above came from. Recorded rather than "
        "assumed because they may come from OpenStreetMap while the staffing figures "
        "below come from UDISE — the card has to be able to say which is which.",
    )

    schools_with_staffing_data: int = Field(
        0,
        description="How many nearby schools have staffing/enrolment figures at all. "
        "Usually far fewer than the school count, since only UDISE carries those and "
        "its coverage is patchy. Showing the gap is the point.",
    )
    median_pupil_teacher_ratio: Optional[float] = None
    median_proxy_score: Optional[float] = None
    government_share_pct: Optional[float] = Field(
        None, description="Share of nearby schools that are government-run."
    )
    staffing_vintage: Optional[datetime] = Field(
        None,
        description="Vintage of the staffing figures specifically. Distinct from the "
        "envelope's data_vintage, which covers the payload as a whole: school presence "
        "may be current while the staffing numbers behind it are years old.",
    )

    boards_available: list[str] = Field(default_factory=list)
    nearest_schools: list[SchoolsPayload] = Field(default_factory=list)
    sources_used: list[str] = Field(default_factory=list)


class NewsIncident(BaseModel):
    """One press-reported incident, kept as an item rather than folded into a count."""

    title: str
    url: str
    domain: Optional[str] = None
    language: Optional[str] = None
    published_at: Optional[datetime] = None
    incident_type: Optional[str] = None


class NewsCoverage(BaseModel):
    """Press-derived signal, with its own limits attached.

    Deliberately not reducible to a rate. docs/strategy.md is emphatic: press
    coverage is a function of media-market size and newsworthiness, not incident
    rate, so a well-covered locality looks worse than an identical but
    under-covered one. It is reported as "N incidents reported in local press over
    12 months" and never normalised into a score without a coverage-normalisation
    step that does not yet exist.
    """

    incidents_12m: int = 0
    incident_types: list[str] = Field(default_factory=list)
    characterisation: Optional[str] = Field(
        None,
        description="What KIND of incident is reported here, in a sentence. This is the "
        "part that survives coverage bias: how many articles mention a locality is "
        "largely a fact about media attention, but whether those incidents are "
        "chain-snatchings or murders is a fact about the place.",
    )
    incident_type_counts: dict[str, int] = Field(
        default_factory=dict,
        description="How many confirmed incidents of each type, over the whole "
        "12 months. Distinct from `recent`, which is a display sample of five: "
        "anything derived from `recent` describes the sample rather than the "
        "locality, and a flag built that way contradicted the card beside it — "
        "'violence (1 of 5)' next to 'violence (9 of 18)' on the same page.",
    )
    recent: list[NewsIncident] = Field(default_factory=list)

    # The funnel, exposed rather than hidden. Keyword search finds far more than
    # is real; showing how many were fetched, judged and confirmed is what stops
    # `incidents_12m` reading as an exhaustive tally.
    mentions_fetched: int = 0
    mentions_classified: int = 0
    classifier: Optional[str] = None
    coverage_caveat: str = Field(
        "Counts press coverage, not incidents. Better-covered areas appear worse.",
        description="Shown verbatim in the UI — this caveat is not optional.",
    )


class CrimePayload(BaseModel):
    official_crime_rate_district: Optional[float] = Field(
        None, description="Always district-level per NCRB — never present as locality-specific."
    )
    resident_reports_90d_count: int = 0
    blended_safety_perception_score: Optional[float] = Field(
        None,
        description="Intentionally left None while the only input is press coverage. "
        "docs/strategy.md warns against blending coverage into a single number without "
        "coverage normalisation; a score here would imply a precision nothing supports.",
    )
    news: Optional[NewsCoverage] = None


class AqiBand(str, Enum):
    """CPCB National AQI bands. Deliberately CPCB's six-band scale, not the US EPA's —
    the same PM2.5 concentration lands in a different band under each, and an Indian
    buyer cross-checking against a CPCB bulletin must see the same word we do."""

    GOOD = "good"
    SATISFACTORY = "satisfactory"
    MODERATE = "moderate"
    POOR = "poor"
    VERY_POOR = "very_poor"
    SEVERE = "severe"


class TrendPoint(BaseModel):
    """One day of the 30-day trend.

    Adjusted from the Phase 0 `trend_30d: list[float]` once real data was in hand:
    station history has gaps (stations go offline for days at a time), so a bare
    list of floats silently misaligns the chart's x-axis the first time a day is
    missing. Carrying the date on each point makes a gap render as a gap.
    """

    day: date
    aqi: float
    observation_count: int = Field(
        1, description="Hourly observations this daily value was averaged from. "
        "Low counts mean a thin day, which the chart dims rather than hides."
    )


class AirQualityPayload(BaseModel):
    """Air quality output. See agents/air_quality/ for how each field is derived.

    Field-name changes from the Phase 0 draft, all driven by live responses:
      - `pm2_5` kept as-is (CPCB returns pollutant_id "PM2.5"; we normalize).
      - `trend_30d` is now list[TrendPoint] rather than list[float] — see TrendPoint.
      - added `aqi_band`, `dominant_pollutant`, `station_name`, `observed_at`,
        `sources_used`, and the remaining CPCB pollutants, all of which the real
        payloads carry and the UI needs to avoid re-deriving on the client.
    """

    current_aqi: float = Field(
        ..., description="CPCB National AQI computed from 24-hour mean concentrations, "
        "which is how CPCB defines it. Not the latest single hour — see latest_hour_aqi."
    )
    aqi_band: AqiBand
    aqi_basis: str = Field(
        "24h_rolling",
        description="Averaging window behind current_aqi. Recorded rather than assumed "
        "because indexing a single hour against CPCB's 24-hour breakpoints inflates the "
        "number substantially, and a stored value should say which method produced it.",
    )
    latest_hour_aqi: Optional[float] = Field(
        None, description="AQI of the most recent single hour. Context beside the headline "
        "— it moves far more than the 24-hour figure and is never the headline itself."
    )
    dominant_pollutant: Optional[str] = Field(
        None, description="Pollutant whose sub-index set the AQI — CPCB AQI is a max, not an average."
    )

    pm2_5: Optional[float] = None
    pm10: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = Field(None, description="mg/m³ — CPCB reports CO in mg/m³, not µg/m³.")
    o3: Optional[float] = None
    nh3: Optional[float] = None

    station_name: Optional[str] = None
    nearest_station_km: Optional[float] = None
    observed_at: Optional[datetime] = Field(
        None, description="When the station actually measured this — distinct from envelope.fetched_at."
    )

    trend_30d: list[TrendPoint] = Field(default_factory=list)
    sources_used: list[str] = Field(
        default_factory=list,
        description="Every upstream that contributed, e.g. ['CPCB via data.gov.in', 'OpenAQ']. "
        "Drives the source strip in the UI, which per docs/strategy.md is the credibility engine.",
    )


class WaterPayload(BaseModel):
    reported_supply_frequency: Optional[str] = None
    groundwater_trend: Optional[str] = None
    tanker_dependency_pct: Optional[float] = None
    news: Optional[NewsCoverage] = None


class PowerPayload(BaseModel):
    """Power supply. The category with no official source at all.

    NCRB is late and district-level; UDISE is stale but real. For outages there
    is simply nothing — no Indian body publishes them at locality level — so
    press coverage is not a supplement here, it is the whole record until
    residents report.
    """

    avg_outage_hours_per_week_reported: Optional[float] = Field(
        None,
        description="Intentionally never populated from press coverage. A weekly "
        "average implies a measured rate, and counting articles measures what was "
        "written about rather than what happened.",
    )
    official_data_available: bool = Field(
        False, description="Always False today, and stated rather than implied."
    )
    news: Optional[NewsCoverage] = None


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
