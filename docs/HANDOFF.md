# Nestra (Neighbour Trust) — Project Handoff & Context

> A single-file context dump so any developer or AI assistant can pick up where
> this work left off. Last updated: **2026-10-07**.
> No secrets are stored here — only pointers to where they live.

---

## 1. What this is

**Nestra** (repo name `neighbour-trust`) is a neighbourhood due-diligence product
for Indian home buyers and renters. It aggregates public data — air quality,
schools, flood risk, connectivity, safety/water signals — into per-locality
reports where **every figure shows its source, date, and confidence**, instead
of the invented "trust scores" most property apps use. If reliable data is
missing for something, the card says so instead of guessing.

- **Web:** live at **https://neighbourtrust.com** (and the Vercel URL `neighbour-trust-virid.vercel.app`)
- **Android:** submitted to **Google Play internal testing** (package `com.nestra503.app`)
- **Coverage:** **1,671 localities** across **6 cities** — Delhi, Noida, Bengaluru, Gurugram, Hyderabad, Mumbai
- **Languages:** 5 — English, Hindi, Kannada, Telugu, Marathi

## 2. The core principle (read before changing anything)

**Honesty-first data.** This is the whole product thesis and must not be diluted:
- No invented scores presented as fact. Every figure carries **source + date + confidence**.
- Score a category **only where data supports it**; otherwise leave it off the report (don't blank or estimate).
- **Reconcile** conflicting sources rather than averaging them away.
- Safety/water and "reported as coming" come from **press coverage** and are **never turned into a score** — only described.
- Flood risk is **modeled screening (~1 km)**, labelled as such, never scored.
- If a change makes a data claim, the privacy policy / about page must change in the **same commit**.

## 3. Architecture & stack

Monorepo (TypeScript + Python):

```
apps/
  mobile/   Expo / React Native app (SDK 57, expo-router), Android → Google Play
  web/      Next.js (App Router) + Tailwind → Vercel
  api/      FastAPI (Python, Pydantic) → Render
agents/     Python ingestion + orchestration (air quality, schools, flood, news, Q&A)
infra/      Postgres migrations, deploy config
docs/       strategy.md, build-roadmap.md, this handoff
design/     brand assets, Play graphics, screenshots
scripts/    icon/screenshot generators, classifier benchmark & diagnostic
```

**Flow:** public sources → Python ingestion agents (scheduled via GitHub Actions)
→ orchestrator assembles a report (scores, reconciles, attaches source/date/confidence)
→ PostgreSQL (Neon) → FastAPI (Render) → web (Vercel) + mobile (Expo).

**Infra:**
- Web: **Vercel** (auto-deploys from `main`), custom domain `neighbourtrust.com`
- API: **Render** (`neighbour-trust.onrender.com`)
- DB: **Neon** Postgres (PostGIS / H3 spatial keying)
- CI: **GitHub Actions** (scheduled data ingest)
- Mobile builds: **EAS** (preview = APK, production = AAB)

## 4. AI / LLM subsystems (the differentiators)

LLMs are used **only where the task is a judgement about language** — not for
arithmetic (air quality, school access, flood depth, distances are deterministic).

### a) News-incident classifier — `agents/news_monitor/classify.py`
Decides whether a news mention is a locality-specific incident vs noise.
- Provider-agnostic (OpenAI-compatible): **Groq** (default), Cerebras, OpenRouter, ScaleMax, self-hosted **Ollama**; an Anthropic path exists.
- **Model chosen by benchmark** (`scripts/compare_classifiers.py`, labelled GDELT headlines): default `qwen/qwen3.8-27b` (7/7 @0.36s), vs gpt-oss-120b (6/7), gpt-oss-20b (5/7).
- Strict free `HeuristicClassifier` fallback floor; structured output; token-budget rate limiting (~14 calls/min on Groq free tier); per-verdict `provider:model` audit trail.
- Diagnostic: `scripts/check_classifier.py` (names *why* a classifier failed).

### b) Retrieval-grounded Q&A — `agents/orchestrator/qa.py`
Answers a buyer's free-text question about one locality, strictly from stored data.
- **Deterministic retrieval** (no vector DB): assemble + number all facts for the locality, hand the model the lot.
- **Citation validation** (`validate()`): drops any citation id the model invented; requires grounded answers to cite real *evidence* (not just "absence" records); demotes ungrounded answers to refusals.
- **Refusal-by-default** (`answerable` is a schema field).
- **No derived numbers** (quote, never compute).
- **Prompt-injection defense** (`_sanitize_question`): neutralises citation-shaped `[n]` tokens in the untrusted question at one chokepoint; structural prompt separation; system prompt forbids following instructions in the question.
- Provider-flexible: Anthropic (`QA_MODEL`, default `claude-opus-5`) or any OpenAI-compatible provider (reuses the Groq config). System prompt is prompt-cached.

> **Currently** the Q&A runs on the free Groq fallback (no Anthropic credit yet).
> When Claude credits arrive, set `ANTHROPIC_API_KEY` (and optionally `QA_MODEL`)
> to run it on Claude — see §7.

## 5. Key conventions & non-negotiables

- **Package name `com.nestra503.app` is permanent** (Android + iOS). `com.nestra.app` was taken by other developers; do not revert.
- **Signing keystore is EAS-managed, fingerprint `B6:8A:A0:FC:…:1D:DA`.** Backed up locally as `@shubhamsinha50__neighbour-trust.jks` (passwords stored privately, NOT in the repo). **Never regenerate the keystore** (answer "No" to "generate a new keystore?" in EAS) — it's registered as the Play upload key.
- Commit messages end with the project's attribution trailers (Co-Authored-By + Claude-Session line).
- **No model identifiers** in commit messages, PR bodies, code comments, or any repo artifact (the app's own LLM config in code is fine to document).
- Branch workflow: feature branch → PR → **squash-merge** to `main` → resync branch to `origin/main`.
- Never disable TLS verification / unset HTTPS_PROXY in the dev environment.

## 6. What was done recently (this work stream) — merged PRs

- **Noida expansion** 5 → ~52 sectors via landuse-polygon geocoding (`scripts/geocode_sectors.py`, `agents/common/seed_localities.py`).
- **Icon pipeline** `scripts/derive_icons.py` (all app/web/Play icons from one master, PIL-only).
- **Schools** reworked to **access-only** scoring; **staffing data purged** for honesty (`agents/orchestrator/score.py`, `apps/api/app/schools_verdict.py`, reconcile).
- **Pros/Cons** consolidation on the mobile locality screen (`apps/mobile/app/[slug]/index.tsx`).
- **Flood risk (Phase 1)** — WRI Aqueduct Floods raster sampling: `scripts/sample_flood_hazard.py`, `agents/common/flood_hazard.py` (289 flood-prone), `agents/orchestrator/flood.py`, web `FloodCard`, mobile flood section. Never scored; labelled modeled.
- **PM2.5/PM10 rounding** fix on mobile (`round1()` in `apps/mobile/app/[slug]/air-quality.tsx`) — PR #31.
- **Store screenshots generator** `scripts/make_store_screenshots.py` — PR #30.
- **Play listing copy + Data-safety answers** `apps/mobile/store/play-listing.md`.
- **expo-doctor build fixes** (remove `newArchEnabled`, move splash into `expo-splash-screen` plugin, bump expo/expo-constants/expo-router) — **PR #32**.
- **Package rename → `com.nestra503.app`** + **More-screen redesign** ("Where our data comes from" sources card, 5 languages) — **PR #33**.
- **README → recruiter case study** — **PR #34**; **+ live screenshots & AI/LLM engineering section** — **PR #35**; **+ author-credited "how it was built"** — **PR #36**.
- **Domain & email:** registered `neighbourtrust.com` (DNS on Cloudflare, site on Vercel), Zoho Mail with MX + SPF records; `shubham@neighbourtrust.com`.
- **Claude for Startups** application submitted (org "Nestra", SMB, India, bootstrapped).

## 7. Open items / next steps

1. **Play rollout (blocked until ~Oct 8, 2026 ~09:49 IST)** — the upload-key reset activates then. Steps:
   - Rebuild AAB only if needed; the built AAB (EAS build `vdASBFU…`) is already signed with the registered key.
   - Play Console → Internal testing → remove rejected bundle → upload the AAB → **Review release → Start rollout**.
   - Fill App content: Data safety (no data collected off-device), content rating (expect Everyone), target audience 18+, **privacy policy URL** `https://neighbourtrust.com/privacy`.
2. **Switch Q&A to Claude when credits land:** set `ANTHROPIC_API_KEY` in the API's env (Render) and `.env`; optionally set `QA_MODEL`. The Anthropic client in `agents/orchestrator/qa.py` is already wired.
3. **Claude Startups decision** pending (minutes to ~3 business days; email to shubham@neighbourtrust.com).
4. **Entity registration** decision (Pvt Ltd / OPC if raising; Udyam/proprietorship if bootstrapping) — keep the application's incorporation date accurate.
5. **Housekeeping:** update resume/README links to `neighbourtrust.com`; point Play privacy URL to the domain.

## 8. Where secrets live (never commit these)

- **EAS keystore + passwords:** downloaded `.jks` on the owner's machine; passwords kept privately (EAS also holds the managed copy).
- **API keys** (Groq, Anthropic when issued): `.env` at repo root (gitignored) and the Render/Vercel env dashboards.
- **Zoho email / Cloudflare / Play Console / Vercel / Render / Neon:** owner's accounts.

## 9. Useful commands

```bash
# Mobile
cd apps/mobile && npm install && npx expo start -c        # dev
eas build --profile production --platform android          # AAB for Play

# Checks
cd apps/mobile && npx tsc --noEmit                         # typecheck
python -m scripts.check_classifier                         # which LLM providers are reachable
python scripts/compare_classifiers.py                      # benchmark classifiers

# Data
python -m scripts.sample_flood_hazard                      # regenerate flood_hazard.py (offline, needs rasterio)
```

---

*This file is documentation only. For the product overview see the root `README.md`;
for strategy and the build roadmap see `docs/strategy.md` and `docs/build-roadmap.md`.*
