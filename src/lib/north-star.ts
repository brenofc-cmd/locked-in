/**
 * North Star and the morning (V2 Phase 4, docs/NORTH_STAR.md, ADR-060…062):
 * pure selection and presentation rules, unit-tested. Everything shown comes
 * from what the user wrote (vision, goals, mirror) or from real numbers —
 * never a generated phrase.
 */
import type { ProofSummary } from "@/lib/goal-proof";
import { localTimeHM } from "@/lib/local-date";
import { groupUpcoming, type PlannerEvent } from "@/lib/planner";
import {
  groupGoals,
  bySortOrder,
  type Goal,
  type GoalType,
  type MirrorItem,
  type Vision,
} from "@/lib/goals";

export type StarPick<T> = { item: T; featured: boolean } | null;

/** One vision, one goal, one mirror item at most — each may be missing. */
export type NorthStar = {
  vision: StarPick<{ id: string; title: string; description: string }>;
  goal: StarPick<{
    id: string;
    title: string;
    type: GoalType;
    targetDate: string;
    /** V2 Phase 5: this week's proof of that goal (null = none / not loaded). */
    week?: ProofSummary | null;
  }>;
  mirror: StarPick<{ id: string; text: string }>;
};

export const EMPTY_NORTH_STAR: NorthStar = {
  vision: null,
  goal: null,
  mirror: null,
};

export const isEmptyNorthStar = (n: NorthStar) =>
  !n.vision && !n.goal && !n.mirror;

/**
 * Selection: the item the user featured (only ever an active one), else a
 * predictable fallback — never random:
 *   vision → first active vision by the user's order;
 *   goal   → first active goal, 90 DIAS before ESTE MÊS before LONGO PRAZO,
 *            then the /goals order (sort order, nearest target, title);
 *   mirror → first active item by the user's order.
 * Archived visions, achieved / archived goals and inactive mirror items are
 * never shown (an achieved goal is not "META ATUAL").
 */
export function pickNorthStar(data: {
  visions: Vision[];
  goals: Goal[];
  mirror: MirrorItem[];
}): NorthStar {
  const visions = data.visions.filter((v) => !v.archived).sort(bySortOrder);
  const vision = visions.find((v) => v.featured) ?? visions[0];

  const active = groupGoals(data.goals).active.flatMap((g) => g.goals);
  const goal = active.find((g) => g.featured) ?? active[0];

  const mirrors = data.mirror.filter((m) => m.active).sort(bySortOrder);
  const mirror = mirrors.find((m) => m.featured) ?? mirrors[0];

  return {
    vision: vision
      ? {
          item: {
            id: vision.id,
            title: vision.title,
            description: vision.description,
          },
          featured: vision.featured,
        }
      : null,
    goal: goal
      ? {
          item: {
            id: goal.id,
            title: goal.title,
            type: goal.type,
            targetDate: goal.targetDate,
          },
          featured: goal.featured,
        }
      : null,
    mirror: mirror
      ? {
          item: { id: mirror.id, text: mirror.text },
          featured: mirror.featured,
        }
      : null,
  };
}

// ----------------------------------------------------------------- daypart

export type Daypart = "morning" | "afternoon" | "evening";

/** 05:00–11:59 morning · 12:00–17:59 afternoon · 18:00–04:59 evening. */
export function daypartOf(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** The daypart in the user's timezone (profiles.timezone), not the device's. */
export function daypartAt(at: Date | number, timeZone: string): Daypart {
  const hm = localTimeHM(new Date(at), timeZone);
  return daypartOf(Number(hm.slice(0, 2)));
}

// ------------------------------------------------------------------ planner

/**
 * The single next commitment for the morning card: the first upcoming event
 * (today → later, same order as the Planner), skipping today's events whose
 * time has already passed. null when nothing is coming up.
 */
export function nextEvent(
  events: PlannerEvent[],
  today: string,
  nowHM: string,
): PlannerEvent | null {
  for (const g of groupUpcoming(events, today)) {
    for (const e of g.events) {
      if (e.date === today && e.time && e.time < nowHM) continue;
      return e;
    }
  }
  return null;
}

// ------------------------------------------------------------------- top 3

export const MAX_PRIORITIES = 3;

/** Today's priorities in rank order (1, 2, 3). */
export function topThree<T extends { priority: number | null }>(
  tasks: T[],
): T[] {
  return tasks
    .filter((t) => t.priority !== null)
    .sort((a, b) => a.priority! - b.priority!)
    .slice(0, MAX_PRIORITIES);
}

/** The ids in rank order, as the database expects them. */
export const priorityIds = <T extends { id: string; priority: number | null }>(
  tasks: T[],
) => topThree(tasks).map((t) => t.id);

/** Adds at the end; null when the list is full (the user must replace one). */
export function addPriority(ids: string[], id: string): string[] | null {
  if (ids.includes(id)) return ids;
  if (ids.length >= MAX_PRIORITIES) return null;
  return [...ids, id];
}

/** Puts `id` where `out` was (same rank); unchanged if `out` is not listed. */
export function replacePriority(
  ids: string[],
  out: string,
  id: string,
): string[] {
  if (!ids.includes(out) || ids.includes(id)) return ids;
  return ids.map((x) => (x === out ? id : x));
}

export const removePriority = (ids: string[], id: string) =>
  ids.filter((x) => x !== id);

/** One step up (-1) or down (+1); null at the edge. */
export function movePriority(
  ids: string[],
  id: string,
  dir: -1 | 1,
): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
