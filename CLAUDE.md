# Nestra (Neighbour Trust) — working notes for AI assistants

Honest, sourced neighbourhood data for Indian home buyers. Monorepo: Expo/React
Native app (`apps/mobile`), Next.js web (`apps/web`), FastAPI (`apps/api`),
Python ingestion + orchestration agents (`agents/`).

**Full context:** read [`docs/HANDOFF.md`](docs/HANDOFF.md) (project state, open
items, where secrets live) and [`README.md`](README.md) (overview + architecture).

## Non-negotiable product rule: honesty-first data

Every figure shows its **source, date, and confidence**. Never invent a score or
present an estimate as fact. Score a category **only where data supports it** —
otherwise leave it off the report, don't blank or estimate. Safety/water and
"reported as coming" come from press coverage and are **never scored**, only
described. Flood risk is **modeled ~1 km screening**, labelled as such, never
scored. If a change alters a data claim, update the privacy policy / about page
in the **same commit**.

## Hard invariants (do not break)

- **Package id `com.nestra503.app` is permanent** (Android + iOS). Never revert to `com.nestra.app` (it's taken by others and is the registered Play package).
- **Never regenerate the EAS signing keystore** (fingerprint `B6:8A:A0:FC:…:1D:DA`). It's the registered Google Play upload key — answer **No** to "generate a new keystore?" in EAS. Regenerating breaks Play uploads.
- **Never commit secrets** (keystore passwords, API keys, account creds). They live in `.env` (gitignored) and the hosting dashboards.
- **No model identifiers** in commit messages, PR bodies, code comments, or any committed artifact. (Documenting the *app's own* LLM config in code is fine.)

## LLM usage (see `agents/orchestrator/qa.py`, `agents/news_monitor/classify.py`)

LLMs are used only for language judgement (grounded Q&A, news-incident
classification) — not for arithmetic. The Q&A agent enforces citation
validation, refusal-by-default, no derived numbers, and prompt-injection defense.
Currently on the free Groq fallback; set `ANTHROPIC_API_KEY` (+ optional
`QA_MODEL`) to run Q&A on Claude.

## Workflow & checks

- Branch → PR → **squash-merge** to `main`; then resync the working branch to `origin/main`.
- Commit messages end with the project's attribution trailers.
- Before pushing mobile changes: `cd apps/mobile && npx tsc --noEmit`.
- Production Android build: `eas build --profile production --platform android`.
- Web auto-deploys from `main` (Vercel, `neighbourtrust.com`); API on Render; DB on Neon.
