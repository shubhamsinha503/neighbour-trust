-- Repair verdicts destroyed by a --reclassify run that could not re-judge.
--
-- On 2026-09-01 a news_monitor run was started with --reclassify while the
-- Anthropic account had no quota left. The flag cleared 3,031 stored verdicts
-- and then classified none of them:
--
--   Re-classifying: cleared 3031 mentions previously judged.
--   classifying 3611 mentions with claude
--   Judged           : 0 (0 confirmed as incidents)
--   Left undecided   : 3611
--
-- Every safety and water count on the site went to zero, because
-- confirmed_incidents keys off is_locality_specific IS TRUE.
--
-- The verdicts are reconstructible. The clear only nulled `classified_at` and
-- `is_locality_specific`; it left `incident_type`, `classifier` and
-- `classifier_reason` untouched. The classifier's output schema requires
-- incident_type to be null when a headline is not a locality incident, so the
-- presence of a type is exactly equivalent to a true verdict.
--
-- Scope is tight by construction. `classifier IS NOT NULL` means the row was
-- judged at some point, and `is_locality_specific IS NULL` means it has no
-- verdict now — a combination only the clear can produce. A never-judged row has
-- no classifier; a correctly-negative row has false, not null. Re-running this
-- migration matches nothing.
--
-- classified_at is restored alongside the verdict, deliberately. Leaving it null
-- would queue all 3,031 for re-judgement on the next run, which is the bill that
-- could not be paid in the first place. Re-judging with the improved prompt stays
-- available through --reclassify, when there is quota for it.

UPDATE news_mention
   SET is_locality_specific = (incident_type IS NOT NULL),
       classified_at        = COALESCE(classified_at, fetched_at, now())
 WHERE classifier IS NOT NULL
   AND is_locality_specific IS NULL;
