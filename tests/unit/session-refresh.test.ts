// @vitest-environment node
/**
 * ISSUE-001 regression (docs/DECISIONS.md → ADR-063): the session on the
 * first load after idle, with controlled tokens instead of a 60-minute wait.
 * The real @supabase/ssr + supabase-js stack runs against a fake Supabase
 * (Auth token endpoint, JWKS and PostgREST) behind a stubbed global fetch.
 */
import { NextRequest } from "next/server";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const SUPABASE_URL = "https://issue001ref.supabase.co";
const COOKIE = "sb-issue001ref-auth-token";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

// ---------------------------------------------------------------- next/headers
// The server client reads cookies() once when created; each test sets what
// the render would receive (the cookies forwarded by the proxy).
let renderCookies: { name: string; value: string }[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = [...renderCookies];
    return {
      getAll: () => jar,
      set: () => {
        throw new Error("Server Components cannot set cookies");
      },
    };
  },
}));

// ---------------------------------------------------------------- tokens
const enc = (s: string) => Buffer.from(s).toString("base64url");
let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let jwk: JsonWebKey & { kid: string; alg: string; use: string };
const KID = "issue-001-test-key";

async function jwt(
  sub: string,
  { iat, exp, key = signingKey }: { iat: number; exp: number; key?: CryptoKey },
) {
  const header = enc(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const payload = enc(
    JSON.stringify({
      sub,
      iat,
      exp,
      aud: "authenticated",
      role: "authenticated",
      iss: `${SUPABASE_URL}/auth/v1`,
      email: `${sub.slice(0, 1)}@example.com`,
      session_id: `session-${sub}`,
    }),
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${Buffer.from(sig).toString("base64url")}`;
}

const now = () => Math.floor(Date.now() / 1000);

type Session = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: { id: string; aud: string; role: string; email: string };
};

async function session(
  sub: string,
  refresh: string,
  { expired = false, key }: { expired?: boolean; key?: CryptoKey } = {},
): Promise<Session> {
  const iat = expired ? now() - 3700 : now() - 60;
  const exp = iat + 3600;
  return {
    access_token: await jwt(sub, { iat, exp, key }),
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: sub,
      aud: "authenticated",
      role: "authenticated",
      email: `${sub.slice(0, 1)}@example.com`,
    },
  };
}

const cookieValue = (s: Session) => `base64-${enc(JSON.stringify(s))}`;

function readCookieSession(value: string | undefined): Session | null {
  if (!value) return null;
  return JSON.parse(
    Buffer.from(value.replace(/^base64-/, ""), "base64url").toString(),
  );
}

// ---------------------------------------------------------------- fake Supabase
type Call = { path: string; method: string; auth: string | null; body: string };
let calls: Call[];
/** refresh_token -> the session the token endpoint returns (rotated). */
let refreshable: Map<string, Session>;
/** PostgREST path -> how many of its next requests answer "issued at future". */
let issuedAtFuture: Map<string, number>;
/** Every PostgREST request answers 401 PGRST303 "JWT expired". */
let postgrestRejectsAll: boolean;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const FEED = Array.from({ length: 3 }, (_, i) => ({
  id: `event-${i}`,
  actor_id: A,
  event_type: "task_completed",
  target_id: null,
  title: `Task ${i}`,
  duration_seconds: null,
  created_at: new Date(Date.now() - i * 1000).toISOString(),
  reactions: [],
}));

async function fakeSupabase(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init?.headers);
  const call: Call = {
    path: url.pathname,
    method: init?.method ?? "GET",
    auth: headers.get("authorization"),
    body: typeof init?.body === "string" ? init.body : "",
  };
  calls.push(call);

  if (url.pathname === "/auth/v1/.well-known/jwks.json")
    return json({ keys: [jwk] });
  if (url.pathname === "/auth/v1/token") {
    const { refresh_token } = JSON.parse(call.body);
    const next = refreshable.get(refresh_token);
    if (!next)
      return json(
        {
          code: 400,
          error_code: "refresh_token_not_found",
          msg: "Invalid Refresh Token: Refresh Token Not Found",
        },
        400,
      );
    return json(next);
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const path = url.pathname.slice("/rest/v1".length);
    const bearerSub = subOf(call.auth);
    if (postgrestRejectsAll || !bearerSub)
      return json(
        { code: "PGRST303", details: null, hint: null, message: "JWT expired" },
        401,
      );
    const left = issuedAtFuture.get(path) ?? 0;
    if (left > 0) {
      issuedAtFuture.set(path, left - 1);
      return json(
        {
          code: "PGRST303",
          details: null,
          hint: null,
          message: "JWT issued at future",
        },
        401,
      );
    }
    switch (path) {
      case "/activity_events":
        // RLS: the caller's duo only (here: the caller's own events).
        return json(FEED.map((e) => ({ ...e, actor_id: bearerSub })));
      case "/rpc/partner_today":
      case "/rpc/partner_current_focus":
        return json([]);
      case "/user_presence":
        return json(null);
      case "/rpc/server_now":
        return json(new Date().toISOString());
      case "/profiles":
        return json([{ id: bearerSub }]);
      default:
        return json([]);
    }
  }
  throw new Error(`unexpected request ${url}`);
}

/** The `sub` of a bearer token, without verifying (the fake trusts the test). */
function subOf(auth: string | null): string | null {
  const token = auth?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return null;
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  return typeof payload.sub === "string" ? payload.sub : null;
}

const rest = (path: string) =>
  calls.filter((c) => c.path === `/rest/v1${path}`);
const refreshes = () => calls.filter((c) => c.path === "/auth/v1/token");

// ---------------------------------------------------------------- helpers
async function proxy(path: string, cookie?: string) {
  const { updateSession } = await import("@/lib/supabase/proxy");
  const request = new NextRequest(`https://app.test${path}`, {
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
  });
  return updateSession(request);
}

