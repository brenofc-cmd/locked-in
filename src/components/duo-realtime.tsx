"use client";

/**
 * REAL duo realtime (Stage 5). One private Supabase channel per duo,
 * topic "duo:<duo_id>", carrying:
 *   - Presence: this user is here { user_id, state: "online" } (key = user
 *     id, so several tabs / devices are one user; offline = no presence);
 *   - Broadcast from the database: "activity", "activity_removed",
 *     "tasks_changed" (daily_tasks trigger) and "focus" (one per focus
 *     session transition); never sent by clients.
 * Postgres is the source of truth: initial data comes from the server, and
 * after every event, reconnect or return to the tab the feed and the
 * partner's day are refetched. Realtime only makes updates arrive sooner.
 * Docs: docs/REALTIME.md.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/components/session";
import { loadDuoData, type DuoData, type PartnerFocus } from "@/lib/duo-data";
import { localTimeHM } from "@/lib/local-date";
import {
  connectionFrom,
  eventFromActivity,
  mergeFeed,
  presenceOnline,
  removeFromFeed,
  type ActivityRecord,
  type LiveEvent,
  type PresenceMeta,
} from "@/lib/realtime-model";
import { createClient } from "@/lib/supabase/client";
import type { ConnectionState, PartnerTask } from "@/types";

type ActivityListener = (event: LiveEvent) => void;
/** A focus state change of MY session (another tab / device), from the database. */
type MyFocusListener = (focus: PartnerFocus) => void;

/** Serialises channel teardown and re-creation (see the lifecycle effect). */
let pendingRemoval: Promise<unknown> = Promise.resolve();

