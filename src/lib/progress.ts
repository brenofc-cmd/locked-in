/**
 * Progress maths on top of the database aggregates (Stage 7, docs/ANALYTICS.md).
 * The database returns counts (my_daily_progress, duo_weeks, my_habits,
 * my_progress_summary); everything here is small, pure and unit-tested:
 * percentages, ranges, chart buckets, calendar states, winners, insights.
 *
 * One rounding rule: a percentage shown in the UI is Math.round(100·c/p)
 * (half up, as Postgres round()). Decisions (standard met, winners) always
 * use the exact ratio, never the rounded number.
 */
import {
  DAYS,
  addDays,
  daysBetween,
  isoWeekday,
  weekdayName,
} from "@/lib/local-date";
import { t } from "@/i18n/pt-BR";
import type { DuelRow } from "@/lib/duel";
import type { RecordsData } from "@/lib/records";

export type DayStat = {
  day: string;
  planned: number;
  completed: number;
  focusSeconds: number;
  focusSessions: number;
};

export type WeekRow = {
  weekStart: string;
  isCurrent: boolean;
  me: { planned: number; completed: number; focus: number; perfect: number };
  partner: {
    planned: number;
    completed: number;
    focus: number;
    perfect: number;
  } | null;
};

export type Habit = {
  routineId: string;
  title: string;
  planned: number;
  completed: number;
};

export type Summary = {
  today: string;
  standard: number;
  streakBeforeToday: number;
  /** Longest streak over closed days (today is added live). */
  longestClosed: number;
  todayPlanned: number;
  todayCompleted: number;
  firstTaskDate: string | null;
};

export type PartnerSummary = {
  streakBeforeToday: number;
  currentStreak: number;
  standard: number;
};

export type ProgressData = {
  summary: Summary;
  days: DayStat[];
  habits: Habit[];
  weeks: WeekRow[];
  partner: PartnerSummary | null;
  /** V2 Phase 7: today's duel and the last 7 (docs/DUEL.md). */
  duels: DuelRow[];
  /** V2 Phase 8: per-day duel numbers of the last months (monthly champion). */
  months: DuelRow[];
  /** V2 Phase 8: personal records and milestone totals (owner-only). */
  records: RecordsData;
};

// ---- day ------------------------------------------------------------------

/** Rounded completion %, or null for a neutral (no task) day / period. */
export function percent(completed: number, planned: number): number | null {
  return planned > 0 ? Math.round((100 * completed) / planned) : null;
}

/** Exact: completed / planned >= standard %. Never true for a neutral day. */
export function standardMet(
  planned: number,
  completed: number,
  standard: number,
): boolean {
  return planned > 0 && completed * 100 >= standard * planned;
}

export type DayState = "neutral" | "missed" | "met" | "perfect";

export function dayState(
  planned: number,
  completed: number,
  standard: number,
): DayState {
  if (planned === 0) return "neutral";
  if (completed === planned) return "perfect";
  return standardMet(planned, completed, standard) ? "met" : "missed";
}

/** Streak now: closed days (from the database) + today once it meets the standard. */
export function liveStreak(
  streakBeforeToday: number,
  todayPlanned: number,
  todayCompleted: number,
  standard: number,
): number {
  return (
    streakBeforeToday +
    (standardMet(todayPlanned, todayCompleted, standard) ? 1 : 0)
  );
}

/**
 * The series with today's entry replaced by the live counts (my own task
 * changes and focus show at once, without a refetch).
 */
export function withToday(
  days: DayStat[],
  today: string,
  live: { planned: number; completed: number; focusSeconds?: number },
): DayStat[] {
  return days.map((d) =>
    d.day === today
      ? {
          ...d,
          planned: live.planned,
          completed: live.completed,
          focusSeconds: live.focusSeconds ?? d.focusSeconds,
        }
      : d,
  );
}

// ---- ranges -----------------------------------------------------------------

export type Range = "7" | "30" | "90" | "Y";

/** Inclusive local-date range ending today. YEAR = the current calendar year. */
export function rangeFrom(range: Range, today: string): string {
  if (range === "Y") return `${today.slice(0, 4)}-01-01`;
  return addDays(today, -(Number(range) - 1));
}

/** First day the Progress series must cover (every range + this month). */
export function seriesFrom(today: string): string {
  const candidates = [
    rangeFrom("Y", today),
    rangeFrom("90", today),
    `${today.slice(0, 7)}-01`,
  ];
  return candidates.sort()[0];
}

export type Totals = {
  planned: number;
  completed: number;
  pct: number | null;
  focusSeconds: number;
  focusSessions: number;
  perfectDays: number;
  daysWithTasks: number;
};

