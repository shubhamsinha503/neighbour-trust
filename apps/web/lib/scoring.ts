/**
 * What the Trust Score is made of, in words a buyer can check.
 *
 * The score is a weighted average of only the categories we could measure,
 * renormalised over them (agents/orchestrator/score.py). That is the honest
 * choice — a missing category is not scored as bad — but it has a cost: a
 * locality scored on two categories shows a number that looks exactly as
 * complete as one scored on five. This module turns the report into an explicit
 * breakdown so the page can say, next to the number, what it covers and what it
 * does not.
 *
 * Pure functions over the report, so the wording is unit-tested and cannot
 * drift between the score chip and the breakdown.
 */

import type { LocalityReport, ReportCategory } from "@/lib/api";
import type { Confidence } from "@schema/envelope";

/** What each category's 0–100 actually measures — and what it does not. */
export const CATEGORY_MEASURES: Record<string, string> = {
  air_quality:
    "Air at the nearest live monitor or sensor, from its 24-hour average. Not a forecast, and not measured at your street.",
  schools:
    "How many schools are within 2 km — access, not quality. No open Indian data rates teaching.",
  crime:
    "The mix of incidents local press reported in 12 months, led by the share involving violence. Not a crime rate.",
  water:
    "Flooding, supply and contamination problems reported in local press in 12 months. Not a measured supply figure.",
  infrastructure:
    "How close transit, hospitals and daily needs are, from OpenStreetMap.",
};

/** Confidence tags, explained once in plain words. */
export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  high: "Recent, from an official or regulatory source close to the locality.",
  medium: "A real measurement, but older, further away or from a weaker source.",
  low: "An indication only — old, distant, partial or modelled. Weigh it lightly.",
  community_estimated:
    "No official source exists; this leans on local press or community sensors.",
};

export interface CountedPart {
  category: string;
  label: string;
  score: number;
  /** Base weight in the full model, 0–100. */
  basePct: number;
  /** Share of *this* score after renormalising over what was counted, 0–100. */
  sharePct: number;
  confidence: Confidence | null;
}

export interface UncountedPart {
  category: string;
  label: string;
  reason: string;
}

export interface ScoreBreakdown {
  counted: CountedPart[];
  notCounted: UncountedPart[];
  /** Share of the full model's weight this score rests on, 0–100. */
  coveragePct: number;
  /** True when the score rests on less than everything we would weigh. */
  partial: boolean;
  /** Counted categories whose inputs are low-confidence or community-estimated. */
  weakInputs: string[];
}

const WEAK: ReadonlyArray<Confidence> = ["low", "community_estimated"];

/** Why a category is not in the number, without contradicting its own card. */
export function uncountedReason(c: ReportCategory): string {
  if (!c.available) return "No data for this locality yet — unknown, not fine.";
  if (c.historical) {
    return "The last reading is too old to describe today. Shown with its date, never counted.";
  }
  if (c.isBaseline) {
    return "Nothing reported in local press in 12 months. Shown on the card as a baseline, never counted — no coverage is not evidence of no problems.";
  }
  if (c.score === null) {
    return c.summary || c.status || "Not enough data to score.";
  }
  return c.status || "Not counted.";
}

export function breakdown(
  report: Pick<LocalityReport, "categories" | "trustScore">,
  label: (c: ReportCategory) => string = (c) => c.label,
): ScoreBreakdown {
  const counted = report.categories.filter((c) => c.counted && c.score !== null);
  const countedWeight = counted.reduce((sum, c) => sum + c.weight, 0);

  const parts: CountedPart[] = counted.map((c) => ({
    category: c.category,
    label: label(c),
    score: c.score as number,
    basePct: Math.round(c.weight * 100),
    sharePct: countedWeight > 0 ? Math.round((c.weight / countedWeight) * 100) : 0,
    confidence: c.confidence,
  }));

  const notCounted: UncountedPart[] = report.categories
    .filter((c) => !(c.counted && c.score !== null))
    .map((c) => ({ category: c.category, label: label(c), reason: uncountedReason(c) }));

  const coveragePct = report.trustScore.coveragePct;
  return {
    counted: parts,
    notCounted,
    coveragePct,
    partial: coveragePct < 100 || notCounted.length > 0,
    weakInputs: parts
      .filter((p) => p.confidence !== null && WEAK.includes(p.confidence))
      .map((p) => p.label),
  };
}

/** "Schools, Water and Safety" — for inline sentences. */
export function joinLabels(labels: string[], and = "and"): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} ${and} ${labels[labels.length - 1]}`;
}
