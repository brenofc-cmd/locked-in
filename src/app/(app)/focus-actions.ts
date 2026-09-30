"use server";

import { t } from "@/i18n/pt-BR";
import { focusErrorMessage, type FocusRow } from "@/lib/focus";
import { loadFocusData, type FocusData } from "@/lib/focus-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Focus session mutations (Stage 6). Every timestamp is set by Postgres;
 * these only request a transition. Identity comes from the session cookie.
 */
type Result =
  { ok: true; session: FocusRow | null } | { ok: false; error: string };

const MAX_MINUTES = 12 * 60;

async function one(
  fallback: string,
  call: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{
    data: FocusRow[] | null;
    error: { message: string } | null;
  }>,
): Promise<Result> {
  try {
    const supabase = await createClient();
    const { data, error } = await call(supabase);
    if (error)
      return { ok: false, error: focusErrorMessage(error.message, fallback) };
    return { ok: true, session: data?.[0] ?? null };
  } catch (e) {
    return {
      ok: false,
      error: focusErrorMessage(e instanceof Error ? e.message : null, fallback),
    };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startFocus(input: {
  title: string;
  minutes: number;
  dailyTaskId: string | null;
  /** V2 Phase 5: my own ACTIVE goal (checked by the database), or null. */
  goalId?: string | null;
}): Promise<Result> {
  const title = input.title.trim().slice(0, 80);
  const minutes = Math.round(input.minutes);
  if (!title || !(minutes >= 1 && minutes <= MAX_MINUTES)) {
    return { ok: false, error: t.actionErrors.focusStart };
  }
  if (input.goalId && !UUID.test(input.goalId))
    return { ok: false, error: t.focusErrors.LI_GOAL_INACTIVE };
  return one(t.actionErrors.focusStart, (s) =>
    s.rpc("start_focus_session", {
      p_title: title,
      p_planned_seconds: minutes * 60,
      p_daily_task_id: input.dailyTaskId ?? undefined,
      p_goal_id: input.goalId ?? undefined,
    }),
  );
}

/**
 * V2 Phase 5: change the goal of my running / paused session (ADR-067). The
 * database refuses a completed session, a closed day and anything but my own
 * active goal. Never shared: the partner projection has no goal.
 */
export async function setFocusGoal(
  id: string,
  goalId: string | null,
): Promise<Result> {
  if (!UUID.test(id) || (goalId !== null && !UUID.test(goalId)))
    return { ok: false, error: t.focusErrors.LI_NOT_FOUND };
  return one(t.actionErrors.focusStart, (s) =>
    s.from("focus_sessions").update({ goal_id: goalId }).eq("id", id).select(),
  );
}

export async function pauseFocus(id: string): Promise<Result> {
  return one(t.actionErrors.focusPause, (s) =>
    s.rpc("pause_focus_session", { p_id: id }),
  );
}

export async function resumeFocus(id: string): Promise<Result> {
  return one(t.actionErrors.focusResume, (s) =>
    s.rpc("resume_focus_session", { p_id: id }),
  );
}

export async function completeFocus(id: string): Promise<Result> {
  return one(t.actionErrors.focusFinish, (s) =>
    s.rpc("complete_focus_session", { p_id: id }),
  );
}

export async function saveReflection(
  id: string,
  reflection: string,
): Promise<Result> {
  const text = reflection.trim().slice(0, 1000);
  return one(t.actionErrors.focusNote, (s) =>
    s.rpc("save_focus_reflection", { p_id: id, p_reflection: text }),
  );
}

/** My unfinished session (after reconciling an expired one) + recent sessions. */
export async function loadMyFocus(): Promise<
  ({ ok: true } & FocusData) | { ok: false; error: string }
> {
  try {
    return { ok: true, ...(await loadFocusData(await createClient())) };
  } catch {
    return { ok: false, error: t.actionErrors.focusLoad };
  }
}
