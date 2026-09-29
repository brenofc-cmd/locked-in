"use server";

import {
  GOAL_STATUSES,
  goalFromRow,
  goalsErrorMessage,
  isUuid,
  milestoneFromRow,
  mirrorFromRow,
  validateGoal,
  validateMilestone,
  validateMirror,
  validateVision,
  visionFromRow,
  type Goal,
  type GoalInput,
  type GoalStatus,
  type Milestone,
  type MirrorItem,
  type Vision,
  type VisionInput,
} from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";

/**
 * Goals, vision and mirror writes (V2 Phase 3). Identity comes from the
 * session cookie; owner-only RLS, column grants and composite foreign keys
 * decide the rest (owner_id is never sent). Errors are fixed copy.
 */
type Fail = { ok: false; error: string };
const fail = (error: { code?: string; message?: string }): Fail => ({
  ok: false,
  error: goalsErrorMessage(error),
});

async function run<T>(fn: () => Promise<T | Fail>): Promise<T | Fail> {
  try {
    return await fn();
  } catch {
    return fail({});
  }
}

const orNull = (s: string) => s.trim() || null;

// ------------------------------------------------------------ vision ----

export async function saveVision(
  id: string | null,
  input: VisionInput,
  sortOrder = 0,
): Promise<{ ok: true; vision: Vision } | Fail> {
  const invalid = validateVision(input);
  if (invalid) return { ok: false, error: invalid };
  if (id !== null && !isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const fields = {
      title: input.title.trim(),
      description: orNull(input.description),
    };
    const res = id
      ? await supabase
          .from("vision_items")
          .update(fields)
          .eq("id", id)
          .select()
          .single()
      : await supabase
          .from("vision_items")
          .insert({ ...fields, sort_order: sortOrder })
          .select()
          .single();
    if (res.error) return fail(res.error);
    return { ok: true as const, vision: visionFromRow(res.data) };
  });
}

export async function setVisionArchived(
  id: string,
  archived: boolean,
): Promise<{ ok: true; vision: Vision } | Fail> {
  if (!isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from("vision_items")
      .update({ is_archived: archived })
      .eq("id", id)
      .select()
      .single();
    if (res.error) return fail(res.error);
    return { ok: true as const, vision: visionFromRow(res.data) };
  });
}

// ------------------------------------------------------------- goals ----

export async function saveGoal(
  id: string | null,
  input: GoalInput,
  sortOrder = 0,
): Promise<{ ok: true; goal: Goal } | Fail> {
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };
  if (id !== null && !isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const fields = {
      title: input.title.trim(),
      goal_type: input.type,
      vision_id: input.visionId,
      target_date: input.targetDate || null,
      description: orNull(input.description),
    };
    const res = id
      ? await supabase
          .from("goals")
          .update(fields)
          .eq("id", id)
          .select()
          .single()
      : await supabase
          .from("goals")
          .insert({ ...fields, sort_order: sortOrder })
          .select()
          .single();
    if (res.error) return fail(res.error);
    const ms = id
      ? await supabase.from("goal_milestones").select("*").eq("goal_id", id)
      : { data: [], error: null };
    if (ms.error) return fail(ms.error);
    return {
      ok: true as const,
      goal: goalFromRow(res.data, (ms.data ?? []).map(milestoneFromRow)),
    };
  });
}

export async function setGoalStatus(
  id: string,
  status: GoalStatus,
): Promise<{ ok: true; status: GoalStatus; achievedAt: string | null } | Fail> {
  if (!isUuid(id) || !GOAL_STATUSES.includes(status))
    return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from("goals")
      .update({ status })
      .eq("id", id)
      .select("status, achieved_at")
      .single();
    if (res.error) return fail(res.error);
    return {
      ok: true as const,
      status: res.data.status as GoalStatus,
      achievedAt: res.data.achieved_at,
    };
  });
}

// -------------------------------------------------------- milestones ----

