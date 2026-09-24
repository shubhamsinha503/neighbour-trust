-- Which localities a consented visitor has opened, and when.
--
-- A second reversal on top of 014, and a bigger one. 014 kept a *preference*
-- (the city filter a visitor chose) and its header promised "never anything
-- observed about them — no location, no device, no history". This table is
-- history: a row per locality report a visitor opened. So the same discipline
-- applies, enforced in the schema where it can be:
--
--   1. **Consent first, or no row.** A row is written only for a visitor id,
--      and an id exists only after the banner was accepted. The banner that
--      asked for 014 did not mention history, so the web app re-asks anyone who
--      accepted the old wording (nt_consent=granted) and records views only for
--      the new answer (nt_consent=granted-v2). See apps/web/lib/preferences.ts.
--
--   2. **Forgettable in one step.** visitor_id references visitor_pref ON DELETE
--      CASCADE, so the existing "forget me" — one DELETE of the visitor_pref row
--      — erases the whole history with it. No second erasure path to forget.
--
--   3. **Bounded.** The API prunes a visitor's rows past 180 days and past the
--      newest 500 on every write, so the history cannot grow into a lifetime
--      record. It stores which locality and when — never a location, device,
--      address or anything the visitor did not do on this site.
--
-- The privacy page and the consent banner change in the same commit as this file.

CREATE TABLE IF NOT EXISTS visitor_view (
    id           BIGSERIAL PRIMARY KEY,
    visitor_id   UUID NOT NULL REFERENCES visitor_pref(visitor_id) ON DELETE CASCADE,
    -- A locality pruned from the seed takes its views with it: a history entry
    -- pointing at a page that no longer exists is useless to the visitor.
    locality_id  BIGINT NOT NULL REFERENCES locality(id) ON DELETE CASCADE,
    viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "This visitor's recent views" and the per-visitor pruning both walk this.
CREATE INDEX IF NOT EXISTS visitor_view_visitor_time_idx
    ON visitor_view (visitor_id, viewed_at DESC);
