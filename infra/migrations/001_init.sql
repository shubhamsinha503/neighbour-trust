-- Neighbour Trust — initial schema.
--
-- Makes packages/schema/python/neighbour_trust_schema/envelope.py true against a
-- real database: data_envelope is the envelope, one row per (category, locality,
-- source, vintage), keyed by H3 cell so six categories from six unrelated sources
-- join on location without ever needing a shared address format.
--
-- Design notes worth knowing before extending this:
--   * H3 cells are stored as TEXT, not a native type. The `h3-pg` Postgres
--     extension exists but is not in the standard postgis image, and every H3
--     operation we need (latlng->cell, cell->boundary, k-ring) happens in Python
--     via h3-py inside the agents. Keeping the DB dumb about H3 means the DB
--     image stays stock.
--   * geom is derived from the H3 cell centroid, not stored independently, so the
--     two can never drift. PostGIS earns its place on proximity queries
--     ("nearest station to this locality"), which is exactly the nearest_station_km
--     field the air quality confidence rule depends on.
--   * Both are indexed: h3_cell for exact-cell joins between agents, geom (GiST)
--     for distance work.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Enums mirror the Python enums exactly. Adding a value here means adding it in
-- envelope.py and envelope.ts in the same commit.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE category_t AS ENUM (
        'schools', 'crime', 'air_quality', 'water', 'power', 'infrastructure'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE confidence_t AS ENUM (
        'high', 'medium', 'low', 'community_estimated'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- Localities — the buyer-facing unit. A locality is what someone searches for
-- ("Indiranagar"), an H3 cell is what we key data to; this table is the join.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS locality (
    id          BIGSERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    city        TEXT NOT NULL,
    state       TEXT NOT NULL,
    pincode     TEXT,
    -- Centroid of the locality as commonly understood, not a bounding polygon.
    -- Polygons are a Phase 2 problem: locality boundaries in India are contested
    -- and unofficial, and pretending we have a precise one would be exactly the
    -- false precision docs/strategy.md warns against.
    centroid    geography(Point, 4326) NOT NULL,
    h3_cell     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locality_h3_idx       ON locality (h3_cell);
CREATE INDEX IF NOT EXISTS locality_centroid_idx ON locality USING GIST (centroid);
CREATE INDEX IF NOT EXISTS locality_city_idx     ON locality (city);


-- ---------------------------------------------------------------------------
-- Air quality monitoring stations, from whichever upstream told us about them.
-- One physical station can appear under several sources with different ids, so
-- identity is (source, external_id) and dedupe across sources is done on
-- proximity in the agent, not here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS aq_station (
    id           BIGSERIAL PRIMARY KEY,
    source       TEXT NOT NULL,           -- 'cpcb' | 'aqicn' | 'openaq'
    external_id  TEXT NOT NULL,           -- station name for CPCB, uid for AQICN, id for OpenAQ
    name         TEXT NOT NULL,
    city         TEXT,
    state        TEXT,
    location     geography(Point, 4326) NOT NULL,
    h3_cell      TEXT NOT NULL,
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS aq_station_location_idx ON aq_station USING GIST (location);
CREATE INDEX IF NOT EXISTS aq_station_h3_idx       ON aq_station (h3_cell);


-- ---------------------------------------------------------------------------
-- Raw per-station observations. This is the layer the envelope is computed
-- *from*, not a copy of it.
--
-- It exists for one specific reason: neither the CPCB data.gov.in resource nor
-- the AQICN free API returns history — both are current-value-only. The 30-day
-- trend is seeded from OpenAQ (90-day window) and then accumulated here from our
-- own hourly pulls, so the chart survives OpenAQ's window rolling past us.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS aq_observation (
    id                  BIGSERIAL PRIMARY KEY,
    station_id          BIGINT NOT NULL REFERENCES aq_station(id) ON DELETE CASCADE,
    observed_at         TIMESTAMPTZ NOT NULL,   -- when the station measured, not when we fetched
    source              TEXT NOT NULL,

    aqi                 DOUBLE PRECISION,       -- CPCB National AQI, computed by us for CPCB rows
    dominant_pollutant  TEXT,

    -- How many underlying readings this row represents. 1 for a live hourly pull;
    -- for a day seeded from OpenAQ's daily aggregate it is that day's real hour
    -- count, so a day built from 4 readings never looks as solid as one built
    -- from 96.
    observation_count   INTEGER NOT NULL DEFAULT 1,

    pm2_5               DOUBLE PRECISION,
    pm10                DOUBLE PRECISION,
    no2                 DOUBLE PRECISION,
    so2                 DOUBLE PRECISION,
    co                  DOUBLE PRECISION,       -- mg/m³, unlike the others
    o3                  DOUBLE PRECISION,
    nh3                 DOUBLE PRECISION,

    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Re-running the agent for the same hour must not duplicate rows; the hourly
    -- schedule and any manual backfill will overlap constantly.
    UNIQUE (station_id, observed_at, source)
);

CREATE INDEX IF NOT EXISTS aq_obs_station_time_idx ON aq_observation (station_id, observed_at DESC);


-- ---------------------------------------------------------------------------
-- The envelope table. Every category agent writes here and nowhere else.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_envelope (
    id            BIGSERIAL PRIMARY KEY,

    category      category_t   NOT NULL,
    source_name   TEXT         NOT NULL,
    source_url    TEXT,
    fetched_at    TIMESTAMPTZ  NOT NULL,
    -- How old the underlying data actually is. Kept separate from fetched_at on
    -- purpose: a UDISE+ record fetched today can still be 18 months stale, and
    -- that gap is what the UI's confidence tag and "last updated" line report.
    data_vintage  TIMESTAMPTZ  NOT NULL,

    h3_cell       TEXT         NOT NULL,
    geom          geography(Point, 4326) NOT NULL,  -- H3 cell centroid, derived
    confidence    confidence_t NOT NULL,
    payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- One row per source per cell per vintage. An hourly AQI pull that returns
    -- the same station reading twice updates in place rather than growing the
    -- table; a genuinely new reading has a new data_vintage and inserts.
    UNIQUE (category, h3_cell, source_name, data_vintage)
);

CREATE INDEX IF NOT EXISTS envelope_lookup_idx  ON data_envelope (category, h3_cell, data_vintage DESC);
CREATE INDEX IF NOT EXISTS envelope_geom_idx    ON data_envelope USING GIST (geom);
CREATE INDEX IF NOT EXISTS envelope_payload_idx ON data_envelope USING GIN (payload);
