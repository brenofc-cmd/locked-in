"use client";

/**
 * Product state shared through one context.
 *
 * REAL: identity and duo (useSession(), Stage 3); routine and today's tasks
 *   (useTasks(), Stage 4); partner presence (online / focusing / offline),
 *   partner's day, activity feed and connection state (useDuoRealtime(),
 *   Stage 5).
 * MOCK (not persisted): reactions, focus sessions and totals, standard,
 *   stats, streak and challenges.
 */
import { usePathname } from "next/navigation";
import { updateDisplayName } from "@/app/(app)/actions";
import { useDuoRealtime } from "@/components/duo-realtime";
import { useSession } from "@/components/session";
import { useTasks } from "@/components/use-tasks";
import type { TasksData } from "@/lib/session";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { nowHM } from "@/lib/format";
import {
  mockChallenges,
  mockFocus,
  mockPartner,
  mockUser,
} from "@/lib/mock-data";
import type {
  Challenge,
  FocusDuration,
  FocusSession,
  FocusState,
  Overlay,
  Partner,
  Sheet,
  Snack,
  Task,
  Toast,
} from "@/types";

let seq = 0;
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;

export type { TaskInput } from "@/lib/task-model";

const INITIAL_FOCUS: FocusState = {
  phase: "setup",
  task: mockFocus.defaultActivity,
  dur: 50,
  custom: "",
  total: 0,
  left: 0,
  paused: false,
  note: "",
  from: "",
  to: "",
};

