import type { Metadata } from "next";
import { RoutineScreen } from "@/components/screens/RoutineScreen";

export const metadata: Metadata = { title: "Routine" };

export default function Page() {
  return <RoutineScreen />;
}
