export type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** Stored values (daily_tasks / routine_items.category). Labels: CATEGORY_LABEL. */
export type Category = "morning" | "work_study" | "body" | "night" | "custom";

/** Section header shown on Today (copy from the i18n catalog). */
export type SectionName = string;

export type TaskStatus = "pending" | "completed" | "skipped";

/** A task on Today: one daily_tasks row (routine occurrence or one-off). */
export type Task = {
  id: string;
  /** Routine this occurrence came from; null for one-off tasks. */
  routineId: string | null;
  /** Local date "YYYY-MM-DD". */
  date: string;
  name: string;
  category: Category;
  /** "HH:MM" or "" */
  time: string;
  /** Short line under the name (the task's notes). */
  meta: string;
  /** The routine's weekdays; [] for one-off tasks. */
  days: Day[];
  /** One-off task (not part of the routine). */
  once: boolean;
  status: TaskStatus;
  done: boolean;
  /** Local "HH:MM" of completion. */
  doneAt: string | null;
  /** Skip label shown on the row, e.g. "SKIPPED · SICK". null when not skipped. */
  skip: string | null;
  skipReason: string | null;
  visible: boolean;
  reminder: boolean;
  notes: string;
  sortOrder: number;
  /** Mock connection simulation (Stage 5): shows the "Will sync" marker. */
  unsynced: boolean;
};

/** A recurring routine item (routine_items row, active only). */
export type RoutineItem = {
  id: string;
  name: string;
  category: Category;
  time: string;
  days: Day[];
  visible: boolean;
  reminder: boolean;
  notes: string;
  sortOrder: number;
};

export type PartnerStatus = "online" | "focusing" | "offline";

export type Partner = {
  name: string;
  handle: string;
  initial: string;
  status: PartnerStatus;
  focusLabel: string;
  /** The partner's persistent focus session (timer fields only), or null. */
  focusSession: {
    status: string;
    started_at: string;
    planned_seconds: number;
    paused_at: string | null;
    accumulated_pause_seconds: number;
  } | null;
  seenAt: string;
  /** epoch ms of the last completion, drives the card flash */
  flashAt: number;
  /** Current streak (aggregate from partner_progress_summary); null without data. */
  streak: number | null;
};

export type PartnerTask = {
  id: string;
  name: string;
  done: boolean;
  at: string | null;
};

export type FeedKind = "start" | "done" | "focus" | "focusdone" | "react";

export type FeedEvent = {
  id: string;
  t: string;
  who: "me" | "partner";
  kind: FeedKind;
  text: string;
  /** What a reaction refers to, e.g. "Morning Run". */
  target: string | null;
  /** The task (or focus session) behind this event: withdraws my optimistic
   * line on uncheck, and links a partner task to its event for reactions. */
  taskId: string | null;
};

export type FocusDuration = 25 | 50 | 90 | "custom";

export type FocusState = {
  phase: "setup" | "running" | "complete";
  task: string;
  dur: FocusDuration;
  custom: string;
  total: number;
  left: number;
  paused: boolean;
  note: string;
  from: string;
  to: string;
};

export type ConnectionState = "connected" | "reconnecting" | "offline";

export type Sheet =
  | { kind: "add"; repeat?: boolean }
  | { kind: "edit"; taskId: string }
  | { kind: "editRoutine"; routineId: string }
  | { kind: "options"; taskId: string }
  | { kind: "react"; eventId: string; title: string }
  | { kind: "focus" }
  | { kind: "streak" }
  | { kind: "day"; date: string }
  | { kind: "template" }
  | { kind: "challenge" };

export type Overlay =
  | { kind: "review" }
  | { kind: "weekly"; weekStart: string }
  | { kind: "briefing" };

export type Toast = {
  id: string;
  text: string;
  sub: string;
  emoji?: string;
  actions?: { label: string; aria: string; run: () => void }[];
};

export type Snack = {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
};
