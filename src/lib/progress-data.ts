import { t } from "@/i18n/pt-BR";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDuels } from "@/lib/duel-data";
import { addDays } from "@/lib/local-date";
import {
  seriesFrom,
  type DayStat,
  type Habit,
  type PartnerSummary,
  type ProgressData,
  type WeekRow,
} from "@/lib/progress";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Completed weeks loaded for head-to-head and weekly reviews. */
export const HISTORY_WEEKS = 8;
/** "CONSISTENCY · 30 DAYS": the last 30 closed days. */
export const HABIT_DAYS = 30;

const fail = () => new Error(t.loadErrors.progress);

export async function loadHabits(
  supabase: Client,
  from: string,
  to: string,
): Promise<Habit[]> {
  const { data, error } = await supabase.rpc("my_habits", {
    p_from: from,
    p_to: to,
  });
  if (error) throw fail();
  return data.map((h) => ({
    routineId: h.routine_item_id,
    title: h.title,
    planned: h.planned,
    completed: h.completed,
  }));
}

/**
 * The duo part (refetched on partner events): weeks, the partner's streak
 * and the daily duels (V2 Phase 7).
 */
export async function loadDuoProgress(
  supabase: Client,
): Promise<Pick<ProgressData, "weeks" | "partner" | "duels">> {
  const [weeks, partner, duels] = await Promise.all([
    supabase.rpc("duo_weeks", { p_weeks: HISTORY_WEEKS }),
    supabase.rpc("partner_progress_summary"),
    loadDuels(supabase),
  ]);
  if (weeks.error || partner.error) throw fail();
  const p = partner.data[0];
  return {
    weeks: weeks.data.map((w): WeekRow => ({
      weekStart: w.week_start,
      isCurrent: w.is_current,
      me: {
        planned: w.me_planned,
        completed: w.me_completed,
        focus: w.me_focus_seconds,
        perfect: w.me_perfect_days,
      },
      partner:
        w.partner_planned === null
          ? null
          : {
              planned: w.partner_planned,
              completed: w.partner_completed ?? 0,
              focus: w.partner_focus_seconds ?? 0,
              perfect: w.partner_perfect_days ?? 0,
            },
    })),
    partner: p
      ? ({
          streakBeforeToday: p.streak_before_today,
          currentStreak: p.current_streak,
          standard: p.standard,
        } satisfies PartnerSummary)
      : null,
    duels,
  };
}

/**
 * Everything Progress / Partner / Today need, in two round trips: the summary
 * first (it materialises my routine up to today, so the series below never
 * misses today's tasks), then the rest in parallel.
 */
export async function loadProgress(supabase: Client): Promise<ProgressData> {
  const summary = await supabase.rpc("my_progress_summary");
  const s = summary.data?.[0];
  if (summary.error || !s) throw fail();
  const today = s.today;
  const [days, habits, duo] = await Promise.all([
    supabase.rpc("my_daily_progress", {
      p_from: seriesFrom(today),
      p_to: today,
    }),
    loadHabits(supabase, addDays(today, -HABIT_DAYS), addDays(today, -1)),
    loadDuoProgress(supabase),
  ]);
  if (days.error) throw fail();
  return {
    summary: {
      today,
      standard: s.standard,
      streakBeforeToday: s.streak_before_today,
      longestClosed: s.longest_closed,
      todayPlanned: s.today_planned,
      todayCompleted: s.today_completed,
      firstTaskDate: s.first_task_date,
    },
    days: days.data.map((d): DayStat => ({
      day: d.day,
      planned: d.planned,
      completed: d.completed,
      focusSeconds: d.focus_seconds,
      focusSessions: d.focus_sessions,
    })),
    habits,
    ...duo,
  };
}
