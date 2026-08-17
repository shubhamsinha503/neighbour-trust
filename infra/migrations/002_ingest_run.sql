-- Ingestion run log.
--
-- Exists for one reason: a scheduler you cannot tell is dead is worth nothing.
-- Once the agent runs unattended on a schedule, "the data looks a bit old" and
-- "the job has been crashing for nine days" are indistinguishable from the
-- outside — and the failure mode is silent, because stale rows still serve
-- happily through the API.
--
-- Every scheduled run writes a row here whether it succeeds or fails, so
-- /healthz can answer "when did ingestion last actually work?" rather than only
-- "is the database up?".

CREATE TABLE IF NOT EXISTS ingest_run (
    id             BIGSERIAL PRIMARY KEY,
    category       category_t  NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ,

    localities_ok      INTEGER NOT NULL DEFAULT 0,
    localities_skipped INTEGER NOT NULL DEFAULT 0,

    -- NULL while running, 'ok' or 'error' once finished. A row that stays NULL
    -- long past its expected duration is itself the signal that a run died
    -- mid-flight.
    status         TEXT,
    error          TEXT,

    -- Which sources were configured for this run. Makes "why did quality drop
    -- last Tuesday" answerable — usually the answer is that a key expired.
    sources        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ingest_run_recent_idx
    ON ingest_run (category, started_at DESC);
