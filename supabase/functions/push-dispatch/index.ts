/**
 * Edge Function `push-dispatch` (V2 Phase 10, docs/WEB_PUSH.md).
 *
 * Woken by `private.push_tick()` (pg_cron → pg_net) only when deliveries are
 * waiting. Authenticated by the `x-li-dispatch` header, compared with the
 * dispatch secret kept in Supabase Vault (generated inside the database —
 * nobody types it). It reaches the database with the platform's own
 * connection (SUPABASE_DB_URL), so no service-role key exists anywhere else.
 *
 * Logs carry counts only: never an endpoint, a key, a payload or a user id.
 */
import postgres from "npm:postgres@3.4.7";
import { deliver, type Claimed } from "./message.ts";
import {
  generateVapidKeys,
  importVapidPrivateKey,
  type Vapid,
} from "./webpush.ts";

const SUBJECT = "https://locked-in-rust.vercel.app";
const BATCH = 25;
const BUDGET_MS = 20_000;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", {
  prepare: false,
  max: 2,
});

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  );
}

/** Constant-time comparison of the header and the vault secret. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && expected.length > 0;
}

async function vaultSecret(name: string): Promise<string | null> {
  const rows =
    await sql`select decrypted_secret from vault.decrypted_secrets where name = ${name}`;
  return (rows[0]?.decrypted_secret as string | undefined) ?? null;
}

/**
 * The VAPID key pair of this environment. Generated once, here, and stored in
 * the vault: the private key is never printed, returned or logged.
 */
async function loadVapid(): Promise<Vapid> {
  let privateJwk = await vaultSecret("push_vapid_private_jwk");
  let publicKey = await vaultSecret("push_vapid_public_key");
  if (!privateJwk || !publicKey) {
    const keys = await generateVapidKeys();
    try {
      await sql.begin(async (tx) => {
        await tx`select vault.create_secret(${keys.privateJwk}, 'push_vapid_private_jwk', 'LOCKED IN Web Push: VAPID private key (JWK)')`;
        await tx`select vault.create_secret(${keys.publicKey}, 'push_vapid_public_key', 'LOCKED IN Web Push: VAPID public key')`;
      });
      console.log("push-dispatch: VAPID key pair created");
    } catch {
      // Another run created it first: use that one.
    }
    privateJwk = await vaultSecret("push_vapid_private_jwk");
    publicKey = await vaultSecret("push_vapid_public_key");
    if (!privateJwk || !publicKey) throw new Error("vapid_unavailable");
  }
  return {
    publicKey,
    privateKey: await importVapidPrivateKey(privateJwk),
    subject: SUBJECT,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("method not allowed", { status: 405 });
  const secret = await vaultSecret("push_dispatch_secret");
  if (
    !secret ||
    !(await sameSecret(req.headers.get("x-li-dispatch") ?? "", secret))
  ) {
    return new Response("unauthorized", { status: 401 });
  }

  const vapid = await loadVapid();
  const started = Date.now();
  const counts = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0 };

  while (Date.now() - started < BUDGET_MS) {
    const rows =
      (await sql`select * from private.push_claim(${BATCH})`) as unknown as Claimed[];
    if (rows.length === 0) break;
    counts.claimed += rows.length;
    for (const row of rows) {
      const { results, reason } = await deliver(row, vapid);
      const [done] =
        await sql`select private.push_finish(${row.delivery_id}::uuid, ${sql.json(results)}, ${reason}) as status`;
      const status = done?.status as string | null;
      if (status === "sent") counts.sent++;
      else if (status === "pending") counts.retry++;
      else if (status === "skipped") counts.skipped++;
      else counts.failed++;
    }
  }

  console.log(`push-dispatch: ${JSON.stringify(counts)}`);
  return Response.json(counts);
});
