import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { RoutineScreen } from "@/components/screens/RoutineScreen";

export const metadata: Metadata = { title: t.pageTitles.routine };

export default function Page() {
  return <RoutineScreen />;
}
