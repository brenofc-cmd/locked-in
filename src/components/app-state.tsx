"use client";

/**
 * Product state shared through one context.
 *
 * REAL: identity and duo (useSession(), Stage 3); routine and today's tasks
 *   (useTasks(), Stage 4); partner presence, partner's day, activity feed and
 *   connection state (useDuoRealtime(), Stage 5); focus sessions, timer,
 *   focus today and the partner's focus (useFocus(), Stage 6); standard,
 *   streaks, weekly competition, head-to-head and analytics (useProgress(),
 *   Stage 7).
 *   Stage 8: persistent reactions (useDuoRealtime()), settings and
 *   notification preferences (useSession().settings), in-app notifications
 *   (toast + optional browser Notification while open), task reminders while
 *   open, morning briefing / weekly review prompts, duo joined / ended.
 * Challenges load on their own screen (use-challenges.ts). No mocks remain.
 * V2 Phase 6: duo accountability (commitments, nudges, check-ins) through
 *   useAccountability(); a nudge to me is a toast on any screen.
 */
import { t } from "@/i18n/pt-BR";
import { usePathname, useRouter } from "next/navigation";
import { clearReaction, setReaction } from "@/app/(app)/social-actions";
import { updateDisplayName } from "@/app/(app)/actions";
import { useAccountability } from "@/components/use-accountability";
import { useHeartbeat } from "@/components/use-heartbeat";
import { usePlanner } from "@/components/use-planner";
import type { PlannerRow } from "@/lib/planner";
import { useDuoRealtime } from "@/components/duo-realtime";
import { useSession } from "@/components/session";
import { useFocus } from "@/components/use-focus";
import { useProgress } from "@/components/use-progress";
import { useTasks } from "@/components/use-tasks";
import { partnerStatus } from "@/lib/focus";
import type { FocusData } from "@/lib/focus-data";
import {
  addDays,
  isoWeekday,
  localDateISO,
  localTimeHM,
} from "@/lib/local-date";
import {
  decide,
  reminderDelays,
  type NotificationKind,
} from "@/lib/notifications";
import {
  completedWeeks,
  msUntilDateChange,
  weekStartOf,
  type ProgressData,
} from "@/lib/progress";
import {
  reactionLabel,
  reactionToastText,
  type ReactionType,
} from "@/lib/reactions";
import { isProofKind } from "@/lib/realtime-model";
import { notificationPrefs } from "@/lib/settings";
import { setMark } from "@/lib/resume-state";
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
import type { Overlay, Partner, Sheet, Snack, Task, Toast } from "@/types";

let seq = 0;
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;

export type { TaskInput } from "@/lib/task-model";

type InitialFocus = FocusData & { serverNow: number };

