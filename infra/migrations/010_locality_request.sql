-- Places people searched for and asked us to cover.
--
-- Coverage has been chosen from the map so far — OpenStreetMap place nodes,
-- ranked by housing density (scripts/propose_localities.py). This is the other
-- half: what visitors actually looked for and did not find. Enough requests
-- for the same place is a reason to add it next.
--
-- Deliberately nothing about the person. No email, no account, no IP address:
-- the request is a fact about a place, and a demand count does not need to
-- know who asked. Rate limiting happens in the API's memory and is never
-- written here. The privacy page describes exactly these columns.

CREATE TABLE IF NOT EXISTS locality_request (
    id           BIGSERIAL PRIMARY KEY,

    -- What was typed, trimmed and capped. Kept as written, so "Kharadi" and
    -- "kharadi pune" can be read and grouped by a person rather than guessed at.
    query_text   TEXT NOT NULL,
    -- Lowercased and stripped of punctuation, for counting repeats.
    query_key    TEXT NOT NULL,

    -- The city chip selected when it was asked, if any.
    city         TEXT,

    -- Where the place lookup put it, when it found it. A place, not a person:
    -- this is the searched location, never the visitor's own.
    place_label  TEXT,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    -- Nearest covered locality and its distance, so "asked for, but 900 m from
    -- one we have" can be told apart from "nothing we cover within 20 km".
    nearest_slug TEXT,
    nearest_km   DOUBLE PRECISION,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT locality_request_text_length CHECK (length(query_text) BETWEEN 2 AND 120),
    CONSTRAINT locality_request_lat CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
    CONSTRAINT locality_request_lon CHECK (lon IS NULL OR lon BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS locality_request_key_idx
    ON locality_request (query_key, created_at DESC);
