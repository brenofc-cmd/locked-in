/**
 * ISSUE-001 (docs/DECISIONS.md → ADR-063): PostgREST sometimes rejects a
 * valid access token with 401 PGRST303 "JWT issued at future" on the first
 * requests after it has been idle while a new token was issued (its cached
 * clock is still behind the token's `iat`). Seen in production with the same
 * JWT succeeding on parallel requests of the same render.
 *
 * This fetch repeats such a request exactly once, immediately, with the same
 * URL, headers and body (PostgREST rejects the JWT before running anything, so
 * repeating a POST is safe). Every other response — including every other
 * 401 (expired, bad signature, anonymous) — is returned untouched, and a
 * second rejection is returned as is: nothing is hidden and nothing loops.
 * Stateless: no token, response or user data is kept between calls.
 */
export function isIssuedAtFutureRejection(
  status: number,
  body: unknown,
): boolean {
  if (status !== 401 || !body || typeof body !== "object") return false;
  const { code, message } = body as { code?: unknown; message?: unknown };
  return (
    code === "PGRST303" &&
    typeof message === "string" &&
    /issued at future/i.test(message)
  );
}

async function readRejection(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  if (!response.headers.get("content-type")?.includes("json")) return false;
  try {
    return isIssuedAtFutureRejection(401, await response.clone().json());
  } catch {
    return false;
  }
}

export function withIssuedAtRetry(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    // A Request body is a one-shot stream; postgrest-js always passes a URL
    // and a string body, which can be sent twice.
    const repeatable = !(input instanceof Request) || input.body === null;
    const first = await base(input, init);
    if (!repeatable || !(await readRejection(first))) return first;
    return base(input, init);
  };
}

/** The fetch every Supabase client of the app uses (server, proxy, browser). */
export const supabaseFetch: typeof fetch = (input, init) =>
  withIssuedAtRetry(globalThis.fetch)(input, init);
