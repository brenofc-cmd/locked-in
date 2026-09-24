"use server";

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

export async function startFocus(input: {
  title: string;
  minutes: number;
  dailyTaskId: string | null;
}): Promise<Result> {
  const title = input.title.trim().slice(0, 80);
  const minutes = Math.round(input.minutes);
  if (!title || !(minutes >= 1 && minutes <= MAX_MINUTES)) {
    return { ok: false, error: "Could not start Focus." };
  }
  return one("Could not start Focus.", (s) =>
    s.rpc("start_focus_session", {
      p_title: title,
      p_planned_seconds: minutes * 60,
      p_daily_task_id: input.dailyTaskId ?? undefined,
    }),
  );
}

export async function pauseFocus(id: string): Promise<Result> {
  return one("Could not pause.", (s) =>
    s.rpc("pause_focus_session", { p_id: id }),
  );
}

export async function resumeFocus(id: string): Promise<Result> {
  return one("Could not resume.", (s) =>
    s.rpc("resume_focus_session", { p_id: id }),
  );
}

export async function completeFocus(id: string): Promise<Result> {
  return one("Could not finish Focus.", (s) =>
    s.rpc("complete_focus_session", { p_id: id }),
  );
}

export async function saveReflection(
  id: string,
  reflection: string,
): Promise<Result> {
  const text = reflection.trim().slice(0, 1000);
  return one("Could not save your note.", (s) =>
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
    return { ok: false, error: "Could not load Focus." };
  }
}
