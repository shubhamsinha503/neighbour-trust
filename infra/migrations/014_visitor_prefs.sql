-- Preferences remembered for a visitor who has NOT signed in.
--
-- This is a deliberate reversal, and the biggest one this database has made.
-- Migration 009 added the first table of people, but only people who *choose*
-- to sign in; everyone else stayed anonymous by construction, and the privacy
-- page said so ("we assign you no identifier, nothing tied to a profile").
-- This table breaks that: it keeps a per-visitor row keyed by an opaque id we
-- put in a cookie, so a visitor is recognised across visits without signing in.
--
-- Because that is a promise being reversed, three rules are enforced here in the
-- schema, not left to the API — the same discipline as 009:
--
--   1. **Consent first, or no row.** The API creates a row only after the
--      visitor has said yes (the consent cookie is set by the web app before the
--      id is ever minted). Nothing here exists for someone who declined or was
--      never asked. This table cannot enforce "asked" by itself, so the web
--      app's consent gate is the other half of the rule — see
--      apps/web/components/ConsentBanner.tsx.
--
--   2. **Forgettable in one step.** The id is a random UUID with no link to an
--      account, an email, or an IP. "Forget me" is a single DELETE of this row,
--      and clearing the cookie orphans it permanently. DPDP's erasure right is
--      one statement, like account deletion.
--
--   3. **Only a preference, never a fact about a person.** The columns hold
--      choices the visitor made in the UI (which city they filter to), never
--      anything observed about them — no location, no device, no history. A
--      preference is not a profile in the surveillance sense, and the schema is
--      kept that way so it cannot quietly become one.
--
-- The privacy page changes in the same commit as this file.

CREATE TABLE IF NOT EXISTS visitor_pref (
    -- The opaque id from the visitor's cookie. A UUID minted by the web app on
    -- consent; it means nothing outside this table and is tied to no identity.
    visitor_id   UUID PRIMARY KEY,

    -- The city filter last chosen on the search box, e.g. 'Hyderabad'. Nullable
    -- so "All" (no filter) is a real, storable state rather than a missing row.
    city         TEXT,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A city name is short; anything longer than this is not a city and has no
    -- business here. Guards against the column being repurposed as free text.
    CONSTRAINT visitor_pref_city_length CHECK (city IS NULL OR length(city) <= 120)
);
