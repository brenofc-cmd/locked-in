import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { PlannerScreen } from "@/components/screens/PlannerScreen";

export const metadata: Metadata = { title: t.pageTitles.planner };

export default function Page() {
  return <PlannerScreen />;
}
