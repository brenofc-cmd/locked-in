"use server";

import { createClient } from "@/lib/supabase/server";
import {
  UUID,
  daysToDb,
  taskErrorMessage,
  timeToDb,
  validateTaskInput,
  type DailyTaskRow,
  type GoalLinks,
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
type Client = Awaited<ReturnType<typeof createClient>>;

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

// ---- goal links (V2 Phase 5, owner-only side tables) ------------------------
// The database checks everything (own task / routine, own ACTIVE goal, open
// day); these only write when the link actually changes, so editing a task
// that still points at an archived goal never trips the "active" rule.

async function setTaskGoal(
  supabase: Client,
  taskId: string,
  goalId: string | null,
) {
  const current = await supabase
    .from("daily_task_goals")
    .select("goal_id")
    .eq("daily_task_id", taskId)
    .maybeSingle();
  if (current.error) return current.error;
  if ((current.data?.goal_id ?? null) === goalId) return null;
  const links = supabase.from("daily_task_goals");
  const { error } = !goalId
    ? await links.delete().eq("daily_task_id", taskId)
    : current.data
      ? await links.update({ goal_id: goalId }).eq("daily_task_id", taskId)
      : await links.insert({ daily_task_id: taskId, goal_id: goalId });
  return error;
}

async function setRoutineGoal(
  supabase: Client,
  routineId: string,
  goalId: string | null,
) {
  const current = await supabase
    .from("routine_item_goals")
    .select("goal_id")
    .eq("routine_item_id", routineId)
    .maybeSingle();
  if (current.error) return current.error;
  if ((current.data?.goal_id ?? null) === goalId) return null;
  const links = supabase.from("routine_item_goals");
  const { error } = !goalId
    ? await links.delete().eq("routine_item_id", routineId)
    : current.data
      ? await links.update({ goal_id: goalId }).eq("routine_item_id", routineId)
      : await links.insert({ routine_item_id: routineId, goal_id: goalId });
  return error;
}

/** Current goal links of these tasks (absent = no goal). */
async function taskGoalsOf(
  supabase: Client,
  taskIds: string[],
): Promise<GoalLinks> {
  const links: GoalLinks = Object.fromEntries(taskIds.map((id) => [id, null]));
  if (!taskIds.length) return links;
  const { data, error } = await supabase
    .from("daily_task_goals")
    .select("daily_task_id, goal_id")
    .in("daily_task_id", taskIds);
  if (error) throw error;
  for (const l of data) links[l.daily_task_id] = l.goal_id;
  return links;
}

async function routineWithToday(supabase: Client, routineIds: string[]) {
  const [routines, today, routineLinks] = await Promise.all([
    supabase
      .from("routine_items")
      .select("*")
      .in("id", routineIds)
      .order("sort_order"),
    supabase.rpc("my_today"),
    supabase
      .from("routine_item_goals")
      .select("routine_item_id, goal_id")
      .in("routine_item_id", routineIds),
  ]);
  if (routines.error) throw routines.error;
  if (routineLinks.error) throw routineLinks.error;
  if (today.error || !today.data) throw today.error ?? new Error("today");
  const tasks = await supabase
    .from("daily_tasks")
    .select("*")
    .in("routine_item_id", routineIds)
    .eq("task_date", today.data);
  if (tasks.error) throw tasks.error;
  const routineGoals: GoalLinks = Object.fromEntries(
    routineIds.map((id) => [id, null]),
  );
  for (const l of routineLinks.data)
    routineGoals[l.routine_item_id] = l.goal_id;
  return {
    routines: routines.data,
    tasks: tasks.data,
    taskGoals: await taskGoalsOf(
      supabase,
      tasks.data.map((x) => x.id),
    ),
    routineGoals,
  };
}

type Saved = {
  ok: true;
  routines: RoutineRow[];
  tasks: DailyTaskRow[];
  taskGoals: GoalLinks;
  routineGoals: GoalLinks;
};

/** Quick Add (one-off for today) or a new routine item starting today. */
export async function addTask(input: TaskInput): Promise<Saved | Fail> {
  const invalid = validateTaskInput(input);
  if (invalid) return { ok: false, error: invalid };
  const goalId = input.goalId ?? null;
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
      if (goalId) {
        const linkError = await setTaskGoal(supabase, data.id, goalId);
        if (linkError) {
          // Never leave half a save behind: the task goes with its link.
          await supabase.from("daily_tasks").delete().eq("id", data.id);
          return fail(linkError);
        }
      }
      return {
        ok: true as const,
        routines: [],
        tasks: [data],
        taskGoals: { [data.id]: goalId },
        routineGoals: {},
      };
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
    if (goalId) {
      // Also links today's occurrence (database trigger).
      const linkError = await setRoutineGoal(supabase, id, goalId);
      if (linkError) {
        await supabase.rpc("archive_routine_item", { p_id: id });
        return fail(linkError);
      }
    }
    return { ok: true as const, ...(await routineWithToday(supabase, [id])) };
  });
}

