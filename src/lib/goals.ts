/**
 * Goals, vision and the accountability mirror (V2 Phase 3, docs/GOALS.md):
 * pure model, validation, grouping, ordering and labels. Direction, not
 * daily execution: no percentage is ever derived or stored here.
 */
import { t } from "@/i18n/pt-BR";
import { addDays, daysBetween } from "@/lib/local-date";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type VisionRow = Tables["vision_items"]["Row"];
export type GoalRow = Tables["goals"]["Row"];
export type MilestoneRow = Tables["goal_milestones"]["Row"];
export type MirrorRow = Tables["accountability_items"]["Row"];

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const MIRROR_MAX = 300;

export const GOAL_TYPES = ["90_day", "monthly", "long_term"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_STATUSES = ["active", "achieved", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export type Vision = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  archived: boolean;
};

export type Milestone = {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  sortOrder: number;
};

export type Goal = {
  id: string;
  visionId: string | null;
  title: string;
  description: string;
  type: GoalType;
  /** "YYYY-MM-DD" or "" */
  targetDate: string;
  status: GoalStatus;
  achievedAt: string | null;
  sortOrder: number;
  createdAt: string;
  milestones: Milestone[];
};

export type MirrorItem = {
  id: string;
  text: string;
  active: boolean;
  sortOrder: number;
};

export type GoalsData = {
  visions: Vision[];
  goals: Goal[];
  mirror: MirrorItem[];
};

export type Section = "vision" | "goals" | "mirror";
export const SECTIONS: Section[] = ["vision", "goals", "mirror"];

const isType = (x: unknown): x is GoalType =>
  (GOAL_TYPES as readonly unknown[]).includes(x);
const isStatus = (x: unknown): x is GoalStatus =>
  (GOAL_STATUSES as readonly unknown[]).includes(x);

export const visionFromRow = (r: VisionRow): Vision => ({
  id: r.id,
  title: r.title,
  description: r.description ?? "",
  sortOrder: r.sort_order,
  archived: r.is_archived,
});

export const milestoneFromRow = (r: MilestoneRow): Milestone => ({
  id: r.id,
  goalId: r.goal_id,
  title: r.title,
  done: r.is_completed,
  sortOrder: r.sort_order,
});

export function goalFromRow(r: GoalRow, milestones: Milestone[] = []): Goal {
  return {
    id: r.id,
    visionId: r.vision_id,
    title: r.title,
    description: r.description ?? "",
    type: isType(r.goal_type) ? r.goal_type : "long_term",
    targetDate: r.target_date ?? "",
    status: isStatus(r.status) ? r.status : "active",
    achievedAt: r.achieved_at,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    milestones: milestones
      .filter((m) => m.goalId === r.id)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
      ),
  };
}

export const mirrorFromRow = (r: MirrorRow): MirrorItem => ({
  id: r.id,
  text: r.text,
  active: r.is_active,
  sortOrder: r.sort_order,
});

// ------------------------------------------------------------ validation

