"""Air quality agent — fetch, normalize, store.

The Phase 1 proof: one category, two cities, real sources, all the way from an
HTTP call to a row in Postgres that the API can serve and the card can render.

Source priority, per the Phase 1 decision:

  1. **CPCB via data.gov.in** — the official source of record, used whenever
     DATA_GOV_IN_API_KEY is configured and it has a station in range.
  2. **CPCB via OpenAQ** — the same regulator's data through a different pipe,
     used when 1 is unavailable, and always used for the 30-day history because
     neither data.gov.in nor AQICN serves history at all.
  3. **AQICN** — corroboration only, stored as its own envelope on its own (US
     EPA) scale. Never contributes to the displayed CPCB number. See
     sources/aqicn.py for why.

Nothing here falls back to sample data. If no source yields a usable reading for
a locality, the agent records that and moves on, and the card says so.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterator, Optional

from neighbour_trust_schema.envelope import (
    AirQualityPayload,
    AqiBand,
    Category,
    Confidence,
    DataEnvelope,
    TrendPoint,
)

from agents.air_quality import aqi as aqi_lib
from agents.air_quality.sources import aqicn as aqicn_src
from agents.air_quality.sources import cpcb as cpcb_src
from agents.air_quality.sources import openaq as openaq_src
from agents.common import db
from agents.common.config import AQICN, DATA_GOV_IN, OPENAQ
from agents.common.geo import cell_for, haversine_km

log = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

# Confidence thresholds. Distance comes straight from docs/strategy.md ("High
# when the nearest monitoring station is under ~5km; Low and flagged as
# interpolated beyond that").
HIGH_CONFIDENCE_KM = 5.0
MEDIUM_CONFIDENCE_KM = 15.0
MAX_USABLE_KM = 25.0

# Staleness thresholds — not in the original spec, added after live testing found
# AQICN serving eight-week-old Bengaluru readings through the same fields as
# current ones. Distance alone would have called that data "High confidence".
FRESH_WITHIN = timedelta(hours=3)
STALE_AFTER = timedelta(hours=24)
UNUSABLE_AFTER = timedelta(days=7)

# When no regulatory station can produce a full CPCB AQI, a community low-cost
# sensor reporting PM2.5 alone is still real, current, local information. During
# the CPCB outage of late August 2026 it was the only air data available for
# Bengaluru at all — every regulatory station in the city had been silent for
# four days.
#
# It is published as a PM2.5 concentration, never as an "AQI", at
# COMMUNITY_ESTIMATED confidence with the operator named. That is precisely what
# that confidence value is for: not worse official data, but a different kind of
# data. Low-cost sensors are not reference monitors, and the card says so.
PM25_ONLY_FALLBACK = True

# A PM2.5-only sensor must be close to be worth reporting — with no second
# pollutant to corroborate it, distance is the only quality signal left.
PM25_ONLY_MAX_KM = 8.0


@dataclass
class StationReading:
    """A usable current reading from one station, in CPCB units."""

    source_name: str
    source_url: str
    source_key: str                    # short tag used for aq_station.source
    external_id: str
    name: str
    lat: float
    lon: float
    distance_km: float
    observed_at: datetime
    # 24-hour means, which is what CPCB's breakpoint table is defined on.
    concentrations: dict[str, float]
    # The most recent single hour, shown beside the headline as context. Kept
    # separate so the two can never be confused for one another.
    latest_hour: dict[str, float] = field(default_factory=dict)
    openaq_location_id: Optional[int] = None
    sensor_ids: dict[str, int] = field(default_factory=dict)


@dataclass
class LocalityResult:
    slug: str
    ok: bool
    reason: Optional[str] = None
    envelope: Optional[DataEnvelope] = None
    trend_days: int = 0


def assess_confidence(distance_km: float, age: timedelta) -> Optional[Confidence]:
    """Confidence for one reading, from station distance and data age.

    Returns None when the reading is too old to present as current at all —
    publishing a week-old number under a "current AQI" heading would be a lie the
    confidence tag can't rescue.

    Distance and staleness are combined as a cap rather than an average: a
    perfectly sited station reporting stale data is a stale reading, not a
    medium-quality one.
    """
    if age > UNUSABLE_AFTER:
        return None

    if distance_km <= HIGH_CONFIDENCE_KM:
        base = Confidence.HIGH
    elif distance_km <= MEDIUM_CONFIDENCE_KM:
        base = Confidence.MEDIUM
    else:
        base = Confidence.LOW

    if age > STALE_AFTER:
        return Confidence.LOW
    if age > FRESH_WITHIN:
        return Confidence.MEDIUM if base == Confidence.HIGH else base
    return base


# ---------------------------------------------------------------------------
# Source adapters — each returns the nearest usable StationReading, or None.
# ---------------------------------------------------------------------------


def _reading_from_cpcb(
    client: cpcb_src.CpcbClient, *, city: str, lat: float, lon: float
) -> Optional[StationReading]:
    best: Optional[StationReading] = None
    for station in client.stations_for_city(city):
        distance = haversine_km(lat, lon, station["lat"], station["lon"])
        if distance > MAX_USABLE_KM:
            continue
        observed_at = station["observed_at"]
        if observed_at is None:
            continue
        if best is None or distance < best.distance_km:
            best = StationReading(
                source_name=cpcb_src.SOURCE_NAME,
                source_url=cpcb_src.SOURCE_URL,
                source_key="cpcb",
                external_id=station["external_id"],
                name=station["name"],
                lat=station["lat"],
                lon=station["lon"],
                distance_km=distance,
                observed_at=observed_at,
                concentrations=station["concentrations"],
            )
    return best


def _readings_from_openaq(
    client: openaq_src.OpenAqClient, *, lat: float, lon: float
) -> Iterator[StationReading]:
    """Candidate readings, nearest first — a generator, and both parts matter.

    *Plural*, because the nearest thing OpenAQ knows about is not always a station
    that can produce a CPCB AQI. Around Koramangala the closest entry is a
    low-cost PM-only sensor (pm1, pm25, particle counts) which cannot meet CPCB's
    three-pollutant minimum, while a full KSPCB regulatory station sits just
    behind it. Returning only the nearest made that locality report "no data"
    while a perfectly good station went unread.

    *Lazy*, because each candidate costs several requests against a 60/minute
    budget. The caller stops at the first station that yields an AQI, so the ones
    behind it are never fetched.

    Concentrations are 24-hour means, per CPCB's method — see
    OpenAqClient.rolling_24h_concentrations.
    """
    stations = client.live_stations_near(lat, lon)
    ranked = sorted(
        (
            {**s, "distance_km": haversine_km(lat, lon, s["lat"], s["lon"])}
            for s in stations
        ),
        key=lambda s: s["distance_km"],
    )

    for station in ranked:
        if station["distance_km"] > MAX_USABLE_KM:
            break

        latest, observed_at, sensor_ids = client.latest_concentrations(station["id"])
        if not sensor_ids or observed_at is None:
            continue  # live by directory, but nothing usable right now

        # Reject hopeless stations from the sensor listing alone. Fetching the
        # 24-hour window costs one request per pollutant against a 60/minute
        # budget, so it must not be spent on a station that can never produce a
        # CPCB AQI.
        if not openaq_src.could_meet_cpcb_minimum(sensor_ids):
            log.debug(
                "skipping %s — only %s, cannot meet CPCB's AQI minimum",
                station["name"], sorted(sensor_ids),
            )
            continue

        averaged, _hours = client.rolling_24h_concentrations(sensor_ids)
        # Fall back to the latest hour only if the 24-hour window came back empty,
        # which means the station just came online.
        concentrations = averaged or latest
        if not concentrations:
            continue

        yield StationReading(
            # Name the actual operator. "CPCB via OpenAQ" on a community low-cost
            # sensor would be a false credential, and the source strip is the
            # product's credibility engine.
            source_name=_openaq_source_name(station.get("provider")),
            source_url=openaq_src.SOURCE_URL,
            source_key="openaq",
            external_id=str(station["id"]),
            name=station["name"],
            lat=station["lat"],
            lon=station["lon"],
            distance_km=station["distance_km"],
            observed_at=observed_at,
            concentrations=concentrations,
            latest_hour=latest,
            openaq_location_id=station["id"],
            sensor_ids=sensor_ids,
        )


def _pm25_only_reading(
    client: openaq_src.OpenAqClient, *, lat: float, lon: float
) -> Optional[StationReading]:
    """Nearest live sensor with a usable PM2.5 figure, whatever else it lacks.

    Used only when no station in range can produce a full CPCB AQI. Returns a
    reading whose `concentrations` may hold nothing but pm2_5 — the caller must
    not pass it to compute_aqi, which would correctly refuse it.
    """
    stations = client.live_stations_near(lat, lon)
    ranked = sorted(
        (
            {**s, "distance_km": haversine_km(lat, lon, s["lat"], s["lon"])}
            for s in stations
        ),
        key=lambda s: s["distance_km"],
    )

    for station in ranked:
        if station["distance_km"] > PM25_ONLY_MAX_KM:
            break

        latest, observed_at, sensor_ids = client.latest_concentrations(station["id"])
        if observed_at is None or "pm2_5" not in sensor_ids:
            continue

        averaged, _hours = client.rolling_24h_concentrations(
            {"pm2_5": sensor_ids["pm2_5"]}
        )
        concentrations = averaged or {k: v for k, v in latest.items() if k == "pm2_5"}
        if "pm2_5" not in concentrations:
            continue

        return StationReading(
            source_name=_openaq_source_name(station.get("provider")),
            source_url=openaq_src.SOURCE_URL,
            source_key="openaq",
            external_id=str(station["id"]),
            name=station["name"],
            lat=station["lat"],
            lon=station["lon"],
            distance_km=station["distance_km"],
            observed_at=observed_at,
            concentrations={"pm2_5": concentrations["pm2_5"]},
            latest_hour={k: v for k, v in latest.items() if k == "pm2_5"},
            openaq_location_id=station["id"],
            sensor_ids={"pm2_5": sensor_ids["pm2_5"]},
        )
    return None


def _openaq_source_name(provider: Optional[str]) -> str:
    if provider and provider.strip().upper() == "CPCB":
        return openaq_src.SOURCE_NAME  # "CPCB via OpenAQ"
    if provider:
        return f"{provider} via OpenAQ"
    return "OpenAQ"


# ---------------------------------------------------------------------------
# Trend
# ---------------------------------------------------------------------------


def seed_trend_from_openaq(
    conn,
    client: openaq_src.OpenAqClient,
    *,
    station_id: int,
    sensor_ids: dict[str, int],
    days: int = 30,
) -> int:
    """Backfill daily observations for a station from OpenAQ's history.

    Fetches each pollutant's daily series, then computes a CPCB AQI **per day**
    from that day's pollutant means — rather than charting a single pollutant and
    calling it AQI. Days that don't meet CPCB's three-pollutant minimum are
    skipped, so the chart can have holes; that's the honest rendering.
    """
    per_pollutant: dict[str, dict[date, tuple[float, int]]] = {}
    for column, sensor_id in sensor_ids.items():
        try:
            per_pollutant[column] = client.daily_history(sensor_id, column=column, days=days)
        except Exception as exc:  # one bad sensor shouldn't lose the whole trend
            log.warning("history fetch failed for sensor %s (%s): %s", sensor_id, column, exc)

    all_days = sorted({day for series in per_pollutant.values() for day in series})
    written = 0

    for day in all_days:
        concentrations = {
            column: series[day][0]
            for column, series in per_pollutant.items()
            if day in series
        }
        counts = [series[day][1] for series in per_pollutant.values() if day in series]
        result = aqi_lib.compute_aqi(concentrations)
        if result is None:
            continue

        db.upsert_observation(
            conn,
            station_id=station_id,
            source="openaq_daily",
            # Anchored to local midnight IST: these are Indian calendar days, and
            # storing them as UTC midnight would shift a day's readings onto the
            # previous date in every query that groups by local date.
            observed_at=datetime.combine(day, time(0, 0), tzinfo=IST),
            aqi=result.aqi,
            dominant_pollutant=result.dominant_pollutant,
            pollutants=concentrations,
            observation_count=max(counts) if counts else 1,
        )
        written += 1

    return written


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_for_locality(
    conn,
    locality: dict[str, Any],
    *,
    openaq_client: Optional[openaq_src.OpenAqClient] = None,
    cpcb_client: Optional[cpcb_src.CpcbClient] = None,
    aqicn_client: Optional[aqicn_src.AqicnClient] = None,
    trend_days: int = 30,
    now: Optional[datetime] = None,
) -> LocalityResult:
    now = now or datetime.now(timezone.utc)
    lat, lon, slug = locality["lat"], locality["lon"], locality["slug"]

    # Candidates in source-priority order, nearest first within each source, and
    # evaluated lazily. The first that yields a valid CPCB AQI wins — a nearer
    # station that can't produce one must not block a slightly further one that
    # can, and the stations behind the winner are never fetched.
    def candidates() -> Iterator[StationReading]:
        if cpcb_client is not None:
            try:
                cpcb_reading = _reading_from_cpcb(
                    cpcb_client, city=locality["city"], lat=lat, lon=lon
                )
                if cpcb_reading is not None:
                    yield cpcb_reading
            except Exception as exc:
                log.warning("[%s] CPCB/data.gov.in failed: %s", slug, exc)

        if openaq_client is not None:
            try:
                yield from _readings_from_openaq(openaq_client, lat=lat, lon=lon)
            except Exception as exc:
                log.warning("[%s] OpenAQ failed: %s", slug, exc)

    reading: Optional[StationReading] = None
    result = None
    considered = 0
    for candidate in candidates():
        considered += 1
        computed = aqi_lib.compute_aqi(candidate.concentrations)
        if computed is not None:
            reading, result = candidate, computed
            break
        log.debug(
            "[%s] %s has only %s — below CPCB's AQI minimum, trying next station",
            slug, candidate.name, sorted(candidate.concentrations),
        )

    # Fallback: a community sensor with PM2.5 but too few pollutants for a CPCB
    # AQI. Only reached when nothing above worked.
    pm25_only: Optional[StationReading] = None
    if reading is None and PM25_ONLY_FALLBACK and openaq_client is not None:
        try:
            pm25_only = _pm25_only_reading(openaq_client, lat=lat, lon=lon)
        except Exception as exc:
            log.warning("[%s] PM2.5 fallback failed: %s", slug, exc)

    if reading is None and pm25_only is None:
        return LocalityResult(
            slug=slug,
            ok=False,
            reason=(
                "no live station within range"
                if considered == 0
                else f"{considered} station(s) in range, none meeting CPCB's minimum "
                "for an AQI (3 pollutants including PM2.5 or PM10), and no community "
                "PM2.5 sensor either"
            ),
        )

    # Adopt the fallback if that is all we have. `result` stays None, which is
    # what every branch below keys off to know it is publishing a PM2.5 reading
    # rather than an AQI.
    pm25_mode = reading is None
    if pm25_mode:
        reading = pm25_only
        log.info(
            "[%s] no CPCB-capable station; falling back to PM2.5 only from %s",
            slug, reading.name,
        )

    sources_used: list[str] = [reading.source_name]
    age = now - reading.observed_at
    confidence = assess_confidence(reading.distance_km, age)
    if confidence is not None and pm25_mode:
        # A single-pollutant reading from a low-cost sensor is a different kind
        # of evidence, not a lesser grade of the official kind.
        confidence = Confidence.COMMUNITY_ESTIMATED
    if confidence is None:
        return LocalityResult(
            slug=slug,
            ok=False,
            reason=f"nearest station's latest reading is {age.days} days old",
        )

    # -- persist station + current observation ----------------------------
    station_h3 = cell_for(reading.lat, reading.lon)
    station_id = db.upsert_station(
        conn,
        source=reading.source_key,
        external_id=reading.external_id,
        name=reading.name,
        lat=reading.lat,
        lon=reading.lon,
        h3_cell=station_h3,
        city=locality["city"],
        state=locality["state"],
    )
    db.upsert_observation(
        conn,
        station_id=station_id,
        source=reading.source_key,
        observed_at=reading.observed_at,
        aqi=result.aqi if result else None,
        dominant_pollutant=result.dominant_pollutant if result else None,
        pollutants=reading.concentrations,
    )

    # -- trend ------------------------------------------------------------
    if openaq_client is not None:
        sensor_ids = reading.sensor_ids
        openaq_station_id = station_id

        if reading.source_key != "openaq":
            # Primary reading came from data.gov.in, which has no history. Find
            # the matching OpenAQ station for the same place to seed the trend.
            openaq_reading = None
            try:
                openaq_reading = next(
                    (
                        c
                        for c in _readings_from_openaq(openaq_client, lat=lat, lon=lon)
                        if aqi_lib.compute_aqi(c.concentrations)
                    ),
                    None,
                )
            except Exception as exc:
                log.warning("[%s] OpenAQ trend lookup failed: %s", slug, exc)
            if openaq_reading is not None:
                sensor_ids = openaq_reading.sensor_ids
                openaq_station_id = db.upsert_station(
                    conn,
                    source=openaq_reading.source_key,
                    external_id=openaq_reading.external_id,
                    name=openaq_reading.name,
                    lat=openaq_reading.lat,
                    lon=openaq_reading.lon,
                    h3_cell=cell_for(openaq_reading.lat, openaq_reading.lon),
                    city=locality["city"],
                    state=locality["state"],
                )
                if openaq_src.SOURCE_NAME not in sources_used:
                    sources_used.append(openaq_src.SOURCE_NAME)

        if sensor_ids:
            seeded = seed_trend_from_openaq(
                conn,
                openaq_client,
                station_id=openaq_station_id,
                sensor_ids=sensor_ids,
                days=trend_days,
            )
            log.info("[%s] seeded %d trend days", slug, seeded)
        trend_rows = db.daily_trend(conn, station_id=openaq_station_id, days=trend_days)
    else:
        trend_rows = db.daily_trend(conn, station_id=station_id, days=trend_days)

    trend = [
        TrendPoint(
            day=row["day"],
            aqi=round(float(row["aqi"]), 1),
            observation_count=int(row["observation_count"]),
        )
        for row in trend_rows
    ]

    # -- envelope ---------------------------------------------------------
    latest_hour_result = (
        aqi_lib.compute_aqi(reading.latest_hour) if reading.latest_hour else None
    )

    if pm25_mode:
        # PM2.5 alone cannot be an AQI, so the AQI fields carry the PM2.5
        # sub-index and the band it falls in — accurate for that one pollutant,
        # and labelled as such by aqi_basis so no consumer can mistake it for a
        # full CPCB index.
        pm25 = reading.concentrations["pm2_5"]
        sub_index = aqi_lib.sub_index("pm2_5", pm25) or 0.0
        headline_aqi = round(sub_index, 1)
        band = aqi_lib.band_for(headline_aqi)
        dominant = "PM2.5"
        basis = "pm2_5_only"
    else:
        headline_aqi = result.aqi
        band = result.band
        dominant = aqi_lib.pollutant_label(result.dominant_pollutant)
        basis = "24h_rolling"

    payload = AirQualityPayload(
        current_aqi=headline_aqi,
        aqi_band=band,
        aqi_basis=basis,
        latest_hour_aqi=latest_hour_result.aqi if latest_hour_result else None,
        dominant_pollutant=dominant,
        pm2_5=reading.concentrations.get("pm2_5"),
        pm10=reading.concentrations.get("pm10"),
        no2=reading.concentrations.get("no2"),
        so2=reading.concentrations.get("so2"),
        co=reading.concentrations.get("co"),
        o3=reading.concentrations.get("o3"),
        nh3=reading.concentrations.get("nh3"),
        station_name=reading.name,
        nearest_station_km=round(reading.distance_km, 2),
        observed_at=reading.observed_at,
        trend_30d=trend,
        sources_used=sources_used,
    )

    envelope = DataEnvelope(
        category=Category.AIR_QUALITY,
        source_name=reading.source_name,
        source_url=reading.source_url,
        fetched_at=now,
        # For air quality these are close together but genuinely different: the
        # station measured at observed_at, we pulled at fetched_at. The gap is
        # what the staleness rule above reads.
        data_vintage=reading.observed_at,
        h3_cell=locality["h3_cell"],
        confidence=confidence,
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

    # -- AQICN corroboration, stored separately on its own scale ----------
    if aqicn_client is not None:
        try:
            _store_aqicn_corroboration(conn, aqicn_client, locality=locality, now=now)
        except Exception as exc:
            log.warning("[%s] AQICN corroboration skipped: %s", slug, exc)

    return LocalityResult(slug=slug, ok=True, envelope=envelope, trend_days=len(trend))


def _store_aqicn_corroboration(
    conn, client: aqicn_src.AqicnClient, *, locality: dict[str, Any], now: datetime
) -> None:
    """Record AQICN's reading as a second, clearly-labelled envelope.

    Written on the US EPA scale under source_name 'AQICN', so the Phase 3
    orchestrator can surface disagreement between sources without any part of the
    pipeline mistaking it for the CPCB number the card displays.
    """
    station = client.nearest_station(locality["city"], locality["lat"], locality["lon"])
    if station is None:
        return
    feed = client.station_feed(station["uid"])
    if feed is None or feed["observed_at"] is None:
        return

    age = now - feed["observed_at"]
    confidence = assess_confidence(station["distance_km"], age)
    if confidence is None:
        log.info(
            "[%s] AQICN station %s is %d days stale — not stored",
            locality["slug"], station["name"], age.days,
        )
        return

    db.upsert_envelope(
        conn,
        category="air_quality",
        source_name=aqicn_src.SOURCE_NAME,
        source_url=aqicn_src.SOURCE_URL,
        fetched_at=now,
        data_vintage=feed["observed_at"],
        h3_cell=locality["h3_cell"],
        confidence=confidence.value,
        payload={
            "scale": "us_epa",
            "epa_aqi": feed["epa_aqi"],
            "dominant_pollutant": feed.get("dominant_pollutant"),
            "station_name": feed.get("name"),
            "nearest_station_km": round(station["distance_km"], 2),
            "observed_at": feed["observed_at"].isoformat(),
            "epa_sub_indices": feed.get("epa_sub_indices", {}),
            "note": (
                "US EPA scale, not CPCB. Not comparable to the CPCB AQI shown on "
                "the card; kept for source-disagreement disclosure."
            ),
        },
    )


def available_clients() -> dict[str, bool]:
    """Which sources are configured — used by run.py to report before fetching."""
    return {
        "CPCB via data.gov.in": DATA_GOV_IN.is_set(),
        "CPCB via OpenAQ": OPENAQ.is_set(),
        "AQICN": AQICN.is_set(),
    }
