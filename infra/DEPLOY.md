# Deploying Neighbour Trust

Per `docs/build-roadmap.md`: **Postgres + API + scheduler on Railway, frontend on
Vercel.** Three Railway services and one Vercel project.

Budget about 60–90 minutes for a first run. Read step 1 before you start — it's
the one that wastes an afternoon if you get it wrong.

---

## Before you begin

Push the repo to GitHub. Railway and Vercel both deploy from a repo, not from
your laptop.

```powershell
cd C:\Users\pc\Desktop\neighbour-trust-starter
git remote add origin https://github.com/<you>/neighbour-trust.git
git push -u origin main
```

`.env` is gitignored and stays local. Every secret is re-entered in Railway and
Vercel by hand.

---

## 1. Database — do NOT use Railway's default Postgres

Railway's standard Postgres has **no PostGIS**, and Railway has said it does not
plan to add extensions to the default templates. `CREATE EXTENSION postgis` fails
on it, `001_init.sql` won't apply, and nothing downstream works.

Deploy from a PostGIS template instead:

**New Project → Deploy from Template → search "PostGIS"** —
[postgis/postgis:17-3.5](https://railway.com/deploy/postgis-spatial-database) is
closest to local (we run 16-3.4), or the
[PostgreSQL Extensions template](https://railway.com/deploy/postgresql-extensions--postgresql-extensions)
if you'd also like pgvector and pg_cron available for later phases.

Once it's up, open the service → **Variables** → copy `DATABASE_URL`.

> Local is PostGIS 3.4, this is 3.5. Nothing in our migrations is
> version-sensitive — `geography(Point,4326)`, `ST_DWithin`, `ST_Distance` have
> been stable for years.

## 2. API service

**New Service → GitHub repo → your repo.**

- **Settings → Build → Dockerfile path**: `infra/Dockerfile`
- **Settings → Deploy → Start command**: leave empty (the Dockerfile `CMD` serves the API)
- **Settings → Networking → Generate Domain** — note the URL, Vercel needs it
- **Variables**:

  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  OPENAQ_API_KEY=<your key>
  AQICN_TOKEN=<your token>
  DATA_GOV_IN_API_KEY=<your key, when you have it>
  CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>
  ```

  `${{Postgres.DATABASE_URL}}` is Railway's reference syntax — it wires the
  services together so the URL tracks the database rather than being pasted and
  going stale. Substitute your actual Postgres service name.

  You won't know the Vercel domain until step 5; set `CORS_ALLOWED_ORIGINS` then
  and let it redeploy. Local origins are always allowed, so leaving it blank
  breaks only the production frontend, nothing else.

## 3. Migrate and seed — once

From the Railway CLI (`npm i -g @railway/cli`, then `railway login`):

```powershell
railway link
railway run --service api python -m infra.migrate
railway run --service api python -m agents.common.seed_localities
```

Five migrations apply in order; all are idempotent, so re-running after adding
one is the normal path. The seed inserts the 11 launch localities and is also
idempotent.

## 4. Scheduler service

Same repo, same Dockerfile, **different start command**. Add a second service:

- **Build → Dockerfile path**: `infra/Dockerfile`
- **Deploy → Start command**: `python -m agents.scheduler`
- **Variables**: same as the API, minus `CORS_ALLOWED_ORIGINS`. Add
  `ANTHROPIC_API_KEY` and `ANTHROPIC_WORKSPACE_ID` if you want Claude
  classifying news headlines rather than the keyword heuristic.
- **Networking**: none. It serves no traffic — don't generate a domain.

It runs every job once at boot, then on these cadences (all UTC):

| Job | When | Why then |
|---|---|---|
| `air_quality` | hourly at :17 | CPCB publishes near the hour and every naive scraper hits :00 |
| `schools` | Sundays 03:47 | Off-peak for Overpass, which is donated infrastructure |
| `news_monitor` | daily 04:23 | After Indian morning editions are indexed |

> **The scheduler is the time-sensitive service.** OpenAQ serves a 90-day history
> window; data.gov.in and AQICN serve none. Every hour it isn't running is an
> hour of trend data that becomes permanently unrecoverable. `aq_observation`
> accumulating our own readings is the only asset here that compounds.

A full air quality pass takes ~3.5 minutes, most of it waiting out OpenAQ's
60 requests/minute limit. That's expected, not a hang.

## 5. Frontend on Vercel

- **Import the repo → Root Directory: `apps/web`.** Vercel auto-detects Next.js.
- **Environment variable**:
  `NEXT_PUBLIC_API_BASE_URL=https://<your-railway-api-domain>` (no trailing slash)
- Deploy, then copy the Vercel domain back into `CORS_ALLOWED_ORIGINS` on the
  Railway API service (step 2) and let it redeploy.

## 6. Verify

```powershell
curl https://<your-railway-api-domain>/healthz
```

You want `status: "ok"` and, under `ingest`, `stale: false` for `air_quality`.

```json
{
  "status": "ok",
  "degraded_categories": [],
  "localities": 11,
  "ingest": {
    "air_quality": { "stale": false, "localities_ok": 8, "age_minutes": 12 },
    "schools":     { "stale": false, "localities_ok": 11 }
  }
}
```

Then open your Vercel domain and click into a locality — you should get a Trust
Score, the category grid, and working links to the air quality and schools
detail pages.

**Point an uptime check at `/healthz` and alert on `status != "ok"`.** That field
is the one that catches the failure you cannot otherwise see: a scheduler that
runs cleanly while storing nothing, which is exactly what happened on 2026-08-31
when CPCB's feed stopped. Stale rows keep serving happily, so from the outside
"the data looks a bit old" is indistinguishable from "ingestion has been dead for
nine days".

---

## Costs

At this size, Railway's usage-based pricing puts the database, API and scheduler
together in the few-dollars-a-month range — the scheduler is idle 99% of the
time and the API serves almost nothing until there are users. Vercel's hobby tier
covers the frontend. GDELT, OpenAQ, AQICN, UDISE and OpenStreetMap are all free.

The only metered cost is Claude classifying news headlines, and only if you set
`ANTHROPIC_API_KEY` — roughly a few dollars a month on `claude-opus-5` at a daily
cadence, or about a fifth of that with
`NEWS_CLASSIFIER_MODEL=claude-haiku-4-5`. Without a key the agent uses the
keyword heuristic and costs nothing.

Watch `aq_observation` growth over time. At 11 localities × 24 readings/day it is
trivial; at 500 localities × 6 categories it is worth a retention policy — keep
hourly for 90 days, daily aggregates forever. The `observation_count` column is
already there to make those aggregates honest.

## What is deliberately not here

- **Redis.** `docs/build-roadmap.md` calls for a hot-path cache. At this traffic
  there is nothing to cache and an unused Redis is one more thing to keep alive.
- **Staging.** One environment until there is something to protect.
- **Alembic.** See the note at the top of `infra/migrate.py` for when to switch.

## Known gaps at launch

Worth knowing before anyone else sees it:

- **4 of 6 categories have no score.** Crime and water carry press coverage only
  (deliberately unscored); power and infrastructure have no source at all. The
  report states this on its face.
- **Air quality may be running on community sensors.** Every CPCB station in both
  cities went silent on 2026-08-27. The agent falls back to low-cost PM2.5
  sensors at `community_estimated` confidence, labelled as such. It recovers
  automatically when CPCB resumes.
- **Schools staffing data is from January 2022** and UDISE's Bengaluru
  coordinates are incomplete — see the schools section of the root README.
- **GDELT has been unreachable** from at least one network, so crime and water
  may have no incidents stored yet.
