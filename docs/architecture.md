# Neighbour Trust — Architecture

A neighbourhood due-diligence tool for Indian home buyers. It shows sourced,
dated, confidence-tagged data on the things you can't tell from a property
listing — air, schools, safety, water, connectivity — and refuses to fake the
parts it doesn't know.

This document is the technical map: what each piece is, **why** it was chosen,
and how the hard problems were solved. It is meant to be readable by a new
engineer and quotable in a pitch.

---

## 1. The stack

| Layer | Tech | Why this |
|---|---|---|
| Frontend | Next.js (React) on **Vercel** | Server-rendered pages → fast first paint + SEO (buyers Google "Koramangala safety"). Auto-deploys from `main`. |
| API | FastAPI (Python) on **Render** | Same language as the data agents, so scoring logic is shared code, not reimplemented. |
| Database | Postgres + PostGIS on **Neon** | Geospatial joins + flexible payloads + serverless. See §2. |
| Pipeline | Python agents on **GitHub Actions** | Cron-scheduled bursts. No always-on server to pay for. |

```
        PUBLIC DATA SOURCES
   CPCB/OpenAQ · UDISE · OpenStreetMap · Local press
                    │
         ┌──────────▼───────────┐
         │   INGEST PIPELINE     │  Python agents on GitHub Actions (cron)
         │   (the "factory")     │  → writes data_envelopes
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │   Postgres + PostGIS  │  Neon. One row per (category, source, H3 cell)
         │   (the "warehouse")   │  = the data_envelope
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │   FastAPI (Python)    │  Render. Reads envelopes, computes the
         │   (the "kitchen")     │  Trust Score, builds the report
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │   Next.js (React)     │  Vercel. neighbourtrust.com
         │   (the "storefront")  │
         └──────────────────────┘
```

---

## 2. Why Postgres + PostGIS

The core problem: six unrelated kinds of data from six unrelated sources — air
stations, government school records, OpenStreetMap, news headlines — that share
nothing except **a location**. The database's job is to let them **join on
place**. Postgres wins for four concrete reasons:

1. **PostGIS gives real geospatial queries.** "Nearest air-quality station to
   this locality" is a distance query over the globe. A `geography(Point, 4326)`
   column + GiST index does it natively. This powers the `nearest_station_km`
   field the air-quality confidence rule depends on.
2. **JSONB lets each category keep its own shape.** A school payload and a news
   payload look nothing alike. The variable data lives in a `JSONB` column —
   structured, queryable, GIN-indexed — so a new field needs no migration.
3. **Relational where it helps, JSON where it doesn't.** `locality` and
   `aq_station` are proper tables with constraints; the variable data is JSON.
4. **Neon is serverless.** It scales to zero between cron runs, so there is no
   idle database to pay for.

---

## 3. The data model

### `locality` — what a buyer searches for
```
slug, name, city, state, pincode,
centroid geography(Point,4326),   -- the map point
h3_cell  TEXT                     -- the join key
```
A locality is a **centroid, not a polygon** — deliberately. Indian neighbourhood
boundaries are contested and unofficial; a precise polygon would be false
precision. So it is a single trusted point.

### `data_envelope` — the atom of the whole system
```
category, source_name, source_url,
fetched_at,        -- when WE looked
data_vintage,      -- how old the DATA actually is  (the crucial split)
h3_cell, geom, confidence,
payload JSONB,
UNIQUE (category, h3_cell, source_name, data_vintage)
```
Three deliberate choices:

- **`fetched_at` vs `data_vintage` are separate.** A UDISE record fetched today
  can still be 18 months old. That gap is what the "last updated" line and the
  confidence tag report. Collapsing them into one timestamp would quietly lie
  about freshness.
- **The `UNIQUE` constraint makes the pipeline safe to re-run.** An hourly pull
  returning the same reading twice **updates in place** (upsert); a genuinely
  new reading has a new `data_vintage` and inserts. An ingest run can crash
  halfway and be re-run with zero corruption.
- **Indexes:** `(category, h3_cell, data_vintage DESC)` makes "latest envelope
  for this category here" one index seek; GiST on `geom` for distance work; GIN
  on `payload` for JSON queries.

### `aq_station` — physical air monitors
Identity is `(source, external_id)` because one physical station appears under
CPCB, AQICN, and OpenAQ with different IDs. Dedupe-by-proximity happens in
Python, not the DB.

---

## 4. H3 — the geospatial key

Every location maps to an **H3 resolution-9 hexagon** (~150 m across). "Is this
school near this locality" becomes "same or neighbouring cell" — a cheap text
comparison instead of a distance calc for every pair.

Deliberate decision: **H3 cells are stored as `TEXT`, not a native type.** The
`h3-pg` extension is not in the stock PostGIS image, and every H3 operation we
need (`latlng→cell`, `k-ring`) happens in Python via `h3-py` inside the agents.
Keeping the DB dumb about H3 keeps the database image stock and portable.

`geom` is **derived from the H3 cell centroid**, never stored independently — so
the cell and the point can never drift out of sync.

---

## 5. Lifecycle of one fact

