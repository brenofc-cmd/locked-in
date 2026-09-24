/**
 * Pure logic for the duo's realtime layer (Stage 5): presence aggregation,
 * activity feed mapping / merging, connection state. No Supabase imports.
 */
import { localTimeHM } from "@/lib/local-date";
import type { ConnectionState, FeedEvent, PartnerStatus } from "@/types";

/** What each tab publishes with Presence. Small on purpose: no names, no tasks. */
export type PresenceMeta = {
  user_id: string;
  state: "online" | "focusing";
  focus_title?: string | null;
  /** ISO instant the focus session started; the viewer computes the countdown. */
  focus_started_at?: string | null;
  focus_planned_minutes?: number | null;
};

export type PartnerPresence = {
  status: PartnerStatus;
  focusTitle: string;
  /** epoch ms the partner's focus session is planned to end (0 if unknown) */
  focusEnd: number;
};

export const OFFLINE: PartnerPresence = {
  status: "offline",
  focusTitle: "",
  focusEnd: 0,
};

/**
 * One user may have several tabs / devices, each a presence meta under the
 * same key (user id). Offline = no meta at all; focusing wins over online.
 */
export function aggregatePresence(
  state: Record<string, PresenceMeta[] | undefined>,
  userId: string,
): PartnerPresence {
  const metas = state[userId] ?? [];
  if (metas.length === 0) return OFFLINE;
  const focusing = metas
    .filter((m) => m.state === "focusing")
    .sort((a, b) =>
      (b.focus_started_at ?? "").localeCompare(a.focus_started_at ?? ""),
    )[0];
  if (!focusing) return { status: "online", focusTitle: "", focusEnd: 0 };
  const start = focusing.focus_started_at
    ? Date.parse(focusing.focus_started_at)
    : NaN;
  const minutes = focusing.focus_planned_minutes ?? 0;
  return {
    status: "focusing",
    focusTitle: focusing.focus_title ?? "",
    focusEnd:
      Number.isFinite(start) && minutes > 0 ? start + minutes * 60_000 : 0,
  };
}

/** activity_events row or the equivalent broadcast payload. */
export type ActivityRecord = {
  id: string;
  actor_id: string;
  target_id: string | null;
  title: string | null;
  created_at: string;
};

/** A feed line, with the instant kept for ordering. */
export type LiveEvent = FeedEvent & { at: string };

export function eventFromActivity(
  r: ActivityRecord,
  myId: string,
  timeZone: string,
): LiveEvent {
  const title = r.title ?? "a task";
  return {
    id: r.id,
    at: r.created_at,
    t: localTimeHM(r.created_at, timeZone),
    who: r.actor_id === myId ? "me" : "partner",
    kind: "done",
    text: `completed ${title}`,
    target: title,
    taskId: r.target_id,
    reacted: null,
  };
}

export const FEED_LIMIT = 20;

/**
 * Merge events into the feed: identity is the event id (reconnects and
 * refetches never duplicate). A real event also replaces the optimistic local
 * line for the same task. Result: oldest first, at most FEED_LIMIT.
 */
export function mergeFeed(
  feed: LiveEvent[],
  incoming: LiveEvent[],
): LiveEvent[] {
  const byId = new Map(feed.map((e) => [e.id, e]));
  for (const e of incoming) {
    if (e.taskId) {
      for (const [id, old] of byId) {
        if (old.taskId === e.taskId && old.who === e.who && id !== e.id)
          byId.delete(id);
      }
    }
    byId.set(e.id, e);
  }
  return (
    [...byId.values()]
      // Compare instants: local lines use "…Z", database rows "…+00:00".
      .sort(
        (a, b) =>
          Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
      )
      .slice(-FEED_LIMIT)
  );
}

export function removeFromFeed(
  feed: LiveEvent[],
  match: { id?: string; taskId?: string },
): LiveEvent[] {
  return feed.filter(
    (e) =>
      !(
        (match.id && e.id === match.id) ||
        (match.taskId && e.taskId === match.taskId)
      ),
  );
}

/** supabase-js channel status (+ browser online flag) -> the three UI states. */
export function connectionFrom(
  status:
    "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR" | "CONNECTING",
  browserOnline: boolean,
): ConnectionState {
  if (!browserOnline) return "offline";
  if (status === "SUBSCRIBED" || status === "CONNECTING") return "connected";
  return "reconnecting";
}