function useAppStateValue(
  initialTasks: TasksData,
  initialFocus: InitialFocus,
  initialProgress: ProgressData,
  initialPlanner: PlannerRow[],
) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { settings } = session;

  // ---- real identity (Stage 3) ----------------------------------------------
  const userName = session.me.displayName;
  const userId = session.me.id;
  const realPartner = session.duo?.partner ?? null;
  const hasPartner = realPartner !== null;
  const partnerName = realPartner?.displayName ?? t.hookToasts.yourPartner;

  // ---- real duo side (Stage 5, duo-realtime.tsx) ----------------------------
  const rt = useDuoRealtime();
  // V2 Phase 2: my own last seen, for my partner's "visto por último".
  useHeartbeat(true);
  // Server-corrected clock: starts at the server's render time (identical on
  // server and client, so no hydration mismatch), then device time + offset.
  const [now, setNow] = useState(() => initialFocus.serverNow);
  const conn = rt.conn;
  const partnerCounts = rt.partnerCounts;
  const feed = rt.feed;
  const partnerTasks = rt.partnerTasks;
  const reactions = rt.reactions;
  const partner: Omit<Partner, "streak"> = {
    name: partnerName,
    initial: partnerName.charAt(0).toUpperCase(),
    handle: "",
    // Persistent focus wins over presence (FOCUSING even with the app closed).
    status: partnerStatus(rt.partnerOnline, rt.partnerFocus, now),
    focusLabel: rt.partnerFocus?.title ?? "",
    focusSession: rt.partnerFocus,
    seenAt: rt.partnerLastSeen ?? "",
    flashAt: rt.flashAt,
  };
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
        text: t.hookToasts.completedSnack(name),
        action: {
          label: t.hookToasts.undo,
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
      const task = tasks.find((x) => x.id === id);
      if (!task) return;
      if (task.skip) {
        unskip(id);
        return;
      }
      setTaskDone(id, task.name, !task.done);
    },
    [tasks, unskip, setTaskDone],
  );

  const skipTask = useCallback(
    (id: string, reason: string) => {
      const task = tasks.find((x) => x.id === id);
      if (!task) return;
      real.skipTask(id, reason);
      setSheet(null);
      toast({ text: t.hookToasts.skippedToday, sub: task.name.toUpperCase() });
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

  // ---- notifications (Stage 8, docs/NOTIFICATIONS.md) ---------------------

  const timeZone = session.me.timezone;
  const prefs = useMemo(() => notificationPrefs(settings), [settings]);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  /**
   * In-app toast when the preference is on; the browser notification only
   * with permission, in a background tab and outside quiet hours. Nothing
   * is sent anywhere: the app must be open (V1 has no push).
   */
  const notify = useCallback(
    (kind: NotificationKind, msg: Omit<Toast, "id"> & { id?: string }) => {
      const hasApi = typeof Notification !== "undefined";
      const d = decide(kind, prefsRef.current, {
        nowHM: localTimeHM(new Date(), timeZone),
        permission: hasApi ? Notification.permission : "unsupported",
        visible: document.visibilityState === "visible",
      });
      if (d.toast) toast(msg);
      if (d.browser) {
        try {
          new Notification("LOCKED IN", {
            body: msg.text,
            tag: msg.id ?? kind,
          });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    },
    [toast, timeZone],
  );

  // ---- planner: REAL (V2 Phase 2, use-planner.ts) ----------------------------

  const planner = usePlanner({
    initial: initialPlanner,
    me: session.me.id,
    today: real.today,
    timeZone,
    version: rt.plannerVersion,
    notify,
    toast,
  });

  // ---- reactions: REAL (Stage 8) --------------------------------------------

  const { setMyReaction } = rt;
  /** Set / replace / remove my reaction on a partner event (optimistic). */
  const react = useCallback(
    async (eventId: string, type: ReactionType | null) => {
      const before = reactions[eventId]?.[session.me.id] ?? null;
      setSheet(null);
      if (before === type) return;
      setMyReaction(eventId, type);
      const res = await (
        type ? setReaction(eventId, type) : clearReaction(eventId)
      ).catch(() => null);
      if (!res?.ok) {
        setMyReaction(eventId, before);
        toast({
          text: res && !res.ok ? res.error : t.hookToasts.networkTryAgain,
          sub: t.hookToasts.reaction,
        });
      }
    },
    [reactions, session.me.id, setMyReaction, toast],
  );

  /** A partner task links to its completion event (for reacting). */
  const eventForTask = useCallback(
    (taskId: string) =>
      feed.find(
        (e) => e.who === "partner" && e.kind === "done" && e.taskId === taskId,
      )?.id ?? null,
    [feed],
  );

  // My partner reacted to one of my events.
  const { onPartnerReaction } = rt;
  const feedRef = useRef(feed);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);
  useEffect(
    () =>
      onPartnerReaction(({ eventId, type }) => {
        const target = feedRef.current.find((e) => e.id === eventId)?.target;
        notify("reaction", {
          text: reactionToastText(partnerName, target ?? null),
          sub: reactionLabel(type),
        });
      }),
    [onPartnerReaction, partnerName, notify],
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
        const canReact = isProofKind(event.kind);
        notify("partner_activity", {
          id: toastId,
          text: `${partnerName} ${event.text}`,
          sub: event.t,
          actions: canReact
            ? (["fire", "salute"] as const).map((r) => ({
                label: reactionLabel(r),
                aria: t.hookToasts.reactAria(reactionLabel(r)),
                run: () => {
                  void react(event.id, r);
                  dismissToast(toastId);
                },
              }))
            : undefined,
        });
      }),
    [onPartnerActivity, partnerName, notify, react, dismissToast],
  );

  // Duo joined / ended (either member): re-render the session from the
  // server; the realtime provider then leaves or joins the channel.
  const { onDuoChange } = rt;
  useEffect(
    () =>
      onDuoChange((change, byMe) => {
        router.refresh();
        if (byMe) return;
        toast(
          change === "joined"
            ? {
                text: t.hookToasts.partnerJoined,
                sub: t.hookToasts.duoComplete,
              }
            : {
                text: t.hookToasts.partnerEnded(partnerName),
                sub: t.hookToasts.noPartnerYet,
              },
        );
      }),
    [onDuoChange, router, partnerName, toast],
  );

  // ---- focus: REAL (Stage 6, use-focus.ts) ---------------------------------
  // (accountability below needs the focus minutes)

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

  // ---- duo accountability: REAL (V2 Phase 6, use-accountability.ts) -------

  const accountability = useAccountability({
    myId: userId,
    partner: realPartner
      ? {
          id: realPartner.id,
          name: partnerName,
          timezone: realPartner.timezone,
        }
      : null,
    today: real.today,
    version: rt.accountabilityVersion,
    doneToday: tasks.filter((x) => x.done).length,
    focusMin: Math.floor(fx.focusSeconds / 60),
    toast,
  });
  const commitmentsRef = useRef(accountability.commitments);
  useEffect(() => {
    commitmentsRef.current = accountability.commitments;
  }, [accountability.commitments]);
  const { onNudge } = rt;
  useEffect(
    () =>
      onNudge((commitmentId) => {
        const title = commitmentsRef.current.find(
          (c) => c.id === commitmentId,
        )?.title;
        notify("partner_activity", {
          text: t.accountability.nudgeToast(partnerName),
          sub: title ? t.accountability.nudgeToastSub(title) : "",
        });
      }),
    [onNudge, partnerName, notify],
  );

  // ---- progress: REAL (Stage 7, use-progress.ts) ----------------------------

  const pg = useProgress({
    initial: initialProgress,
    tasks,
    focusTodaySeconds: fx.focusSeconds,
    partnerCounts,
    partnerVersion: rt.partnerVersion,
    toast,
  });

  // The local day changed (midnight, or back from sleep on a new day): reload
  // so Today, Focus and Progress all start the new day from the database.
  // Uses the database-corrected clock, so a wrong device date cannot loop.
  const today = real.today;
  useEffect(() => {
    const check = () => {
      if (localDateISO(timeZone, new Date(clockNow())) !== today)
        window.location.reload();
    };
    const ms = msUntilDateChange(clockNow(), timeZone, today, localDateISO);
    const id = setTimeout(check, Math.min(ms, 2 ** 31 - 1));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [today, timeZone, clockNow]);
  // ---- reminders, briefing, weekly result (Stage 8) ------------------------

  // Task reminders fire only while the app is open (timers to each pending
  // reminder time today; rescheduled whenever the tasks change). V1 has no
  // push: a closed app reminds nobody (docs/NOTIFICATIONS.md).
  useEffect(() => {
    if (!settings.notifyTaskReminders) return;
    const now = new Date(clockNow());
    const timers = reminderDelays(
      localTimeHM(now, timeZone),
      now.getSeconds(),
      tasks,
    )
      .filter((r) => r.ms < 2 ** 31 - 1)
      .map(({ id, ms }) =>
        setTimeout(() => {
          const task = tasks.find((x) => x.id === id);
          if (task)
            notify("task_reminder", {
              text: task.name,
              sub: t.hookToasts.reminder(task.time),
            });
        }, ms),
      );
    return () => timers.forEach(clearTimeout);
  }, [settings.notifyTaskReminders, tasks, timeZone, clockNow, notify]);

  // Morning briefing: V2 Phase 4 moved it into Today (MorningCard), once per
  // user and local day (docs/NORTH_STAR.md).

  // A new week: offer last week's result once (in-app toast).
  const weeklyChecked = useRef(false);
  const lastWeek = completedWeeks(pg.progress.weeks).find(
    (w) =>
      w.weekStart === addDays(weekStartOf(today), -7) &&
      (w.row.me.planned > 0 || (w.row.partner?.planned ?? 0) > 0),
  );
  useEffect(() => {
    if (weeklyChecked.current || !settings.onboarded || !lastWeek) return;
    weeklyChecked.current = true;
    // Once per user and week on this device (V2 Phase 4: user-scoped mark).
    if (!setMark(userId, "weekly", weekStartOf(today))) return;
    const weekStart = lastWeek.weekStart;
    notify("weekly_review", {
      text: t.hookToasts.weekClosed(lastWeek.week),
      sub:
        isoWeekday(today) === 1
          ? t.hookToasts.mondayResult
          : t.hookToasts.result,
      actions: [
        {
          label: t.hookToasts.open,
          aria: t.hookToasts.openWeeklyReview,
          run: () => setOverlay({ kind: "weekly", weekStart }),
        },
      ],
    });
  }, [settings.onboarded, lastWeek, today, notify, userId]);

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
      const at = clockNow();
      setNow(at);
      checkExpiry(at);
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

  /** Real: writes profiles.display_name, then the layout reloads the session. */
  const setUserName = useCallback(
    async (name: string) => {
      const res = await updateDisplayName(name);
      if (!res.ok) toast({ text: res.error, sub: t.hookToasts.profile });
    },
    [toast],
  );

  return {
    userName,
    setUserName,
    standard: pg.standard,
    setStandard: pg.setStandard,
    streak: pg.streak,
    longestStreak: pg.longestStreak,
    progress: pg.progress,
    progressDays: pg.progressDays,
    hasHistory: pg.hasHistory,
    week: pg.week,
    refreshProgress: pg.refreshProgress,
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
    setPriorities: real.setPriorities,
    applyTemplate: real.applyTemplate,
    // V2 Phase 5 — Goal → Action → Proof (owner-only; never sent to the partner).
    goals: real.goals,
    syncGoals: real.syncGoals,
    taskGoals: real.taskGoals,
    routineGoals: real.routineGoals,
    linkRoutine: real.linkRoutine,
    setFocusGoal: fx.setFocusGoal,
    accountability,
    feed,
    partner: { ...partner, streak: pg.partnerStreak } satisfies Partner,
    partnerTasks,
    partnerCounts,
    partnerStandard: pg.partnerStandard,
    hasPartner,
    reactions,
    react,
    eventForTask,
    settings,
    notify,
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
    ...planner,
  };
}

export type AppState = ReturnType<typeof useAppStateValue>;

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({
  initialTasks,
  initialFocus,
  initialProgress,
  initialPlanner,
  children,
}: {
  initialTasks: TasksData;
  initialFocus: InitialFocus;
  initialProgress: ProgressData;
  initialPlanner: PlannerRow[];
  children: ReactNode;
}) {
  const value = useAppStateValue(
    initialTasks,
    initialFocus,
    initialProgress,
    initialPlanner,
  );
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