function useDuoRealtimeValue(initial: DuoData) {
  const { me, duo } = useSession();
  const duoId = duo?.id ?? null;
  const partnerId = duo?.partner?.id ?? null;
  const tz = me.timezone;

  const toFeed = useCallback(
    (rows: ActivityRecord[]) =>
      mergeFeed(
        [],
        rows.map((r) => eventFromActivity(r, me.id, tz)),
      ),
    [me.id, tz],
  );
  const toTasks = useCallback(
    (rows: DuoData["partnerTasks"]): PartnerTask[] =>
      rows.map((t) => ({
        id: t.id,
        name: t.title,
        done: t.status === "completed",
        at: t.completed_at ? localTimeHM(t.completed_at, tz) : null,
        reacted: null,
      })),
    [tz],
  );

  const [feed, setFeed] = useState<LiveEvent[]>(() => toFeed(initial.feed));
  const [partnerCounts, setPartnerCounts] = useState(() => ({
    done: initial.partnerDay?.done ?? 0,
    total: initial.partnerDay?.total ?? 0,
  }));
  const [partnerTasks, setPartnerTasks] = useState<PartnerTask[]>(() =>
    toTasks(initial.partnerTasks),
  );
  const [partnerOnline, setPartnerOnline] = useState(false);
  // The partner's persistent focus (Postgres), not presence.
  const [partnerFocus, setPartnerFocus] = useState<PartnerFocus | null>(
    initial.partnerFocus,
  );
  const [conn, setConn] = useState<ConnectionState>("connected");
  const [flashAt, setFlashAt] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Set<ActivityListener>());
  const myFocusListeners = useRef(new Set<MyFocusListener>());

  /** Re-read feed + partner's day from Postgres (the source of truth). */
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Bumped after every successful refetch of the partner's side (partner
   * events, reconnect, back online, tab visible): progress re-reads its duo
   * numbers then (Stage 7). No extra broadcast, no polling.
   */
  const [partnerVersion, setPartnerVersion] = useState(0);
  /** Bumped by each partner "focus" broadcast: a read that raced one is stale. */
  const focusSeq = useRef(0);
  const refetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    // Coalesce bursts (e.g. several events after a reconnect) into one read.
    refetchTimer.current = setTimeout(async () => {
      try {
        const seq = focusSeq.current;
        const data = await loadDuoData(createClient(), me.id);
        setFeed((f) => {
          // Keep optimistic local lines that the database has not confirmed yet.
          const local = f.filter((e) => e.id.startsWith("local-"));
          return mergeFeed(local, toFeed(data.feed));
        });
        setPartnerCounts({
          done: data.partnerDay?.done ?? 0,
          total: data.partnerDay?.total ?? 0,
        });
        setPartnerTasks(toTasks(data.partnerTasks));
        setPartnerVersion((v) => v + 1);
        if (seq === focusSeq.current) setPartnerFocus(data.partnerFocus);
      } catch {
        // Offline or transient: the next reconnect / event retries.
      }
    }, 250);
  }, [me.id, toFeed, toTasks]);

  const publishPresence = useCallback(
    (ch: RealtimeChannel) => {
      // Once per join: presence only says "here". No timers, no focus.
      const meta: PresenceMeta = { user_id: me.id, state: "online" };
      void ch.track(meta).catch(() => {
        // Not joined yet or reconnecting: tracked again on the next SUBSCRIBED.
      });
    },
    [me.id],
  );

  // ---- channel lifecycle: one channel per duo, removed on change / unmount ----
  useEffect(() => {
    if (!duoId) return;
    const supabase = createClient();
    let alive = true;
    let channel: RealtimeChannel | null = null;
    let wasConnected = false;
    let lastStatus: Parameters<typeof connectionFrom>[0] = "CONNECTING";
    const online = () =>
      typeof navigator === "undefined" ? true : navigator.onLine;
    const update = () => alive && setConn(connectionFrom(lastStatus, online()));

    // realtime-js reuses a channel with the same topic until its leave has
    // finished, so a new subscription waits for the previous removal.
    const ready = pendingRemoval.then(async () => {
      if (!alive) return;
      // Private channels need the user's JWT; supabase-js keeps it current on
      // every token refresh (TOKEN_REFRESHED -> realtime.setAuth).
      await supabase.realtime.setAuth();
      if (!alive) return;
      const ch = supabase.channel(`duo:${duoId}`, {
        config: { private: true, presence: { key: me.id } },
      });
      channel = ch;
      channelRef.current = ch;
      ch.on("presence", { event: "sync" }, () => {
        if (!partnerId) return;
        setPartnerOnline(presenceOnline(ch.presenceState(), partnerId));
      })
        .on("broadcast", { event: "activity" }, ({ payload }) => {
          const record: ActivityRecord = {
            id: String(payload.id),
            actor_id: String(payload.actor_id),
            event_type: payload.event_type ? String(payload.event_type) : null,
            target_id: payload.target_id ? String(payload.target_id) : null,
            title: payload.title ? String(payload.title) : null,
            duration_seconds:
              typeof payload.duration_seconds === "number"
                ? payload.duration_seconds
                : null,
            created_at: String(payload.created_at),
          };
          const event = eventFromActivity(record, me.id, tz);
          setFeed((f) => mergeFeed(f, [event]));
          if (event.who === "partner") {
            setFlashAt(Date.now());
            listeners.current.forEach((l) => l(event));
            refetch();
          }
        })
        .on("broadcast", { event: "activity_removed" }, ({ payload }) => {
          setFeed((f) => removeFromFeed(f, { id: String(payload.id) }));
          if (payload.actor_id !== me.id) refetch();
        })
        .on("broadcast", { event: "focus" }, ({ payload }) => {
          // One message per transition (start / pause / resume / complete).
          const f: PartnerFocus = {
            id: String(payload.id),
            user_id: String(payload.user_id),
            title: payload.title ? String(payload.title) : null,
            status: String(payload.status),
            started_at: String(payload.started_at),
            planned_seconds: Number(payload.planned_seconds),
            paused_at: payload.paused_at ? String(payload.paused_at) : null,
            accumulated_pause_seconds: Number(
              payload.accumulated_pause_seconds,
            ),
          };
          if (f.user_id === me.id) {
            myFocusListeners.current.forEach((l) => l(f));
          } else {
            focusSeq.current++;
            setPartnerFocus(f.status === "completed" ? null : f);
          }
        })
        .on("broadcast", { event: "tasks_changed" }, ({ payload }) => {
          if (payload.actor_id !== me.id) refetch();
        })
        .subscribe((status) => {
          lastStatus = status;
          update();
          if (status === "SUBSCRIBED") {
            publishPresence(ch);
            // Anything missed while disconnected comes back from Postgres.
            if (wasConnected) refetch();
            wasConnected = true;
          }
        });
    });

    const onNetwork = () => {
      update();
      if (online()) refetch();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      document.removeEventListener("visibilitychange", onVisible);
      channelRef.current = null;
      pendingRemoval = ready
        .then(() => (channel ? supabase.removeChannel(channel) : undefined))
        .catch(() => undefined);
      setPartnerOnline(false);
      setConn("connected");
    };
  }, [duoId, partnerId, me.id, tz, publishPresence, refetch]);

  // Duo created / joined / left while the app is open: never keep another
  // duo's feed (reset while rendering), then load the new one.
  const [shownDuo, setShownDuo] = useState(duoId);
  if (shownDuo !== duoId) {
    setShownDuo(duoId);
    setFeed([]);
    setPartnerTasks([]);
    setPartnerCounts({ done: 0, total: 0 });
    setPartnerFocus(null);
  }
  const loadedDuo = useRef(duoId);
  useEffect(() => {
    if (loadedDuo.current === duoId) return;
    loadedDuo.current = duoId;
    if (duoId) refetch();
  }, [duoId, refetch]);

  /** Optimistic line for my own shared completion (replaced by the real event). */
  const addLocalCompletion = useCallback(
    (taskId: string, title: string) => {
      if (!duoId) return;
      const at = new Date().toISOString();
      setFeed((f) =>
        mergeFeed(f, [
          {
            id: `local-${taskId}`,
            at,
            t: localTimeHM(at, tz),
            who: "me",
            kind: "done",
            text: `completed ${title}`,
            target: title,
            taskId,
            reacted: null,
          },
        ]),
      );
    },
    [duoId, tz],
  );

  const removeLocalCompletion = useCallback((taskId: string) => {
    setFeed((f) => removeFromFeed(f, { taskId }));
  }, []);

  const onMyFocus = useCallback((listener: MyFocusListener) => {
    myFocusListeners.current.add(listener);
    return () => {
      myFocusListeners.current.delete(listener);
    };
  }, []);

  const onPartnerActivity = useCallback((listener: ActivityListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return {
    conn,
    feed,
    partnerOnline,
    partnerFocus,
    partnerCounts,
    partnerTasks,
    partnerVersion,
    flashAt,
    onMyFocus,
    addLocalCompletion,
    removeLocalCompletion,
    onPartnerActivity,
  };
}

export type DuoRealtime = ReturnType<typeof useDuoRealtimeValue>;

const DuoRealtimeContext = createContext<DuoRealtime | null>(null);

export function DuoRealtimeProvider({
  initial,
  children,
}: {
  initial: DuoData;
  children: ReactNode;
}) {
  const value = useDuoRealtimeValue(initial);
  return (
    <DuoRealtimeContext.Provider value={value}>
      {children}
    </DuoRealtimeContext.Provider>
  );
}

export function useDuoRealtime(): DuoRealtime {
  const ctx = useContext(DuoRealtimeContext);
  if (!ctx)
    throw new Error("useDuoRealtime must be used inside <DuoRealtimeProvider>");
  return ctx;
}
