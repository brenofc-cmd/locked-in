import type { SupabaseClient } from "@supabase/supabase-js";
import { hasProof, weekRange } from "@/lib/goal-proof";
import { loadProofSummaries } from "@/lib/goal-proof-data";
import { goalFromRow, mirrorFromRow, visionFromRow } from "@/lib/goals";
import {
  EMPTY_NORTH_STAR,
  pickNorthStar,
  type NorthStar,
} from "@/lib/north-star";
import type { Database } from "@/types/database";

/**
 * The North Star for Today (V2 Phase 4): only ACTIVE visions, goals and
 * mirror items of the signed-in user (owner-only RLS), three small queries in
 * parallel, picked on the server — the client receives at most three short
 * items, never the lists. A failure only hides the card (Today still works).
 * V2 Phase 5: the picked goal carries this week's proof (one batch call; a
 * failure only hides that line).
 */
export async function loadNorthStar(
  supabase: SupabaseClient<Database>,
): Promise<NorthStar> {
  const [visions, goals, mirror, today] = await Promise.all([
    supabase
      .from("vision_items")
      .select("*")
      .eq("is_archived", false)
      .order("sort_order")
      .limit(50),
    supabase
      .from("goals")
      .select("*")
      .eq("status", "active")
      .order("sort_order")
      .limit(100),
    supabase
      .from("accountability_items")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .limit(50),
    supabase.rpc("my_today"),
  ]);
  if (visions.error || goals.error || mirror.error) return EMPTY_NORTH_STAR;
  const star = pickNorthStar({
    visions: visions.data.map(visionFromRow),
    goals: goals.data.map((g) => goalFromRow(g)),
    mirror: mirror.data.map(mirrorFromRow),
  });
  if (!star.goal || !today.data) return star;
  const week = weekRange(today.data);
  const summaries = await loadProofSummaries(
    supabase,
    week.from,
    week.to,
  ).catch(() => null);
  const summary = summaries?.[star.goal.item.id];
  return {
    ...star,
    goal: {
      ...star.goal,
      item: { ...star.goal.item, week: hasProof(summary) ? summary : null },
    },
  };
}
