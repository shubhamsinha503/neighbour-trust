# Google Play release — Neighbour Trust

The Android app is a **Trusted Web Activity**: a thin Android shell that opens
the live website full-screen. There is no separate app codebase — every website
deploy reaches the app. The pieces already in the repo:

| Piece | Where |
|---|---|
| Web app manifest (name, icons, colours, `display: standalone`) | `apps/web/app/manifest.ts` |
| Icons incl. maskable 192/512 | `apps/web/public/icons/` |
| Service worker + offline page | `apps/web/public/sw.js`, `apps/web/app/offline` |
| Digital Asset Links (removes the URL bar once filled in) | `apps/web/app/.well-known/assetlinks.json/route.ts` |
| Privacy policy, incl. "If you install the app" | `/privacy` |

Account type: **Personal / single developer**. $25 one-time, no D-U-N-S. A new
personal account must run a **closed test with 12+ testers opted in for 14
continuous days** before it can apply for production; internal testing (just
you) has no such gate. The 14-day window is timed to overlap the news-pipeline
fix and locality expansion, so the app is public-ready when the data is fresh.
Identity verification (a government ID) is required at sign-up. Confirm the
current rules on the Console — Google changes them.

---

## 1. Store listing (draft)

**App name** (30 chars max): `Neighbour Trust`

**Short description** (80 max):
`Check a Bengaluru or Gurugram neighbourhood before you rent or buy — sourced.`

**Full description** (4,000 max):

> Know the neighbourhood before you commit to it.
>
> Neighbour Trust brings together what public sources actually say about a
> locality in Bengaluru or Gurugram — and tells you where every figure came from
> and how old it is.
>
> • Trust Score out of 100, built only from the categories we can measure there,
>   and saying how many that is
> • Schools nearby, from UDISE and OpenStreetMap
> • Air quality from community and government sensors
> • Safety and water: incidents confirmed from local press, with the headlines
> • Connectivity: stations, hospitals, parks and markets on a map
> • Projects the local press has reported as coming — shown as reports, never
>   as promises
> • Ask a question about a locality and get an answer that cites its sources
> • Search by locality, pincode, apartment, road or landmark
> • Save localities, keep private notes and compare them side by side (optional
>   Google sign-in)
>
> What makes it different: when we have no data, we say so instead of guessing.
> Absence of reports is never shown as a good score, and no number is ever
> invented to fill a gap.
>
> Covers 159 localities across Bengaluru and Gurugram, and growing.

**Category:** House & Home. **Tags:** real estate, neighbourhood, city guide.

**Contact email:** the organization's support address (required, public).
**Website:** `https://neighbourtrust.com` (or the custom domain).
**Privacy policy URL:** `https://neighbourtrust.com/privacy`

### Graphics needed

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `public/icons/icon-512.png` — checked: 512×512, opaque RGB, ready |
| Feature graphic | 1024×500 PNG/JPG | **to make** |
| Phone screenshots | 2–8, 16:9 or 9:16, min 320 px, max 3840 px | **to capture**: home search, a locality report, map, Ask answer, shortlist, compare |

---

## 2. Data safety form — answers matched to the code

Answer from what the app does **today**; update the form in the same change as
any code that alters these (the same rule the privacy page follows).

**Does your app collect or share any of the required user data types?** Yes.

**Is all user data encrypted in transit?** Yes (HTTPS only).

**Do you provide a way for users to request that their data be deleted?** Yes —
in-app, "Delete my account and everything saved" on the shortlist page. Deletion
URL for the form: `https://neighbourtrust.com/shortlist`.

| Data type | Collected? | Shared? | Optional? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Optional (only if signed in) | Account management | From Google sign-in |
| Personal info → **Email address** | Yes | No | Optional (only if signed in) | Account management | From Google sign-in |
| Personal info → **User IDs** | Yes | No | Optional | Account management | Google account id |
| App activity → **Other user-generated content** | Yes | No | Optional | App functionality | Saved localities and private notes |
| App activity → **Other actions** (questions asked) | Yes — processed, not stored | **Yes** — sent to Groq (AI provider) to generate the answer | Optional | App functionality | Not retained by us |
| Location → **Approximate / precise location** | **No** | — | — | — | "Near me" runs in the browser; coordinates are never sent to our servers |
| App info & performance → **Crash logs / diagnostics** | No | — | — | — | |
| **Web browsing / analytics** | Page views only, aggregate, no identifier | No | Required | Analytics | Vercel Web Analytics, cookieless |

Items typed into search or the address box are sent to OpenStreetMap's
Nominatim to be placed on a map and are not stored; declare as **App activity →
Other actions, shared, processed ephemerally**, purpose App functionality.

The Android app requests **no permissions** (no location, contacts, storage,
camera). Keep it that way unless the privacy page changes first.

---

## 3. Other Console questionnaires

- **App access:** all functionality available without sign-in; sign-in is
  optional for saving. If reviewers need an account, they can use any Google
  account.
- **Ads:** No ads.
- **Content rating:** complete the IARC questionnaire — reference/information
  app, no user-to-user interaction, no violence depiction beyond news headlines.
- **Target audience:** 18+ (home renting/buying).
- **News app declaration:** No — it summarises local press as data, it is not a
  news publisher. Re-check the current policy wording when filling it in.
- **Government app:** No. **Financial features:** No.

---

## 4. Build and release steps

1. **Package name** (permanent once uploaded): `app.neighbourtrust`.
2. **Toolchain:** Bubblewrap CLI downloads a JDK 17 and the Android command-line
   tools on first run (~500 MB total). Needs explicit go-ahead before download.
3. `bubblewrap init --manifest https://<site>/manifest.webmanifest` → generates
   the Android project and an **upload signing key**. Back the keystore file and
   its password up somewhere safe outside the repo; never commit it.
4. `bubblewrap build` → `app-release-bundle.aab`.
5. Play Console → create app → upload the `.aab` to **Internal testing** first
   and enrol **Play App Signing**.
6. Copy **both** SHA-256 fingerprints — the upload key and Play's app-signing key
   (Console → Test and release → App integrity) — into Vercel:
   `ANDROID_PACKAGE_NAME=app.neighbourtrust`,
   `ANDROID_CERT_FINGERPRINTS=<upload>,<play signing>`; redeploy. Confirm
   `/.well-known/assetlinks.json` lists both, then check the installed app shows
   no URL bar.
7. Internal testing (you) → **closed testing, 12+ testers, 14 days** (required
   for a new personal account) → production. Recruit testers now — friends,
   family, a few prospective users — since the 14 days are the long pole.

**Domain note:** the app is tied to the site's origin. If the site moves from
`*.vercel.app` to a custom domain, the app must be rebuilt and re-verified —
cheaper to move the domain before step 3 than after release.

**Do not promote to production** while the ingestion pipelines are degraded
(`/healthz`): the app shows the same data as the site.
