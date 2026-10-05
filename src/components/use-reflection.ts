"use client";

/**
 * V2 Phase 9 state (docs/CELEBRATIONS.md, docs/WEEKLY_PLANNING.md):
 * celebrations and this / next week's priorities, both owner-only and loaded
 * with the layout. No polling and no channel: claims are derived from the
 * numbers already on screen and sent when they change; a refused claim is
 * tried once more a moment later (the task write it depends on may still be
 * in flight), then waits for the numbers to change again.
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPriority as addPriorityAction,
  claimCelebrations,
  deletePriority as deletePriorityAction,
  markCelebrationSeen,
  updatePriority as updatePriorityAction,
} from "@/app/(app)/reflection-actions";
import {
  claimsToMake,
  pendingCelebrations,
  type CelebrationRow,
} from "@/lib/celebrations";
import type { Month } from "@/lib/monthly";
import type { Milestone } from "@/lib/records";
import {
  freePosition,
  prioritiesOf,
  type Priority,
  type PriorityStatus,
} from "@/lib/weekly-plan";
import type { Toast } from "@/types";

export type ReflectionData = {
  celebrations: CelebrationRow[];
  priorities: Priority[];
};

const CLAIM_DELAY_MS = 1500;
const RETRY_DELAY_MS = 4000;

export function useReflection(
  initial: ReflectionData,
  input: {
    today: string;
    todayPerfect: boolean;
    milestones: Milestone[];
    months: Month[];
    toast: (t: Omit<Toast, "id">) => void;
  },
) {
  const { today, todayPerfect, milestones, months, toast } = input;
  const [rows, setRows] = useState<CelebrationRow[]>(initial.celebrations);
  const [priorities, setPriorities] = useState<Priority[]>(initial.priorities);

  // ---- celebrations ----------------------------------------------------------

  const claims = useMemo(
    () => claimsToMake({ today, todayPerfect, milestones, months, rows }),
    [today, todayPerfect, milestones, months, rows],
  );
  const claimKey = claims.map((c) => `${c.kind}:${c.key}`).join("|");
  const claimsRef = useRef(claims);
  useEffect(() => {
    claimsRef.current = claims;
  }, [claims]);

  useEffect(() => {
    if (!claimKey) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async (attempt: number) => {
      const due = claimsRef.current;
      if (!due.length) return;
      const res = await claimCelebrations(due).catch(() => null);
      if (!alive) return;
      if (res?.ok) setRows(res.rows);
      // Refused (or failed): the write it depends on may still be in flight.
      const left = res?.ok
        ? due.filter(
            (c) => !res.rows.some((r) => r.kind === c.kind && r.key === c.key),
          )
        : due;
      if (left.length && attempt < 2)
        timer = setTimeout(() => void run(attempt + 1), RETRY_DELAY_MS);
    };
    timer = setTimeout(() => void run(1), CLAIM_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [claimKey]);

  const pending = useMemo(() => pendingCelebrations(rows), [rows]);

  /** Shown and closed: seen here at once, and in the database (all devices). */
  const dismissCelebration = useCallback((row: CelebrationRow) => {
    setRows((rs) =>
      rs.map((r) =>
        r.kind === row.kind && r.key === row.key
          ? { ...r, seenAt: r.seenAt ?? new Date().toISOString() }
          : r,
      ),
    );
    void markCelebrationSeen(row.kind, row.key).catch(() => null);
  }, []);

  // ---- weekly priorities -----------------------------------------------------

  const upsert = useCallback((p: Priority) => {
    setPriorities((ps) => [...ps.filter((x) => x.id !== p.id), p]);
  }, []);

  const addPriority = useCallback(
    async (weekStart: string, title: string) => {
      const position = freePosition(prioritiesOf(priorities, weekStart));
      if (position === null) {
        toast({ text: t.weeklyPlan.errors.full, sub: t.weeklyPlan.title });
        return false;
      }
      const res = await addPriorityAction(weekStart, position, title).catch(
        () => null,
      );
      if (!res?.ok) {
        toast({
          text: res?.error ?? t.weeklyPlan.errors.save,
          sub: t.weeklyPlan.title,
        });
        return false;
      }
      upsert(res.priority);
      return true;
    },
    [priorities, toast, upsert],
  );

  const updatePriority = useCallback(
    async (id: string, change: { title?: string; status?: PriorityStatus }) => {
      const before = priorities.find((p) => p.id === id);
      if (!before) return false;
      // Optimistic: a tap on the box answers at once.
      upsert({
        ...before,
        ...change,
        title: change.title?.trim() ?? before.title,
      });
      const res = await updatePriorityAction(id, change).catch(() => null);
      if (!res?.ok) {
        upsert(before);
        toast({
          text: res?.error ?? t.weeklyPlan.errors.save,
          sub: t.weeklyPlan.title,
        });
        return false;
      }
      upsert(res.priority);
      return true;
    },
    [priorities, toast, upsert],
  );

  const removePriority = useCallback(
    async (id: string) => {
      const before = priorities.find((p) => p.id === id);
      if (!before) return false;
      setPriorities((ps) => ps.filter((p) => p.id !== id));
      const res = await deletePriorityAction(id).catch(() => null);
      if (!res?.ok) {
        upsert(before);
        toast({
          text: res?.error ?? t.weeklyPlan.errors.save,
          sub: t.weeklyPlan.title,
        });
        return false;
      }
      return true;
    },
    [priorities, toast, upsert],
  );

  return {
    celebrationRows: rows,
    pendingCelebrations: pending,
    dismissCelebration,
    priorities,
    addPriority,
    updatePriority,
    removePriority,
  };
}
