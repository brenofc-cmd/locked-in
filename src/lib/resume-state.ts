/**
 * Resume State (V2 Phase 1, ADR-055, docs/RESUME_STATE.md): where the user
 * was in the interface, so reopening the app at `/` lands in the same place.
 *
 * It is NOT a second database. Tasks, routine, focus, duo, progress and
 * settings always come from Supabase; this only holds interface context
 * (last route, Progress range / calendar month, scroll offsets, unsent
 * "new task" drafts). Nothing here may ever hold a token, a password, a
 * copy of product data or anything about the partner.
 *
 * One small JSON value per user and version:
 *   locked-in:v2:<userId>:resume  →  { v: 1, … }
 * Everything is validated on read; a corrupted, foreign or old value is
 * dropped (field by field) and the app falls back to /today. Every access is
 * guarded: on the server, or with storage blocked, it silently does nothing.
 */
import { CATEGORIES } from "@/lib/task-model";
import { DAYS } from "@/lib/local-date";
import {
  EVENT_TYPES,
  REMINDERS,
  type EventType,
  type Reminder,
} from "@/lib/planner";
import type { Range } from "@/lib/progress";
import type { Category, Day } from "@/types";

export const RESUME_VERSION = 1;
const NAMESPACE = "locked-in:v2";

/** Temporary drafts are forgotten after a day (docs/RESUME_STATE.md). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** A scroll offset older than this is stale (the day's content changed). */
export const SCROLL_TTL_MS = 24 * 60 * 60 * 1000;
/** A last route older than this is not restored; `/` opens Today. */
export const ROUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Resume State must stay tiny; above this the optional parts are dropped. */
export const MAX_BYTES = 4096;

/** Private routes `/` may restore. Anything else (auth, onboarding, 404, a
 *  query string) is never restored. There is no /history route: history is
 *  the calendar on /progress. */
export const RESTORABLE_ROUTES = [
  "/today",
  "/partner",
  "/focus",
  "/progress",
  "/more",
  "/routine",
  "/challenges",
  "/duo",
  "/settings",
  "/planner",
] as const;
export type RestorableRoute = (typeof RESTORABLE_ROUTES)[number];

/** Screens whose scroll offset is worth keeping (long, stable lists). */
export const SCROLL_ROUTES: readonly string[] = [
  "/today",
  "/partner",
  "/progress",
  "/routine",
  "/planner",
];

export const FALLBACK_ROUTE = "/today";

export type DraftKind = "task" | "routine";
export type RepeatMode = "daily" | "weekdays" | "custom";

/** The fields of the "new task" form (TaskFormSheet), nothing else. */
export type TaskDraft = {
  name: string;
  repeat: boolean;
  repeatMode: RepeatMode;
  days: Day[];
  time: string;
  reminder: boolean;
  category: Category;
  visible: boolean;
  notes: string;
  updatedAt: number;
};

/** V2 Phase 2: the fields of an unsent NEW planner event (never an edit). */
export type PlannerDraft = {
  title: string;
  type: EventType;
  subject: string;
  date: string;
  time: string;
  notes: string;
  important: boolean;
  shared: boolean;
  reminder: Reminder;
  updatedAt: number;
};

export type PlannerView = "upcoming" | "calendar";

/**
 * Fields added in V2 Phase 2 (planner, plannerDraft) are optional and
 * validated like the rest, so a Phase 1 value stays valid and `v` stays 1.
 */
