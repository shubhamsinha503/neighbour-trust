"use client";

/**
 * The signed-in person's saved localities, their private notes, and the way
 * into comparing them.
 *
 * Scores shown are current, recomputed by the API on every load — a shortlist
 * that showed the number from the day something was saved would be quietly out
 * of date on the one page people decide from.
 */

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Saved = {
  slug: string;
  name: string;
  city: string;
  note: string;
  saved_at: string;
  score: number | null;
  scored_categories: string[];
  top_flag: { headline: string; severity: string } | null;
};

const MAX_COMPARE = 4;

function scoreColour(score: number | null): string {
  if (score === null) return "var(--color-ink-muted)";
  return score >= 75 ? "var(--color-brand)" : score >= 55 ? "#c9860a" : "#c0442c";
}

export function ShortlistView() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/me/shortlist")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.detail ?? "Could not load your shortlist.");
        return data as Saved[];
      })
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [session]);

  if (status === "loading") return <p className="mt-4 text-[13px] text-ink-muted">Loading…</p>;

  if (!session) {
    return (
      <div className="mt-4 rounded-[20px] border border-hairline bg-surface-1 p-5">
        <p className="text-[13.5px] text-ink-secondary">
          Sign in to save localities, keep private notes on them and compare
          them side by side.
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/shortlist" })}
          className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  async function remove(slug: string) {
    const r = await fetch(`/api/me/shortlist/${slug}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setItems((current) => current?.filter((i) => i.slug !== slug) ?? null);
      setPicked((p) => p.filter((s) => s !== slug));
    }
  }

  async function deleteAccount() {
    const r = await fetch("/api/me", { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      await signOut({ redirect: false });
      router.push("/");
    } else {
      setError("Could not delete your account. Please try again.");
    }
  }

  function togglePick(slug: string) {
    setPicked((p) =>
      p.includes(slug) ? p.filter((s) => s !== slug) : p.length >= MAX_COMPARE ? p : [...p, slug],
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[12px] text-ink-muted">
        Signed in as {session.user?.email}. Your shortlist and notes are visible
        only to you.
      </p>

      {error && <p className="mt-4 text-[13px] text-[#c0442c]">{error}</p>}
      {items === null && !error && (
        <p className="mt-4 text-[13px] text-ink-muted">Loading your shortlist…</p>
      )}

      {items?.length === 0 && (
        <div className="mt-4 rounded-[20px] border border-dashed border-hairline p-5 text-[13px] text-ink-secondary">
          Nothing saved yet. Open any locality and tap <b>♡ Save</b>.
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="sticky top-0 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5">
            <span className="text-[12px] text-ink-secondary">
              {picked.length < 2
                ? `Tick 2–${MAX_COMPARE} localities to compare`
                : `${picked.length} selected`}
            </span>
            {picked.length >= 2 ? (
              <Link
                href={`/compare?slugs=${picked.join(",")}`}
                className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white"
              >
                Compare
              </Link>
            ) : (
              <span className="rounded-xl bg-page-plane px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted">
                Compare
              </span>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-2.5">
            {items.map((item) => (
              <ShortlistItem
                key={item.slug}
                item={item}
                picked={picked.includes(item.slug)}
                pickDisabled={!picked.includes(item.slug) && picked.length >= MAX_COMPARE}
                onPick={() => togglePick(item.slug)}
                onRemove={() => remove(item.slug)}
              />
            ))}
          </ul>
        </>
      )}

      <section className="mt-10 border-t border-hairline pt-5">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
          Your account
        </h2>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-2 text-[12px] font-semibold text-[#c0442c] hover:underline"
          >
            Delete my account and everything saved
          </button>
        ) : (
          <div className="mt-2 rounded-2xl border border-hairline bg-surface-1 p-4 text-[12.5px] text-ink-secondary">
            This permanently deletes your account, your shortlist and all your
            notes. It cannot be undone.
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={deleteAccount}
                className="rounded-xl bg-[#c0442c] px-3.5 py-2 font-semibold text-white"
              >
                Yes, delete everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="font-semibold text-ink-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ShortlistItem({
  item,
  picked,
  pickDisabled,
  onPick,
  onRemove,
}: {
  item: Saved;
  picked: boolean;
  pickDisabled: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(item.note);
  const [savedNote, setSavedNote] = useState(item.note);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  // Saved when the box loses focus rather than on every keystroke: one request
  // per edit, and nothing half-typed is written.
  async function saveNote() {
    if (note === savedNote) return;
    setSaving("saving");
    const r = await fetch(`/api/me/shortlist/${item.slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note }),
    }).catch(() => null);
    if (r?.ok) {
      setSavedNote(note);
      setSaving("saved");
    } else {
      setSaving("failed");
    }
  }

  const status =
    saving === "saving"
      ? "Saving…"
      : saving === "saved"
        ? "Note saved"
        : saving === "failed"
          ? "Couldn't save the note"
          : "";

  return (
    <li className="rounded-2xl border border-hairline bg-surface-1 p-3.5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={picked}
          disabled={pickDisabled}
          onChange={onPick}
          aria-label={`Compare ${item.name}`}
          className="mt-1.5 h-4 w-4"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/${item.slug}`} className="text-[14px] font-semibold hover:text-brand">
              {item.name}{" "}
              <span className="text-[11px] font-normal text-ink-muted">{item.city}</span>
            </Link>
            <span
              className="text-[17px] font-bold tabular-nums"
              style={{ color: scoreColour(item.score) }}
            >
              {item.score ?? "—"}
            </span>
          </div>
          {item.top_flag && (
            <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-secondary">
              {item.top_flag.headline}
            </p>
          )}
          <label className="mt-2 block">
            <span className="sr-only">Private note on {item.name}</span>
            <textarea
              value={note}
              maxLength={2000}
              rows={note ? 2 : 1}
              onChange={(e) => {
                setNote(e.target.value);
                setSaving("idle");
              }}
              onBlur={saveNote}
              placeholder="Private note, e.g. visited Sunday, traffic bad at 9am"
              className="w-full resize-y rounded-xl border border-hairline bg-white px-3 py-2 text-[12.5px] placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
          </label>
          <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-muted">
            <span aria-live="polite">{status}</span>
            <button type="button" onClick={onRemove} className="font-semibold hover:text-[#c0442c]">
              Remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
