import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { DuoScreen } from "@/components/screens/DuoScreen";

export const metadata: Metadata = { title: t.pageTitles.duo };

export default function Page() {
  return <DuoScreen />;
}
