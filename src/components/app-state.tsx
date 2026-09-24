"use client";

/**
 * Product state shared through one context.
 * Stage 3: identity (your name, whether you have a partner, the partner's
 * name) is real and comes from useSession(). Tasks, feed, focus, stats,
 * challenges, presence and reactions are still mock and not persisted;
 * Stage 4+ replaces them with Supabase.
 */
import { usePathname } from "next/navigation";
import { updateDisplayName } from "@/app/(app)/actions";
import { useSession } from "@/components/session";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  mockTasks,
  mockUser,
} from "@/lib/mock-data";
import type {
  Category,
  Challenge,
  ConnectionState,
  Day,
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

export type TaskInput = {
  name: string;
  category: Category;
  time: string;
  days: Day[];
  once: boolean;
  visible: boolean;
  reminder: boolean;
  notes: string;
};

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

function useAppStateValue() {
  const pathname = usePathname();
  const session = useSession();

  // ---- real identity (Stage 3) ----------------------------------------------
  const userName = session.me.displayName;
  const realPartner = session.duo?.partner ?? null;
  const hasPartner = realPartner !== null;
  const partnerName = realPartner?.displayName ?? "Your partner";
  const [standard, setStandard] = useState(mockUser.standard);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [feed, setFeed] = useState<FeedEvent[]>(mockActivity);
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
  const [pop, setPop] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
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

  // ---- tasks --------------------------------------------------------------

  /** Idempotent: safe to call from Undo with a stale closure. */
  const applyDone = useCallback((id: string, name: string, done: boolean) => {
    const at = nowHM();
    const offline = connRef.current !== "connected";
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id && t.done !== done
          ? { ...t, done, doneAt: done ? at : null, unsynced: offline }
          : t,
      ),
    );
    setPop(id);
    setTimeout(() => setPop((p) => (p === id ? null : p)), 180);
    if (done) {
      setFlash(id);
      setTimeout(() => setFlash((f) => (f === id ? null : f)), 700);
      setFeed((f) =>
        f.some((e) => e.kind === "done" && e.who === "me" && e.taskId === id)
          ? f
          : [
              ...f,
              {
                id: uid("f"),
                t: at,
                who: "me",
                kind: "done",
                text: `completed ${name}`,
                target: name,
                taskId: id,
                reacted: null,
              },
            ],
      );
    } else {
      // Unchecks never appear in the feed: the original event is withdrawn.
      setFeed((f) =>
        f.filter(
          (e) => !(e.kind === "done" && e.who === "me" && e.taskId === id),
        ),
      );
    }
  }, []);

  const setTaskDone = useCallback(
    (id: string, name: string, done: boolean) => {
      applyDone(id, name, done);
      if (!done) {
        dismissSnack();
        return;
      }
      showSnack({
        text: `${name} completed`,
        action: {
          label: "UNDO",
          run: () => {
            applyDone(id, name, false);
            dismissSnack();
          },
        },
      });
    },
    [applyDone, dismissSnack, showSnack],
  );

  const toggleTask = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      if (t.skip) {
        setTasks((ts) =>
          ts.map((x) => (x.id === id ? { ...x, skip: null } : x)),
        );
        return;
      }
      setTaskDone(id, t.name, !t.done);
    },
    [tasks, setTaskDone],
  );

  const addTask = useCallback(
    (input: TaskInput) => {
      const t: Task = {
        id: uid("t"),
        name: input.name.trim(),
        category: input.category,
        time: input.time,
        meta: "",
        days: input.days,
        once: input.once,
        done: false,
        doneAt: null,
        skip: null,
        visible: input.visible,
        reminder: input.reminder,
        notes: input.notes,
        unsynced: connRef.current !== "connected",
      };
      setTasks((ts) => [...ts, t]);
      toast({ text: "Added to your standard.", sub: t.name.toUpperCase() });
    },
    [toast],
  );

  const updateTask = useCallback(
    (id: string, input: TaskInput) => {
      setTasks((ts) =>
        ts.map((t) =>
          t.id === id ? { ...t, ...input, name: input.name.trim() } : t,
        ),
      );
      toast({ text: "Task updated.", sub: input.name.trim().toUpperCase() });
    },
    [toast],
  );

  const deleteTask = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      setTasks((ts) => ts.filter((x) => x.id !== id));
      setFeed((f) => f.filter((e) => e.taskId !== id));
      setSheet(null);
      toast({ text: "Task deleted.", sub: t.name.toUpperCase() });
    },
    [tasks, toast],
  );

  const skipTask = useCallback(
    (id: string, reason: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      setTasks((ts) =>
        ts.map((x) =>
          x.id === id
            ? {
                ...x,
                skip: `SKIPPED · ${reason.toUpperCase()}`,
                done: false,
                doneAt: null,
              }
            : x,
        ),
      );
      setFeed((f) => f.filter((e) => !(e.kind === "done" && e.taskId === id)));
      setSheet(null);
      toast({
        text: "Skipped for today.",
        sub: `${t.name.toUpperCase()} · NOT COUNTED`,
      });
    },
    [tasks, toast],
  );

  const unskipTask = useCallback((id: string) => {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, skip: null } : x)));
    setSheet(null);
  }, []);

  const moveTask = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTasks((ts) => {
      const a = ts.slice();
      const i = a.findIndex((x) => x.id === fromId);
      const j = a.findIndex((x) => x.id === toId);
      if (i < 0 || j < 0) return ts;
      const [m] = a.splice(i, 1);
      a.splice(j, 0, m);
      return a;
    });
  }, []);

  const applyTemplate = useCallback(
    (items: { name: string; category: Category }[]) => {
      const have = new Set(tasks.map((t) => t.name.toLowerCase()));
      const fresh = items.filter((i) => !have.has(i.name.toLowerCase()));
      setTasks((ts) => [
        ...ts,
        ...fresh.map<Task>((i) => ({
          id: uid("t"),
          name: i.name,
          category: i.category,
          time: "",
          meta: "",
          days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
          once: false,
          done: false,
          doneAt: null,
          skip: null,
          visible: true,
          reminder: false,
          notes: "",
          unsynced: false,
        })),
      ]);
      setSheet(null);
      toast({
        text: fresh.length
          ? `${fresh.length} items added.`
          : "Nothing new to add.",
        sub: "ROUTINE",
      });
    },
    [tasks, toast],
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
        setTasks((ts) =>
          ts.map((t) => (t.unsynced ? { ...t, unsynced: false } : t)),
        );
        toast({ text: "Back online.", sub: "ALL CHANGES SYNCED" });
      }
    },
    [toast],
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
    tasks,
    toggleTask,
    addTask,
    updateTask,
    deleteTask,
    skipTask,
    unskipTask,
    moveTask,
    applyTemplate,
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
    pop,
    flash,
    now,
    setPartnerStatus,
    simulatePartnerDone,
    simulatePartnerReaction,
  };
}

export type AppState = ReturnType<typeof useAppStateValue>;

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const value = useAppStateValue();
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
