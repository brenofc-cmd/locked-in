"use server";

import { t } from "@/i18n/pt-BR";
import type {
  CelebrationKind,
  CelebrationRow,
  Claim,
} from "@/lib/celebrations";
import { isUuid } from "@/lib/goals";
import {
  loadCelebrations,
  loadFacts,
  loadReflection,
  loadWeek,
} from "@/lib/reflection-data";
import {
  normalizeReflection,
  REFLECTION_MAX,
  type Reflection,
  type ReviewFacts,
  type ReviewKind,
} from "@/lib/reviews";
import {
  MAX_PRIORITIES,
  priorityFromRow,
  validatePriorityTitle,
  type Priority,
  type PriorityStatus,
} from "@/lib/weekly-plan";
import { createClient } from "@/lib/supabase/server";

/**
 * V2 Phase 9 writes and reads: celebrations, weekly priorities, reviews.
 * Identity comes from the session cookie; owner_id is never sent. The
 * database validates every claim (a milestone really reached, today really
 * perfect, a month really closed), the week rules and the review period.
 * Errors are fixed copy.
 */
type Fail = { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly CelebrationKind[] = [
  "milestone",
  "perfect_day",
  "monthly",
];

function priorityError(error: { message?: string }): Fail {
  const m = error.message ?? "";
  const e = t.weeklyPlan.errors;
  if (m.includes("LI_HISTORY_LOCKED")) return { ok: false, error: e.locked };
  if (m.includes("LI_WEEK_TOO_FAR")) return { ok: false, error: e.tooFar };
  if (m.includes("one_per_position") || m.includes("position"))
    return { ok: false, error: e.full };
  return { ok: false, error: e.save };
}

// ------------------------------------------------------- celebrations ----

/**
 * Claims what the client derived (each one validated again by the
 * database; a refused or duplicate claim is simply not shown) and returns
 * every row, so the caller shows what is still unseen.
 */
export async function claimCelebrations(
  claims: Claim[],
): Promise<{ ok: true; rows: CelebrationRow[] } | Fail> {
  try {
    const supabase = await createClient();
    const valid = claims
      .filter((c) => KINDS.includes(c.kind) && /^[a-z0-9_-]{1,20}$/.test(c.key))
      .slice(0, 12);
    for (const c of valid)
      await supabase.from("celebrations").insert({ kind: c.kind, key: c.key });
    return { ok: true, rows: await loadCelebrations(supabase) };
  } catch {
    return { ok: false, error: t.errors.network };
  }
}

/** Shown: the database stamps seen_at once (later calls keep the first time). */
export async function markCelebrationSeen(
  kind: CelebrationKind,
  key: string,
): Promise<{ ok: true } | Fail> {
  try {
    if (!KINDS.includes(kind)) return { ok: false, error: t.errors.network };
    const supabase = await createClient();
    const { error } = await supabase
      .from("celebrations")
      .update({ seen_at: new Date().toISOString() })
      .eq("kind", kind)
      .eq("key", key);
    return error ? { ok: false, error: t.errors.network } : { ok: true };
  } catch {
    return { ok: false, error: t.errors.network };
  }
}

// --------------------------------------------------------- priorities ----

export async function addPriority(
  weekStart: string,
  position: number,
  title: string,
): Promise<{ ok: true; priority: Priority } | Fail> {
  const invalid = validatePriorityTitle(title);
  if (invalid) return { ok: false, error: invalid };
  if (
    !DATE.test(weekStart) ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > MAX_PRIORITIES
  )
    return { ok: false, error: t.weeklyPlan.errors.save };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("weekly_priorities")
      .insert({ week_start: weekStart, position, title: title.trim() })
      .select("id, week_start, position, title, status")
      .single();
    if (error) return priorityError(error);
    return { ok: true, priority: priorityFromRow(data) };
  } catch {
    return { ok: false, error: t.weeklyPlan.errors.save };
  }
}

export async function updatePriority(
  id: string,
  change: { title?: string; status?: PriorityStatus },
): Promise<{ ok: true; priority: Priority } | Fail> {
  if (!isUuid(id)) return { ok: false, error: t.weeklyPlan.errors.save };
  const patch: { title?: string; status?: PriorityStatus } = {};
  if (change.title !== undefined) {
    const invalid = validatePriorityTitle(change.title);
    if (invalid) return { ok: false, error: invalid };
    patch.title = change.title.trim();
  }
  if (change.status !== undefined) {
    if (change.status !== "open" && change.status !== "done")
      return { ok: false, error: t.weeklyPlan.errors.save };
    patch.status = change.status;
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("weekly_priorities")
      .update(patch)
      .eq("id", id)
      .select("id, week_start, position, title, status")
      .single();
    if (error) return priorityError(error);
    return { ok: true, priority: priorityFromRow(data) };
  } catch {
    return { ok: false, error: t.weeklyPlan.errors.save };
  }
}

export async function deletePriority(id: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, error: t.weeklyPlan.errors.save };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("weekly_priorities")
      .delete()
      .eq("id", id);
    return error ? priorityError(error) : { ok: true };
  } catch {
    return { ok: false, error: t.weeklyPlan.errors.save };
  }
}

// ------------------------------------------------------------ reviews ----

/** Update the reflection if it exists, insert it otherwise. */
export async function saveReflection(
  kind: ReviewKind,
  periodStart: string,
  input: Reflection,
): Promise<{ ok: true; reflection: Reflection } | Fail> {
  const fail: Fail = { ok: false, error: t.reviews.saveError };
  if ((kind !== "day" && kind !== "week") || !DATE.test(periodStart))
    return fail;
  const r = normalizeReflection(input);
  if (
    [r.worked, r.hindered, r.changeNext].some((s) => s.length > REFLECTION_MAX)
  )
    return fail;
  const values = {
    worked: r.worked || null,
    hindered: r.hindered || null,
    change_next: r.changeNext || null,
  };
  try {
    const supabase = await createClient();
    const updated = await supabase
      .from("reviews")
      .update(values)
      .eq("kind", kind)
      .eq("period_start", periodStart)
      .select("kind");
    if (updated.error) return fail;
    if (!updated.data.length) {
      const { error } = await supabase
        .from("reviews")
        .insert({ kind, period_start: periodStart, ...values });
      if (error) return fail;
    }
    return { ok: true, reflection: r };
  } catch {
    return fail;
  }
}

/** Weekly Review: facts, the week's priorities and my reflection. */
export async function loadWeekReview(weekStart: string): Promise<
  | {
      ok: true;
      facts: ReviewFacts;
      priorities: Priority[];
      reflection: Reflection;
    }
  | Fail
> {
  if (!DATE.test(weekStart)) return { ok: false, error: t.reviews.loadError };
  try {
    return { ok: true, ...(await loadWeek(await createClient(), weekStart)) };
  } catch {
    return { ok: false, error: t.reviews.loadError };
  }
}

/** Day Review / a past day: facts and my reflection of that date. */
export async function loadDayReview(
  date: string,
): Promise<{ ok: true; facts: ReviewFacts; reflection: Reflection } | Fail> {
  if (!DATE.test(date)) return { ok: false, error: t.reviews.loadError };
  try {
    const supabase = await createClient();
    const [facts, reflection] = await Promise.all([
      loadFacts(supabase, date, date),
      loadReflection(supabase, "day", date),
    ]);
    return { ok: true, facts, reflection };
  } catch {
    return { ok: false, error: t.reviews.loadError };
  }
}
