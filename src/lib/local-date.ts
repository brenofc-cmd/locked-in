/**
 * Local dates. A LOCKED IN day is a calendar date in the user's IANA timezone
 * (profiles.timezone). The database is the authority (public.my_today(),
 * returned by ensure_my_daily_tasks); these helpers format and compute with
 * the "YYYY-MM-DD" strings it returns, never with UTC slices of Date.
 */
import { t } from "@/i18n/pt-BR";
import type { Day } from "@/types";

/**
 * ISO order: index 0 = Monday = ISO 1 … index 6 = Sunday = ISO 7. These are
 * identifiers (stored as ISO numbers), never shown: labels come from the
 * catalog (DAY_LABELS, DAY_LETTERS).
 */
export const DAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const DAY_LETTERS: readonly string[] = t.dates.weekdayLetters;
export const DAY_LABELS: readonly string[] = t.dates.weekdaysShort;
/** "SEG" for "MON". */
export const dayLabel = (d: Day) => DAY_LABELS[DAYS.indexOf(d)];

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const dayToIso = (d: Day) => (DAYS.indexOf(d) + 1) as IsoWeekday;
export const isoToDay = (n: number): Day => DAYS[n - 1];

/** Days in ISO order without duplicates; anything outside MON..SUN is dropped. */
export function normalizeDays(days: readonly Day[]): Day[] {
  return DAYS.filter((d) => days.includes(d));
}

/** The calendar date ("YYYY-MM-DD") at `at` in `timeZone`. */
export function localDateISO(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUTC(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(dateISO: string): IsoWeekday {
  const js = toUTC(dateISO).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday;
}

export const weekdayOf = (dateISO: string): Day =>
  isoToDay(isoWeekday(dateISO));

export function addDays(dateISO: string, n: number): string {
  const d = toUTC(dateISO);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10); // safe: d is UTC midnight
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** "QUI, 24 SET" — the Today header. */
export function dateLabel(dateISO: string): string {
  const d = toUTC(dateISO);
  return `${DAY_LABELS[isoWeekday(dateISO) - 1]}, ${d.getUTCDate()} ${t.dates.monthsShort[d.getUTCMonth()]}`;
}

/** "HH:MM" of an instant in `timeZone` (e.g. when a task was completed). */
export function localTimeHM(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** "QUINTA" */
export const weekdayName = (dateISO: string) =>
  t.dates.weekdaysLong[isoWeekday(dateISO) - 1];

/** "DAY N" on Today: 1 on the day the account was created (owner's timezone). */
export function accountDay(
  createdAt: string,
  timeZone: string,
  today: string,
): number {
  return daysBetween(localDateISO(timeZone, new Date(createdAt)), today) + 1;
}
