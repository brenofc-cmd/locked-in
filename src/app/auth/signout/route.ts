import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or prefetch can never sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // "local": signs out this browser only. The default ("global") would also
  // end the user's sessions on every other device.
  await supabase.auth.signOut({ scope: "local" });

  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  // 303: the browser follows with GET.
  return NextResponse.redirect(to, 303);
}
