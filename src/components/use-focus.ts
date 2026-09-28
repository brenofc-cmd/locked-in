"use client";

/**
 * REAL focus sessions (Stage 6). Postgres owns the lifecycle and every
 * timestamp; this hook only requests transitions and derives the clock:
 *   remaining = planned - ((paused_at ?? now) - started_at - pauses)
 * `now` is the device clock corrected by the server offset measured on each
 * response. Nothing is written or broadcast per second.
 * Start is not optimistic (the session exists once the database returns it);
 * pause / resume / end are, with rollback. Transitions are queued, in order. Other tabs / devices: a "focus"
 * broadcast on the duo channel (or the tab becoming visible) triggers a
 * refetch; refetches that raced a local transition are discarded.
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeFocus as completeFocusAction,
  loadMyFocus,
  pauseFocus,
  resumeFocus,
  saveReflection,
  startFocus as startFocusAction,
} from "@/app/(app)/focus-actions";
import type { PartnerFocus } from "@/lib/duo-data";
import {
  FOCUS_PRESETS,
  activeSeconds,
  clockOffset,
  focusTodaySeconds,
  isExpired,
  remainingSeconds,
  sessionLine,
  type FocusRow,
} from "@/lib/focus";
import type { FocusData } from "@/lib/focus-data";
import { localDateISO, localTimeHM } from "@/lib/local-date";
import type { FocusDuration, FocusState, Task, Toast } from "@/types";

type Deps = {
  initial: FocusData;
  today: string;
  timeZone: string;
  /** Server-corrected "now" (ms), ticked by app-state. */
  now: number;
  /** Server clock at render (ms), for the first offset estimate. */
  serverNow: number;
  tasks: Task[];
  toast: (t: Omit<Toast, "id">) => void;
  onMyFocus: (listener: (f: PartnerFocus) => void) => () => void;
};

