"use client";

/**
 * Save a locality to your shortlist, from its page.
 *
 * Signed out, it offers sign-in and saves once you return, so the locality you
 * were looking at is not lost to the detour. Signed in, it toggles.
 */

import { useT } from "@/components/LanguageProvider";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export function SaveButton({ slug, name }: { slug: string; name: string }) {
  const t = useT();
  const { data: session, status } = useSession();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/me/shortlist")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ slug: string }>) => {
        if (cancelled) return;
        const isSaved = Array.isArray(list) && list.some((item) => item.slug === slug);
        // Returning from sign-in with ?save=1 finishes the save that started it.
        const pending = new URLSearchParams(window.location.search).get("save") === "1";
        if (pending && !isSaved) {
          void toggle(false);
          window.history.replaceState(null, "", window.location.pathname);
        } else {
          setSaved(isSaved);
        }
      })
      .catch(() => !cancelled && setSaved(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, slug]);

  async function toggle(currentlySaved: boolean) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/me/shortlist/${slug}`, {
      method: currentlySaved ? "DELETE" : "PUT",
      headers: { "content-type": "application/json" },
      body: currentlySaved ? undefined : "{}",
    }).catch(() => null);
    setBusy(false);
    if (!response || !response.ok) {
      const data = await response?.json().catch(() => null);
      setError(data?.detail ?? t("save.updateError"));
      return;
    }
    setSaved(!currentlySaved);
  }

  // Holds the button's space while the session loads, so the title beside it
  // does not shift when it appears.
  if (status === "loading") {
    return <span aria-hidden="true" className="inline-block h-[30px] w-[74px] rounded-full bg-[#e8e7e1] motion-safe:animate-pulse" />;
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: `/${slug}?save=1` })}
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-3 py-1.5 text-[12px] font-semibold text-ink-secondary hover:border-brand hover:text-brand"
        aria-label={`Sign in to save ${name}`}
      >
        <span aria-hidden="true">♡</span> {t("save.save")}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy || saved === null}
        onClick={() => toggle(Boolean(saved))}
        aria-pressed={Boolean(saved)}
        className={
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 " +
          (saved
            ? "bg-brand text-white"
            : "border border-hairline bg-surface-1 text-ink-secondary hover:border-brand hover:text-brand")
        }
      >
        <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
        {saved ? t("save.saved") : t("save.save")}
      </button>
      {error && <span className="text-[10.5px] text-[#c0442c]">{error}</span>}
    </span>
  );
}
