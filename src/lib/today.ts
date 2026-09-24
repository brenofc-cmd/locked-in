import { sortTasks } from "@/lib/task-model";
import type { Category, Day, RoutineItem, SectionName, Task } from "@/types";

export const SECTION_ORDER: SectionName[] = [
  "MORNING",
  "WORK / STUDY",
  "BODY",
  "NIGHT",
  "CUSTOM",
];

export const SECTION_OF: Record<Category, SectionName> = {
  morning: "MORNING",
  work_study: "WORK / STUDY",
  body: "BODY",
  night: "NIGHT",
  custom: "CUSTOM",
};

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
  if (stats.total === 0) return "Nothing scheduled today.";
  if (stats.perfect) return "Every task done.";
  if (stats.standardMet)
    return `Standard met. ${stats.left} left for a perfect day.`;
  return `${stats.needed} more to meet your standard.`;
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
  if (days.length === 7) return "EVERY DAY";
  const weekdays: Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
  if (days.length === 5 && weekdays.every((d) => days.includes(d)))
    return "WEEKDAYS";
  return days.map((d) => d.slice(0, 2)).join(" ");
}
