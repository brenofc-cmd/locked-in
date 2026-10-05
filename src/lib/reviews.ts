/**
 * Reviews 2.0 (V2 Phase 9, docs/WEEKLY_PLANNING.md → Reviews). The Day and
 * Weekly Reviews keep their numbers and gain three optional reflections
 * (owner-only, `public.reviews`) and a few objective facts from
 * `my_review_facts()`. No AI, no generated text, no score. No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { prioritiesRatio, type Priority } from "@/lib/weekly-plan";

export type ReviewKind = "day" | "week";

export const REFLECTION_MAX = 500;

export type Reflection = {
  worked: string;
  hindered: string;
  changeNext: string;
};

export const REFLECTION_FIELDS = ["worked", "hindered", "changeNext"] as const;

export const emptyReflection = (): Reflection => ({
  worked: "",
  hindered: "",
  changeNext: "",
});

/** Trimmed and capped; the database trims again and stores "" as null. */
export function normalizeReflection(r: Reflection): Reflection {
  const clean = (s: string) => s.trim().slice(0, REFLECTION_MAX);
  return {
    worked: clean(r.worked),
    hindered: clean(r.hindered),
    changeNext: clean(r.changeNext),
  };
}

export const isEmptyReflection = (r: Reflection) =>
  REFLECTION_FIELDS.every((f) => !r[f].trim());

export const sameReflection = (a: Reflection, b: Reflection) =>
  REFLECTION_FIELDS.every((f) => a[f].trim() === b[f].trim());

export type ReviewRow = {
  worked: string | null;
  hindered: string | null;
  change_next: string | null;
};

export const reflectionFromRow = (r: ReviewRow | null): Reflection => ({
  worked: r?.worked ?? "",
  hindered: r?.hindered ?? "",
  changeNext: r?.change_next ?? "",
});

/** Objective facts of a period, from `my_review_facts(from, to)`. */
export type ReviewFacts = {
  daysWithTasks: number;
  planned: number;
  completed: number;
  focusSeconds: number;
  perfectDays: number;
  standardDays: number;
  nonNegotiablePlanned: number;
  nonNegotiableCompleted: number;
};

export type ReviewFactsRow = {
  days_with_tasks: number;
  planned: number;
  completed: number;
  focus_seconds: number;
  perfect_days: number;
  standard_days: number;
  non_negotiable_planned: number;
  non_negotiable_completed: number;
};

export const factsFromRow = (r: ReviewFactsRow): ReviewFacts => ({
  daysWithTasks: Number(r.days_with_tasks),
  planned: Number(r.planned),
  completed: Number(r.completed),
  focusSeconds: Number(r.focus_seconds),
  perfectDays: Number(r.perfect_days),
  standardDays: Number(r.standard_days),
  nonNegotiablePlanned: Number(r.non_negotiable_planned),
  nonNegotiableCompleted: Number(r.non_negotiable_completed),
});

/** "5 / 7", or null when nothing was planned (neutral, never 0 / 0). */
export const ratio = (done: number, total: number) =>
  total > 0 ? `${done} / ${total}` : null;

export type FactLine = { k: string; v: string; testId: string };

/**
 * The Weekly Review's added facts: Daily Standard days, non-negotiables and
 * the week's priorities. Lines without data are left out. (Tasks, focus and
 * Perfect Days are already in the review.)
 */
export function weekFactLines(
  facts: ReviewFacts,
  priorities: Priority[],
): FactLine[] {
  const c = t.reviews;
  const lines: FactLine[] = [];
  const standard = ratio(facts.standardDays, facts.daysWithTasks);
  if (standard)
    lines.push({ k: c.standardDays, v: standard, testId: "fact-standard" });
  const nn = ratio(facts.nonNegotiableCompleted, facts.nonNegotiablePlanned);
  if (nn) lines.push({ k: c.nonNegotiables, v: nn, testId: "fact-nn" });
  const pr = prioritiesRatio(priorities);
  if (pr) lines.push({ k: c.priorities, v: pr, testId: "fact-priorities" });
  return lines;
}

/** The added fact of a past day (DaySheet already shows tasks and focus). */
export function dayFactLines(facts: ReviewFacts): FactLine[] {
  const nn = ratio(facts.nonNegotiableCompleted, facts.nonNegotiablePlanned);
  return nn ? [{ k: t.reviews.nonNegotiables, v: nn, testId: "fact-nn" }] : [];
}
