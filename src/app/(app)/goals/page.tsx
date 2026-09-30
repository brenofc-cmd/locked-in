import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { GoalsScreen } from "@/components/screens/GoalsScreen";
import { weekRange } from "@/lib/goal-proof";
import { loadProofSummaries } from "@/lib/goal-proof-data";
import { loadGoalsData } from "@/lib/goals-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: t.pageTitles.goals };

/**
 * Private to the owner: read here (RLS), not with the app layout. V2 Phase 5:
 * this week's proof for every goal in ONE call (no query per goal); a failure
 * there only hides the proof lines.
 */
export default async function Page() {
  const supabase = await createClient();
  const [data, today] = await Promise.all([
    loadGoalsData(supabase),
    supabase.rpc("my_today"),
  ]);
  const week = today.data ? weekRange(today.data) : null;
  const proofWeek = week
    ? await loadProofSummaries(supabase, week.from, week.to).catch(() => ({}))
    : {};
  return <GoalsScreen initial={data} proofWeek={proofWeek} />;
}
