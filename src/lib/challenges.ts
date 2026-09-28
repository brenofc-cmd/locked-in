/**
 * Duo challenges (Stage 8, docs/CHALLENGES.md). The database stores the
 * challenge (title, type, target, period) and derives both members'
 * progress (duo_challenges()); everything here is presentation: status from
 * the dates, formatting, goal share and the winner. Pure and unit-tested.
 */
import { addDays, daysBetween } from "@/lib/local-date";
import { focusLabel, monthLabel } from "@/lib/progress";
import { t } from "@/i18n/pt-BR";

export type ChallengeType = "standard_days" | "focus_seconds";

export type Challenge = {
  id: string;
  title: string;
  type: ChallengeType;
  target: number;
  start: string;
  end: string;
  createdBy: string;
  me: number;
  /** null while the duo has no partner. */
  partner: number | null;
};

export type ChallengeStatus = "upcoming" | "active" | "completed";

/** Derived from my local today: never stored. */
export function challengeStatus(
  c: Pick<Challenge, "start" | "end">,
  today: string,
): ChallengeStatus {
  if (today < c.start) return "upcoming";
  if (today > c.end) return "completed";
  return "active";
}

/** "12 dias" / "8h 42m" */
export function formatValue(type: ChallengeType, value: number): string {
  if (type === "focus_seconds") return focusLabel(value);
  return t.challenges.days(value);
}

/** Goal line: "20 DIAS NO PADRÃO" / "10 HORAS". */
export function goalLabel(type: ChallengeType, target: number): string {
  if (type === "standard_days") return t.challenges.goalStandardDays(target);
  const hours = target / 3600;
  return Number.isInteger(hours)
    ? t.challenges.goalHours(hours)
    : focusLabel(target).toUpperCase();
}

/** Bar width 0–100 toward the goal (capped). */
export const goalShare = (value: number, target: number) =>
  target > 0 ? Math.min(100, Math.round((100 * value) / target)) : 0;

export type ChallengeResult = "me" | "partner" | "draw" | null;

/** Only a completed challenge has a result: the higher value wins. */
export function challengeWinner(
  c: Pick<Challenge, "me" | "partner" | "start" | "end">,
  today: string,
): ChallengeResult {
  if (challengeStatus(c, today) !== "completed" || c.partner === null)
    return null;
  if (c.me === c.partner) return "draw";
  return c.me > c.partner ? "me" : "partner";
}

/** Current leader of an active challenge (no result yet). */
export function challengeLeader(
  c: Pick<Challenge, "me" | "partner">,
): "me" | "partner" | "tied" | null {
  if (c.partner === null) return null;
  if (c.me === c.partner) return "tied";
  return c.me > c.partner ? "me" : "partner";
}

/** "25 SET → 24 OUT" */
export function periodLabel(start: string, end: string): string {
  const d = (x: string) => `${Number(x.slice(8, 10))} ${monthLabel(x)}`;
  return `${d(start)} → ${d(end)}`;
}

/** Status line under the title. */
export function statusLabel(
  c: Pick<Challenge, "start" | "end">,
  today: string,
) {
  const s = challengeStatus(c, today);
  if (s === "upcoming") {
    const n = daysBetween(today, c.start);
    return n === 1 ? t.challenges.startsTomorrow : t.challenges.startsIn(n);
  }
  if (s === "completed") return t.challenges.completed;
  const left = daysBetween(today, c.end);
  return left === 0 ? t.challenges.lastDay : t.challenges.daysLeft(left + 1);
}

export type ChallengeDraft = {
  title: string;
  type: ChallengeType;
  /** Days for standard_days, hours for focus_seconds (as typed). */
  goal: number;
  start: string;
  end: string;
};

/** The sheet's defaults: a 30-day standard challenge from today. */
export function defaultDraft(
  type: ChallengeType,
  today: string,
): ChallengeDraft {
  return type === "standard_days"
    ? {
        title: t.challenges.defaultStandardTitle,
        type,
        goal: 20,
        start: today,
        end: addDays(today, 29),
      }
    : {
        title: t.challenges.defaultFocusTitle,
        type,
        goal: 10,
        start: today,
        end: addDays(today, 6),
      };
}

/** Client-side validation, same rules as the database. null = valid. */
export function validateDraft(d: ChallengeDraft, today: string): string | null {
  const title = d.title.trim();
  if (!title) return t.challenges.titleRequired;
  if (title.length > 40) return t.challenges.titleTooLong;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.end)
  )
    return t.challenges.datesRequired;
  if (d.start < today) return t.challenges.startInPast;
  if (d.end < d.start) return t.challenges.endBeforeStart;
  const days = daysBetween(d.start, d.end) + 1;
  if (days > 366) return t.challenges.tooLong;
  if (!Number.isFinite(d.goal) || d.goal <= 0) return t.challenges.goalPositive;
  if (d.type === "standard_days") {
    if (!Number.isInteger(d.goal)) return t.challenges.wholeDays;
    if (d.goal > days) return t.challenges.maxDays(days);
  } else if (d.goal > days * 24) {
    return t.challenges.maxHours(days * 24);
  }
  return null;
}

/** Stored target: days, or seconds for focus (hours as typed). */
export const targetValue = (d: ChallengeDraft) =>
  d.type === "focus_seconds" ? Math.round(d.goal * 3600) : Math.round(d.goal);
