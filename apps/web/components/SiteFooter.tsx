import Link from "next/link";

import { LanguageToggle } from "@/components/LanguageToggle";
import { getServerT } from "@/lib/i18n-server";

/**
 * Minimal site footer: a quiet Privacy link and the language picker.
 *
 * The old footer (methodology link + disclaimer paragraph) was removed for a
 * cleaner page. The Privacy link stays because the Play Store requires the
 * privacy policy to be reachable from inside the app, not only from the store
 * listing — so this is the smallest footer that keeps the app compliant. The
 * language picker sits here too: reachable from every page, out of the way of
 * the content.
 */
export async function SiteFooter() {
  const { t } = await getServerT();
  return (
    <footer className="mx-auto mt-12 flex max-w-3xl items-center justify-between px-4 py-5">
      <Link
        href="/privacy"
        className="text-[11px] text-ink-muted transition-colors hover:text-brand"
      >
        {t("nav.privacy")}
      </Link>
      <LanguageToggle />
    </footer>
  );
}
