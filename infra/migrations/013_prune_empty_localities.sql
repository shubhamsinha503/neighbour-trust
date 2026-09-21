-- Prune 53 zero-coverage Hyderabad seed points.
--
-- These localities held none of the five carded categories: no school within
-- range, nothing mapped nearby in OpenStreetMap, no station, no press. Since
-- schools and connectivity run for every locality, an empty cell means the seed
-- point is too granular to sit in a mapped area — builder projects, gated
-- communities and a bare survey number ("sy-no-84"), not neighbourhoods a buyer
-- searches. They made Hyderabad look emptier than it is and added nothing.
--
-- Also removed from agents/common/seed_localities.py in the same commit, so the
-- seeder does not re-create them. Deleting a locality cascades to news_mention,
-- saved_locality and resident_report (all ON DELETE CASCADE); these rows have no
-- such dependents, but the cascade makes the delete safe regardless.
--
-- Idempotent: re-running deletes nothing once the rows are gone.

DELETE FROM locality WHERE slug IN (
    'ashokreddy-colony', 'cb-enclave', 'dream-enclave', 'dream-lake-city',
    'dwaraka-balaji-homes', 'gmr-township', 'gold-phase-colony', 'golden-villas',
    'golden-villas-city-heights', 'hayat-county', 'hill-view-colony',
    'jai-suryapatnam', 'janapriya-nivas', 'jnnurm-housing', 'kammaguda',
    'kohinoor-avion-city', 'libra-avenue', 'libra-enclave', 'mahendra-enclave',
    'marri-laksmi-nagar', 'mega-dream-city', 'narraguda', 'navya-homes',
    'platinum-city', 'postal-colony', 'pride-colony', 'pride-hills',
    'prime-fortune', 'ragannaguda', 'raghu-homes', 'roma-enclave-iii',
    'sai-prabhu-enclave', 'sairam-nagar', 'shareef-nagar', 'sri-balaji-residency',
    'sri-balaji-township', 'sri-nilayam', 'sri-sai-balaji-homes', 'sri-sri-avenue',
    'sriram-enclave', 'sriram-nagar-ph-ii', 'suma-paradise', 'sunshine-valley',
    'sutanpur-township', 'sy-no-84', 'vasanth-vihar', 'vasavi-nagar', 'venkatapur',
    'venkatapur-weaker-section', 'vijaya-lakshmi-nagar', 'vintage-homes',
    'wadi-e-sana', 'ykr-enclave'
);
