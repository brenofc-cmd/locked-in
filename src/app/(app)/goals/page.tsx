import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { GoalsScreen } from "@/components/screens/GoalsScreen";
import { loadGoalsData } from "@/lib/goals-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: t.pageTitles.goals };

/** Private to the owner: read here (RLS), not with the app layout. */
export default async function Page() {
  const data = await loadGoalsData(await createClient());
  return <GoalsScreen initial={data} />;
}
