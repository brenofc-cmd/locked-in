import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or prefetch can never sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  // 303: the browser follows with GET.
  return NextResponse.redirect(to, 303);
}
