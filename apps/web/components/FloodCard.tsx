/**
 * Modeled flood-risk card.
 *
 * Shown only when the hazard model places a locality in a flood zone — a "not in
 * a zone" card under every dry locality would be noise, and the overview already
 * carries that as a reassurance line. The depth is a modeled, ~1 km screening
 * figure, stated plainly and linked to its source, never dressed up as a
 * street-level or observed number. Flood is never scored (see
 * agents/orchestrator/flood.py): it is a fact to show and check, not a number to
 * average into the Trust Score.
 */

import { getServerT } from "@/lib/i18n-server";
import type { FloodInfo } from "@/lib/api";

export async function FloodCard({ flood }: { flood: FloodInfo }) {
  const { t } = await getServerT();
  if (!flood.inZone) return null;

  const depth = flood.depthM != null ? flood.depthM.toFixed(1) : "—";

  return (
    <section className="mt-4 rounded-[20px] border border-[rgba(250,178,25,0.35)] bg-[rgba(250,178,25,0.08)] p-5">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        {t("flood.title")}
      </div>
      <p className="text-[13.5px] leading-[1.5] text-ink-primary">
        {t("flood.line").replace("{depth}", depth)}
      </p>
      <p className="mt-1.5 text-[11px] leading-[1.5] text-ink-muted">{t("flood.caveat")}</p>
      {flood.sourceUrl ? (
        <a
          href={flood.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] font-semibold text-brand underline decoration-dotted underline-offset-2"
        >
          {flood.source} ↗
        </a>
      ) : (
        <span className="mt-2 inline-block text-[11px] text-ink-muted">{flood.source}</span>
      )}
    </section>
  );
}