export function totals(days: DayStat[], from: string, to: string): Totals {
  const inRange = days.filter((d) => d.day >= from && d.day <= to);
  const sum = (f: (d: DayStat) => number) =>
    inRange.reduce((s, d) => s + f(d), 0);
  const planned = sum((d) => d.planned);
  const completed = sum((d) => d.completed);
  return {
    planned,
    completed,
    pct: percent(completed, planned),
    focusSeconds: sum((d) => d.focusSeconds),
    focusSessions: sum((d) => d.focusSessions),
    perfectDays: inRange.filter(
      (d) => d.planned > 0 && d.completed === d.planned,
    ).length,
    daysWithTasks: inRange.filter((d) => d.planned > 0).length,
  };
}

// ---- chart ------------------------------------------------------------------

export type Bar = {
  key: string;
  /** Short label under the bar ("" = none). */
  label: string;
  /** Long label for screen readers / tooltips. */
  title: string;
  pct: number | null;
  current: boolean;
};

export const monthLabel = (dateISO: string) =>
  t.dates.monthsShort[Number(dateISO.slice(5, 7)) - 1];

/** "14 SET" */
const shortDate = (dateISO: string) =>
  `${Number(dateISO.slice(8, 10))} ${monthLabel(dateISO)}`;

/** Monday of the week containing the date. */
export const weekStartOf = (dateISO: string) =>
  addDays(dateISO, -(isoWeekday(dateISO) - 1));

/** ISO-8601 week number (the Thursday rule). */
export function isoWeekNumber(dateISO: string): number {
  const thursday = addDays(dateISO, 4 - isoWeekday(dateISO));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

/**
 * Bars per range: 7D and 30D one per day, 90D one per week, YEAR one per
 * month (completion of each bucket = its completed / planned).
 */
export function chartBars(days: DayStat[], range: Range, today: string): Bar[] {
  const from = rangeFrom(range, today);
  const inRange = days.filter((d) => d.day >= from && d.day <= today);
  if (range === "7" || range === "30") {
    return inRange.map((d, i) => ({
      key: d.day,
      label:
        range === "7"
          ? DAYS[isoWeekday(d.day) - 1]
          : i % 10 === 4
            ? shortDate(d.day)
            : "",
      title: `${shortDate(d.day)}: ${pctText(percent(d.completed, d.planned))}`,
      pct: percent(d.completed, d.planned),
      current: d.day === today,
    }));
  }
  const bucketOf =
    range === "90" ? weekStartOf : (d: string) => `${d.slice(0, 7)}-01`;
  const buckets = new Map<string, { planned: number; completed: number }>();
  for (const d of inRange) {
    const k = bucketOf(d.day);
    const b = buckets.get(k) ?? { planned: 0, completed: 0 };
    b.planned += d.planned;
    b.completed += d.completed;
    buckets.set(k, b);
  }
  const current = bucketOf(today);
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, b]) => {
      const label =
        range === "90" ? t.progress.weekShort(isoWeekNumber(k)) : monthLabel(k);
      return {
        key: k,
        label,
        title: `${range === "90" ? t.progress.week(isoWeekNumber(k)) : label}: ${pctText(percent(b.completed, b.planned))}`,
        pct: percent(b.completed, b.planned),
        current: k === current,
      };
    });
}

export const pctText = (pct: number | null) =>
  pct === null ? t.progress.noTasks : `${pct}%`;

// ---- calendar ---------------------------------------------------------------

export type CalendarCell =
  | { kind: "blank"; key: string }
  | {
      kind: "day";
      key: string;
      date: string;
      dayNumber: number;
      state: DayState | "future" | "today";
      pct: number | null;
    };

/** A month (default: the current one), Monday-first, with each day's state. */
export function calendarMonth(
  days: DayStat[],
  today: string,
  standard: number,
  month: string = today.slice(0, 7),
): { label: string; cells: CalendarCell[] } {
  const first = `${month}-01`;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const cells: CalendarCell[] = [];
  for (let i = 1; i < isoWeekday(first); i++)
    cells.push({ kind: "blank", key: `b${i}` });
  for (let date = first; date.slice(0, 7) === first.slice(0, 7);) {
    const d = byDay.get(date);
    const planned = d?.planned ?? 0;
    const completed = d?.completed ?? 0;
    cells.push({
      kind: "day",
      key: date,
      date,
      dayNumber: Number(date.slice(8, 10)),
      state:
        date > today
          ? "future"
          : date === today
            ? "today"
            : dayState(planned, completed, standard),
      pct: date > today ? null : percent(completed, planned),
    });
    date = addDays(date, 1);
  }
  return {
    label:
      month === today.slice(0, 7)
        ? fullMonth(first)
        : `${fullMonth(first)} ${first.slice(0, 4)}`,
    cells,
  };
}