export type VisionInput = { title: string; description: string };
export type GoalInput = {
  title: string;
  type: GoalType;
  visionId: string | null;
  targetDate: string;
  description: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string =>
  typeof s === "string" && UUID.test(s);

function validTitle(title: string): string | null {
  const s = title.trim();
  if (!s) return t.goals.errors.titleRequired;
  if (s.length > TITLE_MAX) return t.goals.errors.titleTooLong(TITLE_MAX);
  return null;
}

export function validateVision(input: VisionInput): string | null {
  return (
    validTitle(input.title) ??
    (input.description.trim().length > DESCRIPTION_MAX
      ? t.goals.errors.descriptionTooLong(DESCRIPTION_MAX)
      : null)
  );
}

export function validateGoal(input: GoalInput): string | null {
  const title = validTitle(input.title);
  if (title) return title;
  if (!isType(input.type)) return t.goals.errors.invalid;
  if (input.visionId !== null && !isUuid(input.visionId))
    return t.goals.errors.invalid;
  if (input.targetDate) {
    const d = new Date(`${input.targetDate}T00:00:00Z`);
    if (
      !DATE.test(input.targetDate) ||
      Number.isNaN(d.getTime()) ||
      d.toISOString().slice(0, 10) !== input.targetDate ||
      input.targetDate < "2000-01-01" ||
      input.targetDate > "2100-12-31"
    )
      return t.goals.errors.dateInvalid;
  }
  if (input.description.trim().length > DESCRIPTION_MAX)
    return t.goals.errors.descriptionTooLong(DESCRIPTION_MAX);
  return null;
}

export function validateMirror(text: string): string | null {
  const s = text.trim();
  if (!s) return t.goals.errors.mirrorRequired;
  if (s.length > MIRROR_MAX) return t.goals.errors.mirrorTooLong(MIRROR_MAX);
  return null;
}

export const validateMilestone = (title: string) => validTitle(title);

/** Database / network errors → fixed copy. */
export function goalsErrorMessage(error: {
  code?: string;
  message?: string;
}): string {
  if (error.code === "23514") return t.goals.errors.invalid;
  if (error.code === "23503") return t.goals.errors.visionInvalid;
  if (error.code === "42501" || error.code === "PGRST116")
    return t.goals.errors.notAllowed;
  return t.goals.errors.saveFailed;
}

// ------------------------------------------------------- ordering / groups

export const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder;

/** Next sort_order at the end of a list. */
export const nextSortOrder = (list: { sortOrder: number }[]) =>
  list.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 10;

/**
 * Moves one id up / down in an ordered list. Returns the new id order, or
 * null at an edge (nothing to do).
 */
export function move(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Stable active ordering: sort_order, then the nearest target date, then title. */
function compareActive(a: Goal, b: Goal): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.targetDate !== b.targetDate) {
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return a.targetDate < b.targetDate ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "pt-BR");
}

export function groupGoals(goals: Goal[]): {
  active: { type: GoalType; goals: Goal[] }[];
  achieved: Goal[];
  archived: Goal[];
} {
  const active = GOAL_TYPES.map((type) => ({
    type,
    goals: goals
      .filter((g) => g.status === "active" && g.type === type)
      .sort(compareActive),
  })).filter((g) => g.goals.length > 0);
  const achieved = goals
    .filter((g) => g.status === "achieved")
    .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));
  const archived = goals
    .filter((g) => g.status === "archived")
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return { active, achieved, archived };
}

export const activeVisions = (v: Vision[]) =>
  v.filter((x) => !x.archived).sort(bySortOrder);
export const archivedVisions = (v: Vision[]) =>
  v.filter((x) => x.archived).sort(bySortOrder);
export const activeMirror = (m: MirrorItem[]) =>
  m.filter((x) => x.active).sort(bySortOrder);
export const inactiveMirror = (m: MirrorItem[]) =>
  m.filter((x) => !x.active).sort(bySortOrder);

// ------------------------------------------------------------------ labels

export const goalTypeLabel = (type: GoalType) => t.goals.types[type];

/** "ATÉ 12 MAR", "ATÉ 12 MAR 2027", "PRAZO PASSOU · 12 MAR"; "" without a date. */
export function targetLabel(
  targetDate: string,
  today: string,
  status: GoalStatus = "active",
): string {
  if (!targetDate) return "";
  const [y, m, d] = targetDate.split("-").map(Number);
  const month = t.dates.monthsShort[m - 1];
  const base = `${d} ${month}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
  if (status === "active" && targetDate < today)
    return t.goals.target.passed(base);
  if (status === "active" && daysBetween(today, targetDate) <= 7)
    return t.goals.target.soon(base, daysBetween(today, targetDate));
  return t.goals.target.until(base);
}

/** "2 de 4 marcos" (a count, never a percentage); "" without milestones. */
export function milestonesLabel(ms: Milestone[]): string {
  if (!ms.length) return "";
  return t.goals.milestonesCount(ms.filter((m) => m.done).length, ms.length);
}

/** Suggested target for a new goal of a type (the form starts empty). */
export function suggestedTarget(type: GoalType, today: string): string {
  if (type === "90_day") return addDays(today, 90);
  if (type === "monthly") {
    const [y, m] = today.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    return addDays(next.toISOString().slice(0, 10), -1);
  }
  return "";
}
