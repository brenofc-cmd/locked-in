"use server";

import { createClient } from "@/lib/supabase/server";
import {
  daysToDb,
  taskErrorMessage,
  timeToDb,
  validateTaskInput,
  type DailyTaskRow,
  type RoutineRow,
  type TaskInput,
} from "@/lib/task-model";
import type { Category, TaskStatus } from "@/types";

/**
 * Task and routine mutations. Identity always comes from the session cookie;
 * RLS and the SQL functions enforce ownership. Every action returns the rows
 * the client needs to reconcile its optimistic state, or a safe error.
 * No revalidation: the client state is authoritative until the next load.
 */
type Fail = { ok: false; error: string };
const fail = (error: Parameters<typeof taskErrorMessage>[0]): Fail => ({
  ok: false,
  error: taskErrorMessage(error),
});

async function guard<T>(fn: () => Promise<T | Fail>): Promise<T | Fail> {
  try {
    return await fn();
  } catch (e) {
    return fail({ message: e instanceof Error ? e.message : "" });
  }
}

const STATUSES: TaskStatus[] = ["pending", "completed", "skipped"];

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
  skipReason: string | null = null,
): Promise<{ ok: true; task: DailyTaskRow } | Fail> {
  if (!STATUSES.includes(status)) return fail({ code: "23514" });
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_tasks")
      .update({ status, skip_reason: status === "skipped" ? skipReason : null })
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return { ok: true as const, task: data };
  });
}

function taskFields(input: TaskInput) {
  return {
    title: input.name.trim(),
    category: input.category,
    scheduled_time: timeToDb(input.time),
    visible_to_partner: input.visible,
    notes: input.notes.trim(),
    reminder: input.reminder,
  };
}

async function routineWithToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  routineIds: string[],
) {
  const [routines, today] = await Promise.all([
    supabase
      .from("routine_items")
      .select("*")
      .in("id", routineIds)
      .order("sort_order"),
    supabase.rpc("my_today"),
  ]);
  if (routines.error) throw routines.error;
  if (today.error || !today.data) throw today.error ?? new Error("today");
  const tasks = await supabase
    .from("daily_tasks")
    .select("*")
    .in("routine_item_id", routineIds)
    .eq("task_date", today.data);
  if (tasks.error) throw tasks.error;
  return { routines: routines.data, tasks: tasks.data };
}

/** Quick Add (one-off for today) or a new routine item starting today. */
export async function addTask(
  input: TaskInput,
): Promise<{ ok: true; routines: RoutineRow[]; tasks: DailyTaskRow[] } | Fail> {
  const invalid = validateTaskInput(input);
  if (invalid) return { ok: false, error: invalid };
  return guard(async () => {
    const supabase = await createClient();
    if (input.once) {
      // task_date defaults to public.my_today(); owner_id to auth.uid().
      const { data, error } = await supabase
        .from("daily_tasks")
        .insert(taskFields(input))
        .select()
        .single();
      if (error) return fail(error);
      return { ok: true as const, routines: [], tasks: [data] };
    }
    const f = taskFields(input);
    const { data: id, error } = await supabase.rpc("create_routine_item", {
      p_title: f.title,
      p_days: daysToDb(input.days),
      p_category: f.category,
      p_time: f.scheduled_time ?? undefined,
      p_visible: f.visible_to_partner,
      p_notes: f.notes,
      p_reminder: f.reminder,
    });
    if (error || !id) return fail(error);
    return { ok: true as const, ...(await routineWithToday(supabase, [id])) };
  });
}

/** "Today only": edits this occurrence (or a one-off). The routine is untouched. */
export async function updateTaskToday(
  id: string,
  input: TaskInput,
): Promise<{ ok: true; task: DailyTaskRow } | Fail> {
  const invalid = validateTaskInput({ ...input, once: true });
  if (invalid) return { ok: false, error: invalid };
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_tasks")
      .update(taskFields(input))
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return { ok: true as const, task: data };
  });
}

/** "Today and future days": template + today's occurrence; history untouched. */
export async function updateRoutine(
  routineId: string,
  input: TaskInput,
): Promise<{ ok: true; routines: RoutineRow[]; tasks: DailyTaskRow[] } | Fail> {
  const invalid = validateTaskInput({ ...input, once: false });
  if (invalid) return { ok: false, error: invalid };
  return guard(async () => {
    const supabase = await createClient();
    const f = taskFields(input);
    const { error } = await supabase.rpc("update_routine_item", {
      p_id: routineId,
      p_title: f.title,
      p_days: daysToDb(input.days),
      p_category: f.category,
      // Generated types mark every argument non-null; SQL accepts null time.
      p_time: f.scheduled_time as string,
      p_visible: f.visible_to_partner,
      p_notes: f.notes,
      p_reminder: f.reminder,
    });
    if (error) return fail(error);
    return {
      ok: true as const,
      ...(await routineWithToday(supabase, [routineId])),
    };
  });
}

/** "Delete" a routine item = archive it; history stays. */
export async function archiveRoutine(
  routineId: string,
): Promise<{ ok: true } | Fail> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("archive_routine_item", {
      p_id: routineId,
    });
    if (error) return fail(error);
    return { ok: true as const };
  });
}

/** Delete a one-off task. Routine occurrences are skipped or archived instead. */
export async function deleteOneOff(id: string): Promise<{ ok: true } | Fail> {
  return guard(async () => {
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("daily_tasks")
      .delete({ count: "exact" })
      .eq("id", id)
      .is("routine_item_id", null);
    if (error) return fail(error);
    if (count !== 1) return fail({ message: "LI_NOT_FOUND" });
    return { ok: true as const };
  });
}

export async function reorderRoutines(
  ids: string[],
): Promise<{ ok: true } | Fail> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("reorder_routine_items", {
      p_ids: ids,
    });
    if (error) return fail(error);
    return { ok: true as const };
  });
}

/** Creates one routine item per template entry (every day), in order. */
export async function applyTemplate(
  items: { name: string; category: Category }[],
): Promise<{ ok: true; routines: RoutineRow[]; tasks: DailyTaskRow[] } | Fail> {
  if (items.length === 0 || items.length > 20) return fail({ code: "23514" });
  return guard(async () => {
    const supabase = await createClient();
    const ids: string[] = [];
    for (const item of items) {
      const { data, error } = await supabase.rpc("create_routine_item", {
        p_title: item.name,
        p_days: [1, 2, 3, 4, 5, 6, 7],
        p_category: item.category,
      });
      if (error || !data) return fail(error);
      ids.push(data);
    }
    return { ok: true as const, ...(await routineWithToday(supabase, ids)) };
  });
}
