"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/session";

export function OnboardingDone() {
  const { settings } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (settings.onboarded) router.replace("/today");
  }, [settings.onboarded, router]);
  return null;
}
