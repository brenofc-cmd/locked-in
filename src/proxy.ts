import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation, the PWA
    // manifest (installable without a session), the service worker and its
    // offline page (V2 Phase 10: the same for everyone, no data).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
