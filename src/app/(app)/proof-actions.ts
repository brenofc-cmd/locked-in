"use server";

import { t } from "@/i18n/pt-BR";
import { periodRange, type Proof, type ProofSummary } from "@/lib/goal-proof";
import { loadProofPage, loadProofSummaries } from "@/lib/goal-proof-data";
import type { Range } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

/**
 * V2 Phase 5 — proof reads for the client (docs/GOAL_PROOF.md). Read-only;
 * identity from the session cookie; the database returns the caller's own
 * proof only (another user's goal id simply yields nothing).
 */
type Fail = { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANGES: readonly Range[] = ["7", "30", "90", "Y"];

/** "CARREGAR MAIS" on a goal's timeline. */
export async function loadMoreProofs(
  goalId: string,
  offset: number,
): Promise<{ ok: true; proofs: Proof[]; more: boolean } | Fail> {
  if (!UUID.test(goalId) || !Number.isFinite(offset) || offset < 0)
    return { ok: false, error: t.proof.errors.load };
  try {
    const page = await loadProofPage(await createClient(), goalId, offset);
    return { ok: true, ...page };
  } catch {
    return { ok: false, error: t.proof.errors.load };
  }
}

/** Progress → PROGRESSO DAS METAS for a range ending on my today. */
export async function loadGoalProgress(
  range: Range,
): Promise<{ ok: true; summaries: Record<string, ProofSummary> } | Fail> {
  if (!RANGES.includes(range)) return { ok: false, error: t.proof.errors.load };
  try {
    const supabase = await createClient();
    const today = await supabase.rpc("my_today");
    if (today.error || !today.data) throw today.error;
    const { from, to } = periodRange(range, today.data);
    return {
      ok: true,
      summaries: await loadProofSummaries(supabase, from, to),
    };
  } catch {
    return { ok: false, error: t.proof.errors.load };
  }
}