export type ResumeState = {
  v: typeof RESUME_VERSION;
  lastRoute?: { path: RestorableRoute; at: number };
  progress?: { range?: Range; month?: string };
  scroll?: Record<string, { y: number; at: number }>;
  drafts?: Partial<Record<DraftKind, TaskDraft>>;
  planner?: { view?: PlannerView; month?: string };
  plannerDraft?: PlannerDraft;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EMPTY: ResumeState = { v: RESUME_VERSION };
const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANGES: readonly Range[] = ["7", "30", "90", "Y"];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME = /^(\d{2}:\d{2})?$/;
const NAME_MAX = 200;
const NOTES_MAX = 1000;

const isDev = process.env.NODE_ENV === "development";
function log(...args: unknown[]) {
  if (isDev) console.debug("[resume]", ...args);
}

/** localStorage, or null on the server / when the browser blocks it. */
function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The storage key of a user, or null for anything that is not a user id. */
export function resumeKey(userId: string): string | null {
  return USER_ID.test(userId)
    ? `${NAMESPACE}:${userId.toLowerCase()}:resume`
    : null;
}

export function isRestorableRoute(path: unknown): path is RestorableRoute {
  return (
    typeof path === "string" &&
    (RESTORABLE_ROUTES as readonly string[]).includes(path)
  );
}

// ---------------------------------------------------------------- validation

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const isTime = (x: unknown, now: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x > 0 && x <= now + 60_000;

function parseDraft(x: unknown, now: number): TaskDraft | undefined {
  if (!isRecord(x) || !isTime(x.updatedAt, now)) return undefined;
  if (now - x.updatedAt > DRAFT_TTL_MS) return undefined;
  const {
    name,
    repeat,
    repeatMode,
    days,
    time,
    reminder,
    category,
    visible,
    notes,
  } = x;
  if (
    typeof name !== "string" ||
    typeof repeat !== "boolean" ||
    (repeatMode !== "daily" &&
      repeatMode !== "weekdays" &&
      repeatMode !== "custom") ||
    !Array.isArray(days) ||
    !days.every((d) => (DAYS as readonly unknown[]).includes(d)) ||
    typeof time !== "string" ||
    !TIME.test(time) ||
    typeof reminder !== "boolean" ||
    !(CATEGORIES as readonly unknown[]).includes(category) ||
    typeof visible !== "boolean" ||
    typeof notes !== "string"
  )
    return undefined;
  return {
    name: name.slice(0, NAME_MAX),
    repeat,
    repeatMode,
    days: [...new Set(days as Day[])],
    time,
    reminder,
    category: category as Category,
    visible,
    notes: notes.slice(0, NOTES_MAX),
    updatedAt: x.updatedAt,
  };
}

const DATE_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parsePlannerDraft(x: unknown, now: number): PlannerDraft | undefined {
  if (!isRecord(x) || !isTime(x.updatedAt, now)) return undefined;
  if (now - x.updatedAt > DRAFT_TTL_MS) return undefined;
  const {
    title,
    type,
    subject,
    date,
    time,
    notes,
    important,
    shared,
    reminder,
  } = x;
  if (
    typeof title !== "string" ||
    !(EVENT_TYPES as readonly unknown[]).includes(type) ||
    typeof subject !== "string" ||
    typeof date !== "string" ||
    !(date === "" || DATE_ISO.test(date)) ||
    typeof time !== "string" ||
    !TIME.test(time) ||
    typeof notes !== "string" ||
    typeof important !== "boolean" ||
    typeof shared !== "boolean" ||
    !(REMINDERS as readonly unknown[]).includes(reminder)
  )
    return undefined;
  return {
    title: title.slice(0, NAME_MAX),
    type: type as EventType,
    subject: subject.slice(0, 40),
    date,
    time,
    notes: notes.slice(0, NOTES_MAX),
    important,
    shared,
    reminder: reminder as Reminder,
    updatedAt: x.updatedAt,
  };
}

/**
 * Validates any JSON value into a ResumeState: unknown keys are dropped,
 * invalid fields are dropped one by one, expired drafts / scroll offsets and
 * an old last route are dropped. An unknown version starts empty (the place
 * for a future migration from v1).
 */
export function parseResume(raw: unknown, now = Date.now()): ResumeState {
  if (!isRecord(raw) || raw.v !== RESUME_VERSION) return { ...EMPTY };
  const out: ResumeState = { v: RESUME_VERSION };

  const lr = raw.lastRoute;
  if (
    isRecord(lr) &&
    isRestorableRoute(lr.path) &&
    isTime(lr.at, now) &&
    now - lr.at <= ROUTE_TTL_MS
  )
    out.lastRoute = { path: lr.path, at: lr.at };

  if (isRecord(raw.progress)) {
    const p: NonNullable<ResumeState["progress"]> = {};
    const { range, month } = raw.progress;
    if ((RANGES as readonly unknown[]).includes(range))
      p.range = range as Range;
    if (typeof month === "string" && MONTH.test(month)) p.month = month;
    if (p.range || p.month) out.progress = p;
  }

  if (isRecord(raw.scroll)) {
    const s: NonNullable<ResumeState["scroll"]> = {};
    for (const path of SCROLL_ROUTES) {
      const e = raw.scroll[path];
      if (
        isRecord(e) &&
        typeof e.y === "number" &&
        Number.isFinite(e.y) &&
        e.y >= 0 &&
        e.y < 1e6 &&
        isTime(e.at, now) &&
        now - e.at <= SCROLL_TTL_MS
      )
        s[path] = { y: Math.round(e.y), at: e.at };
    }
    if (Object.keys(s).length) out.scroll = s;
  }

  if (isRecord(raw.drafts)) {
    const d: NonNullable<ResumeState["drafts"]> = {};
    for (const kind of ["task", "routine"] as const) {
      const draft = parseDraft(raw.drafts[kind], now);
      if (draft) d[kind] = draft;
    }
    if (Object.keys(d).length) out.drafts = d;
  }

  if (isRecord(raw.planner)) {
    const p: NonNullable<ResumeState["planner"]> = {};
    const { view, month } = raw.planner;
    if (view === "upcoming" || view === "calendar") p.view = view;
    if (typeof month === "string" && MONTH.test(month)) p.month = month;
    if (p.view || p.month) out.planner = p;
  }
  const pd = parsePlannerDraft(raw.plannerDraft, now);
  if (pd) out.plannerDraft = pd;
  return out;
}

/** JSON for storage; the optional parts go first if it grows too big. */
export function serializeResume(state: ResumeState): string {
  let json = JSON.stringify(state);
  if (json.length <= MAX_BYTES) return json;
  json = JSON.stringify({
    v: state.v,
    lastRoute: state.lastRoute,
    progress: state.progress,
    planner: state.planner,
  });
  return json.length <= MAX_BYTES ? json : JSON.stringify(EMPTY);
}

// ------------------------------------------------------------------- storage

/** The user's validated Resume State; empty on any problem. Never throws. */
export function loadResume(
  userId: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): ResumeState {
  const key = resumeKey(userId);
  if (!key || !storage) return { ...EMPTY };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...EMPTY };
    return parseResume(JSON.parse(raw), now);
  } catch {
    log("ignored an unreadable value");
    return { ...EMPTY };
  }
}

