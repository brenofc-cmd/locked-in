"use client";

/**
 * The duo's challenges (Stage 8), loaded while the Challenges screen is open.
 * Progress is derived by the database (duo_challenges()); the screen re-reads
 * it after a challenge is created / deleted (challenges_changed broadcast),
 * after every partner refetch (their tasks / focus changed) and when my own
 * completions or focus change. No polling, no progress broadcast.
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteChallenge, loadChallenges } from "@/app/(app)/social-actions";
import { useApp } from "@/components/app-state";
import { useDuoRealtime } from "@/components/duo-realtime";
import type { Challenge } from "@/lib/challenges";

export function useChallenges() {
  const { tasks, focusMin, toast } = useApp();
  const { challengesVersion } = useDuoRealtime();
  const [list, setList] = useState<Challenge[] | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const res = await loadChallenges().catch(() => null);
    if (mine !== seq.current) return; // a newer read is on its way
    if (res?.ok) {
      setList(res.challenges);
      setError(false);
    } else setError(true);
  }, []);

  // My own progress inputs: completions today and focus minutes.
  const doneToday = tasks.filter((t) => t.done).length;
  useEffect(() => {
    const id = setTimeout(() => void reload(), 300);
    return () => clearTimeout(id);
  }, [reload, challengesVersion, doneToday, focusMin]);

  const remove = useCallback(
    async (id: string) => {
      const res = await deleteChallenge(id).catch(() => null);
      if (!res?.ok) {
        toast({
          text: res && !res.ok ? res.error : t.hookToasts.networkTryAgain,
          sub: t.hookToasts.challenge,
        });
        return;
      }
      setList((l) => l?.filter((c) => c.id !== id) ?? l);
    },
    [toast],
  );

  return { challenges: list, error, reload, remove };
}
