import type { SupabaseClient } from "@supabase/supabase-js";
import type { CelebrationKind, CelebrationRow } from "@/lib/celebrations";
import { addDays } from "@/lib/local-date";
import {
  factsFromRow,
  reflectionFromRow,
  type Reflection,
  type ReviewFacts,
  type ReviewKind,
} from "@/lib/reviews";
import { planWeeks, priorityFromRow, type Priority } from "@/lib/weekly-plan";
import type { Database } from "@/types/database";

/**
 * V2 Phase 9 reads (owner-only, RLS): celebrations, weekly priorities and
 * reviews. Shared by the initial load and the server actions.
 */
type Client = SupabaseClient<Database>;

const KINDS: readonly string[] = ["milestone", "perfect_day", "monthly"];

/** Every celebration row of mine (a handful: 9 milestones + receipts). */
export async function loadCelebrations(
  supabase: Client,
): Promise<CelebrationRow[]> {
  const { data, error } = await supabase
    .from("celebrations")
    .select("kind, key, baseline, seen_at")
    .order("achieved_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data
    .filter((r) => KINDS.includes(r.kind))
    .map((r) => ({
      kind: r.kind as CelebrationKind,
      key: r.key,
      baseline: r.baseline,
      seenAt: r.seen_at,
    }));
}

/** Priorities of this week and the next (the plannable ones). */
export async function loadPriorities(
  supabase: Client,
  today: string,
): Promise<Priority[]> {
  const { current, next } = planWeeks(today);
  const { data, error } = await supabase
    .from("weekly_priorities")
    .select("id, week_start, position, title, status")
    .in("week_start", [current, next])
    .order("week_start")
    .order("position");
  if (error) throw error;
  return data.map(priorityFromRow);
}

export async function loadReflection(
  supabase: Client,
  kind: ReviewKind,
  periodStart: string,
): Promise<Reflection> {
  const { data, error } = await supabase
    .from("reviews")
    .select("worked, hindered, change_next")
    .eq("kind", kind)
    .eq("period_start", periodStart)
    .maybeSingle();
  if (error) throw error;
  return reflectionFromRow(data);
}

/** Objective facts of [from, to] (the database caps at today and 31 days). */
export async function loadFacts(
  supabase: Client,
  from: string,
  to: string,
): Promise<ReviewFacts> {
  const { data, error } = await supabase
    .rpc("my_review_facts", { p_from: from, p_to: to })
    .single();
  if (error) throw error;
  return factsFromRow(data);
}

/** Facts, priorities and reflection of one week (Weekly Review). */
export async function loadWeek(supabase: Client, weekStart: string) {
  const [facts, priorities, reflection] = await Promise.all([
    loadFacts(supabase, weekStart, addDays(weekStart, 6)),
    supabase
      .from("weekly_priorities")
      .select("id, week_start, position, title, status")
      .eq("week_start", weekStart)
      .order("position"),
    loadReflection(supabase, "week", weekStart),
  ]);
  if (priorities.error) throw priorities.error;
  return {
    facts,
    priorities: priorities.data.map(priorityFromRow),
    reflection,
  };
}