export function saveResume(
  userId: string,
  state: ResumeState,
  storage: StorageLike | null = defaultStorage(),
): void {
  const key = resumeKey(userId);
  if (!key || !storage) return;
  try {
    storage.setItem(key, serializeResume(state));
  } catch {
    // Quota exceeded or storage blocked: resume is a convenience, never an error.
  }
}

/** Read, change, write (last write wins across tabs; no sync between them). */
export function updateResume(
  userId: string,
  change: (state: ResumeState) => ResumeState,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): ResumeState {
  const next = change(loadResume(userId, now, storage));
  saveResume(userId, next, storage);
  return next;
}

/** Explicit sign-out: forget this user's route, scroll, drafts and choices. */
export function clearResume(
  userId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  const key = resumeKey(userId);
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
    storage.removeItem(remindedKey(userId)!);
    log("cleared");
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

// ------------------------------------------------------------------ helpers

/** Where `/` sends a signed-in user: the last safe route, else Today. */
export function restoreTarget(
  userId: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): string {
  const path = loadResume(userId, now, storage).lastRoute?.path;
  log("restore", path ?? `(none → ${FALLBACK_ROUTE})`);
  return path ?? FALLBACK_ROUTE;
}

export function rememberRoute(
  userId: string,
  path: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!isRestorableRoute(path)) return;
  updateResume(
    userId,
    (s) => ({ ...s, lastRoute: { path, at: now } }),
    now,
    storage,
  );
}

