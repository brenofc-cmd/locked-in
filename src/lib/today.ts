import { t } from "@/i18n/pt-BR";
import { dayLabel } from "@/lib/local-date";
import { CATEGORIES, sortTasks } from "@/lib/task-model";
import type { Category, Day, RoutineItem, SectionName, Task } from "@/types";

export const SECTION_OF: Record<Category, SectionName> = t.sections;

export const SECTION_ORDER: SectionName[] = CATEGORIES.map(
  (c) => SECTION_OF[c],
);

export type TodayStats = {
  done: number;
  total: number;
  pct: number;
  perfect: boolean;
  standardMet: boolean;
  /** Tasks still needed to reach the standard (0 when met). */
  needed: number;
  left: number;
};

/**
 * Completion = completed / all tasks scheduled for the day (ADR-022).
 * A skipped task stays in the total and is not completed:
 * 10 tasks, 8 completed, 1 skipped, 1 pending -> 80%.
 */
export function todayStats(tasks: Task[], standard: number): TodayStats {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const neededTotal = Math.ceil((standard / 100) * total);
  const needed = Math.max(0, neededTotal - done);
  return {
    done,
    total,
    pct,
    perfect: total > 0 && done === total,
    standardMet: total > 0 && needed === 0,
    needed,
    left: total - done,
  };
}

export function nextLine(stats: TodayStats): string {
  if (stats.total === 0) return t.today.nothingScheduled;
  if (stats.perfect) return t.today.everyTaskDone;
  if (stats.standardMet) return t.today.standardMet(stats.left);
  return t.today.moreToStandard(stats.needed);
}

/** Routine items scheduled / not scheduled on a weekday. */
export function routinesOn(routines: RoutineItem[], day: Day) {
  return {
    on: routines.filter((r) => r.days.includes(day)),
    off: routines.filter((r) => !r.days.includes(day)),
  };
}

export function groupBySection(tasks: Task[]) {
  return SECTION_ORDER.map((name) => {
    const list = sortTasks(
      tasks.filter((t) => SECTION_OF[t.category] === name),
    );
    return {
      name,
      tasks: list,
      count: `${list.filter((t) => t.done).length} / ${list.length}`,
    };
  }).filter((s) => s.tasks.length > 0);
}

export function scheduleLabel(days: Day[]): string {
  if (days.length === 7) return t.today.everyDay;
  const weekdays: Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
  if (days.length === 5 && weekdays.every((d) => days.includes(d)))
    return t.today.weekdays;
  return days.map(dayLabel).join(" ");
}

/**
 * V3 — the one task Today points at: the best-ranked open Top 3 task, else
 * the first open task in the order the list shows (section, then time).
 * Skipped and done tasks are never next; null when nothing is open. Pure
 * presentation: it changes no rule, no order and no data.
 */
export function nextTaskId(tasks: Task[]): string | null {
  const open = (t: Task) => !t.done && t.skip === null;
  const ranked = tasks
    .filter((t) => open(t) && t.priority !== null)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  if (ranked.length) return ranked[0].id;
  for (const section of groupBySection(tasks)) {
    const first = section.tasks.find(open);
    if (first) return first.id;
  }
  return null;
}

/** One Proof Pill per task (V3): empty, pointed at (PRÓXIMA), skipped, proved. */
export type Pill = "done" | "skip" | "next" | "open";

/**
 * V3 — Today's bar as Proof Pills, in the order the list shows. Pure
 * presentation over the same tasks as `todayStats` (skipped stays a pill,
 * as it stays in the denominator).
 */
export function dayPills(tasks: Task[], nextId: string | null): Pill[] {
  return groupBySection(tasks).flatMap((s) =>
    s.tasks.map((task): Pill =>
      task.done
        ? "done"
        : task.skip !== null
          ? "skip"
          : task.id === nextId
            ? "next"
            : "open",
    ),
  );
}
