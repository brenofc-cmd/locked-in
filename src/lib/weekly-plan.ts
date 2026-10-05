/**
 * Weekly Planning (V2 Phase 9, docs/WEEKLY_PLANNING.md). Up to 3 priorities
 * per week (Monday–Sunday, the same week as Progress), status open / done,
 * owner-only. Self-declared: a priority is a plan, never proof, never a score.
 * The database owns the rules (3 positions, week start, no past week, at most
 * next week); this module only shapes and validates for the screen. No
 * Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { addDays } from "@/lib/local-date";
import { weekStartOf } from "@/lib/progress";

export const MAX_PRIORITIES = 3;
export const PRIORITY_TITLE_MAX = 120;

export type PriorityStatus = "open" | "done";

export type Priority = {
  id: string;
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  /** 1..3 */
  position: number;
  title: string;
  status: PriorityStatus;
};

export type PriorityRow = {
  id: string;
  week_start: string;
  position: number;
  title: string;
  status: string;
};

export const priorityFromRow = (r: PriorityRow): Priority => ({
  id: r.id,
  weekStart: r.week_start,
  position: r.position,
  title: r.title,
  status: r.status === "done" ? "done" : "open",
});

/** The two weeks that can be planned: this one and the next. */
export function planWeeks(today: string): { current: string; next: string } {
  const current = weekStartOf(today);
  return { current, next: addDays(current, 7) };
}

/** Priorities of one week, by position. */
export const prioritiesOf = (all: Priority[], weekStart: string) =>
  all
    .filter((p) => p.weekStart === weekStart)
    .sort((a, b) => a.position - b.position);

/** The first free position (1..3), or null when the week is full. */
export function freePosition(week: Priority[]): number | null {
  for (let p = 1; p <= MAX_PRIORITIES; p++)
    if (!week.some((x) => x.position === p)) return p;
  return null;
}

/** null = valid; otherwise the message to show. */
export function validatePriorityTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return t.weeklyPlan.errors.empty;
  if (trimmed.length > PRIORITY_TITLE_MAX) return t.weeklyPlan.errors.tooLong;
  return null;
}

/** "2 / 3" done of the planned ones; null when nothing is planned. */
export function prioritiesRatio(week: Priority[]): string | null {
  if (!week.length) return null;
  return `${week.filter((p) => p.status === "done").length} / ${week.length}`;
}

/** The PLANEJAR row: "2 prioridades" + "1 / 2 feitas", or "Planeje sua semana". */
export function planRow(week: Priority[]): { value: string; meta: string } {
  const ratio = prioritiesRatio(week);
  return ratio
    ? {
        value: t.weeklyPlan.count(week.length),
        meta: t.weeklyPlan.doneRatio(ratio),
      }
    : { value: t.weeklyPlan.none, meta: "" };
}
