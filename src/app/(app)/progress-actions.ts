"use server";

import { t } from "@/i18n/pt-BR";
import { addDays } from "@/lib/local-date";
import type { DayStat, Habit, ProgressData } from "@/lib/progress";
import { loadDuoProgress, loadHabits, loadProgress } from "@/lib/progress-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Progress reads (Stage 7). Nothing here writes a statistic: every number is
 * derived by the database from daily_tasks and focus_sessions. Identity comes
 * from the session cookie.
 */
type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const ERROR = t.actionErrors.progressLoad;

export async function refreshProgress(): Promise<
  Result<{ data: ProgressData }>
> {
  try {
    return { ok: true, data: await loadProgress(await createClient()) };
  } catch {
    return { ok: false, error: ERROR };
  }
}

/** After a partner event: this week, history and the partner's streak. */
export async function refreshDuoProgress(): Promise<
  Result<{ data: Pick<ProgressData, "weeks" | "partner"> }>
> {
  try {
    return { ok: true, data: await loadDuoProgress(await createClient()) };
  } catch {
    return { ok: false, error: ERROR };
  }
}

/** Best / most missed routine of one Monday–Sunday week (weekly review). */
export async function loadWeekHabits(
  weekStart: string,
): Promise<Result<{ habits: Habit[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
    return { ok: false, error: ERROR };
  try {
    const habits = await loadHabits(
      await createClient(),
      weekStart,
      addDays(weekStart, 6),
    );
    return { ok: true, habits };
  } catch {
    return { ok: false, error: ERROR };
  }
}

export async function setDailyStandard(
  percent: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = Math.round(percent);
  if (!(value >= 1 && value <= 100))
    return { ok: false, error: t.actionErrors.standardRange };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    if (!id) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase
      .from("profiles")
      .update({ daily_standard_percent: value })
      .eq("id", id);
    if (error) return { ok: false, error: t.actionErrors.standardSave };
  } catch {
    return { ok: false, error: t.actionErrors.standardSave };
  }
  // The client refetches: the streak is recalculated over history.
  return { ok: true };
}

export type DayTask = {
  id: string;
  title: string;
  status: "pending" | "completed" | "skipped";
};

/** My daily series for a range (history months beyond the loaded series). */
export async function loadDays(
  from: string,
  to: string,
): Promise<Result<{ days: DayStat[] }>> {
  if (!/^d{4}-d{2}-d{2}$/.test(from) || !/^d{4}-d{2}-d{2}$/.test(to))
    return { ok: false, error: ERROR };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_daily_progress", {
      p_from: from,
      p_to: to,
    });
    if (error) return { ok: false, error: ERROR };
    return {
      ok: true,
      days: data.map((d) => ({
        day: d.day,
        planned: d.planned,
        completed: d.completed,
        focusSeconds: d.focus_seconds,
        focusSessions: d.focus_sessions,
      })),
    };
  } catch {
    return { ok: false, error: ERROR };
  }
}

/**
 * One of my past days (history): the task snapshots of that date as they
 * were recorded, and that day's focus. Read-only — past days are the record.
 */
export async function loadDayTasks(
  date: string,
): Promise<
  Result<{ tasks: DayTask[]; focusSeconds: number; focusSessions: number }>
> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: ERROR };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const id = claims?.claims?.sub;
    if (!id) return { ok: false, error: ERROR };
    const [{ data, error }, focus] = await Promise.all([
      supabase
        .from("daily_tasks")
        .select("id, title, status")
        .eq("owner_id", id)
        .eq("task_date", date)
        .order("sort_order")
        .order("created_at"),
      supabase.rpc("my_daily_progress", { p_from: date, p_to: date }),
    ]);
    if (error || focus.error) return { ok: false, error: ERROR };
    return {
      ok: true,
      focusSeconds: focus.data[0]?.focus_seconds ?? 0,
      focusSessions: focus.data[0]?.focus_sessions ?? 0,
      tasks: data.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as DayTask["status"],
      })),
    };
  } catch {
    return { ok: false, error: ERROR };
  }
}
