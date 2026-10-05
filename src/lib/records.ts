/**
 * Personal Records + Milestones (V2 Phase 8, docs/MONTHLY_COMPETITION.md).
 * Pure: the numbers come from `my_records()` (owner-only) and the existing
 * longest streak (my_progress_summary + today live, ADR-038 unchanged).
 * Records are personal bests, never a comparison with the partner; milestones
 * are fixed thresholds derived from the same numbers — nothing is stored,
 * nothing is earned (no XP, no currency). No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { weekStartOf } from "@/lib/progress";

export type RecordsData = {
  bestFocusDay: { seconds: number; date: string } | null;
  /** Monday of the best closed week. */
  bestFocusWeek: { seconds: number; weekStart: string } | null;
  /** First day of the best month. */
  bestPerfectMonth: { days: number; month: string } | null;
  /** Settled effective focus, all history. */
  totalFocusSeconds: number;
  /** Perfect Days over closed days, all history. */
  totalPerfectDays: number;
};

export const emptyRecords = (): RecordsData => ({
  bestFocusDay: null,
  bestFocusWeek: null,
  bestPerfectMonth: null,
  totalFocusSeconds: 0,
  totalPerfectDays: 0,
});

// ---- milestones ---------------------------------------------------------------

export type MilestoneKind = "streak" | "focus" | "perfect";

/** Thresholds: streak in days, focus in hours, Perfect Days in days. */
export const MILESTONES: Record<MilestoneKind, readonly number[]> = {
  streak: [7, 30, 100],
  focus: [10, 50, 100],
  perfect: [5, 10, 30],
};

export type Milestone = {
  key: string;
  kind: MilestoneKind;
  target: number;
  /** Progress in the milestone's unit (days or whole hours), capped at the target. */
  current: number;
  reached: boolean;
};

/**
 * Every milestone with its state. Streak uses the LONGEST streak, so losing
 * the current run never takes a milestone back; focus uses whole hours of
 * settled effective focus; Perfect Days the closed-day total. V2 Phase 9: a
 * milestone with a durable unlock (`unlocked`, database codes like
 * "streak_30") stays CONQUISTADO whatever the numbers say later.
 */
export function milestones(input: {
  longestStreak: number;
  totalFocusSeconds: number;
  totalPerfectDays: number;
  unlocked?: ReadonlySet<string>;
}): Milestone[] {
  const value: Record<MilestoneKind, number> = {
    streak: input.longestStreak,
    focus: Math.floor(input.totalFocusSeconds / 3600),
    perfect: input.totalPerfectDays,
  };
  return (Object.keys(MILESTONES) as MilestoneKind[]).flatMap((kind) =>
    MILESTONES[kind].map((target) => {
      const reached =
        value[kind] >= target ||
        Boolean(input.unlocked?.has(`${kind}_${target}`));
      return {
        key: `${kind}-${target}`,
        kind,
        target,
        current: reached ? target : Math.min(value[kind], target),
        reached,
      };
    }),
  );
}

/**
 * The next milestone of each kind (the lowest one not reached yet), ordered
 * by how close it is (share done, then kind order). Reached kinds drop out.
 */
export function nextMilestones(all: Milestone[]): Milestone[] {
  const order: MilestoneKind[] = ["streak", "focus", "perfect"];
  return order
    .map((kind) => all.find((m) => m.kind === kind && !m.reached))
    .filter((m): m is Milestone => m !== undefined)
    .sort((a, b) => b.current / b.target - a.current / a.target);
}

export const milestoneTitle = (m: Milestone) =>
  t.records.milestone[m.kind](m.target);

/** "23 / 30" on screen. */
export const milestoneProgress = (m: Milestone) =>
  t.records.progress[m.kind](m.current, m.target);

/** "23 de 30 dias" for screen readers. */
export const milestoneAria = (m: Milestone) =>
  m.reached
    ? `${milestoneTitle(m)}: ${t.records.reached}`
    : `${milestoneTitle(m)}: ${t.records.progressAria[m.kind](m.current, m.target)}`;

// ---- record labels -----------------------------------------------------------

/** "4h 32min", "45min", "—" */
export function hoursLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
}

/** "14–20 SET" or "28 SET–4 OUT" for the Monday of a week. */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStartOf(weekStart)}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400000);
  const short = (d: Date) => t.dates.monthsShort[d.getUTCMonth()];
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${short(end)}`
    : `${start.getUTCDate()} ${short(start)}–${end.getUTCDate()} ${short(end)}`;
}
