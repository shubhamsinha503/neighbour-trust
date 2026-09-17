-- A single running tally of homepage views.
--
-- One number, one row. This is a vanity counter for the front page — "N and
-- counting" — not analytics: it holds no time series, no per-page breakdown and
-- nothing about who visited. Like locality_request it is anonymous by
-- construction, because there is nowhere in this table to put a person even if
-- we wanted to.
--
-- The singleton is enforced rather than assumed. A CHECK pins the row to id = 1
-- so a second row cannot appear and split the count, and the seed INSERT is
-- idempotent so running migrations twice leaves the tally untouched. Increments
-- are a single atomic UPDATE ... RETURNING (see apps/api/app/visits.py), so
-- concurrent views never lose a count to a read-modify-write race.

CREATE TABLE IF NOT EXISTS visit_counter (
    id     SMALLINT PRIMARY KEY DEFAULT 1,
    total  BIGINT   NOT NULL DEFAULT 0,
    CONSTRAINT visit_counter_singleton CHECK (id = 1)
);

INSERT INTO visit_counter (id, total) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
