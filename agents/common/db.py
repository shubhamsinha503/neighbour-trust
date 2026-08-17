"""Database access shared by the agents and the API.

Plain SQL over psycopg3 rather than an ORM. infra/migrations/001_init.sql stays
the single source of truth for the schema, and PostGIS/geography columns are
awkward enough through an ORM layer that the indirection would cost more than it
saves at this size.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Iterable, Iterator, Optional

import psycopg
from psycopg.rows import dict_row

from agents.common.config import database_url
from agents.common.geo import cell_centroid


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """Open a connection with dict rows. Commits on clean exit, rolls back on error."""
    with psycopg.connect(database_url(), row_factory=dict_row) as conn:
        yield conn


# ---------------------------------------------------------------------------
# Localities
# ---------------------------------------------------------------------------


def upsert_locality(
    conn: psycopg.Connection,
    *,
    slug: str,
    name: str,
    city: str,
    state: str,
    lat: float,
    lon: float,
    h3_cell: str,
    pincode: Optional[str] = None,
) -> int:
    row = conn.execute(
        """
        INSERT INTO locality (slug, name, city, state, pincode, centroid, h3_cell)
        VALUES (%s, %s, %s, %s, %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
        ON CONFLICT (slug) DO UPDATE SET
            name     = EXCLUDED.name,
            city     = EXCLUDED.city,
            state    = EXCLUDED.state,
            pincode  = EXCLUDED.pincode,
            centroid = EXCLUDED.centroid,
            h3_cell  = EXCLUDED.h3_cell
        RETURNING id
        """,
        (slug, name, city, state, pincode, lon, lat, h3_cell),
    ).fetchone()
    return row["id"]


def get_locality(conn: psycopg.Connection, slug: str) -> Optional[dict[str, Any]]:
    return conn.execute(
        """
        SELECT id, slug, name, city, state, pincode, h3_cell,
               ST_Y(centroid::geometry) AS lat,
               ST_X(centroid::geometry) AS lon
        FROM locality WHERE slug = %s
        """,
        (slug,),
    ).fetchone()


def list_localities(conn: psycopg.Connection) -> list[dict[str, Any]]:
    return conn.execute(
        """
        SELECT slug, name, city, state, pincode, h3_cell,
               ST_Y(centroid::geometry) AS lat,
               ST_X(centroid::geometry) AS lon
        FROM locality ORDER BY city, name
        """
    ).fetchall()


# ---------------------------------------------------------------------------
# Air quality stations and observations
# ---------------------------------------------------------------------------


def upsert_station(
    conn: psycopg.Connection,
    *,
    source: str,
    external_id: str,
    name: str,
    lat: float,
    lon: float,
    h3_cell: str,
    city: Optional[str] = None,
    state: Optional[str] = None,
) -> int:
    row = conn.execute(
        """
        INSERT INTO aq_station (source, external_id, name, city, state, location, h3_cell)
        VALUES (%s, %s, %s, %s, %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
        ON CONFLICT (source, external_id) DO UPDATE SET
            name      = EXCLUDED.name,
            city      = EXCLUDED.city,
            state     = EXCLUDED.state,
            location  = EXCLUDED.location,
            h3_cell   = EXCLUDED.h3_cell,
            last_seen = now()
        RETURNING id
        """,
        (source, external_id, name, city, state, lon, lat, h3_cell),
    ).fetchone()
    return row["id"]


POLLUTANT_COLUMNS = ("pm2_5", "pm10", "no2", "so2", "co", "o3", "nh3")


def upsert_observation(
    conn: psycopg.Connection,
    *,
    station_id: int,
    source: str,
    observed_at: datetime,
    aqi: Optional[float] = None,
    dominant_pollutant: Optional[str] = None,
    pollutants: Optional[dict[str, float]] = None,
    observation_count: int = 1,
) -> None:
    """Write one station-hour. Re-running the agent for the same hour updates in
    place — the hourly schedule and any manual backfill overlap constantly."""
    pollutants = pollutants or {}
    values = [pollutants.get(col) for col in POLLUTANT_COLUMNS]
    conn.execute(
        f"""
        INSERT INTO aq_observation
            (station_id, source, observed_at, aqi, dominant_pollutant,
             observation_count, {", ".join(POLLUTANT_COLUMNS)})
        VALUES (%s, %s, %s, %s, %s, %s, {", ".join(["%s"] * len(POLLUTANT_COLUMNS))})
        ON CONFLICT (station_id, observed_at, source) DO UPDATE SET
            aqi                = EXCLUDED.aqi,
            dominant_pollutant = EXCLUDED.dominant_pollutant,
            observation_count  = EXCLUDED.observation_count,
            {", ".join(f"{c} = EXCLUDED.{c}" for c in POLLUTANT_COLUMNS)},
            ingested_at        = now()
        """,
        (station_id, source, observed_at, aqi, dominant_pollutant, observation_count, *values),
    )


def daily_trend(
    conn: psycopg.Connection, *, station_id: int, days: int = 30
) -> list[dict[str, Any]]:
    """Daily mean AQI for a station, computed from stored observations.

    Reads from our own aq_observation table rather than re-querying upstream, so
    the chart keeps working after OpenAQ's 90-day window rolls past the seeded
    range. Days with no observations are simply absent — the chart renders those
    as gaps rather than interpolating across them.
    """
    return conn.execute(
        """
        WITH rows AS (
            SELECT (observed_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
                   aqi,
                   observation_count,
                   -- Our own hourly pulls beat a seeded daily aggregate for the
                   -- same day: same underlying station, but we know exactly what
                   -- went into ours.
                   CASE WHEN source LIKE '%%_daily' THEN 2 ELSE 1 END AS priority
            FROM aq_observation
            WHERE station_id = %s
              AND aqi IS NOT NULL
              AND observed_at >= now() - make_interval(days => %s)
        ),
        preferred AS (
            SELECT day, MIN(priority) AS priority FROM rows GROUP BY day
        )
        SELECT r.day,
               AVG(r.aqi)               AS aqi,
               SUM(r.observation_count) AS observation_count
        FROM rows r
        JOIN preferred p ON p.day = r.day AND p.priority = r.priority
        GROUP BY r.day
        ORDER BY r.day
        """,
        (station_id, days),
    ).fetchall()


def nearest_station(
    conn: psycopg.Connection, *, lat: float, lon: float, max_km: float = 50.0
) -> Optional[dict[str, Any]]:
    """Closest known station to a point, within a hard radius.

    The radius is not optional politeness. AQICN's `feed/geo:` endpoint answered a
    Bengaluru query with a Delhi station roughly 1,700 km away during Phase 1
    testing; any nearest-station logic that trusts an upstream's own idea of
    "nearby" will eventually attribute one city's air to another.
    """
    return conn.execute(
        """
        SELECT id, source, external_id, name, city, h3_cell,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lon,
               ST_Distance(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) / 1000.0 AS distance_km
        FROM aq_station
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
        ORDER BY distance_km
        LIMIT 1
        """,
        (lon, lat, lon, lat, max_km * 1000),
    ).fetchone()


# ---------------------------------------------------------------------------
# Envelopes
# ---------------------------------------------------------------------------


def upsert_envelope(
    conn: psycopg.Connection,
    *,
    category: str,
    source_name: str,
    source_url: Optional[str],
    fetched_at: datetime,
    data_vintage: datetime,
    h3_cell: str,
    confidence: str,
    payload: dict[str, Any],
) -> int:
    lat, lon = cell_centroid(h3_cell)
    row = conn.execute(
        """
        INSERT INTO data_envelope
            (category, source_name, source_url, fetched_at, data_vintage,
             h3_cell, geom, confidence, payload)
        VALUES (%s, %s, %s, %s, %s, %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s, %s)
        ON CONFLICT (category, h3_cell, source_name, data_vintage) DO UPDATE SET
            source_url = EXCLUDED.source_url,
            fetched_at = EXCLUDED.fetched_at,
            geom       = EXCLUDED.geom,
            confidence = EXCLUDED.confidence,
            payload    = EXCLUDED.payload
        RETURNING id
        """,
        (
            category, source_name, source_url, fetched_at, data_vintage,
            h3_cell, lon, lat, confidence, json.dumps(payload, default=_json_default),
        ),
    ).fetchone()
    return row["id"]


def latest_envelope(
    conn: psycopg.Connection, *, category: str, h3_cell: str
) -> Optional[dict[str, Any]]:
    """Most recent envelope for a cell, by the age of the underlying data.

    Ordered by data_vintage, not fetched_at: a fresh fetch of stale data is still
    stale data, and ordering by fetch time would let a re-pull of a two-month-old
    reading outrank a genuinely current one.
    """
    return conn.execute(
        """
        SELECT category, source_name, source_url, fetched_at, data_vintage,
               h3_cell, confidence, payload
        FROM data_envelope
        WHERE category = %s::category_t AND h3_cell = %s
        ORDER BY data_vintage DESC, fetched_at DESC
        LIMIT 1
        """,
        (category, h3_cell),
    ).fetchone()


# ---------------------------------------------------------------------------
# Ingestion run log — see infra/migrations/002_ingest_run.sql
# ---------------------------------------------------------------------------


def start_ingest_run(
    conn: psycopg.Connection, *, category: str, sources: dict[str, bool]
) -> int:
    row = conn.execute(
        """
        INSERT INTO ingest_run (category, sources)
        VALUES (%s::category_t, %s)
        RETURNING id
        """,
        (category, json.dumps(sources)),
    ).fetchone()
    return row["id"]


def finish_ingest_run(
    conn: psycopg.Connection,
    run_id: int,
    *,
    status: str,
    ok: int = 0,
    skipped: int = 0,
    error: Optional[str] = None,
) -> None:
    conn.execute(
        """
        UPDATE ingest_run
           SET finished_at = now(),
            status = %s,
            localities_ok = %s,
            localities_skipped = %s,
            error = %s
        WHERE id = %s
        """,
        (status, ok, skipped, error, run_id),
    )


def last_successful_ingest(
    conn: psycopg.Connection, *, category: str
) -> Optional[dict[str, Any]]:
    return conn.execute(
        """
        SELECT started_at, finished_at, localities_ok, localities_skipped
        FROM ingest_run
        WHERE category = %s::category_t AND status = 'ok'
        ORDER BY started_at DESC
        LIMIT 1
        """,
        (category,),
    ).fetchone()


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"not JSON-serialisable: {type(value)!r}")
