export type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** Stored values (daily_tasks / routine_items.category). Labels: CATEGORY_LABEL. */
export type Category = "morning" | "work_study" | "body" | "night" | "custom";

export type SectionName =
  "MORNING" | "WORK / STUDY" | "BODY" | "NIGHT" | "CUSTOM";

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
  /** epoch ms when the partner's focus session ends */
  focusEnd: number;
  seenAt: string;
  /** epoch ms of the last completion, drives the card flash */
  flashAt: number;
  streak: number;
};

export type PartnerTask = {
  id: string;
  name: string;
  done: boolean;
  at: string | null;
  reacted: string | null;
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
  /** My task that produced this event; used to withdraw it on uncheck. */
  taskId: string | null;
  reacted: string | null;
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

export type FocusSession = {
  id: string;
  task: string;
  from: string;
  to: string;
  min: number;
  note: string;
};

export type Challenge = {
  id: string;
  title: string;
  desc: string;
  status: string;
  progLabel: string;
  prog: string;
  me: string;
  meWidth: number;
  partner: string;
  partnerWidth: number;
};

export type WeekResult = { week: number; me: number; partner: number };

export type ConnectionState = "connected" | "reconnecting" | "offline";

export type Sheet =
  | { kind: "add"; repeat?: boolean }
  | { kind: "edit"; taskId: string }
  | { kind: "editRoutine"; routineId: string }
  | { kind: "options"; taskId: string }
  | {
      kind: "react";
      source: "feed" | "partnerTask";
      id: string;
      title: string;
    }
  | { kind: "focus" }
  | { kind: "streak" }
  | { kind: "day"; day: number }
  | { kind: "template" }
  | { kind: "challenge" };

export type Overlay =
  { kind: "review" } | { kind: "weekly"; index: number } | { kind: "briefing" };

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
