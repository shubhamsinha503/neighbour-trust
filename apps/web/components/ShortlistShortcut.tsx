"use client";

/**
 * On the front page, for someone signed in: straight back to what they saved.
 *
 * A returning person has usually already narrowed their search, and the most
 * useful thing on their first screen is that shortlist rather than an empty
 * search box. Renders nothing for anyone signed out, and nothing until the
 * count is known, so it never pushes the page down after it has painted.
 */

import { useT } from "@/components/LanguageProvider";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export function ShortlistShortcut() {
  const t = useT();
  const { data: session } = useSession();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!cancelled && me && typeof me.saved_count === "number") setCount(me.saved_count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session || count === null || count === 0) return null;

  const firstName = session.user?.name?.split(" ")[0];

  return (
    <Link
      href="/shortlist"
      className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3.5 transition-colors hover:border-brand"
    >
      <span className="text-[13.5px] text-brand-deep">
        {firstName ? t("sc.welcomeBack").replace("{name}", firstName) : ""}
        <span className="font-semibold">
          ♥ {t("sc.yourShortlist")} · {count} {count === 1 ? t("sc.locality") : t("sc.localities")}
        </span>
      </span>
      <span className="text-[13px] font-semibold text-brand-deep">{t("sc.open")}</span>
    </Link>
  );
}
