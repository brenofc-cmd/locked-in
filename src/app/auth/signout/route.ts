import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or prefetch can never sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // V2 Phase 10 (docs/WEB_PUSH.md → Sign-out): this device's push
  // subscription goes with the session, so the next person on this browser
  // never receives this user's notifications. RLS: only the caller's row.
  const form = await request.formData().catch(() => null);
  const endpoint = form?.get("push_endpoint");
  if (
    typeof endpoint === "string" &&
    endpoint.length > 0 &&
    endpoint.length <= 1024
  ) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }

  // "local": signs out this browser only. The default ("global") would also
  // end the user's sessions on every other device.
  await supabase.auth.signOut({ scope: "local" });

  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  // 303: the browser follows with GET.
  return NextResponse.redirect(to, 303);
}
