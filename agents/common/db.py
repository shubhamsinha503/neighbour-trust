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
    """Every locality.

    Returns the same columns as get_locality, `id` included. They diverged once —
    list_localities omitted `id` — and the news agent, which needs it as a
    foreign key, raised KeyError('id') only on the all-localities path. A
    single-locality run went through get_locality and passed, so the bug reached
    CI. Keep the two column lists identical.
    """
    return conn.execute(
        """
        SELECT id, slug, name, city, state, pincode, h3_cell,
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


def last_productive_ingest(
    conn: psycopg.Connection, *, category: str
) -> Optional[dict[str, Any]]:
    """The last run that actually stored something.

    `status = 'ok'` is not enough, and that distinction is the whole point of
    this function. On 2026-08-31 the air quality job completed cleanly while
    storing zero localities — the upstream CPCB feed had stopped publishing, so
    every locality was correctly skipped. The run was a success in the sense that
    nothing crashed, and a total data outage in the sense that mattered.
    Requiring localities_ok > 0 is what makes the second sense visible.
    """
    return conn.execute(
        """
        SELECT started_at, finished_at, localities_ok, localities_skipped
        FROM ingest_run
        WHERE category = %s::category_t AND status = 'ok' AND localities_ok > 0
        ORDER BY started_at DESC
        LIMIT 1
        """,
        (category,),
    ).fetchone()


def last_ingest_run(
    conn: psycopg.Connection, *, category: str
) -> Optional[dict[str, Any]]:
    """The most recent run of any outcome — so "running but producing nothing"
    can be told apart from "not running at all"."""
    return conn.execute(
        """
        SELECT started_at, finished_at, status, localities_ok, localities_skipped, error
        FROM ingest_run
        WHERE category = %s::category_t
        ORDER BY started_at DESC
        LIMIT 1
        """,
        (category,),
    ).fetchone()


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"not JSON-serialisable: {type(value)!r}")


# ---------------------------------------------------------------------------
# Schools — see infra/migrations/003_schools.sql
# ---------------------------------------------------------------------------


SCHOOL_COLUMNS = (
    "udise_code", "name", "state", "district", "pincode", "school_category",
    "school_type", "management", "board_secondary", "board_higher_sec",
    "year_established", "class_from", "class_to", "total_teachers",
    "total_students", "class_rooms", "other_rooms", "pupil_teacher_ratio",
    "students_per_room", "proxy_score", "data_vintage", "source_name",
)


def upsert_school(conn: psycopg.Connection, school: dict[str, Any]) -> int:
    """Insert or refresh one school, keyed on (source, external_id).

    Keyed on the upstream's own identifier rather than a surrogate id so a later
    refresh updates rows in place — which is what makes the 2022 UDISE snapshot
    fixable by configuration rather than by reimport. UDISE rows key on the UDISE
    code, OSM rows on "way/12345".
    """
    values = [school.get(col) for col in SCHOOL_COLUMNS]
    assignments = ", ".join(f"{c} = EXCLUDED.{c}" for c in SCHOOL_COLUMNS)
    row = conn.execute(
        f"""
        INSERT INTO school (source, external_id, location, h3_cell,
                            {", ".join(SCHOOL_COLUMNS)}, fetched_at)
        VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s,
                {", ".join(["%s"] * len(SCHOOL_COLUMNS))}, now())
        ON CONFLICT (source, external_id) DO UPDATE SET
            location = EXCLUDED.location,
            h3_cell  = EXCLUDED.h3_cell,
            {assignments},
            fetched_at = now()
        RETURNING id
        """,
        (
            school["source"], school["external_id"],
            school["lon"], school["lat"], school["h3_cell"], *values,
        ),
    ).fetchone()
    return row["id"]


def schools_near(
    conn: psycopg.Connection,
    *,
    lat: float,
    lon: float,
    radius_km: float,
    source: Optional[str] = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Schools within a radius of a point, nearest first.

    Distance is computed in PostGIS rather than in Python because this runs per
    API request over the whole school table, and the GiST index on `location` is
    the entire reason that is cheap.
    """
    return conn.execute(
        """
        SELECT source, external_id, udise_code, name, management, school_category,
               board_secondary, board_higher_sec, total_students, total_teachers,
               pupil_teacher_ratio, students_per_room, proxy_score,
               ST_Distance(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) / 1000.0
                   AS distance_km
        FROM school
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
          AND (%s::text IS NULL OR source = %s)
        ORDER BY distance_km
        LIMIT %s
        """,
        (lon, lat, lon, lat, radius_km * 1000, source, source, limit),
    ).fetchall()


