# Deploying Neighbour Trust

Per `docs/build-roadmap.md`: **API + scheduler + Postgres on Railway, frontend on
Vercel.** Four Railway services and one Vercel project.

Read the first gotcha before you start — it's the one that wastes an afternoon.

---

## 1. Database — do NOT use Railway's default Postgres

Railway's standard Postgres has **no PostGIS**, and Railway has said it does not
plan to add extensions to the default templates. `CREATE EXTENSION postgis` fails
on it, so `001_init.sql` won't apply and nothing else will work.

Deploy from a PostGIS template instead:

- **New Project → Deploy from Template → search "PostGIS"** —
  [postgis/postgis:17-3.5 template](https://railway.com/deploy/postgis-spatial-database)
  is the closest match to local (`postgis/postgis:16-3.4`), or the
  [PostgreSQL Extensions template](https://railway.com/deploy/postgresql-extensions--postgresql-extensions)
  if you'd rather have pgvector and pg_cron available for later phases too.

Once it's up, copy its `DATABASE_URL` from the service's **Variables** tab.

> Local uses PostGIS 3.4, this uses 3.5. Nothing in `001_init.sql` is
> version-sensitive — `geography(Point,4326)`, `ST_DWithin` and `ST_Distance`
> have been stable for years — but it's a difference worth knowing about when
> debugging.

## 2. API service

- **New Service → GitHub repo** (push this repo to GitHub first).
- **Settings → Build → Dockerfile path**: `infra/Dockerfile`
- **Settings → Deploy → Start command**: leave empty (the Dockerfile `CMD` serves
  the API).
- **Settings → Networking → Generate Domain** — note the URL, Vercel needs it.
- **Variables**:

  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  DATA_GOV_IN_API_KEY=<your key>
  OPENAQ_API_KEY=<your key>
  AQICN_TOKEN=<your token>
  ```

  `${{Postgres.DATABASE_URL}}` is Railway's reference syntax — it wires the
  services together so the URL tracks the database rather than being pasted and
  going stale. Substitute your actual Postgres service name.

## 3. Run migrations once

From the Railway CLI, against the deployed database:

```bash
railway run --service api python -m infra.migrate
```

Idempotent, so re-running after adding a migration is the normal path — see the
note at the top of `infra/migrate.py` about when to switch to Alembic.

Then seed the localities (also idempotent):

```bash
railway run --service api python -m agents.common.seed_localities
```

## 4. Scheduler service

Same repo, same Dockerfile, **different start command**. Add a second service:

- **Build → Dockerfile path**: `infra/Dockerfile`
- **Deploy → Start command**: `python -m agents.scheduler`
- **Variables**: same four as the API.
- **Networking**: none. It serves no traffic — don't generate a domain.

It runs one air quality pass at boot, then hourly at **:17 past the hour UTC**
(offset deliberately — CPCB publishes near the hour and every naive scraper in
the country hits it at :00).

> **Why the scheduler is the urgent part.** OpenAQ serves a 90-day history
> window; data.gov.in and AQICN serve none. Every hour this isn't running is an
> hour of trend data that becomes permanently unrecoverable once it ages out of
> that window. `aq_observation` accumulating our own readings is the only asset
> in this system that compounds — and only while this service is up.

A full pass takes ~3.5 minutes, most of it waiting out OpenAQ's 60 requests/minute
limit. That's expected, not a hang.

## 5. Frontend on Vercel

- **Import the repo → Root Directory: `apps/web`.** Vercel auto-detects Next.js.
- **Environment variable**: `NEXT_PUBLIC_API_BASE_URL=https://<your-railway-api-domain>`
  (no trailing slash).
- Deploy.

Then add the Vercel domain to CORS in `apps/api/app/main.py` — it currently
allows only localhost:3000, which is correct for local but will block production:

```python
allow_origins=["http://localhost:3000", "https://your-app.vercel.app"],
```

## 6. Verify

```bash
curl https://<your-railway-api-domain>/healthz
```

You want:

```json
{
  "status": "ok",
  "localities": 11,
  "air_quality_ingest": { "age_minutes": 12, "stale": false, "localities_ok": 11 }
}
```

`air_quality_ingest.stale` is the field that matters. It goes `true` when the
last successful run is over 2.5 hours old — two missed hourly runs. This exists
because a dead scheduler is otherwise invisible: stale rows keep serving happily
through the API, and "the data looks a bit old" is indistinguishable from "the
job has been crashing for nine days". Point an uptime check at it.

---

## Costs

At this size, Railway's usage-based pricing puts the database, API and scheduler
together in the few-dollars-a-month range — the scheduler is idle 99% of the
time, and the API serves almost nothing until there are users. Vercel's hobby
tier covers the frontend. The three data sources are free.

The one thing that changes this is Postgres storage growth from
`aq_observation`. At 11 localities × 24 readings/day that is trivial; at 500
localities × 6 categories it is worth revisiting. A retention policy — keep
hourly for 90 days, daily aggregates forever — is the obvious answer when that
day comes, and the `observation_count` column is already there to make aggregates
honest.

## What is deliberately not here

- **Redis.** `docs/build-roadmap.md` calls for a cache on the hot path. At Phase 1
  traffic there is nothing to cache and an unused Redis is one more thing to keep
  running. Add it when the API is actually under load.
- **Staging environment.** One environment until there is something to protect.
- **Alembic.** See `infra/migrate.py`.