/** The cookies the proxy hands to the render (what cookies() will return). */
function forwarded(response: Response): { name: string; value: string }[] {
  const header = response.headers.get("x-middleware-request-cookie") ?? "";
  return header
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      return {
        name: pair.slice(0, i),
        value: decodeURIComponent(pair.slice(i + 1)),
      };
    });
}

async function renderClient(cookies: { name: string; value: string }[]) {
  renderCookies = cookies;
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

// ---------------------------------------------------------------- setup
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  signingKey = pair.privateKey;
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk = { ...exported, kid: KID, alg: "ES256", use: "sig" };
  foreignKey = (
    await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )
  ).privateKey;
});

beforeEach(() => {
  calls = [];
  refreshable = new Map();
  issuedAtFuture = new Map();
  postgrestRejectsAll = false;
  renderCookies = [];
  vi.stubGlobal("fetch", vi.fn(fakeSupabase));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- the fetch
describe("withIssuedAtRetry (ADR-063)", () => {
  const issuedAtFutureBody = {
    code: "PGRST303",
    details: null,
    hint: null,
    message: "JWT issued at future",
  };

  it("repeats a spurious 'JWT issued at future' exactly once, with the same request", async () => {
    const { withIssuedAtRetry } = await import("@/lib/supabase/fetch");
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(issuedAtFutureBody, 401))
      .mockResolvedValueOnce(json([{ id: 1 }]));
    const init = {
      method: "POST",
      headers: { authorization: "Bearer A" },
      body: '{"x":1}',
    };
    const res = await withIssuedAtRetry(base)("https://x/rest/v1/rpc/f", init);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1]).toEqual(["https://x/rest/v1/rpc/f", init]);
  });

  it("never repeats more than once: a second rejection is returned as is", async () => {
    const { withIssuedAtRetry } = await import("@/lib/supabase/fetch");
    const base = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(issuedAtFutureBody, 401));
    const res = await withIssuedAtRetry(base)("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe("JWT issued at future");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an expired JWT", 401, { code: "PGRST303", message: "JWT expired" }],
    ["a bad signature", 401, { code: "PGRST301", message: "JWSError" }],
    ["anonymous access", 401, { code: "42501", message: "permission denied" }],
    [
      "a forbidden request",
      403,
      { code: "42501", message: "issued at future" },
    ],
    ["a success", 200, []],
  ])("never repeats %s", async (_, status, body) => {
    const { withIssuedAtRetry } = await import("@/lib/supabase/fetch");
    const base = vi.fn<typeof fetch>().mockResolvedValue(json(body, status));
    const res = await withIssuedAtRetry(base)("https://x/rest/v1/t");
    expect(res.status).toBe(status);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("never repeats a non-JSON 401", async () => {
    const { withIssuedAtRetry } = await import("@/lib/supabase/fetch");
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("issued at future", { status: 401 }));
    await withIssuedAtRetry(base)("https://x/rest/v1/t");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("keeps parallel requests of two users apart (each repeat carries its own token)", async () => {
    const { withIssuedAtRetry } = await import("@/lib/supabase/fetch");
    const seen: string[] = [];
    let rejected = 0;
    const base = vi.fn<typeof fetch>(async (_input, init) => {
      const auth = new Headers(init?.headers).get("authorization")!;
      seen.push(auth);
      // The first request of each user is refused once.
      if (rejected < 2 && seen.filter((a) => a === auth).length === 1) {
        rejected++;
        return json(issuedAtFutureBody, 401);
      }
      return json({ owner: auth });
    });
    const f = withIssuedAtRetry(base);
    const [a, b] = await Promise.all([
      f("https://x/rest/v1/t", { headers: { authorization: "Bearer A" } }),
      f("https://x/rest/v1/t", { headers: { authorization: "Bearer B" } }),
    ]);
    expect(await a.json()).toEqual({ owner: "Bearer A" });
    expect(await b.json()).toEqual({ owner: "Bearer B" });
    expect(seen.sort()).toEqual([
      "Bearer A",
      "Bearer A",
      "Bearer B",
      "Bearer B",
    ]);
  });
});

// ---------------------------------------------------------------- the proxy
describe("proxy → render: one consistent session per request", () => {
  it("valid session: no refresh, the render and every parallel query use it", async () => {
    const s = await session(A, "rt-a");
    const res = await proxy("/today", cookieValue(s));
    expect(res.headers.get("location")).toBeNull();
    expect(refreshes()).toHaveLength(0);

    const supabase = await renderClient([
      { name: COOKIE, value: cookieValue(s) },
    ]);
    await Promise.all([
      supabase.from("profiles").select("id"),
      supabase.from("activity_events").select("*"),
      supabase.rpc("partner_today"),
      supabase.rpc("server_now"),
    ]);
    const bearers = new Set(
      calls.filter((c) => c.path.startsWith("/rest/")).map((c) => c.auth),
    );
    expect(bearers).toEqual(new Set([`Bearer ${s.access_token}`]));
  });

  it("case A — expired access token + valid refresh token: one refresh, the render gets the new session", async () => {
    const old = await session(A, "rt-a-old", { expired: true });
    const fresh = await session(A, "rt-a-new");
    refreshable.set("rt-a-old", fresh);

    const res = await proxy("/today", cookieValue(old));
    expect(res.headers.get("location")).toBeNull(); // no redirect: /today loads
    expect(refreshes()).toHaveLength(1);
    // The browser receives the rotated session…
    expect(
      readCookieSession(res.cookies.get(COOKIE)?.value)?.refresh_token,
    ).toBe("rt-a-new");
    // …and so does this very render (never the stale cookie).
    const toRender = forwarded(res);
    const rendered = readCookieSession(
      toRender.find((c) => c.name === COOKIE)?.value,
    );
    expect(rendered?.access_token).toBe(fresh.access_token);

    // First open of /today after idle: the layout's parallel bootstrap.
    const supabase = await renderClient(toRender);
    const { data: claims } = await supabase.auth.getClaims();
    expect(claims?.claims.sub).toBe(A);
    await Promise.all([
      supabase.from("profiles").select("id"),
      supabase.from("duos").select("id"),
      supabase.from("activity_events").select("*"),
      supabase.rpc("partner_today"),
      supabase.rpc("partner_current_focus"),
      supabase.rpc("server_now"),
    ]);
    const restCalls = calls.filter((c) => c.path.startsWith("/rest/"));
    expect(restCalls).toHaveLength(6);
    expect(new Set(restCalls.map((c) => c.auth))).toEqual(
      new Set([`Bearer ${fresh.access_token}`]),
    );
    expect(refreshes()).toHaveLength(1); // the render never refreshes again
  });

  it("case B — refresh token invalid: clean redirect to /login, cookie cleared, no query runs", async () => {
    const old = await session(A, "rt-revoked", { expired: true });
    const res = await proxy("/today", cookieValue(old));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/today");
    expect(res.cookies.get(COOKIE)?.value ?? "").toBe("");
    expect(refreshes()).toHaveLength(1); // tried once, not in a loop
    expect(calls.filter((c) => c.path.startsWith("/rest/"))).toHaveLength(0);
  });

  it("case B — invalid session (token signed by another key): redirect to /login", async () => {
    const forged = await session(A, "rt-a", { key: foreignKey });
    const res = await proxy("/today", cookieValue(forged));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("case B — unreadable session cookie: redirect to /login", async () => {
    const res = await proxy("/today", "base64-not-a-session");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("the session-ended login is never bounced back to /today (no redirect loop)", async () => {
    const s = await session(A, "rt-a");
    const bounced = await proxy("/login", cookieValue(s));
    expect(new URL(bounced.headers.get("location")!).pathname).toBe("/today");
    const shown = await proxy("/login?reason=session", cookieValue(s));
    expect(shown.headers.get("location")).toBeNull();
  });

  it("users A and B refreshing at the same time each get only their own session", async () => {
    refreshable.set("rt-a-old", await session(A, "rt-a-new"));
    refreshable.set("rt-b-old", await session(B, "rt-b-new"));
    const [ra, rb] = await Promise.all([
      proxy(
        "/today",
        cookieValue(await session(A, "rt-a-old", { expired: true })),
      ),
      proxy(
        "/today",
        cookieValue(await session(B, "rt-b-old", { expired: true })),
      ),
    ]);
    const a = await renderClient(forwarded(ra));
    const b = await renderClient(forwarded(rb));
    const [feedA, feedB] = await Promise.all([
      a.from("activity_events").select("*"),
      b.from("activity_events").select("*"),
    ]);
    expect(feedA.data?.every((e) => e.actor_id === A)).toBe(true);
    expect(feedB.data?.every((e) => e.actor_id === B)).toBe(true);
    for (const c of rest("/activity_events")) {
      expect([A, B]).toContain(subOf(c.auth));
    }
  });
});

// ---------------------------------------------------------------- the render
describe("first load after idle (the production event of 2026-09-29)", () => {
  it("a spurious 'issued at future' on the feed is repeated once: the feed loads, not duplicated", async () => {
    const { loadDuoData } = await import("@/lib/duo-data");
    const s = await session(A, "rt-a");
    issuedAtFuture.set("/activity_events", 1);
    const supabase = await renderClient([
      { name: COOKIE, value: cookieValue(s) },
    ]);

    const duo = await loadDuoData(supabase, A);
    expect(duo.feed).toHaveLength(FEED.length);
    expect(new Set(duo.feed.map((e) => e.id)).size).toBe(FEED.length);
    expect(rest("/activity_events")).toHaveLength(2);
    expect(new Set(rest("/activity_events").map((c) => c.auth))).toEqual(
      new Set([`Bearer ${s.access_token}`]),
    );
    // The other parallel reads were not repeated.
    expect(rest("/rpc/partner_today")).toHaveLength(1);
    expect(refreshes()).toHaveLength(0);
  });

  it("a persistent rejection is not hidden and not looped: two tries, then the error", async () => {
    const { loadDuoData } = await import("@/lib/duo-data");
    const s = await session(A, "rt-a");
    issuedAtFuture.set("/activity_events", 99);
    const supabase = await renderClient([
      { name: COOKIE, value: cookieValue(s) },
    ]);
    await expect(loadDuoData(supabase, A)).rejects.toThrow();
    expect(rest("/activity_events")).toHaveLength(2);
  });
});

describe("isSessionRejected (layout backstop, case B)", () => {
  it("is false for a healthy session (a real load error stays an error)", async () => {
    const { isSessionRejected } = await import("@/lib/session");
    renderCookies = [
      { name: COOKIE, value: cookieValue(await session(A, "rt")) },
    ];
    await expect(isSessionRejected()).resolves.toBe(false);
  });

  it("is false after a single spurious 'issued at future'", async () => {
    const { isSessionRejected } = await import("@/lib/session");
    renderCookies = [
      { name: COOKIE, value: cookieValue(await session(A, "rt")) },
    ];
    issuedAtFuture.set("/rpc/server_now", 1);
    await expect(isSessionRejected()).resolves.toBe(false);
    expect(rest("/rpc/server_now")).toHaveLength(2);
  });

  it("is true when the database refuses the session", async () => {
    const { isSessionRejected } = await import("@/lib/session");
    renderCookies = [
      { name: COOKIE, value: cookieValue(await session(A, "rt")) },
    ];
    postgrestRejectsAll = true;
    await expect(isSessionRejected()).resolves.toBe(true);
    expect(rest("/rpc/server_now")).toHaveLength(1); // "JWT expired" is not repeated
  });

  it("is true without a session", async () => {
    const { isSessionRejected } = await import("@/lib/session");
    renderCookies = [];
    await expect(isSessionRejected()).resolves.toBe(true);
    expect(calls.filter((c) => c.path.startsWith("/rest/"))).toHaveLength(0);
  });
});
