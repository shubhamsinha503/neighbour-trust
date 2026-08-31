-- Schools.
--
-- Shape note, because it differs from air quality in a way that matters:
-- air quality is one measurement per locality, schools is *many rows* per
-- locality. So the raw records live in their own table and the envelope carries
-- an aggregate over them, rather than the envelope being the only store.
--
-- That split is what lets "4 schools within 2 km, median PTR 22:1" be recomputed
-- when the radius or the scoring changes, without re-fetching 1.37M rows from
-- upstream.

CREATE TABLE IF NOT EXISTS school (
    id                  BIGSERIAL PRIMARY KEY,

    -- UDISE's own 11-digit code. Stable across years, which is what makes an
    -- eventual refresh to a newer UDISE cycle an update rather than a reimport.
    udise_code          TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,

    state               TEXT,
    district            TEXT,
    pincode             TEXT,

    location            geography(Point, 4326) NOT NULL,
    h3_cell             TEXT NOT NULL,

    -- Descriptive fields, straight from UDISE.
    school_category     TEXT,   -- e.g. "Pri. with Upper Pri. Sec. and H.Sec."
    school_type         TEXT,   -- co-ed / boys / girls
    management          TEXT,   -- Department of Education, Private Unaided, ...
    board_secondary     TEXT,
    board_higher_sec    TEXT,
    year_established    INTEGER,
    class_from          TEXT,
    class_to            TEXT,

    -- The numbers the proxy score is built from.
    total_teachers      INTEGER,
    total_students      INTEGER,
    class_rooms         INTEGER,
    other_rooms         INTEGER,

    -- Derived at ingest so the API never recomputes per request.
    pupil_teacher_ratio DOUBLE PRECISION,
    students_per_room   DOUBLE PRECISION,
    proxy_score         DOUBLE PRECISION,   -- 0-100, see agents/schools/scoring.py

    -- How old the underlying UDISE cycle is. Carried per row rather than assumed
    -- globally: a later refresh may bring some districts forward before others,
    -- and the confidence tag has to reflect the row it actually describes.
    data_vintage        TIMESTAMPTZ NOT NULL,
    source_name         TEXT NOT NULL,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_location_idx ON school USING GIST (location);
CREATE INDEX IF NOT EXISTS school_h3_idx       ON school (h3_cell);
CREATE INDEX IF NOT EXISTS school_district_idx ON school (district);
