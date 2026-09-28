import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { PartnerScreen } from "@/components/screens/PartnerScreen";

export const metadata: Metadata = { title: t.pageTitles.partner };

export default function Page() {
  return <PartnerScreen />;
}
