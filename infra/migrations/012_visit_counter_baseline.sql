-- Start the visit tally from the real prior traffic, once.
--
-- The counter (011) began at zero, but the site had already served ~282 page
-- views (Vercel Analytics) before it existed. Showing "6 and counting" under a
-- site with real history undersells it, so the tally is seeded to that real
-- figure and counts up live from there.
--
-- The hard part is that migrate.py re-runs every migration on every ingest pass
-- (see its docstring — no version table). A bare UPDATE would re-seed the count
-- every hour and erase the live increments. So a one-shot guard: a column that
-- records the seed was applied, and an UPDATE that fires only while it has not
-- been. After the first pass baseline_applied is true and this becomes a no-op,
-- which is exactly the idempotence the rest of the migrations get from
-- IF NOT EXISTS.

ALTER TABLE visit_counter
    ADD COLUMN IF NOT EXISTS baseline_applied BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE visit_counter
    SET total = GREATEST(total, 282),
        baseline_applied = TRUE
    WHERE id = 1 AND baseline_applied = FALSE;
