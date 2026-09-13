-- People who choose to sign in, and what they save.
--
-- Until this migration the database held no personal data at all: "there is no
-- table of people in it, only tables of places", as the privacy page put it.
-- Signing in is optional and nothing here is created until someone does. The
-- privacy page changes in the same commit as this file.
--
-- Three rules, each enforced in the schema rather than left to the API:
--
--   1. **Only what sign-in needs.** The Google account id to recognise a
--      returning person, and the email and name Google shows them at sign-in so
--      the page can say who is signed in. No phone, no photo, no location, no
--      browsing history.
--
--   2. **Deleting an account deletes everything.** Every table that refers to a
--      user does so ON DELETE CASCADE, so one DELETE removes the person and all
--      they saved. There is no soft delete: an "erased" account that still sits
--      in a table is not erased.
--
--   3. **Saved data is private to its owner.** Nothing here is ever joined into
--      a public page, a count, or a locality's score. How many people saved a
--      locality is not published — it would be a popularity signal on a product
--      whose scores are meant to rest on evidence.

CREATE TABLE IF NOT EXISTS app_user (
    id            BIGSERIAL PRIMARY KEY,

    -- Google's stable subject id. The email can change; this does not. Kept as
    -- (provider, subject) so phone sign-in can be added without a new table.
    auth_provider TEXT NOT NULL DEFAULT 'google',
    auth_subject  TEXT NOT NULL,

    email         TEXT,
    display_name  TEXT,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT app_user_subject_unique UNIQUE (auth_provider, auth_subject)
);


-- A locality someone has shortlisted, with their own note on it.
CREATE TABLE IF NOT EXISTS saved_locality (
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    locality_id  BIGINT NOT NULL REFERENCES locality(id) ON DELETE CASCADE,

    -- Private, free text, and capped: a note is a reminder ("traffic bad at
    -- 9am"), not a document, and an unbounded field is an invitation to store
    -- things this database should not hold.
    note         TEXT NOT NULL DEFAULT '',

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, locality_id),
    CONSTRAINT saved_locality_note_length CHECK (length(note) <= 2000)
);

CREATE INDEX IF NOT EXISTS saved_locality_user_idx
    ON saved_locality (user_id, created_at DESC);