```
1. AGENT fetches from source (e.g. a CPCB reading)
2. AGENT computes confidence NOW (station distance, source quality, vintage)
3. AGENT upserts a data_envelope        -- UNIQUE constraint dedupes
        ── data sits in Postgres ──
4. USER opens a report → FastAPI reads the latest envelope
5. FRESHNESS re-evaluates confidence based on age SINCE it was written
6. ORCHESTRATOR runs it through scoring → Trust Score
7. REACT renders the card with source + date + confidence chip
```

---

## 6. Freshness — confidence decays at read time

`agents/common/freshness.py`. The bug it fixes: confidence was computed once, at
write time, and served unchanged forever — so a 13-day-old air reading kept
saying `confidence: medium` because that was honest the day it was stored.

Staleness is the one property that changes without anyone writing to it, so it
must be judged **when read, not when written.** Three rules, in order:

1. **Degrade** — past its freshness window, a reading can't claim its original
   confidence.
2. **Historical** — past a further limit, it is shown *with its date attached*
   but excluded from the Trust Score.
3. **Withhold** — data too old to serve at all.

Why "historical" exists: when CPCB's network went silent (Aug 2026), every air
reading was about to cross the 7-day line and vanish — 19 localities would show
blank cards while a real Aug-31 reading sat in the DB. "Last reading was Aug 31"
beats a blank, and it is not a lie as long as the date is on it. The card can
caveat itself in words; a single 0–100 score cannot — so historical data is
shown but never counted. Windows differ by category because the data does: an
air reading is worthless in a week; a UDISE survey describes a whole year.

---

## 7. The agents

| Agent | Does what | Key engineering |
|---|---|---|
| `air_quality` | Pulls station readings, finds nearest to each locality | Multi-source dedupe; per-locality savepoints so one failure ≠ whole-run rollback |
| `schools` | UDISE (staffing) + OpenStreetMap (what's physically there) | Reads 780 MB OSM extract locally instead of slow Overpass |
| `infrastructure` (connectivity) | Reads the same OSM extract schools downloaded | Shares the parse — computed once per run |
| `news_monitor` | Fetches local press, AI-classifies into incident types → safety + water | Coverage-bias correction; provider fallback so a spent budget slows, not halts |
| `orchestrator` | Reads all envelopes, computes Trust Score, builds the report | Scoring lives in one place both API and agents share |

---

## 8. Scoring

`agents/orchestrator/score.py` + `press_score.py`. The Trust Score is a weighted
composite whose weights are a **visible, arguable table**:

```
air_quality 0.24 · schools 0.24 · crime 0.24 · water 0.17 · infrastructure 0.11
```

Two hard problems it solves:

- **Press-coverage bias.** Counting news incidents would rank well-covered rich
  areas as more dangerous. So safety/water score the **mix** of incident types
  (violent share, recurrent flooding), with raw volume capped and secondary.
- **Silence is not safety.** A locality with no coverage gets a labelled
  **baseline (80)** that is deliberately excluded from the composite — because
  "no news" means "no journalists," not "safe." The baseline only shows when the
  locality was ≥90% classified, so a half-finished run never fakes reassurance.

---

## 9. Problems overcome

1. **Re-runnable pipeline** — `UNIQUE` upsert constraint + per-locality savepoints.
2. **Stale-as-fresh** — `fetched_at`/`data_vintage` split + read-time decay.
3. **No boundaries in India** — H3 hex cells instead of polygons.
4. **6 sources, 1 join** — everything keyed to `h3_cell`; JSONB per-category payloads.
5. **Coverage bias** — composition-based press scoring, volume capped.
6. **AI cost/fragility** — provider fallback chain (ScaleMax → DeepSeek → Groq free).
7. **Empty-looking product** — distinguish "not searched" (hide) from "searched,
   nothing found" (baseline card).
8. **No always-on server** — GitHub Actions cron + Neon serverless.

---

## 10. Scaling to more localities

**Within a covered city:** add rows to `agents/common/seed_localities.py`
(`slug, name, city, state, pincode, lat, lon`). The next ingest run does the
rest. The one rule: every centroid is verified twice (hand-entered +
independently geocoded via `scripts/geocode_localities.py`), because a centroid
1 km off silently attributes one neighbourhood's data to another — an error
nothing downstream can catch.

**A whole new city:** three mechanical steps —
1. Add localities to the seed file.
2. Map the city to its OpenStreetMap regional extract (`CITY_EXTRACT` /
   `CITY_BBOX`, e.g. Hyderabad → southern-zone, Mumbai → western-zone).
3. Run ingest. Schools, connectivity, air, and news all flow with no new code.

**Honest constraints (worth stating in a pitch):**
- Air quality is station-limited — some outer localities never reach 5/5 because
  no monitor is near. A data-availability truth, not a bug.
- Corridors (long roads like Sarjapur Rd) can't be one centroid, so they are
  excluded until built properly.
- News backfill of a new city takes a few daily cycles; the fetch queue is
  least-recently-fetched first, so never-seen new cities are prioritised.

---

## In one breath

> A Postgres + PostGIS spine where six unrelated public data sources join on H3
> location cells. Every fact is an "envelope" that carries its source, its real
> age, and a confidence that decays as it gets stale — so the product is
> structurally incapable of showing a confident number it can't back up. Python
> agents refresh it on cron; a scoring layer turns it into one Trust Score built
> only from data recent enough to stand behind.
