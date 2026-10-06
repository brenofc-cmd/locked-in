/**
 * Web Push without a library (V2 Phase 10, docs/WEB_PUSH.md): the message
 * encryption of RFC 8291 (aes128gcm, RFC 8188) and the VAPID authorization
 * of RFC 8292, on WebCrypto only — the same code runs in the Edge Function
 * (Deno) and in the unit tests (Node). Keys never leave this module in a log.
 */

const enc = new TextEncoder();

/** Base64url without padding (the encoding of every Web Push key). */
export function b64uEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ikm as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: info as BufferSource,
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** A P-256 JWK from an uncompressed public key (65 bytes) and a private scalar. */
export function p256Jwk(
  publicKey: Uint8Array,
  privateKey?: Uint8Array,
): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4)
    throw new Error("bad_public_key");
  return {
    kty: "EC",
    crv: "P-256",
    x: b64uEncode(publicKey.slice(1, 33)),
    y: b64uEncode(publicKey.slice(33, 65)),
    ...(privateKey ? { d: b64uEncode(privateKey) } : {}),
    ext: true,
  };
}

export type EncryptOptions = {
  /** Fixed values for the RFC 8291 test vector; random otherwise. */
  salt?: Uint8Array;
  serverKeys?: CryptoKeyPair;
  recordSize?: number;
};

/**
 * Encrypts one push message for a subscription (keys from
 * `PushSubscription.toJSON().keys`). Single record, no padding.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  authSecret: string,
  opts: EncryptOptions = {},
): Promise<Uint8Array> {
  const uaPublic = b64uDecode(p256dh);
  const auth = b64uDecode(authSecret);
  if (uaPublic.length !== 65 || auth.length !== 16)
    throw new Error("bad_subscription_keys");
  const server =
    opts.serverKeys ??
    (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ));
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", server.publicKey),
  );
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey },
      server.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    auth,
    ecdh,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    enc.encode("Content-Encoding: nonce\0"),
    12,
  );
  const recordSize = opts.recordSize ?? 4096;
  const record = concat(plaintext, new Uint8Array([2]));
  if (record.length + 16 > recordSize) throw new Error("payload_too_large");
  const key = await crypto.subtle.importKey(
    "raw",
    cek as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      key,
      record as BufferSource,
    ),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

export type Vapid = {
  /** Base64url uncompressed P-256 public key (the client's applicationServerKey). */
  publicKey: string;
  /** ECDSA P-256 private key (signing only). */
  privateKey: CryptoKey;
  /** "https:" or "mailto:" contact for the push services. */
  subject: string;
};

/** RFC 8292 `Authorization: vapid t=<jwt>, k=<public key>` for an endpoint. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: Vapid,
  nowMs = Date.now(),
): Promise<string> {
  const json = (o: unknown) => b64uEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${json({ typ: "JWT", alg: "ES256" })}.${json({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: vapid.subject,
  })}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.privateKey,
      enc.encode(unsigned) as BufferSource,
    ),
  );
  return `vapid t=${unsigned}.${b64uEncode(signature)}, k=${vapid.publicKey}`;
}

/** A new VAPID key pair: the private key as JWK (for the vault), the public as base64url. */
export async function generateVapidKeys(): Promise<{
  privateJwk: string;
  publicKey: string;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  return { privateJwk: JSON.stringify(jwk), publicKey: b64uEncode(raw) };
}

export async function importVapidPrivateKey(
  privateJwk: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateJwk) as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type SendOptions = {
  /** Seconds the push service may keep the message for an offline device. */
  ttl: number;
  urgency: "very-low" | "low" | "normal" | "high";
  /** Replaces an undelivered message with the same topic (≤ 32 url-safe chars). */
  topic?: string;
};

/**
 * Sends one encrypted message; returns the push service's HTTP status
 * (0 = network failure). Never throws for a delivery problem.
 */
export async function sendPush(
  target: PushTarget,
  payload: Uint8Array,
  vapid: Vapid,
  opts: SendOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  try {
    const body = await encryptPayload(payload, target.p256dh, target.auth);
    const headers: Record<string, string> = {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.floor(opts.ttl))),
      Urgency: opts.urgency,
    };
    if (opts.topic) headers.Topic = opts.topic;
    const res = await fetchImpl(target.endpoint, {
      method: "POST",
      headers,
      body: body as BodyInit,
    });
    // The body is not needed (and may echo identifiers); drop it.
    await res.body?.cancel();
    return res.status;
  } catch {
    return 0;
  }
}
