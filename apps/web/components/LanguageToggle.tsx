"use client";

/**
 * The manual language picker.
 *
 * Sets a first-party `nt_lang` cookie and refreshes so the server re-renders in
 * the chosen language — the cookie, not client state, is the source of truth, so
 * a reload or a shared link opens in the same language. A plain <select> because
 * it is a short list, is keyboard- and screen-reader-friendly for free, and each
 * option is shown in its own script so a reader recognises their language
 * without knowing English.
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useLocale } from "@/components/LanguageProvider";
import {
  LANG_COOKIE,
  LOCALES,
  LOCALE_CITY_HINT,
  LOCALE_NAMES,
  isLocale,
  translator,
  type Locale,
} from "@/lib/i18n";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function LanguageToggle() {
  const locale = useLocale();
  const t = translator(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span className="sr-only">{t("lang.label")}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </svg>
      <select
        aria-label={t("lang.label")}
        value={locale}
        disabled={pending}
        onChange={(e) => {
          if (isLocale(e.target.value)) choose(e.target.value);
        }}
        className="cursor-pointer rounded-md border border-hairline bg-surface-1 px-1.5 py-1 text-[11px] text-ink-secondary transition-colors hover:text-brand disabled:opacity-50"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
            {LOCALE_CITY_HINT[l] ? ` · ${LOCALE_CITY_HINT[l]}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
