# Building the Android App Bundle (.aab) for Play

The app ships to Google Play as a Trusted Web Activity (TWA) wrapping
neighbourtrust.com. The bundle is built from `android/twa-manifest.json`.

## What's set up

- Package: `com.neighbourtrust.app`, host `neighbourtrust.com`
- bubblewrap installed the JDK 17 and Android SDK under `~/.bubblewrap/`
  (`config.json` records `jdkPath` and `androidSdkPath`)
- Upload keystore: `android/android.keystore`, alias `android`
  (keep the file + password backed up — losing them means the app can never
  be updated again)

## Why not just `bubblewrap build`

On this Windows machine `bubblewrap build` fails at the Gradle step with
`'gradlew.bat' is not recognized` (a known bubblewrap spawn bug). The project
it generates is fine, so we invoke Gradle directly instead.

## Build a signed bundle directly (the working recipe)

From `android/`, with the JDK/SDK env pointed at bubblewrap's copies:

```powershell
$env:JAVA_HOME  = 'C:\Users\pc\.bubblewrap\jdk\jdk-17.0.11+9'
$env:ANDROID_HOME = 'C:\Users\pc\.bubblewrap\android_sdk'
# local.properties must contain: sdk.dir=C\:\\Users\\pc\\.bubblewrap\\android_sdk
.\gradlew.bat bundleRelease --no-daemon --max-workers=1 `
  "-Pandroid.injected.signing.store.file=$PWD\android.keystore" `
  '-Pandroid.injected.signing.store.password=<STORE_PW>' `
  '-Pandroid.injected.signing.key.alias=android' `
  '-Pandroid.injected.signing.key.password=<KEY_PW>'
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

### Low-memory note
Gradle's default 1536 MB daemon heap fails on this machine ("Could not reserve
enough space for object heap"). `android/gradle.properties` is set to
`org.gradle.jvmargs=-Xmx768m` + `org.gradle.daemon=false`, and the build uses
`--no-daemon --max-workers=1`. Close Chrome tabs if it still OOMs.

## Version bumps

Edit `appVersionCode` (must increase every upload) and `appVersionName` in
`android/twa-manifest.json`, then rebuild. First release was versionName
`1.0.0`, versionCode `2`.

## Digital Asset Links (required for full-screen)

Play App Signing re-signs the app, so `apps/web/public/.well-known/assetlinks.json`
must carry the **app-signing key** SHA-256 from Play Console → Test and release →
App integrity (NOT the upload key). Update it there and redeploy the web app,
or the installed TWA shows a browser URL bar.
