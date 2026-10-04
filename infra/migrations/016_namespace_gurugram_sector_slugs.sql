-- Namespace Gurugram's "Sector N" slugs by city.
--
-- Gurugram's sector localities were slugged bare ("sector-49"), which worked
-- while Gurugram was the only sector city. Delhi NCR (Noida, Greater Noida,
-- Ghaziabad, Faridabad) all have their own "Sector N", so the bare slug collides
-- on locality.slug's UNIQUE constraint — and propose_localities would silently
-- reject each NCR sector as "slug collides with an existing locality". Going
-- forward every sector is slugged "<city>-sector-N"; this brings the existing
-- Gurugram rows in line.
--
-- An UPDATE rather than delete+reinsert on purpose: it preserves locality.id, so
-- the ON DELETE CASCADE from news_mention (and saved_locality, resident_report)
-- does not fire and every stored mention stays attached. data_envelope is keyed
-- by h3_cell, not slug, so it is unaffected either way.
--
-- Two historical spellings are normalised: the bare "sector-N" and a handful that
-- were hand-suffixed "sector-N-gurugram". Both become "gurugram-sector-N".
--
-- Idempotent: the WHERE clauses exclude anything already prefixed, so a re-run
-- matches nothing. The seed file carries the same new slugs, so a reseed upserts
-- onto these renamed rows by slug without creating duplicates.

UPDATE locality
   SET slug = 'gurugram-' || slug
 WHERE city = 'Gurugram'
   AND slug ~ '^sector-[0-9]'
   AND slug NOT LIKE 'gurugram-%';

UPDATE locality
   SET slug = 'gurugram-' || regexp_replace(slug, '-gurugram$', '')
 WHERE city = 'Gurugram'
   AND slug ~ '^sector-[0-9].*-gurugram$'
   AND slug NOT LIKE 'gurugram-%';
