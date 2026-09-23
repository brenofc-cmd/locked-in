import type { Metadata } from "next";
import { TodayScreen } from "@/components/screens/TodayScreen";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return <TodayScreen />;
}
