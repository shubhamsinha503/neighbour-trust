import Link from "next/link";

/**
 * Site footer.
 *
 * Carries the privacy link, which the Play Store requires to be reachable from
 * inside the app rather than only from the store listing, and the methodology
 * page, which is the long form of the argument the home page makes in three
 * sentences.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 max-w-3xl border-t border-hairline px-4 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
        <Link href="/about" className="font-medium text-ink-secondary hover:text-brand">
          How these numbers are made
        </Link>
        <Link href="/privacy" className="font-medium text-ink-secondary hover:text-brand">
          Privacy
        </Link>
      </div>
      <p className="mt-3 text-[11px] leading-[1.6] text-ink-muted">
        Neighbour Trust shows public data about public places, with its sources
        and dates attached. Nothing here is a valuation or an investment
        recommendation.
      </p>
    </footer>
  );
}
