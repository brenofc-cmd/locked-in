import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { PlanScreen } from "@/components/screens/PlanScreen";
import { loadNorthStar } from "@/lib/north-star-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: t.pageTitles.plan };

/**
 * PLANEJAR: a hub of rows. The featured goal is the North Star's pick, read
 * here like on /today (owner-only); everything else is already in useApp().
 */
export default async function Page() {
  const northStar = await loadNorthStar(await createClient());
  return <PlanScreen goal={northStar.goal?.item.title ?? ""} />;
}
