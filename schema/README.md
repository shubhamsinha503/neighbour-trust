# Moved

The envelope types that started here are now the real, installed shared package:

- **Python** — `packages/schema/python/neighbour_trust_schema/envelope.py`
  (installed in editable mode, so `agents/` and `apps/api/` import the same types
  rather than each keeping a copy)
- **TypeScript** — `packages/schema/typescript/envelope.ts`
  (imported by the frontend as `@schema/envelope`)

This matches the layout in `docs/build-roadmap.md`. The originals were deleted
rather than left in place: two copies of a data contract diverge, and this one is
the thing six agents are supposed to agree on.

Phase 1 changed one payload against live responses — `AirQualityPayload` — and
left the envelope core (`category`, `source_name`, `source_url`, `fetched_at`,
`data_vintage`, `h3_cell`, `confidence`, `payload`) exactly as designed. See the
docstrings there for what changed and why.
