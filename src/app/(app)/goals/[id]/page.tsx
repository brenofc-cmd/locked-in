import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { t } from "@/i18n/pt-BR";
import { GoalDetailScreen } from "@/components/screens/GoalDetailScreen";
import { EMPTY_SUMMARY, weekRange } from "@/lib/goal-proof";
import { loadProofPage, loadProofSummaries } from "@/lib/goal-proof-data";
import { goalFromRow, isUuid, milestoneFromRow } from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: t.pageTitles.goals };

/**
 * V2 Phase 5 — one goal and its proof (docs/GOAL_PROOF.md). Owner-only: RLS
 * returns nothing for anyone else's goal, which is a plain 404 — the page
 * never says that such a goal exists.
 */
export default async function Page({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [goal, milestones, today] = await Promise.all([
    supabase.from("goals").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("goal_milestones")
      .select("*")
      .eq("goal_id", id)
      .order("sort_order"),
    supabase.rpc("my_today"),
  ]);
  if (goal.error || milestones.error || today.error || !today.data)
    throw new Error(t.proof.errors.load);
  if (!goal.data) notFound();

  const week = weekRange(today.data);
  const [summaries, page] = await Promise.all([
    loadProofSummaries(supabase, week.from, week.to),
    loadProofPage(supabase, id, 0),
  ]);

  return (
    <GoalDetailScreen
      goal={goalFromRow(goal.data, milestones.data.map(milestoneFromRow))}
      week={summaries[id] ?? EMPTY_SUMMARY}
      proofs={page.proofs}
      more={page.more}
    />
  );
}
