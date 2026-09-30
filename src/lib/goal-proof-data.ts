import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROOF_PAGE,
  proofFromRow,
  summaryMap,
  type Proof,
  type ProofSummary,
} from "@/lib/goal-proof";
import type { Database } from "@/types/database";

/**
 * V2 Phase 5 reads (docs/GOAL_PROOF.md). Both functions are INVOKER: RLS and
 * explicit owner filters keep every row the caller's own. Summaries come for
 * ALL of my goals in one call (never one query per goal).
 */
type Client = SupabaseClient<Database>;

export async function loadProofSummaries(
  supabase: Client,
  from: string,
  to: string,
): Promise<Record<string, ProofSummary>> {
  const { data, error } = await supabase.rpc("my_goal_proof_summaries", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return Object.fromEntries(summaryMap(data));
}

/** One page of a goal's proof, newest first; `more` = another page may exist. */
export async function loadProofPage(
  supabase: Client,
  goalId: string,
  offset: number,
): Promise<{ proofs: Proof[]; more: boolean }> {
  const { data, error } = await supabase.rpc("my_goal_proofs", {
    p_goal_id: goalId,
    p_limit: PROOF_PAGE,
    p_offset: Math.max(0, Math.floor(offset)),
  });
  if (error) throw error;
  return {
    proofs: data.map(proofFromRow).filter((p): p is Proof => p !== null),
    more: data.length === PROOF_PAGE,
  };
}
