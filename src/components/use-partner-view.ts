"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { partnerView } from "@/lib/partner";

/**
 * The partner's status for any screen (V2 Phase 2): EM FOCO > ONLINE >
 * OFFLINE + last seen, all from partnerView(). While a last seen is on
 * screen, only the components using this hook redraw once a minute so
 * "há 4 min" stays true; nothing is fetched.
 */
export function usePartnerView() {
  const app = useApp();
  const { me } = useSession();
  const showsSeen = app.partner.status === "offline" && !!app.partner.seenAt;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!showsSeen) return;
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [showsSeen]);
  const now = Math.max(app.now, tick);
  return partnerView(
    app.partner,
    app.partnerCounts,
    app.feed,
    now,
    me.timezone,
  );
}