/** "Today only": edits this occurrence (or a one-off). The routine is untouched. */
export async function updateTaskToday(
  id: string,
  input: TaskInput,
): Promise<{ ok: true; task: DailyTaskRow; goalId: string | null } | Fail> {
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
    if (input.goalId !== undefined) {
      const linkError = await setTaskGoal(supabase, id, input.goalId);
      if (linkError) return fail(linkError);
    }
    const links = await taskGoalsOf(supabase, [id]);
    return { ok: true as const, task: data, goalId: links[id] ?? null };
  });
}

/** "Today and future days": template + today's occurrence; history untouched. */
export async function updateRoutine(
  routineId: string,
  input: TaskInput,
): Promise<Saved | Fail> {
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
    if (input.goalId !== undefined) {
      // The template's goal: future occurrences and today's; history keeps its own.
      const linkError = await setRoutineGoal(supabase, routineId, input.goalId);
      if (linkError) return fail(linkError);
    }
    return {
      ok: true as const,
      ...(await routineWithToday(supabase, [routineId])),
    };
  });
}

/**
 * V2 Phase 5, from a goal's page: link an existing routine to the goal (or
 * unlink it). Returns the routine's and today's occurrence links.
 */
export async function linkRoutineToGoal(
  routineId: string,
  goalId: string | null,
): Promise<Saved | Fail> {
  if (!UUID.test(routineId) || (goalId !== null && !UUID.test(goalId)))
    return fail({ message: "LI_NOT_FOUND" });
  return guard(async () => {
    const supabase = await createClient();
    const linkError = await setRoutineGoal(supabase, routineId, goalId);
    if (linkError) return fail(linkError);
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

/**
 * V2 Phase 4: replaces today's Top 3 with `ids` in rank order (0..3 of my own
 * tasks dated today). The database checks ownership, the date, the limit and
 * closed history (set_my_priorities, INVOKER).
 */
export async function setDailyPriorities(
  ids: string[],
): Promise<{ ok: true; tasks: DailyTaskRow[] } | Fail> {
  if (
    !Array.isArray(ids) ||
    ids.length > 3 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && UUID.test(id))
  )
    return fail({ message: "LI_INVALID_PRIORITIES" });
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_my_priorities", {
      p_ids: ids,
    });
    if (error || !data) return fail(error);
    return { ok: true as const, tasks: data };
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

/**
 * Template / onboarding items in one database call (Stage 8): items already
 * in the active routine are skipped and calls are serialised per user, so a
 * double click can never create the same routine twice.
 */
export async function applyTemplate(
  items: { name: string; category: Category }[],
  visible = true,
): Promise<Saved | Fail> {
  if (items.length === 0 || items.length > 20) return fail({ code: "23514" });
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_routine_items", {
      p_titles: items.map((i) => i.name),
      p_categories: items.map((i) => i.category),
      p_visible: visible === true,
    });
    if (error || !data) return fail(error);
    return { ok: true as const, ...(await routineWithToday(supabase, data)) };
  });
}
