/**
 * Focus timer maths (Stage 6). One implementation for my session and the
 * partner's. Postgres owns the timestamps; the browser only derives the
 * clock from them and the current (server-corrected) time. Nothing here is
 * ever decremented: every tick recomputes from the timestamps, so background
 * tabs, sleeps and reloads cannot drift.
 */
import { t } from "@/i18n/pt-BR";
import { localDateISO, localTimeHM } from "@/lib/local-date";
import type { Tables } from "@/types/database";

export type FocusRow = Tables<"focus_sessions">;

/** The fields needed to compute a clock (also what the partner receives). */
export type FocusTimes = {
  status: string;
  started_at: string;
  planned_seconds: number;
  paused_at: string | null;
  accumulated_pause_seconds: number;
};

/** Default activities offered next to today's tasks (product constants). */
export const FOCUS_PRESETS: readonly string[] = t.focusPresets;

/**
 * Seconds of focus so far: (paused_at or now) - started_at - pauses.
 * Never negative. Completed sessions use the stored actual duration.
 */
export function activeSeconds(
  s: FocusTimes & { actual_focus_seconds?: number | null },
  nowMs: number,
): number {
  if (s.status === "completed")
    return s.actual_focus_seconds ?? s.planned_seconds;
  const at = s.paused_at ? Date.parse(s.paused_at) : nowMs;
  const wall = Math.floor((at - Date.parse(s.started_at)) / 1000);
  return Math.min(
    s.planned_seconds,
    Math.max(0, wall - s.accumulated_pause_seconds),
  );
}

/** Seconds left, never below 0 (the display bottoms out at 00:00). */
export function remainingSeconds(s: FocusTimes, nowMs: number): number {
  return Math.max(0, s.planned_seconds - activeSeconds(s, nowMs));
}

/** An active session whose planned time has run out (to be completed). */
export function isExpired(s: FocusTimes, nowMs: number): boolean {
  return s.status === "active" && remainingSeconds(s, nowMs) === 0;
}

/** Whether a (partner's) session still counts as focusing right now. */
export function isFocusing(s: FocusTimes | null, nowMs: number): boolean {
  if (!s) return false;
  if (s.status === "paused") return true;
  return s.status === "active" && remainingSeconds(s, nowMs) > 0;
}

/**
 * Partner status. A valid persistent session wins (even with the app
 * closed); otherwise Presence decides online / offline.
 */
export function partnerStatus(
  presenceOnline: boolean,
  focus: FocusTimes | null,
  nowMs: number,
): "focusing" | "online" | "offline" {
  if (isFocusing(focus, nowMs)) return "focusing";
  return presenceOnline ? "online" : "offline";
}

/**
 * Focus today: completed sessions + the running one, attributed to the local
 * day they started on (a session across midnight stays with its start day).
 */
export function focusTodaySeconds(
  sessions: (FocusTimes & { actual_focus_seconds: number | null })[],
  today: string,
  timeZone: string,
  nowMs: number,
): number {
  return sessions
    .filter((s) => localDateISO(timeZone, new Date(s.started_at)) === today)
    .reduce((sum, s) => sum + activeSeconds(s, nowMs), 0);
}

/** Line in the Focus screen's session list. */
export function sessionLine(s: FocusRow, timeZone: string) {
  return {
    id: s.id,
    task: s.title,
    from: localTimeHM(s.started_at, timeZone),
    to: s.ended_at ? localTimeHM(s.ended_at, timeZone) : "",
    min: Math.round((s.actual_focus_seconds ?? 0) / 60),
    note: s.reflection ?? "",
  };
}

/**
 * Server clock offset from a row written "now" by the database
 * (updated_at): server time minus the request's midpoint on this device.
 */
export function clockOffset(
  serverIso: string,
  sentAtMs: number,
  receivedAtMs: number,
): number {
  return Date.parse(serverIso) - (sentAtMs + receivedAtMs) / 2;
}

const MESSAGES: Record<string, string> = t.focusErrors;

/** Postgres / network errors -> safe copy, with an action-specific fallback. */
export function focusErrorMessage(
  message: string | null | undefined,
  fallback: string,
): string {
  const code = Object.keys(MESSAGES).find((k) => message?.includes(k));
  if (code) return MESSAGES[code];
  if (message && /fetch|network/i.test(message)) return t.errors.network;
  return fallback;
}
