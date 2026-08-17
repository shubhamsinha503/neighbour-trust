# Neighbour Trust App — Build Roadmap

*Companion to `neighbour-trust-app-strategy.md` — turns the strategy into an actual build sequence.*

## Tech stack

**Frontend** — Next.js (React) + Tailwind, built as a mobile-first PWA so there's no separate native app to maintain for the MVP. Carries forward the visual language and validated color palette from the v2 mockup (map hero, verdict card, category grid, share card) as the actual design system rather than a one-off HTML file.

**Backend/API** — Python (FastAPI). Python is the right call specifically because the agent layer (scraping, geocoding, NLP extraction from news, H3 indexing) leans on a Python-native ecosystem (pandas, geopandas, h3-py, the Claude Agent SDK's Python bindings) — better to have API and agents in one language than to duplicate logic across a Node API and Python workers.

**Database** — Postgres with the PostGIS extension, keyed by H3 hexagon cell per the agent spec, so every category's output joins on location regardless of source. A thin Redis cache sits in front of the hot path (current AQI, live report reads) so the API doesn't hit Postgres on every request.

**Agent layer** — Claude Agent SDK with MCP, one tool per data source exactly as specified in the strategy doc (schools, crime, air, water, power, infrastructure, news-monitoring), plus the orchestrator agent that merges envelopes and answers buyer questions.

**Scheduling** — each agent runs on its own cadence (hourly for AQI, weekly for RERA, continuous ingestion for resident reports and news) via a job scheduler (APScheduler to start; move to a managed queue if fetch volume grows).

**Hosting** — frontend on Vercel; API + scheduled agent jobs + Postgres on a single managed provider (Railway or Render is enough at MVP scale — no need for Kubernetes-grade infrastructure yet).

## Repo structure

```
neighbour-trust/
  apps/
    web/          Next.js frontend
    api/          FastAPI backend
  agents/
    schools/
    crime/
    air_quality/
    water/
    power/
    infrastructure/
    news_monitor/
    orchestrator/
  packages/
    schema/       shared Pydantic/TS types for the agent envelope (source, fetched_at, data_vintage, geocode, confidence)
  infra/           deploy configs, migrations
  docs/            links back to the project strategy doc
```

## Build sequence

**Phase 0 — Foundation (roughly a week)**
Repo scaffold, the shared envelope schema as real Pydantic/TypeScript types (not just doc prose), Postgres + PostGIS + H3 indexing utility, and a Next.js shell implementing the v2 mockup as reusable components (verdict card, category card, share card) so every later phase renders into a real UI instead of a static file.

**Phase 1 — Prove the agent pattern on one real source (roughly a week)**
Build exactly one agent end-to-end: Air Quality for Bengaluru + Gurugram, pulling live from CPCB (data.gov.in) and AQICN, normalizing into the envelope, storing to Postgres, served through the API, rendered in the real frontend in place of the mock AQI card. This is deliberately narrow — the goal is validating fetch → normalize → store → serve → render as one working pipeline before multiplying it by six agents and two cities. Air quality is picked first because it's the one category where the official data is genuinely good, so a failure here would be a pipeline bug, not a data-availability problem.

**Phase 2 — Fill out the remaining agents for Bengaluru + Gurugram (3–4 weeks)**
Schools (UDISE+ proxy score), infrastructure (K-RERA + HRERA scrapers), and the news-monitoring agent (GDELT + NewsAPI) feeding both crime and water. Resident-report intake (a simple authenticated submission flow with credibility weighting) ships alongside these, since crime, water, and power all lean on it. This is the phase that actually tests the two data-availability leads worth chasing from the city-comparison doc — Bengaluru's OpenCity crime datasets and Gurugram's DHBVN outage page — hands-on, rather than as an assumption.

**Phase 3 — Composite score, reconciliation, and Q&A (roughly 2 weeks)**
The orchestrator agent: weighted Trust Score computation, the conflict-disclosure logic ("official says X, N residents report Y") from the original spec, and the retrieval-grounded Q&A agent answering buyer questions against the stored dataset with citations.

**Phase 4 — Product polish and the growth loop (1–2 weeks)**
The shareable WhatsApp report-card generator, resident verification/onboarding, and wiring the social-proof numbers (verified residents, monthly viewers) to real usage instead of placeholders — this only ships once there's real usage to report honestly.

**Phase 5 — Closed beta**
Launch to a small group of real Bengaluru/Gurugram buyers, watch what actually gets shared and what gets ignored, and let that (not the roadmap) decide what Phase 6 is.

## Suggested immediate next step

Phase 0 + the first slice of Phase 1 (repo scaffold plus the live AQI agent) is a concrete, boundable unit of work — it's also the option that was recommended earlier as the one that proves the whole architecture rather than any single piece of it. Say the word and that's what gets built next.