const fullMonth = (dateISO: string) =>
  t.dates.monthsLong[Number(dateISO.slice(5, 7)) - 1];

// ---- competition --------------------------------------------------------------

/** Sign of (a's ratio - b's ratio), exact. Both must have planned > 0. */
export function compareRatio(
  a: { planned: number; completed: number },
  b: { planned: number; completed: number },
): number {
  return Math.sign(a.completed * b.planned - b.completed * a.planned);
}

export type Leader = {
  who: "me" | "partner" | "tied" | "none";
  /** "+5%", "<1%" or "" */
  margin: string;
};

/** This week's leader on raw completion % (the standard plays no part). */
export function leader(
  me: { planned: number; completed: number },
  partner: { planned: number; completed: number } | null,
): Leader {
  if (!partner || me.planned === 0 || partner.planned === 0)
    return { who: "none", margin: "" };
  const sign = compareRatio(me, partner);
  if (sign === 0) return { who: "tied", margin: "" };
  const diff = Math.abs(
    (percent(me.completed, me.planned) ?? 0) -
      (percent(partner.completed, partner.planned) ?? 0),
  );
  return {
    who: sign > 0 ? "me" : "partner",
    margin: diff === 0 ? "<1%" : `+${diff}%`,
  };
}

export type WeekResult = {
  weekStart: string;
  week: number;
  me: number | null;
  partner: number | null;
  /** Head-to-head outcome; ineligible unless both had tasks that week. */
  result: "me" | "partner" | "draw" | "ineligible";
  row: WeekRow;
};

/** Completed weeks (the current week never counts), newest first. */
export function completedWeeks(weeks: WeekRow[]): WeekResult[] {
  return weeks
    .filter((w) => !w.isCurrent)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map((w) => {
      const p = w.partner;
      const eligible = p !== null && w.me.planned > 0 && p.planned > 0;
      const sign = eligible ? compareRatio(w.me, p) : 0;
      return {
        weekStart: w.weekStart,
        week: isoWeekNumber(w.weekStart),
        me: percent(w.me.completed, w.me.planned),
        partner: p ? percent(p.completed, p.planned) : null,
        result: !eligible
          ? "ineligible"
          : sign > 0
            ? "me"
            : sign < 0
              ? "partner"
              : "draw",
        row: w,
      };
    });
}

export function headToHead(results: WeekResult[]) {
  return {
    me: results.filter((r) => r.result === "me").length,
    partner: results.filter((r) => r.result === "partner").length,
    draws: results.filter((r) => r.result === "draw").length,
  };
}

/** Weeks that have anything to show (either member had tasks). */
export const weeksWithData = (results: WeekResult[]) =>
  results.filter(
    (r) => r.row.me.planned > 0 || (r.row.partner && r.row.partner.planned > 0),
  );

/** "14 – 20 SET" / "28 SET – 4 OUT" */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return monthLabel(weekStart) === monthLabel(end)
    ? `${Number(weekStart.slice(8, 10))} – ${shortDate(end)}`
    : `${shortDate(weekStart)} – ${shortDate(end)}`;
}

// ---- habits and insights ------------------------------------------------------

/** No "best habit" from 1 / 1: a habit needs this many scheduled occurrences. */
export const MIN_HABIT_SAMPLE = 3;

export type HabitRate = Habit & { rate: number };

/** Eligible habits, best first (ties: more occurrences, then title). */
export function rankHabits(habits: Habit[]): HabitRate[] {
  return habits
    .filter((h) => h.planned >= MIN_HABIT_SAMPLE)
    .map((h) => ({ ...h, rate: Math.round((100 * h.completed) / h.planned) }))
    .sort(
      (a, b) =>
        compareRatio(b, a) ||
        b.planned - a.planned ||
        a.title.localeCompare(b.title),
    );
}

export function habitExtremes(habits: Habit[]): {
  best: HabitRate | null;
  missed: HabitRate | null;
} {
  const ranked = rankHabits(habits);
  if (ranked.length === 0) return { best: null, missed: null };
  const best = ranked[0];
  // Most missed: lowest rate (ties: more occurrences); only if it is not
  // also the best and it actually misses.
  const worst = [...ranked].sort(
    (a, b) =>
      compareRatio(a, b) ||
      b.planned - a.planned ||
      a.title.localeCompare(b.title),
  )[0];
  const missed =
    worst.routineId !== best.routineId && worst.completed < worst.planned
      ? worst
      : null;
  return { best, missed };
}

