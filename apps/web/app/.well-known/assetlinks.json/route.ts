/**
 * Digital Asset Links — how Android knows this app may open this site.
 *
 * A Trusted Web Activity shows the browser's URL bar unless the site vouches for
 * the app. Chrome fetches this file from the origin the app opens and looks for
 * a matching package name and signing-certificate fingerprint; if it does not
 * find one, the app still works but renders with a visible address bar, which
 * defeats the point of shipping it as an app at all.
 *
 * Served from a route rather than a static file so the fingerprint comes from
 * the environment. An app signing key must not be in a public repository, and
 * the fingerprint is the public half of one — harmless to expose, but it belongs
 * with the deployment rather than the source, and it changes if the key ever is
 * rotated.
 *
 * Set in Vercel:
 *   ANDROID_PACKAGE_NAME       e.g. app.neighbourtrust.twa
 *   ANDROID_CERT_FINGERPRINTS  SHA-256 fingerprints, comma-separated
 *
 * Two fingerprints are usual and both must be listed. Play App Signing re-signs
 * the upload with Google's own key, so the certificate users actually receive is
 * not the one built locally: the upload key and the Play signing key are
 * different, and an app verified against only one of them shows the URL bar for
 * everybody who installed it the other way.
 */

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  // Nothing configured yet: return an empty list rather than a broken document.
  // An empty array is valid and simply verifies nothing, which is the honest
  // state before an app exists.
  const statements =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // Chrome caches this; an hour is short enough to fix a wrong fingerprint
      // the same day and long enough not to be fetched on every launch.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
