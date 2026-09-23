import type { Metadata } from "next";
import { PartnerScreen } from "@/components/screens/PartnerScreen";

export const metadata: Metadata = { title: "Partner" };

export default function Page() {
  return <PartnerScreen />;
}
