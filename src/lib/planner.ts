/**
 * School planner (V2 Phase 2, docs/PLANNER.md): pure model, validation,
 * grouping, countdowns, the month grid and reminder dates. Every date is a
 * local "YYYY-MM-DD" school date compared as a string / calendar day — never
 * converted through UTC. "Today" is the database's my_today().
 */
import { t } from "@/i18n/pt-BR";
import { addDays, dateLabel, daysBetween, isoWeekday } from "@/lib/local-date";
import type { Database } from "@/types/database";

export type PlannerRow = Database["public"]["Tables"]["planner_events"]["Row"];

export const EVENT_TYPES = [
  "exam",
  "assignment",
  "homework",
  "deadline",
  "school_event",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const PRIORITIES = ["normal", "important"] as const;
export type Priority = (typeof PRIORITIES)[number];
/** null = no reminder; days before the event (0 = on the day). */
export const REMINDERS = [null, 0, 1, 3, 7] as const;
export type Reminder = (typeof REMINDERS)[number];

export const TITLE_MAX = 80;
export const SUBJECT_MAX = 40;
export const NOTES_MAX = 1000;
/** Upcoming list and Today card: this many days ahead (performance cap). */
export const UPCOMING_DAYS = 60;

export type PlannerEvent = {
  id: string;
  ownerId: string;
  mine: boolean;
  title: string;
  type: EventType;
  subject: string;
  date: string;
  /** "HH:MM" or "" */
  time: string;
  notes: string;
  important: boolean;
  shared: boolean;
  reminder: Reminder;
};

export type PlannerInput = {
  title: string;
  type: EventType;
  subject: string;
  date: string;
  time: string;
  notes: string;
  important: boolean;
  shared: boolean;
  reminder: Reminder;
};

const isType = (x: unknown): x is EventType =>
  (EVENT_TYPES as readonly unknown[]).includes(x);
const isReminder = (x: unknown): x is Reminder =>
  (REMINDERS as readonly unknown[]).includes(x);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateISO(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function fromRow(row: PlannerRow, me: string): PlannerEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    mine: row.owner_id === me,
    title: row.title,
    type: isType(row.event_type) ? row.event_type : "school_event",
    subject: row.subject ?? "",
    date: row.event_date,
    time: row.event_time ? row.event_time.slice(0, 5) : "",
    notes: row.description ?? "",
    important: row.priority === "important",
    shared: row.shared_with_partner,
    reminder: isReminder(row.reminder_days_before)
      ? row.reminder_days_before
      : null,
  };
}

/** Columns a client may write (owner_id / duo_id belong to the database). */
export function toRow(input: PlannerInput) {
  return {
    title: input.title.trim(),
    event_type: input.type,
    subject: input.subject.trim() || null,
    event_date: input.date,
    event_time: input.time || null,
    description: input.notes.trim() || null,
    priority: input.important ? "important" : "normal",
    shared_with_partner: input.shared,
    reminder_days_before: input.reminder,
  };
}

/** Same rules as the table constraints, with friendly copy. */
export function validatePlannerInput(
  input: PlannerInput,
  hasPartner: boolean,
): string | null {
  const title = input.title.trim();
  if (!title) return t.planner.errors.titleRequired;
  if (title.length > TITLE_MAX) return t.planner.errors.titleTooLong(TITLE_MAX);
  if (!isType(input.type)) return t.planner.errors.invalid;
  if (input.subject.trim().length > SUBJECT_MAX)
    return t.planner.errors.subjectTooLong(SUBJECT_MAX);
  if (!isDateISO(input.date)) return t.planner.errors.dateRequired;
  if (input.date < "2000-01-01" || input.date > "2100-12-31")
    return t.planner.errors.dateRequired;
  if (input.time && !TIME.test(input.time)) return t.planner.errors.timeInvalid;
  if (input.notes.trim().length > NOTES_MAX)
    return t.planner.errors.notesTooLong(NOTES_MAX);
  if (!isReminder(input.reminder)) return t.planner.errors.invalid;
  if (typeof input.important !== "boolean") return t.planner.errors.invalid;
  if (input.shared && !hasPartner) return t.planner.errors.noPartner;
  return null;
}

/** Database / network errors → fixed copy (never a raw message). */
export function plannerErrorMessage(error: {
  code?: string;
  message?: string;
}): string {
  const msg = error.message ?? "";
  if (msg.includes("LI_PLANNER_NO_PARTNER")) return t.planner.errors.noPartner;
  if (error.code === "23514") return t.planner.errors.invalid;
  if (error.code === "42501" || error.code === "PGRST116")
    return t.planner.errors.notAllowed;
  return t.planner.errors.saveFailed;
}

