/**
 * Pure logic for the duo's realtime layer (Stage 5): presence aggregation,
 * activity feed mapping / merging, connection state. No Supabase imports.
 */
import { t } from "@/i18n/pt-BR";
import { localTimeHM } from "@/lib/local-date";
import type { ConnectionState, FeedEvent } from "@/types";

/**
 * What each tab publishes with Presence: only that the user is here.
 * Focus is persistent state in Postgres (Stage 6), not presence.
 */
export type PresenceMeta = { user_id: string; state: "online" };

/**
 * One user may have several tabs / devices, each a presence entry under the
 * same key (user id). Online while at least one entry exists.
 */
export function presenceOnline(
  state: Record<string, unknown[] | undefined>,
  userId: string,
): boolean {
  return (state[userId] ?? []).length > 0;
}

/** activity_events row or the equivalent broadcast payload. */
export type ActivityRecord = {
  id: string;
  actor_id: string;
  /** task_completed (default) | focus_started | focus_completed |
   * commitment_proven | commitment_self_declared (V2 Phase 6) */
  event_type?: string | null;
  target_id: string | null;
  title: string | null;
  duration_seconds?: number | null;
  created_at: string;
};

/** "32 min"; under a minute stays honest ("<1 min"). */
export function focusMinutes(seconds: number): string {
  return seconds < 60
    ? t.feed.underAMinute
    : t.feed.minutes(Math.floor(seconds / 60));
}

/** A feed line, with the instant kept for ordering. */
export type LiveEvent = FeedEvent & { at: string };

export function eventFromActivity(
  r: ActivityRecord,
  myId: string,
  timeZone: string,
): LiveEvent {
  const base = {
    id: r.id,
    at: r.created_at,
    t: localTimeHM(r.created_at, timeZone),
    who: r.actor_id === myId ? ("me" as const) : ("partner" as const),
    taskId: r.target_id,
  };
  if (r.event_type === "focus_started") {
    // A private session has no title: a generic line, nothing more.
    return {
      ...base,
      kind: "focus",
      text: r.title ? t.feed.startedFocusOn(r.title) : t.feed.startedFocus,
      target: null,
    };
  }
  if (r.event_type === "focus_completed") {
    return {
      ...base,
      kind: "focusdone",
      text: t.feed.completedFocus(focusMinutes(r.duration_seconds ?? 0)),
      target: t.feed.focusSessionTarget,
    };
  }
  if (
    r.event_type === "commitment_proven" ||
    r.event_type === "commitment_self_declared"
  ) {
    // The commitment's public title; its private source never reaches the feed.
    const title = r.title ?? t.feed.aCommitment;
    return {
      ...base,
      kind: "commit",
      text:
        r.event_type === "commitment_proven"
          ? t.feed.commitmentProven(title)
          : t.feed.commitmentSelfDeclared(title),
      target: title,
    };
  }
  const title = r.title ?? t.feed.aTask;
  return {
    ...base,
    kind: "done",
    text: t.feed.completed(title),
    target: title,
  };
}

/** Feed lines that are proof of work: they can be reacted to. */
export function isProofKind(kind: FeedEvent["kind"]): boolean {
  return kind === "done" || kind === "focusdone" || kind === "commit";
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
      // Only my optimistic "local-" line is replaced; real events for the
      // same target (focus started / completed) are distinct lines.
      for (const [id, old] of byId) {
        if (
          id.startsWith("local-") &&
          old.taskId === e.taskId &&
          old.who === e.who &&
          id !== e.id
        )
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