function useAppStateValue(initialTasks: TasksData) {
  const pathname = usePathname();
  const session = useSession();

  // ---- real identity (Stage 3) ----------------------------------------------
  const userName = session.me.displayName;
  const realPartner = session.duo?.partner ?? null;
  const hasPartner = realPartner !== null;
  const partnerName = realPartner?.displayName ?? "Your partner";
  // Mock until Stage 7 (the day's standard is not persisted yet).
  const [standard, setStandard] = useState(mockUser.standard);

  // ---- real duo side (Stage 5, duo-realtime.tsx) ----------------------------
  const rt = useDuoRealtime();
  const conn = rt.conn;
  const partnerCounts = rt.partnerCounts;
  // Reactions are still mock (Stage 8): marked locally, never sent.
  const [reacted, setReacted] = useState<Record<string, string>>({});
  const feed = useMemo(
    () =>
      rt.feed.map((e) =>
        reacted[e.id] ? { ...e, reacted: reacted[e.id] } : e,
      ),
    [rt.feed, reacted],
  );
  const partnerTasks = useMemo(
    () =>
      rt.partnerTasks.map((t) =>
        reacted[`task:${t.id}`]
          ? { ...t, reacted: reacted[`task:${t.id}`] }
          : t,
      ),
    [rt.partnerTasks, reacted],
  );
  // Presence and day are real; the streak is mock until Stage 7.
  const partner: Partner = {
    ...mockPartner,
    name: partnerName,
    initial: partnerName.charAt(0).toUpperCase(),
    handle: "",
    status: rt.presence.status,
    focusLabel: rt.presence.focusTitle,
    focusEnd: rt.presence.focusEnd,
    seenAt: "",
    flashAt: rt.flashAt,
  };
  const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
  const [sessions, setSessions] = useState<FocusSession[]>(mockFocus.sessions);
  const [challenges, setChallenges] = useState<Challenge[]>(mockChallenges);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusMin = sessions.reduce((sum, s) => sum + s.min, 0);

  // ---- feedback -----------------------------------------------------------

  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id"> & { id?: string }) => {
      const id = t.id ?? uid("toast");
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismissToast(id), t.actions?.length ? 6500 : 4400);
      return id;
    },
    [dismissToast],
  );

  const dismissSnack = useCallback(() => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(null);
  }, []);

  const showSnack = useCallback((s: Omit<Snack, "id">) => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack({ ...s, id: uid("snack") });
    snackTimer.current = setTimeout(() => setSnack(null), 4500);
  }, []);

  // ---- tasks: REAL (Stage 4, use-tasks.ts) ----------------------------------

  /**
   * My own shared completion appears in the feed at once; the database
   * event (broadcast / refetch) replaces it. Private tasks never do.
   */
  const { addLocalCompletion, removeLocalCompletion } = rt;
  const feedOnDone = useCallback(
    (task: Task, done: boolean) => {
      if (!task.visible) return;
      if (done) addLocalCompletion(task.id, task.name);
      else removeLocalCompletion(task.id);
    },
    [addLocalCompletion, removeLocalCompletion],
  );

  const taskEffects = useMemo(
    () => ({ toast, onDone: feedOnDone }),
    [toast, feedOnDone],
  );
  const real = useTasks(initialTasks, session.me.timezone, taskEffects);
  const { tasks, setDone, unskipTask: unskip } = real;

  const setTaskDone = useCallback(
    (id: string, name: string, done: boolean) => {
      setDone(id, done);
      if (!done) {
        dismissSnack();
        return;
      }
      showSnack({
        text: `${name} completed`,
        action: {
          label: "UNDO",
          run: () => {
            setDone(id, false);
            dismissSnack();
          },
        },
      });
    },
    [setDone, dismissSnack, showSnack],
  );

  const toggleTask = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      if (t.skip) {
        unskip(id);
        return;
      }
      setTaskDone(id, t.name, !t.done);
    },
    [tasks, unskip, setTaskDone],
  );

  const skipTask = useCallback(
    (id: string, reason: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      real.skipTask(id, reason);
      setSheet(null);
      toast({ text: "Skipped for today.", sub: t.name.toUpperCase() });
    },
    [tasks, real, toast],
  );

  const unskipTask = useCallback(
    (id: string) => {
      unskip(id);
      setSheet(null);
    },
    [unskip],
  );

  // ---- reactions ----------------------------------------------------------

  const react = useCallback(
    (source: "feed" | "partnerTask", id: string, reaction: string) => {
      const key = source === "feed" ? id : `task:${id}`;
      if (reacted[key]) return;
      const target =
        source === "feed"
          ? (feed.find((x) => x.id === id)?.target ?? "")
          : (partnerTasks.find((x) => x.id === id)?.name ?? "");
      setReacted((r) => ({ ...r, [key]: reaction }));
      setSheet(null);
      toast({
        text: `Sent to ${partnerName}.`,
        sub: `${reaction} · ${target.toUpperCase()}`,
      });
    },
    [reacted, feed, partnerTasks, partnerName, toast],
  );

  /** Toast for the partner's completions (not on /partner, where the feed shows it). */
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const { onPartnerActivity } = rt;
  useEffect(
    () =>
      onPartnerActivity((event) => {
        if (pathnameRef.current === "/partner") return;
        const toastId = uid("toast");
        toast({
          id: toastId,
          text: `${partnerName} ${event.text}`,
          sub: event.t,
          actions: ["🔥", "🫡"].map((r) => ({
            label: r,
            aria: `React ${r}`,
            run: () => {
              setReacted((m) => ({ ...m, [event.id]: r }));
              dismissToast(toastId);
            },
          })),
        });
      }),
    [onPartnerActivity, partnerName, toast, dismissToast],
  );

  // ---- focus --------------------------------------------------------------

  const setFocusTask = useCallback((task: string) => {
    setFocus((f) => ({ ...f, task }));
  }, []);
  const setFocusDur = useCallback((dur: FocusDuration) => {
    setFocus((f) => ({ ...f, dur }));
  }, []);
  const setFocusCustom = useCallback((custom: string) => {
    setFocus((f) => ({ ...f, custom }));
  }, []);
  const setFocusNote = useCallback((note: string) => {
    setFocus((f) => ({ ...f, note }));
  }, []);

  const startFocus = useCallback(() => {
    setFocus((f) => {
      const min =
        f.dur === "custom"
          ? Math.min(240, Math.max(5, parseInt(f.custom, 10) || 30))
          : f.dur;
      return {
        ...f,
        phase: "running",
        total: min * 60,
        left: min * 60,
        paused: false,
        note: "",
        from: nowHM(),
        to: "",
      };
    });
    setSheet(null);
  }, []);

  const togglePause = useCallback(() => {
    setFocus((f) => ({ ...f, paused: !f.paused }));
  }, []);

  const endFocus = useCallback(() => {
    setFocus((f) => ({ ...f, phase: "complete", to: nowHM() }));
  }, []);

  const completeFocus = useCallback(() => {
    const min = Math.max(1, Math.round((focus.total - focus.left) / 60));
    setSessions((s) => [
      ...s,
      {
        id: uid("s"),
        task: focus.task,
        from: focus.from,
        to: focus.to || nowHM(),
        min,
        note: focus.note.trim(),
      },
    ]);
    setFocus((f) => ({ ...f, phase: "setup", note: "" }));
    // Focus sessions are local until Stage 6 (not persisted, not in the feed).
    toast({ text: "Session recorded.", sub: `${min} MIN` });
  }, [focus, toast]);

  // Presence: "focusing" while a session runs, shared once with its start and
  // planned length (the partner computes the countdown; no per-second updates).
  const { setMyPresence } = rt;
  const focusRunning = focus.phase === "running";
  const focusTitle = focus.task;
  const focusTotal = focus.total;
  useEffect(() => {
    setMyPresence(
      focusRunning
        ? {
            state: "focusing",
            title: focusTitle,
            startedAt: new Date().toISOString(),
            plannedMinutes: Math.round(focusTotal / 60),
          }
        : { state: "online" },
    );
  }, [focusRunning, focusTitle, focusTotal, setMyPresence]);

  // 1s tick while a timer is visible.
  const ticking =
    (focus.phase === "running" && !focus.paused) ||
    rt.presence.status === "focusing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setFocus((f) => {
        if (f.phase !== "running" || f.paused) return f;
        const left = f.left - 1;
        return left <= 0
          ? { ...f, left: 0, phase: "complete", to: nowHM() }
          : { ...f, left };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // ---- challenges ---------------------------------------------------------

  const addChallenge = useCallback(
    (title: string, days: number) => {
      setChallenges((c) => [
        {
          id: uid("c"),
          title: title.toUpperCase(),
          desc: `${days} days. Starts today.`,
          status: "STARTS TODAY",
          progLabel: "DAY",
          prog: `0 / ${days}`,
          me: "0%",
          meWidth: 0,
          partner: "0%",
          partnerWidth: 0,
        },
        ...c,
      ]);
      setSheet(null);
      toast({
        text: `Challenge sent to ${partnerName}.`,
        sub: title.toUpperCase(),
      });
    },
    [partnerName, toast],
  );

  /** Real: writes profiles.display_name, then the layout reloads the session. */
  const setUserName = useCallback(
    async (name: string) => {
      const res = await updateDisplayName(name);
      if (!res.ok) toast({ text: res.error, sub: "PROFILE" });
    },
    [toast],
  );

  return {
    userName,
    setUserName,
    standard,
    setStandard,
    today: real.today,
    tasks,
    routines: real.routines,
    toggleTask,
    addTask: real.addTask,
    updateToday: real.updateToday,
    updateRoutine: real.updateRoutine,
    archiveRoutine: real.archiveRoutine,
    deleteTask: real.deleteTask,
    skipTask,
    unskipTask,
    moveRoutine: real.moveRoutine,
    applyTemplate: real.applyTemplate,
    feed,
    partner,
    partnerTasks,
    partnerCounts,
    hasPartner,
    react,
    focus,
    focusMin,
    sessions,
    setFocusTask,
    setFocusDur,
    setFocusCustom,
    setFocusNote,
    startFocus,
    togglePause,
    endFocus,
    completeFocus,
    challenges,
    addChallenge,
    sheet,
    openSheet: useCallback(
      (next: Sheet | null) => {
        dismissSnack();
        setSheet(next);
      },
      [dismissSnack],
    ),
    closeSheet: useCallback(() => setSheet(null), []),
    overlay,
    openOverlay: setOverlay,
    closeOverlay: useCallback(() => setOverlay(null), []),
    toasts,
    toast,
    dismissToast,
    snack,
    dismissSnack,
    conn,
    pop: real.pop,
    flash: real.flash,
    now,
  };
}

export type AppState = ReturnType<typeof useAppStateValue>;

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({
  initialTasks,
  children,
}: {
  initialTasks: TasksData;
  children: ReactNode;
}) {
  const value = useAppStateValue(initialTasks);
  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useApp must be used inside <AppStateProvider>");
  return ctx;
}
