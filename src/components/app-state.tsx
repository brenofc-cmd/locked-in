"use client";

/**
 * Product state shared through one context.
 *
 * REAL: identity and duo (useSession(), Stage 3); routine and today's tasks
 *   (useTasks() in use-tasks.ts, Stage 4, persisted in Supabase).
 * MOCK (not persisted): partner presence, partner tasks and activity feed,
 *   reactions, focus sessions, standard, stats, streak and challenges.
 */
import { usePathname } from "next/navigation";
import { updateDisplayName } from "@/app/(app)/actions";
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
  mockActivity,
  mockChallenges,
  mockFocus,
  mockPartner,
  mockPartnerTasks,
  mockUser,
} from "@/lib/mock-data";
import type {
  Challenge,
  ConnectionState,
  FeedEvent,
  FocusDuration,
  FocusSession,
  FocusState,
  Overlay,
  Partner,
  PartnerStatus,
  PartnerTask,
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
  // Mock partner events only: the user's own events come from real
  // completions (feedOnDone), never from fixtures about tasks they don't have.
  const [feed, setFeed] = useState<FeedEvent[]>(() =>
    mockActivity.filter((e) => e.who === "partner"),
  );
  // Mock presence / focus / streak; name and initial are the real partner's.
  const [partnerMock, setPartner] = useState<Partner>(mockPartner);
  const partner: Partner = {
    ...partnerMock,
    name: partnerName,
    initial: partnerName.charAt(0).toUpperCase(),
    handle: "",
  };
  const [partnerTasks, setPartnerTasks] =
    useState<PartnerTask[]>(mockPartnerTasks);
  const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
  const [sessions, setSessions] = useState<FocusSession[]>(mockFocus.sessions);
  const [challenges, setChallenges] = useState<Challenge[]>(mockChallenges);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [conn, setConnState] = useState<ConnectionState>("connected");
  const [now, setNow] = useState(() => Date.now());

  const connRef = useRef(conn);
  useEffect(() => {
    connRef.current = conn;
  }, [conn]);
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

  const pushFeed = useCallback(
    (
      e: Omit<FeedEvent, "id" | "t" | "reacted" | "target" | "taskId"> &
        Partial<Pick<FeedEvent, "target" | "taskId">>,
    ) => {
      setFeed((f) => [
        ...f,
        {
          id: uid("f"),
          t: nowHM(),
          reacted: null,
          target: null,
          taskId: null,
          ...e,
        },
      ]);
    },
    [],
  );

  // ---- tasks: REAL (Stage 4, use-tasks.ts) ----------------------------------

  /** The mock activity feed mirrors real completions until Stage 5. */
  const feedOnDone = useCallback((task: Task, done: boolean) => {
    if (!done) {
      // Unchecks never appear in the feed: the original event is withdrawn.
      setFeed((f) =>
        f.filter(
          (e) => !(e.kind === "done" && e.who === "me" && e.taskId === task.id),
        ),
      );
      return;
    }
    setFeed((f) =>
      f.some((e) => e.kind === "done" && e.who === "me" && e.taskId === task.id)
        ? f
        : [
            ...f,
            {
              id: uid("f"),
              t: nowHM(),
              who: "me",
              kind: "done",
              text: `completed ${task.name}`,
              target: task.name,
              taskId: task.id,
              reacted: null,
            },
          ],
    );
  }, []);

  const taskEffects = useMemo(
    () => ({
      toast,
      onDone: feedOnDone,
      offline: () => connRef.current !== "connected",
    }),
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
      let target = "";
      if (source === "feed") {
        const e = feed.find((x) => x.id === id);
        if (!e || e.reacted) return;
        target = e.target ?? "";
        setFeed((f) =>
          f.map((x) => (x.id === id ? { ...x, reacted: reaction } : x)),
        );
      } else {
        const p = partnerTasks.find((x) => x.id === id);
        if (!p || p.reacted) return;
        target = p.name;
        setPartnerTasks((ps) =>
          ps.map((x) => (x.id === id ? { ...x, reacted: reaction } : x)),
        );
      }
      pushFeed({
        who: "me",
        kind: "react",
        text: `reacted ${reaction} to ${partnerName}'s ${target}`,
      });
      setSheet(null);
      toast({
        text: `Sent to ${partnerName}.`,
        sub: `${reaction} · ${target.toUpperCase()}`,
      });
    },
    [feed, partnerTasks, partnerName, pushFeed, toast],
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
    pushFeed({ who: "me", kind: "focus", text: "started a Focus Session" });
  }, [pushFeed]);

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
    pushFeed({
      who: "me",
      kind: "focusdone",
      text: `completed ${min} min Focus Session`,
      target: "Focus Session",
    });
    toast({
      text: "Session recorded.",
      sub: hasPartner
        ? `${min} MIN · ${partnerName.toUpperCase()} CAN SEE IT NOW`
        : `${min} MIN`,
    });
  }, [focus, hasPartner, partnerName, pushFeed, toast]);

  // 1s tick while a timer is visible.
  const ticking =
    (focus.phase === "running" && !focus.paused) ||
    partnerMock.status === "focusing";
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

  // ---- dev simulation (?dev=1 in development) -------------------------------

  const setPartnerStatus = useCallback(
    (status: PartnerStatus) => {
      if (status === "focusing") {
        setPartner((p) => ({
          ...p,
          status,
          focusEnd: Date.now() + (34 * 60 + 21) * 1000,
        }));
        setNow(Date.now());
        pushFeed({
          who: "partner",
          kind: "focus",
          text: "started a Focus Session",
        });
      } else if (status === "offline") {
        setPartner((p) => ({ ...p, status, seenAt: nowHM() }));
      } else {
        setPartner((p) => ({ ...p, status }));
      }
    },
    [pushFeed],
  );

  const simulatePartnerDone = useCallback(() => {
    const next = partnerTasks.find((p) => !p.done);
    if (!next) {
      toast({ text: `${partnerName} has finished every task.`, sub: "DEV" });
      return;
    }
    const at = nowHM();
    const feedId = uid("f");
    setPartnerTasks((ps) =>
      ps.map((p) => (p.id === next.id ? { ...p, done: true, at } : p)),
    );
    setPartner((p) => ({ ...p, flashAt: Date.now() }));
    setNow(Date.now());
    setTimeout(() => setNow(Date.now()), 2300);
    setFeed((f) => [
      ...f,
      {
        id: feedId,
        t: at,
        who: "partner",
        kind: "done",
        text: `completed ${next.name}`,
        target: next.name,
        taskId: null,
        reacted: null,
      },
    ]);
    if (pathname !== "/partner") {
      const toastId = uid("toast");
      toast({
        id: toastId,
        text: `${partnerName} completed ${next.name}`,
        sub: at,
        actions: ["🔥", "🫡"].map((r) => ({
          label: r,
          aria: `React ${r}`,
          run: () => {
            setFeed((f) =>
              f.map((x) => (x.id === feedId ? { ...x, reacted: r } : x)),
            );
            pushFeed({
              who: "me",
              kind: "react",
              text: `reacted ${r} to ${partnerName}'s ${next.name}`,
            });
            dismissToast(toastId);
          },
        })),
      });
    }
  }, [partnerTasks, partnerName, pathname, toast, pushFeed, dismissToast]);

  const simulatePartnerReaction = useCallback(() => {
    const mine = [...tasks].reverse().find((t) => t.done);
    const target = mine?.name ?? "day";
    pushFeed({
      who: "partner",
      kind: "react",
      text: `reacted 🔥 to your ${target}`,
    });
    toast({
      emoji: "🔥",
      text: `${partnerName} reacted to your ${target}.`,
      sub: "JUST NOW",
    });
  }, [tasks, partnerName, pushFeed, toast]);

  const setConnection = useCallback(
    (c: ConnectionState) => {
      setConnState(c);
      if (c === "connected") {
        real.markSynced();
        toast({ text: "Back online.", sub: "ALL CHANGES SYNCED" });
      }
    },
    [real, toast],
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
    setConnection,
    pop: real.pop,
    flash: real.flash,
    now,
    setPartnerStatus,
    simulatePartnerDone,
    simulatePartnerReaction,
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
