# Deploying Neighbour Trust

Two supported paths. Both end with the same thing running.

**Path A — free tier (recommended for launch).** Neon for Postgres+PostGIS,
Render for the API, GitHub Actions for scheduled ingestion, Vercel for the
frontend. Costs nothing. More providers to set up, and Render's free API sleeps
after 15 minutes idle (~30s cold start on the next request).

**Path B — Railway (~$5/month).** What `docs/build-roadmap.md` originally
specified. Fewer providers, an always-on scheduler, simpler to operate. Note
Railway's trial is time-limited and its template library has **no PostGIS
template** — you must deploy the database via **Docker Image** with
`postgis/postgis:16-3.4`, not via the PostgreSQL template, which will fail on the
first migration.

Path A is written out below; Path B follows it.

---

# Path A — free tier

## A1. Database: Neon

[neon.tech](https://neon.tech) → new project → region closest to your users
(Singapore or Mumbai for India). Then enable PostGIS once, from the Neon SQL
Editor:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Copy the **pooled** connection string from the dashboard. It looks like
`postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
— keep `?sslmode=require`, psycopg needs it.

Free tier is 0.5 GB and 100 compute-hours/month. This project's whole dataset is
around 6,300 school rows plus a few thousand observations, so storage is not the
constraint; compute-hours are, and an hourly agent run uses very few.

## A2. Scheduled ingestion: GitHub Actions

Already configured in `.github/workflows/ingest.yml`. It runs the same job
modules the local scheduler does, on the same cadences, and writes to
`ingest_run` so `/healthz` can still tell whether ingestion is alive.

Add these under **repo → Settings → Secrets and variables → Actions → New
repository secret**:

| Secret | Required |
|---|---|
| `DATABASE_URL` | yes — the Neon pooled string |
| `OPENAQ_API_KEY` | yes |
| `AQICN_TOKEN` | optional (corroboration only) |
| `DATA_GOV_IN_API_KEY` | optional, official CPCB source |
| `ANTHROPIC_API_KEY` | optional, news classifier |
| `ANTHROPIC_WORKSPACE_ID` | only if the key is identity-linked |

Then **Actions → Ingest → Run workflow** to trigger the first run by hand. It
applies migrations and seeds localities before running the agent, so that first
manual run is also your database setup — there is no separate migrate step.

> Note: GitHub disables scheduled workflows on repos with no activity for 60
> days. A commit re-enables them. Not an issue during active development; worth
> knowing if the project goes quiet.

## A3. API: Render

[render.com](https://render.com) → New → **Web Service** → connect the repo.

- **Runtime**: Docker
- **Dockerfile path**: `infra/Dockerfile`
- **Instance type**: Free
- **Environment variables**: `DATABASE_URL` (the Neon string), plus
  `CORS_ALLOWED_ORIGINS` once you know the Vercel domain

The free instance sleeps after 15 minutes idle and takes ~30 seconds to wake.
Acceptable for launch; the fix when it stops being acceptable is Render's
paid tier or a ping service, not an architecture change.

## A4. Frontend: Vercel

Import the repo → **Root Directory: `apps/web`** → set
`NEXT_PUBLIC_API_BASE_URL` to the Render URL. Deploy, then put the Vercel domain
into `CORS_ALLOWED_ORIGINS` on Render and redeploy that service.

## A5. Verify

```powershell
curl https://<your-render-service>.onrender.com/healthz
```

First request may take ~30s while the instance wakes. You want `status: "ok"`
and `stale: false` under `air_quality`.

---

# Path B — Railway

## 1. Database — do NOT use Railway's default Postgres

Railway's standard Postgres has **no PostGIS**, and Railway has said it does not
plan to add extensions to the default templates. `CREATE EXTENSION postgis` fails
on it, `001_init.sql` won't apply, and nothing downstream works.

Railway's template library has no maintained PostGIS template either — a search
for "postgis" returns nothing, and the "PostgreSQL" template is the plain image.
So deploy the database as a raw container:

**New → Docker Image →** `postgis/postgis:16-3.4`, then set on that service:

```
POSTGRES_USER=neighbour
POSTGRES_PASSWORD=<something long>
POSTGRES_DB=neighbour_trust
```

Add a **volume mounted at `/var/lib/postgresql/data`**, or the database is wiped
on every restart. Then copy `DATABASE_URL` from its Variables tab.

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
