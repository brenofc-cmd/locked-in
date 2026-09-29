"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { restoreTarget } from "@/lib/resume-state";

/**
 * Rendered only at `/`: reads this user's last safe route from the device
 * and replaces the entry (so Back never returns to `/`). Storage exists only
 * in the browser, hence an effect; the server renders the empty app surface.
 */
export function ResumeEntry({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(restoreTarget(userId));
  }, [router, userId]);
  return <div aria-busy="true" className="h-dvh bg-bg" />;
}
