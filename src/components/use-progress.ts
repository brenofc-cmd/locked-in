"use client";

/**
 * REAL progress (Stage 7). The database derives every number from daily_tasks
 * and focus_sessions (docs/ANALYTICS.md); initial data comes with the layout.
 *
 * Live without polling:
 * - my own numbers use today's live tasks and focus on top of the loaded
 *   series (a check-off moves the streak, week and charts at once);
 * - the partner's side (this week, history, streak) is re-read after the
 *   realtime provider refetches the partner (partner events, reconnect).
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  refreshDuoProgress,
  refreshProgress,
  setDailyStandard,
} from "@/app/(app)/progress-actions";
import {
  liveStreak,
  totals,
  weekStartOf,
  withToday,
  type ProgressData,
} from "@/lib/progress";
import type { Task, Toast } from "@/types";

type Deps = {
  initial: ProgressData;
  tasks: Task[];
  /** My focus today (seconds, live from use-focus). */
  focusTodaySeconds: number;
  partnerCounts: { done: number; total: number };
  /** Bumped by the realtime provider after each partner refetch. */
  partnerVersion: number;
  toast: (t: Omit<Toast, "id">) => void;
};

export function useProgress({
  initial,
  tasks,
  focusTodaySeconds,
  partnerCounts,
  partnerVersion,
  toast,
}: Deps) {
  const [data, setData] = useState(initial);
  const { summary } = data;
  const today = summary.today;

  const refresh = useCallback(async () => {
    const res = await refreshProgress().catch(() => null);
    if (res?.ok) setData(res.data);
  }, []);

  // Partner changed (event / reconnect): re-read the duo numbers only.
  const seen = useRef(partnerVersion);
  useEffect(() => {
    if (seen.current === partnerVersion) return;
    seen.current = partnerVersion;
    let alive = true;
    void refreshDuoProgress()
      .catch(() => null)
      .then((res) => {
        if (alive && res?.ok) setData((d) => ({ ...d, ...res.data }));
      });
    return () => {
      alive = false;
    };
  }, [partnerVersion]);

  const setStandard = useCallback(
    async (value: number) => {
      const before = summary.standard;
      setData((d) => ({ ...d, summary: { ...d.summary, standard: value } }));
      const res = await setDailyStandard(value).catch(() => null);
      if (!res?.ok) {
        setData((d) => ({
          ...d,
          summary: { ...d.summary, standard: before },
        }));
        toast({
          text: res && !res.ok ? res.error : t.hookToasts.standardSaveFailed,
          sub: t.hookToasts.standard,
        });
        return;
      }
      await refresh(); // the streak is recalculated with the new standard
    },
    [summary.standard, refresh, toast],
  );

  // ---- live view -------------------------------------------------------------

  const todayPlanned = tasks.length;
  const todayCompleted = tasks.filter((t) => t.done).length;
  const days = useMemo(
    () =>
      withToday(data.days, today, {
        planned: todayPlanned,
        completed: todayCompleted,
        focusSeconds: focusTodaySeconds,
      }),
    [data.days, today, todayPlanned, todayCompleted, focusTodaySeconds],
  );

  const streak = liveStreak(
    summary.streakBeforeToday,
    todayPlanned,
    todayCompleted,
    summary.standard,
  );
  const longestStreak = Math.max(summary.longestClosed, streak);

  // This week: mine from the live series (Monday -> today), the partner's
  // from duo_weeks (future days never count for either).
  const weekStart = weekStartOf(today);
  const myWeek = totals(days, weekStart, today);
  const currentRow = data.weeks.find((w) => w.isCurrent) ?? null;
  const partnerWeek = currentRow?.partner ?? null;

  const partnerStreak = data.partner
    ? liveStreak(
        data.partner.streakBeforeToday,
        partnerCounts.total,
        partnerCounts.done,
        data.partner.standard,
      )
    : null;

  return {
    progress: data,
    progressDays: days,
    standard: summary.standard,
    setStandard,
    streak,
    longestStreak,
    /** No task ever planned: Progress shows its empty state. */
    hasHistory: summary.firstTaskDate !== null || todayPlanned > 0,
    week: {
      start: weekStart,
      me: myWeek,
      partner: partnerWeek,
    },
    partnerStreak,
    /** V2 Phase 6: the partner's Daily Standard (for their day on the hub). */
    partnerStandard: data.partner?.standard ?? null,
    refreshProgress: refresh,
  };
}
