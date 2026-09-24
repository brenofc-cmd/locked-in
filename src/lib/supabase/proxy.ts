import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isPublicPath, isGuestOnlyPath, safeNext } from "@/lib/auth-routes";
import { supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie on every request (official
 * @supabase/ssr pattern) and applies route protection:
 *   signed out + private path  -> /login?next=<path>
 *   signed in  + login/signup  -> /today
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): getClaims
  // validates the JWT and triggers the refresh that keeps users signed in.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search =
      pathname === "/"
        ? ""
        : `?next=${encodeURIComponent(safeNext(pathname + search))}`;
    return redirectWithCookies(to, response);
  }

  if (signedIn && isGuestOnlyPath(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/today";
    to.search = "";
    return redirectWithCookies(to, response);
  }

  return response;
}

/** A redirect must carry any refreshed session cookies, or the user is logged out. */
function redirectWithCookies(to: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(to);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  from.headers.forEach((v, k) => {
    if (k.toLowerCase() === "cache-control") redirect.headers.set(k, v);
  });
  return redirect;
}
