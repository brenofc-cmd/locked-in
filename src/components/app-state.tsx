"use client";

/**
 * Product state shared through one context.
 *
 * REAL: identity and duo (useSession(), Stage 3); routine and today's tasks
 *   (useTasks(), Stage 4); partner presence, partner's day, activity feed and
 *   connection state (useDuoRealtime(), Stage 5); focus sessions, timer,
 *   focus today and the partner's focus (useFocus(), Stage 6).
 * MOCK (not persisted): reactions, standard, stats, streak, competition and
 *   challenges.
 */
import { usePathname } from "next/navigation";
import { updateDisplayName } from "@/app/(app)/actions";
import { useDuoRealtime } from "@/components/duo-realtime";
import { useSession } from "@/components/session";
import { useFocus } from "@/components/use-focus";
import { useTasks } from "@/components/use-tasks";
import { partnerStatus } from "@/lib/focus";
import type { FocusData } from "@/lib/focus-data";
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
import { mockChallenges, mockPartner, mockUser } from "@/lib/mock-data";
import type {
  Challenge,
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

type InitialFocus = FocusData & { serverNow: number };

function useAppStateValue(initialTasks: TasksData, initialFocus: InitialFocus) {
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
  // Server-corrected clock: starts at the server's render time (identical on
  // server and client, so no hydration mismatch), then device time + offset.
  const [now, setNow] = useState(() => initialFocus.serverNow);
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
    // Persistent focus wins over presence (FOCUSING even with the app closed).
    status: partnerStatus(rt.partnerOnline, rt.partnerFocus, now),
    focusLabel: rt.partnerFocus?.title ?? "",
    focusSession: rt.partnerFocus,
    seenAt: "",
    flashAt: rt.flashAt,
  };
  const [challenges, setChallenges] = useState<Challenge[]>(mockChallenges);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [snack, setSnack] = useState<Snack | null>(null);

  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ---- focus: REAL (Stage 6, use-focus.ts) ---------------------------------

  const fx = useFocus({
    initial: initialFocus,
    today: real.today,
    timeZone: session.me.timezone,
    now,
    serverNow: initialFocus.serverNow,
    tasks,
    toast,
    onMyFocus: rt.onMyFocus,
  });
  const { startFocus: start, checkExpiry, clockNow } = fx;
  const startFocus = useCallback(() => {
    setSheet(null);
    void start();
  }, [start]);

  // Local 1 s tick only while a clock is on screen (my running session or the
  // partner's). Each tick recomputes from timestamps; nothing is sent.
  const ticking = fx.focusRunning || partner.status === "focusing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      const t = clockNow();
      setNow(t);
      checkExpiry(t);
    }, 1000);
    return () => clearInterval(id);
  }, [ticking, checkExpiry, clockNow]);

  // Back from background / sleep: redraw from the current time at once.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(clockNow());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [clockNow]);

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
    focus: fx.focus,
    focusMin: Math.floor(fx.focusSeconds / 60),
    sessions: fx.sessions,
    focusOptions: fx.options,
    setFocusTask: fx.setFocusTask,
    setFocusDur: fx.setFocusDur,
    setFocusCustom: fx.setFocusCustom,
    setFocusNote: fx.setFocusNote,
    startFocus,
    togglePause: fx.togglePause,
    endFocus: fx.endFocus,
    completeFocus: fx.completeFocus,
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
  initialFocus,
  children,
}: {
  initialTasks: TasksData;
  initialFocus: InitialFocus;
  children: ReactNode;
}) {
  const value = useAppStateValue(initialTasks, initialFocus);
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
