/**
 * Pure mapping between database rows (daily_tasks, routine_items) and the UI
 * types, plus input validation shared by the forms and the Server Actions.
 */
import {
  dayToIso,
  isoToDay,
  localTimeHM,
  normalizeDays,
} from "@/lib/local-date";
import type { Tables } from "@/types/database";
import type { Category, Day, RoutineItem, Task, TaskStatus } from "@/types";

export type DailyTaskRow = Tables<"daily_tasks">;
export type RoutineRow = Tables<"routine_items">;

export const CATEGORIES: Category[] = [
  "morning",
  "work_study",
  "body",
  "night",
  "custom",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  morning: "Morning",
  work_study: "Work / Study",
  body: "Body",
  night: "Night",
  custom: "Custom",
};

export const TITLE_MAX = 80;
export const NOTES_MAX = 200;

const isCategory = (c: string): c is Category =>
  (CATEGORIES as string[]).includes(c);
const isStatus = (s: string): s is TaskStatus =>
  s === "pending" || s === "completed" || s === "skipped";

/** "06:30:00" -> "06:30"; null -> "". */
export const timeFromDb = (t: string | null) => (t ? t.slice(0, 5) : "");
/** "06:30" -> "06:30"; "" -> null. */
export const timeToDb = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? t : null);

export const daysFromDb = (days: number[]): Day[] =>
  normalizeDays(days.filter((n) => n >= 1 && n <= 7).map(isoToDay));
export const daysToDb = (days: readonly Day[]): number[] =>
  normalizeDays(days).map(dayToIso);

export function skipLabel(reason: string | null): string {
  return reason ? `SKIPPED · ${reason.toUpperCase()}` : "SKIPPED";
}

export function routineFromRow(r: RoutineRow): RoutineItem {
  return {
    id: r.id,
    name: r.title,
    category: isCategory(r.category) ? r.category : "custom",
    time: timeFromDb(r.scheduled_time),
    days: daysFromDb(r.days_of_week),
    visible: r.visible_to_partner,
    reminder: r.reminder,
    notes: r.notes,
    sortOrder: r.sort_order,
  };
}

export function taskFromRow(
  r: DailyTaskRow,
  routines: ReadonlyMap<string, RoutineItem>,
  timeZone: string,
): Task {
  const status: TaskStatus = isStatus(r.status) ? r.status : "pending";
  return {
    id: r.id,
    routineId: r.routine_item_id,
    date: r.task_date,
    name: r.title,
    category: isCategory(r.category) ? r.category : "custom",
    time: timeFromDb(r.scheduled_time),
    meta: r.notes,
    days: r.routine_item_id
      ? (routines.get(r.routine_item_id)?.days ?? [])
      : [],
    once: r.routine_item_id === null,
    status,
    done: status === "completed",
    doneAt: r.completed_at ? localTimeHM(r.completed_at, timeZone) : null,
    skip: status === "skipped" ? skipLabel(r.skip_reason) : null,
    skipReason: r.skip_reason,
    visible: r.visible_to_partner,
    reminder: r.reminder,
    notes: r.notes,
    sortOrder: r.sort_order,
    unsynced: false,
  };
}

/** Section order comes from the layout; inside a section the manual order wins. */
export function sortTasks<T extends { sortOrder: number; name: string }>(
  list: T[],
): T[] {
  return [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export type TaskInput = {
  name: string;
  category: Category;
  time: string;
  days: Day[];
  once: boolean;
  visible: boolean;
  reminder: boolean;
  notes: string;
};

/** Same rules as the database constraints, checked before any request. */
export function validateTaskInput(input: TaskInput): string | null {
  const name = input.name.trim();
  if (!name) return "Give the task a name.";
  if (name.length > TITLE_MAX)
    return `Keep the name under ${TITLE_MAX} characters.`;
  if (input.notes.trim().length > NOTES_MAX)
    return `Keep notes under ${NOTES_MAX} characters.`;
  if (!isCategory(input.category)) return "Pick a section.";
  if (input.time && !timeToDb(input.time)) return "Use a time like 06:30.";
  if (!input.once && normalizeDays(input.days).length === 0)
    return "Pick at least one day.";
  return null;
}

const NETWORK = "Network error. Check your connection and try again.";

/** Supabase / Postgres errors -> copy that is safe to show. */
export function taskErrorMessage(
  error: { message?: string; code?: string } | null | undefined,
): string {
  const message = error?.message ?? "";
  if (message.includes("LI_NOT_FOUND"))
    return "That item no longer exists. Refresh and try again.";
  if (message.includes("LI_NOT_AUTHENTICATED") || error?.code === "42501")
    return "Your session expired. Sign in again.";
  if (error?.code === "23514" || error?.code === "23502")
    return "Check the task details and try again.";
  if (/fetch|network/i.test(message)) return NETWORK;
  return "Couldn't save. Try again.";
}