/** Weekday with the highest completion; needs 3+ samples of each counted day. */
export function bestWeekday(
  days: DayStat[],
): { name: string; pct: number } | null {
  const by = new Map<
    number,
    { planned: number; completed: number; n: number }
  >();
  for (const d of days) {
    if (d.planned === 0) continue;
    const k = isoWeekday(d.day);
    const b = by.get(k) ?? { planned: 0, completed: 0, n: 0 };
    b.planned += d.planned;
    b.completed += d.completed;
    b.n += 1;
    by.set(k, b);
  }
  const eligible = [...by.entries()].filter(([, b]) => b.n >= 3);
  if (eligible.length < 3) return null;
  const [k, b] = eligible.sort(
    ([ka, a], [kb, bb]) => compareRatio(bb, a) || ka - kb,
  )[0];
  const anyDay = days.find((d) => isoWeekday(d.day) === k)!.day;
  const name = weekdayName(anyDay);
  return {
    name: name.toLowerCase(),
    pct: percent(b.completed, b.planned) ?? 0,
  };
}

/** Descriptive lines only: counts and rates, never causes. */
export function insightLines(
  habits: Habit[],
  days: DayStat[],
  period: string,
): string[] {
  const lines: string[] = [];
  const { best, missed } = habitExtremes(habits);
  if (best)
    lines.push(
      t.progress.insightBest(
        best.title,
        best.completed,
        best.planned,
        period,
        best.rate,
      ),
    );
  if (missed) lines.push(t.progress.insightMissed(missed.title, missed.rate));
  const wd = bestWeekday(days);
  if (wd) lines.push(t.progress.insightWeekday(period, wd.name, wd.pct));
  return lines;
}

// ---- focus --------------------------------------------------------------------

/** 31_320 s -> "8h 42m"; under an hour "42m". */
export function focusLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---- day boundary -------------------------------------------------------------

/**
 * Milliseconds until the local date in `timeZone` differs from `today`
 * (0 if it already does). Probed at minute resolution, so DST and odd
 * offsets need no special casing.
 */
export function msUntilDateChange(
  nowMs: number,
  timeZone: string,
  today: string,
  localDate: (tz: string, at: Date) => string,
): number {
  if (localDate(timeZone, new Date(nowMs)) !== today) return 0;
  // Coarse (hour) then fine (minute) search over the next 26 hours.
  let t = nowMs;
  const HOUR = 3_600_000;
  while (
    t < nowMs + 26 * HOUR &&
    localDate(timeZone, new Date(t + HOUR)) === today
  )
    t += HOUR;
  while (localDate(timeZone, new Date(t + 60_000)) === today) t += 60_000;
  // t + 1 min is on the new date (at most a minute late, + 1 s margin).
  return t + 60_000 - nowMs + 1000;
}

// ---- weekly review (Stage 8) --------------------------------------------------

export type ReviewWeek = {
  weekStart: string;
  week: number;
  /** The current week: a live leader, never a winner. */
  current: boolean;
  me: WeekRow["me"];
  partner: WeekRow["partner"];
  mePct: number | null;
  partnerPct: number | null;
  /** Closed weeks only (null for the current week). */
  result: WeekResult["result"] | null;
  /** Current week only. */
  leader: Leader | null;
};

/**
 * Weeks the weekly review can show, newest first: the current week (with my
 * live numbers) when anyone has tasks, then completed weeks with data.
 */
export function reviewWeeks(
  weeks: WeekRow[],
  liveMe?: WeekRow["me"],
): ReviewWeek[] {
  const out: ReviewWeek[] = [];
  const cur = weeks.find((w) => w.isCurrent);
  if (cur) {
    const me = liveMe ?? cur.me;
    const p = cur.partner;
    if (me.planned > 0 || (p?.planned ?? 0) > 0)
      out.push({
        weekStart: cur.weekStart,
        week: isoWeekNumber(cur.weekStart),
        current: true,
        me,
        partner: p,
        mePct: percent(me.completed, me.planned),
        partnerPct: p ? percent(p.completed, p.planned) : null,
        result: null,
        leader: leader(me, p),
      });
  }
  for (const r of weeksWithData(completedWeeks(weeks)))
    out.push({
      weekStart: r.weekStart,
      week: r.week,
      current: false,
      me: r.row.me,
      partner: r.row.partner,
      mePct: r.me,
      partnerPct: r.partner,
      result: r.result,
      leader: null,
    });
  return out;
}

/** "YYYY-MM" shifted by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** First and last day of a "YYYY-MM" month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}
