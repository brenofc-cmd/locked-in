"use client";

/**
 * The planner's upcoming window (V2 Phase 2, docs/PLANNER.md): today to
 * today + 60 days, mine and my current partner's shared events (RLS). Loaded
 * with the layout; re-read after a planner_changed broadcast from the partner
 * and when the app becomes visible again. Writes wait for the database (a
 * planner edit is rare; no optimistic state to reconcile). Reminders are
 * in-app (+ browser notification while open) and never for the partner's
 * events. The month grid reads its own month through loadPlanner().
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePlannerEvent,
  loadPlanner,
  savePlannerEvent,
} from "@/app/(app)/planner-actions";
import type { NotificationKind } from "@/lib/notifications";
import { addDays, localTimeHM } from "@/lib/local-date";
import {
  REMINDER_HM,
  UPCOMING_DAYS,
  countdown,
  dueReminders,
  eventHeading,
  fromRow,
  reminderDate,
  type PlannerEvent,
  type PlannerInput,
  type PlannerRow,
} from "@/lib/planner";
import { loadReminded, markReminded } from "@/lib/resume-state";
import type { Toast } from "@/types";

type Notify = (
  kind: NotificationKind,
  msg: Omit<Toast, "id"> & { id?: string },
) => void;

export function usePlanner({
  initial,
  me,
  today,
  timeZone,
  version,
  notify,
  toast,
}: {
  initial: PlannerRow[];
  me: string;
  today: string;
  timeZone: string;
  /** useDuoRealtime().plannerVersion */
  version: number;
  notify: Notify;
  toast: (msg: Omit<Toast, "id">) => void;
}) {
  const [events, setEvents] = useState<PlannerEvent[]>(() =>
    initial.map((r) => fromRow(r, me)),
  );
  /** Bumped after every change or re-read: an open month grid re-reads. */
  const [plannerSeq, setPlannerSeq] = useState(0);
  const last = addDays(today, UPCOMING_DAYS);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const res = await loadPlanner(today, last).catch(() => null);
    if (mine !== seq.current || !res?.ok) return;
    setEvents(res.rows.map((r) => fromRow(r, me)));
    setPlannerSeq((v) => v + 1);
  }, [today, last, me]);

  // The partner changed a shared event (or it stopped being shared).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => void reload(), 250);
    return () => clearTimeout(id);
  }, [version, reload]);

  // Back to the app: anything missed while hidden or offline.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const save = useCallback(
    async (id: string | null, input: PlannerInput) => {
      const res = await savePlannerEvent(id, input).catch(() => null);
      if (!res?.ok) {
        const error = res && !res.ok ? res.error : t.planner.errors.saveFailed;
        toast({ text: error, sub: t.planner.toastSub });
        return { ok: false as const, error };
      }
      const e = fromRow(res.row, me);
      setEvents((list) => {
        const rest = list.filter((x) => x.id !== e.id);
        return e.date >= today && e.date <= last ? [...rest, e] : rest;
      });
      setPlannerSeq((v) => v + 1);
      toast({ text: t.planner.saved, sub: t.planner.toastSub });
      return { ok: true as const, event: e };
    },
    [me, today, last, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await deletePlannerEvent(id).catch(() => null);
      if (!res?.ok) {
        toast({
          text: res && !res.ok ? res.error : t.planner.errors.saveFailed,
          sub: t.planner.toastSub,
        });
        return false;
      }
      setEvents((list) => list.filter((x) => x.id !== id));
      setPlannerSeq((v) => v + 1);
      toast({ text: t.planner.deleted, sub: t.planner.toastSub });
      return true;
    },
    [toast],
  );

  // Reminders: once per event and due date on this device, from 08:00 of the
  // reminder day (and later if the app was closed then), while the event is
  // still ahead. Preferences and quiet hours are applied by notify().
  useEffect(() => {
    const fire = () => {
      const nowHM = localTimeHM(new Date(), timeZone);
      const shown = new Set(loadReminded(me));
      const due = dueReminders(events, today, nowHM).filter(
        (e) => !shown.has(`${e.id}:${reminderDate(e)}`),
      );
      for (const e of due)
        notify("planner_reminder", {
          id: `planner-${e.id}`,
          text: t.planner.reminderToast(
            `${eventHeading(e)} · ${e.title}`,
            countdown(e.date, today),
          ),
          sub: t.planner.reminderSub,
        });
      markReminded(
        me,
        due.map((e) => `${e.id}:${reminderDate(e)}`),
      );
    };
    fire();
    // Before 08:00: once more when reminders open for the day.
    const nowHM = localTimeHM(new Date(), timeZone);
    if (nowHM >= REMINDER_HM) return;
    const [h, m] = nowHM.split(":").map(Number);
    const [rh, rm] = REMINDER_HM.split(":").map(Number);
    const ms = ((rh - h) * 60 + (rm - m)) * 60_000 + 1000;
    const id = setTimeout(fire, ms);
    return () => clearTimeout(id);
  }, [events, today, timeZone, me, notify]);

  return {
    plannerEvents: events,
    plannerSeq,
    savePlannerEvent: save,
    deletePlannerEvent: remove,
    reloadPlanner: reload,
  };
}
