import type { Metadata } from "next";
import { FocusScreen } from "@/components/screens/FocusScreen";

export const metadata: Metadata = { title: "Focus" };

export default function Page() {
  return <FocusScreen />;
}