type Pick = {
  title: string;
  taskId: string | null;
  dur: FocusDuration;
  custom: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

export function useFocus({
  initial,
  today,
  timeZone,
  now,
  serverNow,
  tasks,
  toast,
  onMyFocus,
}: Deps) {
  const [session, setSession] = useState<FocusRow | null>(initial.active);
  const [recent, setRecent] = useState<FocusRow[]>(initial.recent);
  /** Finished here, waiting for DONE (the reflection step). */
  const [finished, setFinished] = useState<FocusRow | null>(null);
  const [pick, setPick] = useState<Pick>({
    title: FOCUS_PRESETS[0],
    taskId: null,
    dur: 50,
    custom: "",
  });
  const [note, setNote] = useState("");
  /** Transitions run one after another, never dropped (a quick END right
   * after RESUME must not be lost). */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  /** Bumped around every transition: a reload that raced one is stale. */
  const version = useRef(0);
  const starting = useRef(false);
  /** The END request in flight (DONE waits for it before saving a note). */
  const ending = useRef<Promise<unknown>>(Promise.resolve());
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  /** Set the session and its ref at once (the next click may come first). */
  const put = useCallback((s: FocusRow | null) => {
    sessionRef.current = s;
    setSession(s);
  }, []);

  const send = useCallback(<T>(request: () => Promise<T>): Promise<T> => {
    pending.current++;
    version.current++;
    const run = queue.current.then(request, request);
    queue.current = run.catch(() => null);
    return run.finally(() => {
      pending.current--;
      version.current++;
    });
  }, []);

  /** Server minus device clock (ms); owned here, refined by every response. */
  const offset = useRef(0);
  useEffect(() => {
    // First estimate: server render time vs. when the page response arrived.
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const arrived = nav
      ? performance.timeOrigin + nav.responseStart
      : Date.now();
    offset.current = serverNow - arrived;
  }, [serverNow]);
  const clockNow = useCallback(() => Date.now() + offset.current, []);

  /** Record the server offset from a row the database just wrote. */
  const measured = useCallback((row: FocusRow, sentAt: number) => {
    offset.current = clockOffset(row.updated_at, sentAt, Date.now());
  }, []);

  const upsertRecent = useCallback((row: FocusRow) => {
    setRecent((rs) => [...rs.filter((r) => r.id !== row.id), row]);
  }, []);

  /** Postgres is the truth: reload my session (reconciles expiry). */
  const reload = useCallback(async () => {
    const v = version.current;
    const res = await loadMyFocus().catch(() => null);
    // A transition started or finished meanwhile: its response is newer.
    if (!res?.ok || pending.current > 0 || v !== version.current) return;
    setRecent(res.recent);
    put(res.active);
  }, [put]);

  // ---- actions ------------------------------------------------------------

  const setFocusTask = useCallback(
    (title: string, taskId: string | null = null) => {
      setPick((p) => ({ ...p, title, taskId }));
    },
    [],
  );
  const setFocusDur = useCallback(
    (dur: FocusDuration) => setPick((p) => ({ ...p, dur })),
    [],
  );
  const setFocusCustom = useCallback(
    (custom: string) => setPick((p) => ({ ...p, custom })),
    [],
  );

  const startFocus = useCallback(async () => {
    if (starting.current || sessionRef.current) return false;
    starting.current = true;
    const minutes =
      pick.dur === "custom"
        ? Math.min(240, Math.max(5, parseInt(pick.custom, 10) || 30))
        : pick.dur;
    const sentAt = Date.now();
    const res = await send(() =>
      startFocusAction({
        title: pick.title,
        minutes,
        dailyTaskId: pick.taskId,
      }),
    ).catch(() => null);
    starting.current = false;
    if (res?.ok && res.session) {
      measured(res.session, sentAt);
      put(res.session);
      upsertRecent(res.session);
      return true;
    }
    toast({
      text: res && !res.ok ? res.error : t.hookToasts.focusStartFailed,
      sub: t.hookToasts.focus,
    });
    // e.g. another tab already started one: show that session instead.
    await reload();
    return false;
  }, [pick, send, measured, put, upsertRecent, toast, reload]);

  const togglePause = useCallback(async () => {
    const prev = sessionRef.current;
    if (!prev) return;
    const at = clockNow();
    const paused = prev.status === "paused";
    // Optimistic, derived from the same rule the database applies.
    put(
      paused
        ? {
            ...prev,
            status: "active",
            paused_at: null,
            accumulated_pause_seconds:
              prev.accumulated_pause_seconds +
              Math.max(
                0,
                Math.round((at - Date.parse(prev.paused_at!)) / 1000),
              ),
          }
        : { ...prev, status: "paused", paused_at: iso(at) },
    );
    const sentAt = Date.now();
    const res = await send(() =>
      paused ? resumeFocus(prev.id) : pauseFocus(prev.id),
    ).catch(() => null);
    if (res?.ok && res.session) {
      measured(res.session, sentAt);
      // A later transition is queued: its own response will settle the state.
      if (pending.current > 0) return;
      if (res.session.status === "completed") {
        // It had already run out: the database closed it.
        put(null);
        upsertRecent(res.session);
        setFinished(res.session);
      } else {
        put(res.session);
      }
      return;
    }
    toast({
      text:
        res && !res.ok
          ? res.error
          : paused
            ? t.hookToasts.focusResumeFailed
            : t.hookToasts.focusPauseFailed,
      sub: t.hookToasts.focus,
    });
    if (pending.current === 0) {
      put(prev);
      await reload();
    }
  }, [clockNow, send, measured, put, toast, upsertRecent, reload]);

  const endFocus = useCallback(async () => {
    const prev = sessionRef.current;
    if (!prev) return;
    const at = clockNow();
    // Optimistic completion screen with the locally derived duration.
    setFinished({
      ...prev,
      status: "completed",
      paused_at: null,
      ended_at: iso(at),
      actual_focus_seconds: activeSeconds(prev, at),
    });
    put(null);
    const sentAt = Date.now();
    const request = send(() => completeFocusAction(prev.id)).catch(() => null);
    ending.current = request;
    const res = await request;
    if (res?.ok && res.session) {
      const row = res.session;
      measured(row, sentAt);
      // DONE may already have closed the screen: do not reopen it.
      setFinished((f) => (f?.id === row.id ? row : f));
      upsertRecent(row);
      return;
    }
    setFinished((f) => (f?.id === prev.id ? null : f));
    put(prev);
    toast({
      text: res && !res.ok ? res.error : t.hookToasts.focusFinishFailed,
      sub: t.hookToasts.focus,
    });
    await reload();
  }, [clockNow, send, measured, put, toast, upsertRecent, reload]);

  /** DONE on the completion screen: optional reflection, then back to setup. */
  const completeFocus = useCallback(async () => {
    const done = finished;
    const text = note.trim();
    setFinished(null);
    setNote("");
    if (!done) return;
    toast({
      text: t.hookToasts.sessionRecorded,
      sub: t.hookToasts.minutesSub(
        Math.round((done.actual_focus_seconds ?? 0) / 60),
      ),
    });
    if (!text) return;
    await ending.current; // the session must be completed before the note
    const res = await send(() => saveReflection(done.id, text)).catch(
      () => null,
    );
    if (res?.ok && res.session) upsertRecent(res.session);
    else
      toast({
        text: res && !res.ok ? res.error : t.hookToasts.focusNoteFailed,
        sub: t.hookToasts.focus,
      });
  }, [finished, note, send, toast, upsertRecent]);

  /** Called on every tick: finish a session whose time just ran out. */
  const checkExpiry = useCallback(
    (nowMs: number) => {
      const s = sessionRef.current;
      if (s && isExpired(s, nowMs)) void endFocus();
    },
    [endFocus],
  );

  // ---- other tabs / devices ------------------------------------------------

  // Broadcasts only say "something changed" (they can arrive out of order
  // or after this tab's own transition): refetch the truth from Postgres.
  useEffect(
    () =>
      onMyFocus((f) => {
        if (f.status === "completed" && sessionRef.current?.id === f.id)
          put(null); // ended on another tab / device
        void reload();
      }),
    [onMyFocus, put, reload],
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // ---- view ------------------------------------------------------------------

  const shown = session ?? finished;
  const focus: FocusState & { taskId: string | null } = {
    phase: finished ? "complete" : session ? "running" : "setup",
    task: shown?.title ?? pick.title,
    taskId: pick.taskId,
    dur: pick.dur,
    custom: pick.custom,
    total: shown?.planned_seconds ?? 0,
    left: session
      ? remainingSeconds(session, now)
      : finished
        ? finished.planned_seconds - (finished.actual_focus_seconds ?? 0)
        : 0,
    paused: session?.status === "paused",
    note,
    from: shown ? localTimeHM(shown.started_at, timeZone) : "",
    to: finished?.ended_at ? localTimeHM(finished.ended_at, timeZone) : "",
  };

  const all = useMemo(() => {
    const byId = new Map(recent.map((r) => [r.id, r]));
    if (session) byId.set(session.id, session);
    return [...byId.values()];
  }, [recent, session]);

  const focusSeconds = focusTodaySeconds(all, today, timeZone, now);
  const sessions = all
    .filter(
      (s) =>
        s.status === "completed" &&
        localDateISO(timeZone, new Date(s.started_at)) === today &&
        s.id !== finished?.id,
    )
    .map((s) => sessionLine(s, timeZone));

  /** What can be focused on: today's open tasks first, then the presets. */
  const options = useMemo(
    () => [
      ...tasks
        .filter((t) => !t.done && !t.skip && !t.id.startsWith("tmp-"))
        .map((t) => ({ title: t.name, taskId: t.id as string | null })),
      ...FOCUS_PRESETS.map((title) => ({
        title,
        taskId: null as string | null,
      })),
    ],
    [tasks],
  );

  return {
    focus,
    focusSeconds,
    sessions,
    options,
    focusRunning: Boolean(session) && session?.status === "active",
    clockNow,
    setFocusTask,
    setFocusDur,
    setFocusCustom,
    setFocusNote: setNote,
    startFocus,
    togglePause,
    endFocus,
    completeFocus,
    checkExpiry,
  };
}
