import type { Metadata } from "next";
import { DuoScreen } from "@/components/screens/DuoScreen";

export const metadata: Metadata = { title: "Duo" };

export default function Page() {
  return <DuoScreen />;
}
