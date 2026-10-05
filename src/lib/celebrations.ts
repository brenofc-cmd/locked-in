/**
 * Celebrations (V2 Phase 9, docs/CELEBRATIONS.md). Short, rare, factual and
 * shown once. Pure: which unlocks to claim, which receipts to show, and their
 * copy. The database (`public.celebrations`, owner-only) is the only memory —
 * it validates every claim (a milestone really reached, today really perfect,
 * a month really closed) and keeps `seen_at`, so a celebration shown on one
 * device is not shown on another. A baseline row (reached before this
 * feature) never celebrates. No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { addDays } from "@/lib/local-date";
import {
  lastDayOfMonth,
  monthName,
  monthOf,
  monthScore,
  type Month,
} from "@/lib/monthly";
import type { Milestone } from "@/lib/records";

export type CelebrationKind = "milestone" | "perfect_day" | "monthly";

/** A row of `public.celebrations` (the owner's own). */
export type CelebrationRow = {
  kind: CelebrationKind;
  /** Milestone code (streak_7), local date (perfect day) or YYYY-MM-01. */
  key: string;
  baseline: boolean;
  seenAt: string | null;
};

export type Claim = { kind: CelebrationKind; key: string };

/** A monthly celebration only for a month that ended in the last 7 days. */
export const MONTHLY_WINDOW_DAYS = 7;

/** Database code of a milestone: "streak_30" (records.ts keys are "streak-30"). */
export const milestoneCode = (m: Pick<Milestone, "kind" | "target">) =>
  `${m.kind}_${m.target}`;

const has = (rows: CelebrationRow[], c: Claim) =>
  rows.some((r) => r.kind === c.kind && r.key === c.key);

/**
 * The most recent FINAL month I won or drew, if it ended within the window
 * and is before the current month. Never a live month; a lost or
 * insufficient month has no celebration.
 */
export function monthToCelebrate(months: Month[], today: string): Month | null {
  const current = monthOf(today);
  const candidates = months
    .filter(
      (m) =>
        m.final &&
        m.state === "final" &&
        m.month < current &&
        (m.leader === "me" || m.leader === "draw") &&
        addDays(lastDayOfMonth(m.month), MONTHLY_WINDOW_DAYS) >= today,
    )
    .sort((a, b) => b.month.localeCompare(a.month));
  return candidates[0] ?? null;
}

/**
 * What to claim now: today's Perfect Day (one per date), every reached
 * milestone without a row, and the month to celebrate without a row.
 * Each claim is validated again by the database.
 */
export function claimsToMake(input: {
  today: string;
  todayPerfect: boolean;
  milestones: Milestone[];
  months: Month[];
  rows: CelebrationRow[];
}): Claim[] {
  const claims: Claim[] = [];
  if (input.todayPerfect)
    claims.push({ kind: "perfect_day", key: input.today });
  for (const m of input.milestones)
    if (m.reached) claims.push({ kind: "milestone", key: milestoneCode(m) });
  const month = monthToCelebrate(input.months, input.today);
  if (month) claims.push({ kind: "monthly", key: month.month });
  return claims.filter((c) => !has(input.rows, c));
}

const ORDER: CelebrationKind[] = ["perfect_day", "milestone", "monthly"];

/** Receipts not seen yet (never a baseline), in display order. */
export function pendingCelebrations(rows: CelebrationRow[]): CelebrationRow[] {
  return rows
    .filter((r) => !r.baseline && r.seenAt === null)
    .sort(
      (a, b) =>
        ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
        a.key.localeCompare(b.key),
    );
}

/** Milestone codes already unlocked (celebrated or baseline): CONQUISTADO. */
export const unlockedCodes = (rows: CelebrationRow[]) =>
  new Set(rows.filter((r) => r.kind === "milestone").map((r) => r.key));

export type CelebrationCopy = { title: string; line: string };

/** Factual copy. null when the row cannot be shown (unknown code / month). */
export function celebrationCopy(
  row: Pick<CelebrationRow, "kind" | "key">,
  ctx: { months: Month[]; todayTasks: number },
): CelebrationCopy | null {
  const c = t.celebrations;
  if (row.kind === "perfect_day")
    return { title: c.perfectDay, line: c.perfectDayLine(ctx.todayTasks) };
  if (row.kind === "milestone") {
    const match = /^(streak|focus|perfect)_(\d+)$/.exec(row.key);
    if (!match) return null;
    const kind = match[1] as Milestone["kind"];
    return {
      title: t.records.milestone[kind](Number(match[2])),
      line: c.milestoneLine,
    };
  }
  const month = ctx.months.find((m) => m.month === row.key);
  if (!month || (month.leader !== "me" && month.leader !== "draw")) return null;
  return month.leader === "draw"
    ? {
        title: c.monthDraw,
        line: c.monthLine(monthName(month.month), monthScore(month)),
      }
    : {
        title: t.monthly.champion(monthName(month.month)),
        line: c.monthLine(monthName(month.month), monthScore(month)),
      };
}
