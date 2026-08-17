# Neighbour Trust

Sourced, confidence-tagged neighbourhood data for Indian home buyers. Launch
cities: **Bengaluru and Gurugram**.

The planning context lives in `docs/` and is *decided*, not up for re-derivation:

1. **`docs/strategy.md`** — the problem, the six-agent architecture, sources and
   confidence logic per category, the consumer-psychology reasoning behind the
   UI, and the city-selection analysis.
2. **`docs/build-roadmap.md`** — the stack decision and the five-phase build
   sequence.
3. **`design/mockup-v2-psychology.html`** — the UI direction. Its tokens are now
   the design system (see `apps/web/app/globals.css`); the file itself is the
   reference, not the implementation.

## Where the build is

**Phase 0 (foundation) and the first slice of Phase 1 (one real agent) are
done.** Air quality is live end-to-end for both cities: fetch → normalize →
store → serve → render. The other five agents are deliberately not built — the
point of this slice was proving the pipeline once before multiplying it by six.

| Piece | State |
|---|---|
| Repo scaffold per the roadmap's structure | done |
| Envelope as real Pydantic + TS types | done, `packages/schema/` |
| Postgres + PostGIS + H3 keying | done, `infra/migrations/001_init.sql` |
| Air quality agent (CPCB / OpenAQ / AQICN) | done, `agents/air_quality/` |
| FastAPI endpoint | done, `apps/api/` |
| Next.js card in the mockup's language | done, `apps/web/` |
| Hourly scheduler + run log + deploy config | done, `agents/scheduler.py`, `infra/DEPLOY.md` |
| Schools, crime, water, power, infrastructure | not started — Phase 2 |

**Deploying?** Read `infra/DEPLOY.md` first — Railway's default Postgres has no
PostGIS, and getting that wrong is an afternoon.

**The scheduler is the time-sensitive part.** OpenAQ serves a 90-day history
window and the other two sources serve none, so every hour it isn't running is an
hour of trend data that becomes permanently unrecoverable. `aq_observation` is
the one asset here that compounds.

## Quickstart

```bash
cp .env.example .env        # then fill in the keys — see Credentials below
make setup                  # venv + pip + npm
make db                     # Postgres+PostGIS on :5433
make seed                   # the 11 launch localities
make fetch                  # pull live air quality
make api                    # FastAPI on :8000
make web                    # Next.js on :3000
```

Then open http://localhost:3000.

## Credentials

Three free keys. Nothing falls back to sample data — a missing key raises an
error naming the signup URL, because a pipeline that silently serves fixtures is
the exact failure this phase existed to rule out.

| Env var | Where to get it | Used for |
|---|---|---|
| `DATA_GOV_IN_API_KEY` | [data.gov.in](https://www.data.gov.in/) → register → My Account | CPCB real-time AQI — the official source of record |
| `OPENAQ_API_KEY` | [explore.openaq.org/register](https://explore.openaq.org/register) | Live CPCB values **and** the 30-day trend |
| `AQICN_TOKEN` | [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/) | Corroboration only — see the caveats below |

## What live testing changed

Six things turned up against real responses that no amount of reading the docs
would have surfaced. Each one is a comment in the code at the point it matters:

**The AQI must be computed from 24-hour means, not the latest hour.** CPCB's
breakpoint table is *defined* on 24-hour averages (8-hour for CO and O3), so
indexing a single instantaneous reading against it inflates the number badly.
Vikas Sadan, Gurugram read 140.5 µg/m³ of PM2.5 at 19:15 on 2026-08-17 — AQI 316,
"Very Poor" — against a 24-hour mean of 89.6, which is AQI 206, "Poor". The card
would have announced a crisis band on an ordinary evening. The headline is now
the 24-hour figure, with the latest hour shown beside it as context.

**The nearest sensor is often not a station that can produce an AQI.** OpenAQ's
Indian coverage mixes regulatory CPCB/KSPCB stations with community low-cost
sensors that report only PM and particle counts. Around Koramangala the closest
entry is one of those, and it cannot meet CPCB's three-pollutant minimum — the
agent now walks outward to the next candidate instead of reporting "no data"
while a full KSPCB station sits unread just behind it. Station provider is also
carried into `source_name`, so a community sensor is never labelled "CPCB".

**Neither official source serves history.** CPCB-via-data.gov.in and the AQICN
free API are both current-value-only. The 30-day trend chart therefore has no
source under the stack as originally specified. OpenAQ (free, 90-day window,
carries the same CPCB feeds) fills it, and `aq_observation` accumulates our own
readings forward so the chart survives OpenAQ's window rolling past us.

**AQICN's India data can be badly stale.** Every Bengaluru station queried on
2026-08-17 returned readings timestamped 2026-06-23 — eight weeks old, served
through the same fields as current data. The confidence rule in
`agents/air_quality/agent.py` now degrades on *staleness as well as distance*;
the original spec keyed on distance alone, which would have labelled two-month-old
data "High confidence".

**AQICN's `feed/geo:` returned a station 1,700 km away.** A query for
Indiranagar, Bengaluru answered with a Delhi station in a different regulatory
jurisdiction. All nearest-station logic now ranks candidates by our own haversine
distance against a hard radius, and never trusts an upstream's idea of "nearby".

**OpenAQ's free tier allows 60 requests per minute, and that shapes the agent.**
A full run touches ~10 localities, each considering several stations, each
station needing one sensor-listing call plus one per pollutant for the 24-hour
window. Unmanaged, a run exhausts the minute's budget in the first two localities
and every subsequent one reports "no station in range" — throttling that looks
exactly like missing data. The client now reads the rate-limit headers, pauses
before running out, retries on 429, and caches per-station responses across
localities. A full 11-locality run takes about 3.5 minutes as a result, which is
fine against an hourly schedule.

**AQICN is on the US EPA scale, not CPCB's.** Its `iaqi` values are already EPA
sub-indices rather than concentrations, and the same PM2.5 reading produces a
different number and a different word under each scale. AQICN is therefore stored
as its own clearly-labelled envelope and never contributes to the displayed
number — an Indian buyer cross-checks against CPCB bulletins, so everything shown
is CPCB.

## Layout

```
apps/
  web/                 Next.js + Tailwind; tokens from the v2 mockup
  api/                 FastAPI — localities + air quality endpoints
agents/
  common/              config, db, H3 geo helpers, locality seed
  air_quality/         the one built agent
    aqi.py             CPCB National AQI computation
    sources/           cpcb.py (data.gov.in), openaq.py, aqicn.py
  schools/ crime/ water/ power/ infrastructure/ news_monitor/ orchestrator/
                       placeholders — Phase 2+
packages/schema/       the envelope, Pydantic + TypeScript
infra/                 docker-compose, SQL migrations
docs/ design/          the planning handoff
tests/                 AQI maths and confidence rules
```

## Still open

Unchanged from the planning handoff, none of it blocking Phase 2:

- Whether crime/safety ships as a number at all, or as a qualitative
  "resident-reported perception" label.
- Build-vs-partner for RERA scraping (K-RERA + HRERA).
- Whether Bengaluru's OpenCity crime datasets and Gurugram's DHBVN outage page
  are usable — both still unverified hands-on.

One new one, from this phase: **AQICN's free tier forbids use in paid
applications and redistribution.** If the B2B trust-score API in
`docs/strategy.md` ever ships, AQICN needs a written agreement first. CPCB via
data.gov.in carries no such restriction, which is part of why it is primary.
