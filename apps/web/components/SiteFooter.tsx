import Link from "next/link";

/**
 * Minimal site footer: a single, quiet Privacy link.
 *
 * The old footer (methodology link + disclaimer paragraph) was removed for a
 * cleaner page. The Privacy link stays because the Play Store requires the
 * privacy policy to be reachable from inside the app, not only from the store
 * listing — so this is the smallest footer that keeps the app compliant.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 max-w-3xl px-4 py-5">
      <Link
        href="/privacy"
        className="text-[11px] text-ink-muted transition-colors hover:text-brand"
      >
        Privacy
      </Link>
    </footer>
  );
}
