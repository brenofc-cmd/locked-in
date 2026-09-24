import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth-routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links in auth emails (sign-up confirmation, password
 * recovery). Handles both link styles Supabase can send:
 *   ?token_hash=…&type=…  (recommended template, works in any browser)
 *   ?code=…               (default template, PKCE: same browser that asked)
 * On success the session cookie is set and the user goes to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash }))
      .error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  const to = request.nextUrl.clone();
  to.search = "";
  if (ok) {
    const [path, query] = next.split("?");
    to.pathname = path;
    to.search = query ? `?${query}` : "";
  } else {
    to.pathname = "/login";
    to.searchParams.set("error", "link");
  }
  return NextResponse.redirect(to);
}