export function rememberScroll(
  userId: string,
  path: string,
  y: number,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!SCROLL_ROUTES.includes(path) || !Number.isFinite(y) || y < 0) return;
  updateResume(
    userId,
    (s) => ({
      ...s,
      scroll: { ...s.scroll, [path]: { y: Math.round(y), at: now } },
    }),
    now,
    storage,
  );
}

export function rememberProgress(
  userId: string,
  patch: { range?: Range; month?: string },
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  updateResume(
    userId,
    (s) => ({ ...s, progress: { ...s.progress, ...patch } }),
    now,
    storage,
  );
}

/** Saves a draft; an empty form removes it (nothing worth resuming). */
export function saveDraft(
  userId: string,
  kind: DraftKind,
  draft: Omit<TaskDraft, "updatedAt">,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  const empty = !draft.name.trim() && !draft.notes.trim();
  updateResume(
    userId,
    (s) => {
      const drafts = { ...s.drafts };
      if (empty) delete drafts[kind];
      else drafts[kind] = { ...draft, updatedAt: now };
      return { ...s, drafts };
    },
    now,
    storage,
  );
}

export function loadDraft(
  userId: string,
  kind: DraftKind,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): TaskDraft | null {
  return loadResume(userId, now, storage).drafts?.[kind] ?? null;
}

export function clearDraft(
  userId: string,
  kind: DraftKind,
  storage: StorageLike | null = defaultStorage(),
): void {
  updateResume(
    userId,
    (s) => {
      const drafts = { ...s.drafts };
      delete drafts[kind];
      return { ...s, drafts };
    },
    Date.now(),
    storage,
  );
}

// ------------------------------------------------------------ planner (V2.2)

export function rememberPlanner(
  userId: string,
  patch: { view?: PlannerView; month?: string },
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  updateResume(
    userId,
    (s) => ({ ...s, planner: { ...s.planner, ...patch } }),
    now,
    storage,
  );
}

/** Saves the new-event draft; a form without a title or notes removes it. */
export function savePlannerDraft(
  userId: string,
  draft: Omit<PlannerDraft, "updatedAt">,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  const empty = !draft.title.trim() && !draft.notes.trim();
  updateResume(
    userId,
    (s) => {
      const next = { ...s };
      if (empty) delete next.plannerDraft;
      else next.plannerDraft = { ...draft, updatedAt: now };
      return next;
    },
    now,
    storage,
  );
}

export function loadPlannerDraft(
  userId: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): PlannerDraft | null {
  return loadResume(userId, now, storage).plannerDraft ?? null;
}

export function clearPlannerDraft(
  userId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  updateResume(
    userId,
    (s) => {
      const next = { ...s };
      delete next.plannerDraft;
      return next;
    },
    Date.now(),
    storage,
  );
}

/**
 * Planner reminders already shown on this device ("<eventId>:<due date>"),
 * so a reminder appears once. Per user, cleared on sign-out, at most 200.
 */
export function remindedKey(userId: string): string | null {
  return USER_ID.test(userId)
    ? `${NAMESPACE}:${userId.toLowerCase()}:planner-reminded`
    : null;
}

export function loadReminded(
  userId: string,
  storage: StorageLike | null = defaultStorage(),
): string[] {
  const key = remindedKey(userId);
  if (!key || !storage) return [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string").slice(-200)
      : [];
  } catch {
    return [];
  }
}

export function markReminded(
  userId: string,
  ids: string[],
  storage: StorageLike | null = defaultStorage(),
): void {
  const key = remindedKey(userId);
  if (!key || !storage || !ids.length) return;
  try {
    const next = [...new Set([...loadReminded(userId, storage), ...ids])];
    storage.setItem(key, JSON.stringify(next.slice(-200)));
  } catch {
    // Storage blocked: the reminder may show again next time, never an error.
  }
}
