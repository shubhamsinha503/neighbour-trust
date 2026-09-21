# Building the Android app (TWA) for the Play Store

Neighbour Trust ships to Google Play as a **Trusted Web Activity (TWA)** — a thin
Android wrapper around the live PWA at neighbourtrust.com. There is no separate
mobile codebase: the app *is* the website, full-screen, with its own icon.

The web side is already TWA-ready — the manifest (`apps/web/app/manifest.ts`),
the icons (`apps/web/public/icons/`, incl. maskable), and the Digital Asset
Links file (`apps/web/public/.well-known/assetlinks.json`). What remains is the
Android build, which needs a machine with the Android toolchain — it does **not**
run in CI here.

## Decisions already made (don't change after publishing)
- **Package id: `com.neighbourtrust.app`** — permanent once the app is on Play.
- Colours: theme `#ff2d78` (pink), splash background `#fbfbfa` — match the site.
- The reference config is `android/twa-manifest.json`.

## One-time build (on your machine)

**Prerequisites:** Node 18+, and a JDK. Bubblewrap downloads the Android SDK and
(if needed) a JDK on first run, so you don't have to install Android Studio.

```bash
npm install -g @bubblewrap/cli
```

**Initialise from the live manifest** (pulls name, colours, icons automatically —
they're already correct):

```bash
mkdir -p ~/neighbourtrust-android && cd ~/neighbourtrust-android
bubblewrap init --manifest https://neighbourtrust.com/manifest.webmanifest
```

When prompted:
- Application id → **com.neighbourtrust.app**
- Accept the pink theme / pink splash it reads from the manifest.
- It creates a **signing keystore** and asks for a password. **This keystore is
  your identity on Play — back it up and never commit it.** If you lose it you
  can't ship updates. (Keep `android.keystore` and its passwords out of git; this
  repo does not store them.)

**Build the bundle:**

```bash
bubblewrap build
```

Output: `app-release-bundle.aab` — this is what you upload to Play Console.

## Wire up Digital Asset Links (removes the URL bar)

Without this the app shows a browser address bar — Google may reject that. Two
fingerprints matter, and Play App Signing is why:

1. Because you use **Play App Signing** (the default), Google re-signs the app
   with *their* key. The fingerprint that must be published is **Google's app-
   signing key**, found in **Play Console → your app → Test and release → Setup →
   App integrity → App signing**. That page even generates the exact
   `assetlinks.json` for you.
2. Copy the SHA-256 from there into
   `apps/web/public/.well-known/assetlinks.json`, replacing
   `REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE_APP_SIGNING`. You can list **more than
   one** fingerprint in the array (e.g. add your local upload key too), which is
   fine and often needed during testing.
3. Commit and push — Vercel serves it at
   `https://neighbourtrust.com/.well-known/assetlinks.json`.
4. Verify: <https://developers.google.com/digital-asset-links/tools/generator>

## Upload

Play Console → Create app → upload `app-release-bundle.aab`.

**Remember (personal account):** a personal developer account created now must
run a **closed test with 12+ opted-in testers for 14 continuous days** before
production release. Start that clock early — it's the long pole, not the build.

## Shipping updates later

1. Bump `appVersionCode` (and `appVersionName`) in `android/twa-manifest.json`.
2. `bubblewrap update && bubblewrap build`.
3. Upload the new `.aab`.

Content changes on the website need **no** new build — the TWA loads the live
site, so a Vercel deploy updates the app instantly. You only rebuild for
native-level changes (icon, name, colours, package config).