export async function addMilestone(
  goalId: string,
  title: string,
  sortOrder = 0,
): Promise<{ ok: true; milestone: Milestone } | Fail> {
  const invalid = validateMilestone(title);
  if (invalid) return { ok: false, error: invalid };
  if (!isUuid(goalId)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from("goal_milestones")
      .insert({ goal_id: goalId, title: title.trim(), sort_order: sortOrder })
      .select()
      .single();
    if (res.error) return fail(res.error);
    return { ok: true as const, milestone: milestoneFromRow(res.data) };
  });
}

export async function setMilestoneDone(
  id: string,
  done: boolean,
): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from("goal_milestones")
      .update({ is_completed: done })
      .eq("id", id)
      .select("id");
    if (res.error) return fail(res.error);
    if (!res.data.length) return fail({ code: "42501" });
    return { ok: true as const };
  });
}

// ------------------------------------------------------------ mirror ----

export async function saveMirror(
  id: string | null,
  text: string,
  sortOrder = 0,
): Promise<{ ok: true; item: MirrorItem } | Fail> {
  const invalid = validateMirror(text);
  if (invalid) return { ok: false, error: invalid };
  if (id !== null && !isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = id
      ? await supabase
          .from("accountability_items")
          .update({ text: text.trim() })
          .eq("id", id)
          .select()
          .single()
      : await supabase
          .from("accountability_items")
          .insert({ text: text.trim(), sort_order: sortOrder })
          .select()
          .single();
    if (res.error) return fail(res.error);
    return { ok: true as const, item: mirrorFromRow(res.data) };
  });
}

export async function setMirrorActive(
  id: string,
  active: boolean,
): Promise<{ ok: true; item: MirrorItem } | Fail> {
  if (!isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from("accountability_items")
      .update({ is_active: active })
      .eq("id", id)
      .select()
      .single();
    if (res.error) return fail(res.error);
    return { ok: true as const, item: mirrorFromRow(res.data) };
  });
}

// ------------------------------------------------- delete and reorder ----

const TABLES = {
  vision: "vision_items",
  goal: "goals",
  milestone: "goal_milestones",
  mirror: "accountability_items",
} as const;
export type GoalsKind = keyof typeof TABLES;

/** Real delete, only from an explicit, confirmed action in the UI. */
export async function deleteGoalsItem(
  kind: GoalsKind,
  id: string,
): Promise<{ ok: true } | Fail> {
  if (!(kind in TABLES) || !isUuid(id)) return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from(TABLES[kind])
      .delete()
      .eq("id", id)
      .select("id");
    if (res.error) return fail(res.error);
    if (!res.data.length) return fail({ code: "42501" });
    return { ok: true as const };
  });
}

/** New order of one list: sort_order = 10, 20, 30 … (own rows only, RLS). */
export async function reorderGoalsItems(
  kind: Exclude<GoalsKind, "milestone">,
  ids: string[],
): Promise<{ ok: true } | Fail> {
  if (!(kind in TABLES) || ids.length > 200 || !ids.every(isUuid))
    return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const results = await Promise.all(
      ids.map((id, i) =>
        supabase
          .from(TABLES[kind])
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", id),
      ),
    );
    const bad = results.find((r) => r.error);
    if (bad?.error) return fail(bad.error);
    return { ok: true as const };
  });
}

/**
 * V2 Phase 4: feature (or un-feature) one vision / goal / mirror item for the
 * North Star. The database keeps one per owner and table (featuring one
 * un-features the previous) and refuses an archived / inactive / non-active
 * item (23514).
 */
export async function setFeatured(
  kind: Exclude<GoalsKind, "milestone">,
  id: string,
  featured: boolean,
): Promise<{ ok: true } | Fail> {
  if (!(kind in TABLES) || kind === ("milestone" as string) || !isUuid(id))
    return fail({ code: "23514" });
  return run(async () => {
    const supabase = await createClient();
    const res = await supabase
      .from(TABLES[kind])
      .update({ is_featured: featured === true })
      .eq("id", id)
      .select("id");
    if (res.error) return fail(res.error);
    if (!res.data.length) return fail({ code: "42501" });
    return { ok: true as const };
  });
}