def count_schools(conn: psycopg.Connection) -> int:
    return conn.execute("SELECT COUNT(*) AS n FROM school").fetchone()["n"]


# ---------------------------------------------------------------------------
# News mentions — see infra/migrations/005_news.sql
# ---------------------------------------------------------------------------


def upsert_news_mention(conn: psycopg.Connection, mention: dict[str, Any]) -> int:
    """Store one locality-tagged article.

    Existing rows keep their classification on conflict. Re-fetching the same
    article every week must not wipe a judgement already made about it — with an
    LLM classifier that would mean paying to re-decide the same headline
    indefinitely.
    """
    row = conn.execute(
        """
        INSERT INTO news_mention
            (locality_id, h3_cell, category, url, title, domain, language,
             source_country, published_at, query_term, source_name)
        VALUES (%s, %s, %s::category_t, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (locality_id, category, url) DO UPDATE SET
            title      = EXCLUDED.title,
            fetched_at = now()
        RETURNING id
        """,
        (
            mention["locality_id"], mention["h3_cell"], mention["category"],
            mention["url"], mention["title"], mention.get("domain"),
            mention.get("language"), mention.get("source_country"),
            mention.get("published_at"), mention.get("query_term"),
            mention.get("source_name", "GDELT"),
        ),
    ).fetchone()
    return row["id"]


def unclassified_mentions(
    conn: psycopg.Connection, *, limit: int = 500
) -> list[dict[str, Any]]:
    return conn.execute(
        """
        SELECT n.id, n.title, n.category, n.url, l.name AS locality, l.city
        FROM news_mention n
        JOIN locality l ON l.id = n.locality_id
        WHERE n.classified_at IS NULL
        ORDER BY n.published_at DESC NULLS LAST
        LIMIT %s
        """,
        (limit,),
    ).fetchall()


def record_classification(
    conn: psycopg.Connection,
    mention_id: int,
    *,
    is_locality_specific: bool,
    incident_type: Optional[str],
    classifier: str,
    reason: str,
) -> None:
    conn.execute(
        """
        UPDATE news_mention
           SET is_locality_specific = %s,
               incident_type        = %s,
               classifier           = %s,
               classifier_reason    = %s,
               classified_at        = now()
         WHERE id = %s
        """,
        (is_locality_specific, incident_type, classifier, reason, mention_id),
    )


def confirmed_incidents(
    conn: psycopg.Connection, *, h3_cell: str, category: str, months: int = 12
) -> list[dict[str, Any]]:
    """Mentions confirmed as locality-specific incidents.

    `is_locality_specific IS TRUE` rather than `IS NOT FALSE`: an unclassified
    mention (NULL) is not evidence of anything and must never reach a count.
    """
    return conn.execute(
        """
        SELECT title, url, domain, language, published_at, incident_type, classifier
        FROM news_mention
        WHERE h3_cell = %s
          AND category = %s::category_t
          AND is_locality_specific IS TRUE
          AND published_at >= now() - make_interval(months => %s)
        ORDER BY published_at DESC
        """,
        (h3_cell, category, months),
    ).fetchall()


def mention_counts(
    conn: psycopg.Connection, *, h3_cell: str, category: str, months: int = 12
) -> dict[str, int]:
    """Fetched / classified / confirmed, so the gap between them stays visible."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS fetched,
               COUNT(*) FILTER (WHERE classified_at IS NOT NULL) AS classified,
               COUNT(*) FILTER (WHERE is_locality_specific IS TRUE) AS confirmed
        FROM news_mention
        WHERE h3_cell = %s
          AND category = %s::category_t
          AND published_at >= now() - make_interval(months => %s)
        """,
        (h3_cell, category, months),
    ).fetchone()
    return {k: int(v or 0) for k, v in row.items()}


def latest_envelope_by_source(
    conn: psycopg.Connection, *, category: str, h3_cell: str, source_name: str
) -> Optional[dict[str, Any]]:
    """Latest envelope for one cell from one specific source.

    Needed because a category can hold envelopes from several sources at once —
    air quality stores CPCB and AQICN separately and on different scales. The
    orchestrator fetches the second one explicitly to surface the disagreement
    between them, which is precisely the behaviour docs/strategy.md calls the
    product's differentiator.
    """
    return conn.execute(
        """
        SELECT category, source_name, source_url, fetched_at, data_vintage,
               h3_cell, confidence, payload
        FROM data_envelope
        WHERE category = %s::category_t AND h3_cell = %s AND source_name = %s
        ORDER BY data_vintage DESC, fetched_at DESC
        LIMIT 1
        """,
        (category, h3_cell, source_name),
    ).fetchone()
