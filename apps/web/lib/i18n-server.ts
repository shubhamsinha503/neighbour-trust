/**
 * Server-side locale access: read the chosen language from the cookie during a
 * server render, so the first frame is already in the right language (no flash,
 * the same discipline as the city preference). Client components get the locale
 * from LanguageProvider instead.
 */

import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LANG_COOKIE,
  isLocale,
  translator,
  type Locale,
} from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Locale plus a translator, for a server component. */
export async function getServerT(): Promise<{
  locale: Locale;
  t: (key: string) => string;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