/** Chronological: date, then untimed (all day) first, then time, then title. */
export function compareEvents(a: PlannerEvent, b: PlannerEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) {
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time < b.time ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "pt-BR");
}

export type UpcomingGroup = "today" | "tomorrow" | "week" | "later";

/** Sunday of today's ISO week (Mon–Sun). */
export const weekEnd = (today: string) => addDays(today, 7 - isoWeekday(today));

export function groupOf(date: string, today: string): UpcomingGroup | null {
  if (date < today) return null;
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date <= weekEnd(today)) return "week";
  return "later";
}

/** HOJE / AMANHÃ / ESTA SEMANA / DEPOIS; past events never; sorted. */
export function groupUpcoming(
  events: PlannerEvent[],
  today: string,
  days = UPCOMING_DAYS,
): { group: UpcomingGroup; events: PlannerEvent[] }[] {
  const last = addDays(today, days);
  const order: UpcomingGroup[] = ["today", "tomorrow", "week", "later"];
  const buckets = new Map<UpcomingGroup, PlannerEvent[]>();
  for (const e of [...events].sort(compareEvents)) {
    if (e.date > last) continue;
    const g = groupOf(e.date, today);
    if (!g) continue;
    buckets.set(g, [...(buckets.get(g) ?? []), e]);
  }
  return order
    .filter((g) => buckets.has(g))
    .map((g) => ({ group: g, events: buckets.get(g)! }));
}

/** HOJE · AMANHÃ · EM X DIAS (2–7) · "SEX, 03 OUT" later; past: the date. */
export function countdown(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return t.planner.countdown.today;
  if (n === 1) return t.planner.countdown.tomorrow;
  if (n >= 2 && n <= 7) return t.planner.countdown.inDays(n);
  return dateLabel(date);
}

/** The local date a reminder is due, or null without one. */
export function reminderDate(e: Pick<PlannerEvent, "date" | "reminder">) {
  return e.reminder === null ? null : addDays(e.date, -e.reminder);
}

/** Reminders are shown from 08:00 (local) of their day. */
export const REMINDER_HM = "08:00";

/**
 * My own events whose reminder is due today or was due earlier and the event
 * is still ahead (the app was closed on the reminder day). Partner events
 * never remind me.
 */
export function dueReminders(
  events: PlannerEvent[],
  today: string,
  nowHM: string,
): PlannerEvent[] {
  if (nowHM < REMINDER_HM) return [];
  return events.filter((e) => {
    const due = reminderDate(e);
    return e.mine && due !== null && due <= today && e.date >= today;
  });
}

/** "Estudar para Prova de Física", "Fazer Trabalho de História", … */
export function taskSuggestion(e: Pick<PlannerEvent, "title" | "type">) {
  return t.planner.suggestion[e.type](e.title.trim()).slice(0, 80);
}

export const typeLabel = (type: EventType) => t.planner.types[type];

/** "PROVA · FÍSICA" */
export function eventHeading(e: Pick<PlannerEvent, "type" | "subject">) {
  return [typeLabel(e.type), e.subject.toUpperCase()]
    .filter(Boolean)
    .join(" · ");
}

export type PlannerCell =
  | { kind: "blank"; key: string }
  | {
      kind: "day";
      key: string;
      date: string;
      dayNumber: number;
      count: number;
      important: boolean;
      today: boolean;
      past: boolean;
    };

/** Monday-first month grid with the number of events per day. */
export function plannerMonth(
  month: string,
  events: PlannerEvent[],
  today: string,
): PlannerCell[] {
  const first = `${month}-01`;
  const lead = isoWeekday(first) - 1;
  const cells: PlannerCell[] = Array.from({ length: lead }, (_, i) => ({
    kind: "blank" as const,
    key: `b${i}`,
  }));
  const byDay = new Map<string, PlannerEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) {
    const list = byDay.get(d) ?? [];
    cells.push({
      kind: "day",
      key: d,
      date: d,
      dayNumber: Number(d.slice(8)),
      count: list.length,
      important: list.some((e) => e.important),
      today: d === today,
      past: d < today,
    });
  }
  return cells;
}

/** "24 de outubro, 2 eventos" (calendar day buttons). */
export function dayAria(date: string, count: number) {
  const [, m, d] = date.split("-").map(Number);
  return t.planner.dayAria(d, t.dates.monthsLong[m - 1], count);
}
