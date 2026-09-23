import type { Category, Day, SectionName, Task } from "@/types";

export const SECTION_ORDER: SectionName[] = [
  "MORNING",
  "WORK / STUDY",
  "BODY",
  "NIGHT",
  "CUSTOM",
];

export const SECTION_OF: Record<Category, SectionName> = {
  Morning: "MORNING",
  Study: "WORK / STUDY",
  Work: "WORK / STUDY",
  Body: "BODY",
  Night: "NIGHT",
  Custom: "CUSTOM",
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

/** Skipped tasks leave the day's total; they count neither for nor against. */
export function todayStats(tasks: Task[], standard: number): TodayStats {
  const counted = tasks.filter((t) => !t.skip);
  const total = counted.length;
  const done = counted.filter((t) => t.done).length;
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

export function scheduledOn(tasks: Task[], day: Day) {
  return {
    today: tasks.filter((t) => t.days.includes(day)),
    rest: tasks.filter((t) => !t.days.includes(day)),
  };
}

export function groupBySection(tasks: Task[]) {
  return SECTION_ORDER.map((name) => {
    const list = tasks.filter((t) => SECTION_OF[t.category] === name);
    const counted = list.filter((t) => !t.skip);
    return {
      name,
      tasks: list,
      count: `${counted.filter((t) => t.done).length} / ${counted.length}`,
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
