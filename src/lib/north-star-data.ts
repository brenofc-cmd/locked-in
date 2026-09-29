import type { SupabaseClient } from "@supabase/supabase-js";
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
 */
export async function loadNorthStar(
  supabase: SupabaseClient<Database>,
): Promise<NorthStar> {
  const [visions, goals, mirror] = await Promise.all([
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
  ]);
  if (visions.error || goals.error || mirror.error) return EMPTY_NORTH_STAR;
  return pickNorthStar({
    visions: visions.data.map(visionFromRow),
    goals: goals.data.map((g) => goalFromRow(g)),
    mirror: mirror.data.map(mirrorFromRow),
  });
}
