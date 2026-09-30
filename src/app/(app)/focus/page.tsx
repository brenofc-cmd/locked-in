import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { FocusScreen } from "@/components/screens/FocusScreen";

export const metadata: Metadata = { title: t.pageTitles.focus };

/**
 * V2 Phase 5: "?goal=<id>" (INICIAR FOCO on a goal page) pre-selects
 * TRABALHANDO EM; FocusScreen keeps it only if it is one of my active goals.
 */
export default async function Page({ searchParams }: PageProps<"/focus">) {
  const { goal } = await searchParams;
  return <FocusScreen goalId={typeof goal === "string" ? goal : null} />;
}
