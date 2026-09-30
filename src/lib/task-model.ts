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
import { t } from "@/i18n/pt-BR";
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

export const CATEGORY_LABEL: Record<Category, string> = t.categories;

export const TITLE_MAX = 80;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  return reason ? t.tasks.skippedWith(reason.toUpperCase()) : t.tasks.skipped;
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
    priority: r.priority_rank,
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
  /**
   * V2 Phase 5: the goal this action feeds (owner-only link, never shared).
   * undefined = leave the link as it is; null = no goal.
   */
  goalId?: string | null;
};

/** Goal links of actions, by task / routine id (null = unlinked). */
export type GoalLinks = Record<string, string | null>;

/** Same rules as the database constraints, checked before any request. */
export function validateTaskInput(input: TaskInput): string | null {
  const name = input.name.trim();
  if (!name) return t.tasks.nameRequired;
  if (name.length > TITLE_MAX) return t.tasks.nameTooLong(TITLE_MAX);
  if (input.notes.trim().length > NOTES_MAX)
    return t.tasks.notesTooLong(NOTES_MAX);
  if (!isCategory(input.category)) return t.tasks.sectionRequired;
  if (input.time && !timeToDb(input.time)) return t.tasks.timeInvalid;
  if (input.goalId != null && !UUID.test(input.goalId))
    return t.tasks.goalInactive;
  if (!input.once && normalizeDays(input.days).length === 0)
    return t.tasks.daysRequired;
  return null;
}

const NETWORK = t.errors.network;

/** Supabase / Postgres errors -> copy that is safe to show. */
export function taskErrorMessage(
  error: { message?: string; code?: string } | null | undefined,
): string {
  const message = error?.message ?? "";
  if (message.includes("LI_HISTORY_LOCKED")) return t.tasks.dayClosed;
  if (
    message.includes("LI_FUTURE_TASK") ||
    message.includes("LI_ROUTINE_STALE")
  )
    return t.errors.refresh;
  if (message.includes("LI_GOAL_INACTIVE")) return t.tasks.goalInactive;
  if (message.includes("LI_NOT_FOUND")) return t.tasks.itemGone;
  if (message.includes("LI_TOO_MANY_PRIORITIES")) return t.top3.max;
  if (message.includes("LI_INVALID_PRIORITIES")) return t.errors.refresh;
  if (message.includes("LI_NOT_AUTHENTICATED") || error?.code === "42501")
    return t.errors.sessionExpired;
  if (error?.code === "23514" || error?.code === "23502")
    return t.tasks.checkDetails;
  if (/fetch|network/i.test(message)) return NETWORK;
  return t.tasks.saveFailed;
}
