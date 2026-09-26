"use client";

/**
 * Carries the chosen locale to client components.
 *
 * Seeded from the server (layout reads the cookie and passes the locale in), so
 * a client component's first render already matches the server's — no flash, no
 * hydration mismatch. `useT` returns a translator; the dictionaries are small
 * plain data, so importing them into the client bundle costs little and avoids
 * threading a big object through props.
 */

import { createContext, useContext } from "react";

import { DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): (key: string) => string {
  return translator(useContext(LocaleContext));
}
