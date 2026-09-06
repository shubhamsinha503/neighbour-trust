-- What residents tell us, which is the only source for the things no Indian
-- body publishes at locality level.
--
-- docs/strategy.md calls power "realistically a crowd-sourced-data category for
-- the foreseeable future", and the same is true of water and much of safety.
-- Press coverage stands in for all three today, and it measures how closely a
-- neighbourhood is reported on rather than what happens there. A resident is the
-- only source that does not have that bias.
--
-- Reports have the opposite failure mode to press, and the schema is shaped
-- around it. Press is unbiased about *who* is speaking and biased about *where*;
-- a report is precise about where and entirely unverified about who. Four rules
-- follow, and each is enforced here rather than left to the agent:
--
--   1. **Nothing reaches a score until a person accepts it.** `state` starts at
--      'pending' and every reader filters on 'accepted'. Without this, one
--      motivated person with a browser can move a neighbourhood's score, and
--      the first people to find that out will be the ones selling property
--      there. This is the single most important column in the table.
--
--   2. **A report is evidence, not a measurement.** It can raise a flag and it
--      can contradict a baseline. It does not become a number on its own. One
--      person saying the water is bad is a thing worth showing a buyer; it is
--      not a water score.
--
--   3. **Credibility is stored as its inputs, never as a verdict.** How someone
--      knows, and what they are to the area, are recorded as given. The weight
--      derived from them is computed at read time, like confidence and the Trust
--      Score, so changing that judgement never means a backfill and never
--      silently rewrites what someone actually said.
--
--   4. **The contact is optional and separable.** It is the only personal data
--      this database has ever held. It is nullable, it is never required to file
--      a report, and `contact_removed_at` records erasure without deleting the
--      report itself — a person withdrawing their email should not also withdraw
--      what they told us about a flooded road.

-- Where a report came from. Google Forms first, because it collects submissions
-- today with no accounts to build; 'api' is the native path when it exists.
DO $$ BEGIN
    CREATE TYPE report_source_t AS ENUM ('google_form', 'api', 'import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Moderation state. Deliberately four values rather than a boolean: "nobody has
-- looked at this" and "somebody looked and rejected it" are different facts, and
-- collapsing them would make an unreviewed backlog indistinguishable from a
-- clean one.
DO $$ BEGIN
    CREATE TYPE report_state_t AS ENUM ('pending', 'accepted', 'rejected', 'spam');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- How the person knows. Ordered from strongest to weakest, and kept as the
-- submitter's own answer rather than an inference.
DO $$ BEGIN
    CREATE TYPE report_basis_t AS ENUM (
        'happened_to_me', 'witnessed', 'second_hand', 'read_it', 'unstated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- What the person is to the area. A current resident describing a recurring
-- problem is worth more than a passer-by, and neither is worth nothing.
DO $$ BEGIN
    CREATE TYPE report_tie_t AS ENUM (
        'lives_here', 'lived_here', 'works_here', 'considering', 'visiting', 'unstated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE IF NOT EXISTS resident_report (
    id              BIGSERIAL PRIMARY KEY,

    locality_id     BIGINT NOT NULL REFERENCES locality(id) ON DELETE CASCADE,
    h3_cell         TEXT   NOT NULL,
    category        category_t NOT NULL,

    -- What they actually said, verbatim. Never rewritten: a summary of a report
    -- is a different claim from the report, and a moderator has to be able to
    -- read exactly what was submitted.
    body            TEXT NOT NULL,

    -- Coarse buckets rather than a date, because that is what the form asks and
    -- inventing a precision the submitter did not give would be worse than the
    -- vagueness. 'ongoing' is separate from any window: a problem that is still
    -- happening is a different claim from one that happened recently.
    occurred_window TEXT,          -- last_week | last_month | last_6_months | older | ongoing

    basis           report_basis_t NOT NULL DEFAULT 'unstated',
    tie_to_area     report_tie_t   NOT NULL DEFAULT 'unstated',

    -- Something a moderator can check. A link to a news item, a society group
    -- post, a photo hosted elsewhere. Never uploaded here — accepting uploads
    -- means accepting responsibility for moderating images before they appear
    -- beside a real neighbourhood's name.
    evidence_url    TEXT,

    -- The only personal data in this database, and only if volunteered.
    contact_email      TEXT,
    contact_removed_at TIMESTAMPTZ,

    source          report_source_t NOT NULL DEFAULT 'google_form',
    -- The upstream id, so re-importing a form export is idempotent. Two
    -- identical reports from two different people are both real and both kept;
    -- the same report imported twice is a bug, and this is what prevents it.
    external_id     TEXT,

    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Moderation. Nothing here counts for anything until state = 'accepted'.
    state           report_state_t NOT NULL DEFAULT 'pending',
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     TEXT,
    review_note     TEXT,

    -- What a moderator decided this describes, using the same vocabulary as
    -- news_mention.incident_type so a report and an article about the same
    -- flooding land in the same bucket. Null until reviewed.
    incident_type   TEXT,

    -- A moderator's judgement that this report, specifically, is unreliable —
    -- separate from the derived credibility weight, which is about the answers
    -- given rather than about this person.
    distrusted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT resident_report_body_not_empty CHECK (length(btrim(body)) > 0),
    CONSTRAINT resident_report_reviewed_together CHECK (
        (state = 'pending' AND reviewed_at IS NULL)
        OR (state <> 'pending' AND reviewed_at IS NOT NULL)
    ),
    -- An email that has been erased must actually be gone. Without this the
    -- erasure timestamp can be set while the address is still sitting in the row.
    CONSTRAINT resident_report_contact_erased CHECK (
        contact_removed_at IS NULL OR contact_email IS NULL
    )
);

-- Idempotent import. Partial, because 'api' reports have no external id and
-- several NULLs must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS resident_report_source_external_idx
    ON resident_report (source, external_id)
    WHERE external_id IS NOT NULL;

-- The read path every card uses: accepted reports for one cell and category.
CREATE INDEX IF NOT EXISTS resident_report_cell_category_idx
    ON resident_report (h3_cell, category, state);

-- The moderation queue, oldest first.
CREATE INDEX IF NOT EXISTS resident_report_pending_idx
    ON resident_report (submitted_at)
    WHERE state = 'pending';
