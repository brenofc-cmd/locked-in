/**
 * Notification decisions (Stage 8, docs/NOTIFICATIONS.md). In V1 a
 * notification is an in-app toast, optionally mirrored by the browser
 * Notification API while the app is open in a background tab. No push, no
 * service worker, nothing while the app is closed. Pure and unit-tested.
 */
export type NotificationKind =
  "partner_activity" | "reaction" | "task_reminder" | "weekly_review";

export type NotificationPrefs = {
  partnerActivity: boolean;
  reactions: boolean;
  taskReminders: boolean;
  weeklyReview: boolean;
  quietHoursEnabled: boolean;
  /** "HH:MM" in the profile timezone. */
  quietStart: string;
  quietEnd: string;
};

const minutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/** Inside [start, end) in local "HH:MM"; start > end wraps midnight. */
export function inQuietHours(
  nowHM: string,
  start: string,
  end: string,
): boolean {
  const n = minutes(nowHM);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

const PREF: Record<NotificationKind, keyof NotificationPrefs> = {
  partner_activity: "partnerActivity",
  reaction: "reactions",
  task_reminder: "taskReminders",
  weekly_review: "weeklyReview",
};

export type NotifyContext = {
  /** Local "HH:MM" now (profile timezone). */
  nowHM: string;
  /** Notification.permission, or "unsupported". */
  permission: NotificationPermission | "unsupported";
  /** document.visibilityState === "visible" */
  visible: boolean;
};

export type NotifyDecision = { toast: boolean; browser: boolean };

/**
 * Preference off: nothing. Preference on: the in-app toast always; the
 * browser notification only when permission was granted, the tab is not
 * visible (a visible app already shows the toast) and it is not quiet hours.
 */
export function decide(
  kind: NotificationKind,
  prefs: NotificationPrefs,
  ctx: NotifyContext,
): NotifyDecision {
  if (!prefs[PREF[kind]]) return { toast: false, browser: false };
  const quiet =
    prefs.quietHoursEnabled &&
    inQuietHours(ctx.nowHM, prefs.quietStart, prefs.quietEnd);
  return {
    toast: true,
    browser: ctx.permission === "granted" && !ctx.visible && !quiet,
  };
}

/**
 * Milliseconds from now until each pending reminder today ("HH:MM" in the
 * profile timezone). Past times are dropped: V1 reminds only while the app
 * is open, never later.
 */
export function reminderDelays(
  nowHM: string,
  nowSeconds: number,
  tasks: {
    id: string;
    time: string;
    reminder: boolean;
    done: boolean;
    skip: string | null;
  }[],
): { id: string; ms: number }[] {
  const now = minutes(nowHM) * 60 + nowSeconds;
  return tasks
    .filter((t) => t.reminder && t.time && !t.done && !t.skip)
    .map((t) => ({ id: t.id, ms: (minutes(t.time) * 60 - now) * 1000 }))
    .filter((r) => r.ms > 0);
}
