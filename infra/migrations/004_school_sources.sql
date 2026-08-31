-- Let the school table hold records from more than one source.
--
-- Driven by measurement: OpenStreetMap lists 61 schools within 2 km of
-- Indiranagar where UDISE lists 0. UDISE remains the only source with staffing
-- and enrolment numbers, and OSM has none of those — so neither replaces the
-- other, and the table has to carry both.
--
-- Deliberately NOT doing entity resolution between the two. Matching "Govt
-- Higher Primary School" in UDISE to "GHPS" in OSM by name and proximity is a
-- guess, and a wrong merge would attribute one school's staffing to another.
-- Rows stay separate and tagged by source; the payload reports presence from OSM
-- and staffing from UDISE, saying plainly which number came from where.

ALTER TABLE school ADD COLUMN IF NOT EXISTS source      TEXT;
ALTER TABLE school ADD COLUMN IF NOT EXISTS external_id TEXT;

UPDATE school SET source = 'udise' WHERE source IS NULL;
UPDATE school SET external_id = udise_code WHERE external_id IS NULL;

ALTER TABLE school ALTER COLUMN source SET NOT NULL;
ALTER TABLE school ALTER COLUMN external_id SET NOT NULL;

-- udise_code is now optional: an OSM row has no UDISE code and inventing one
-- would make it look like an official record.
ALTER TABLE school ALTER COLUMN udise_code DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE school DROP CONSTRAINT school_udise_code_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE school ADD CONSTRAINT school_source_external_id_key UNIQUE (source, external_id);
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS school_source_idx ON school (source);
