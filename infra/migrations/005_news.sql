-- Locality-tagged news mentions, feeding the crime and water agents.
--
-- docs/strategy.md is explicit that this is a *shared source*, not a category:
-- news is the most scalable way to get locality-grain signal in the two
-- categories where official Indian data is weakest. It is also the source most
-- likely to mislead, so two of its caveats are built into this schema rather
-- than left to the agent:
--
--   1. **Coverage is not incidence.** A well-covered locality in a large media
--      market looks worse than an identical but under-covered one. So the counts
--      here are only ever presented as "N incidents reported in local press",
--      never as a rate, and never blended into a score without normalisation.
--   2. **A keyword match is not an incident.** A GDELT query for "Indiranagar"
--      returns city-wide policy stories, unrelated stabbings in Maharashtra, and
--      a Marathi article about Paithan. Roughly half the hits are noise, so every
--      mention carries an explicit classification and its provenance.

CREATE TABLE IF NOT EXISTS news_mention (
    id              BIGSERIAL PRIMARY KEY,

    locality_id     BIGINT NOT NULL REFERENCES locality(id) ON DELETE CASCADE,
    h3_cell         TEXT   NOT NULL,
    category        category_t NOT NULL,   -- crime | water

    url             TEXT NOT NULL,
    title           TEXT NOT NULL,
    domain          TEXT,
    language        TEXT,
    source_country  TEXT,
    published_at    TIMESTAMPTZ,

    query_term      TEXT,      -- what we searched to find it, for debugging recall
    source_name     TEXT NOT NULL DEFAULT 'GDELT',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Classification. NULL means "not yet judged" and is distinct from false:
    -- an unclassified mention must never be counted as an incident.
    is_locality_specific BOOLEAN,
    incident_type        TEXT,     -- e.g. theft, assault, water_shortage, contamination
    classifier           TEXT,     -- 'heuristic' | 'claude:<model>'
    classifier_reason    TEXT,
    classified_at        TIMESTAMPTZ,

    -- Same article can legitimately be relevant to two localities (a story
    -- naming both), but not twice for the same locality and category.
    UNIQUE (locality_id, category, url)
);

CREATE INDEX IF NOT EXISTS news_mention_lookup_idx
    ON news_mention (h3_cell, category, published_at DESC);
CREATE INDEX IF NOT EXISTS news_mention_unclassified_idx
    ON news_mention (classified_at) WHERE classified_at IS NULL;
