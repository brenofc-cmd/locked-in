// @vitest-environment node
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  verify,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  b64uDecode,
  b64uEncode,
  encryptPayload,
  generateVapidKeys,
  importVapidPrivateKey,
  p256Jwk,
  sendPush,
  vapidAuthorization,
  type Vapid,
} from "../../supabase/functions/push-dispatch/webpush.ts";
import {
  PUSH_ROUTES,
  buildMessage,
  deliver,
  isPushService,
  whenText,
  type Claimed,
} from "../../supabase/functions/push-dispatch/message.ts";

// RFC 8291, Appendix A.
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Independent RFC 8291 decryption with node:crypto (the user agent's side). */
function decrypt(
  body: Uint8Array,
  uaPrivate: Uint8Array,
  uaPublic: Uint8Array,
  auth: Uint8Array,
) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const sealed = buf.subarray(21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(uaPrivate));
  const shared = ecdh.computeSecret(asPublic);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    Buffer.from(uaPublic),
    asPublic,
  ]);
  const ikm = Buffer.from(
    hkdfSync("sha256", shared, Buffer.from(auth), info, 32),
  );
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - 16)),
    decipher.final(),
  ]);
  expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

async function rfcServerKeys(): Promise<CryptoKeyPair> {
  const pub = b64uDecode(RFC.asPublic);
  const jwk = p256Jwk(pub, b64uDecode(RFC.asPrivate));
  const { d: _d, ...publicJwk } = jwk;
  void _d;
  return {
    privateKey: await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ),
    publicKey: await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    ),
  };
}

async function testVapid(): Promise<Vapid> {
  const keys = await generateVapidKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: await importVapidPrivateKey(keys.privateJwk),
    subject: "https://locked-in.test",
  };
}

function newDevice() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = new Uint8Array(16).map((_, i) => i * 7 + 1);
  return {
    priv: new Uint8Array(ecdh.getPrivateKey()),
    pub: new Uint8Array(ecdh.getPublicKey()),
    auth,
    p256dh: b64uEncode(new Uint8Array(ecdh.getPublicKey())),
    authB64: b64uEncode(auth),
  };
}

describe("base64url", () => {
  it("round-trips bytes and accepts padding", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(b64uDecode(b64uEncode(bytes))).toEqual(bytes);
    expect(b64uEncode(bytes)).not.toMatch(/[+/=]/);
    expect(b64uDecode("AQID==")).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("RFC 8291 encryption", () => {
  it("produces the RFC 8291 Appendix A message byte for byte", async () => {
    const body = await encryptPayload(
      b64uDecode(RFC.plaintext),
      RFC.uaPublic,
      RFC.auth,
      {
        salt: b64uDecode(RFC.salt),
        serverKeys: await rfcServerKeys(),
        recordSize: 4096,
      },
    );
    expect(b64uEncode(body)).toBe(RFC.body);
  });

  it("is decrypted by an independent implementation (random keys and salt)", async () => {
    const device = newDevice();
    const message = JSON.stringify({
      t: "Prova amanhã",
      b: "Física",
      r: "planner",
    });
    const body = await encryptPayload(
      new TextEncoder().encode(message),
      device.p256dh,
      device.authB64,
    );
    expect(decrypt(body, device.priv, device.pub, device.auth)).toBe(message);
    const again = await encryptPayload(
      new TextEncoder().encode(message),
      device.p256dh,
      device.authB64,
    );
    expect(b64uEncode(again)).not.toBe(b64uEncode(body)); // fresh salt + server key each time
  });

  it("refuses malformed subscription keys and oversized payloads", async () => {
    const device = newDevice();
    await expect(
      encryptPayload(new Uint8Array(1), "AAAA", device.authB64),
    ).rejects.toThrow("bad_subscription_keys");
    await expect(
      encryptPayload(new Uint8Array(5000), device.p256dh, device.authB64),
    ).rejects.toThrow("payload_too_large");
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs an ES256 JWT for the endpoint's origin that verifies with the public key", async () => {
    const vapid = await testVapid();
    const header = await vapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      vapid,
      1_800_000_000_000,
    );
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, p, s, k] = m!;
    expect(k).toBe(vapid.publicKey);
    const payload = JSON.parse(Buffer.from(b64uDecode(p)).toString());
    expect(payload).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_800_000_000 + 12 * 3600,
      sub: "https://locked-in.test",
    });
    expect(JSON.parse(Buffer.from(b64uDecode(h)).toString())).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    const key = createPublicKey({
      key: { ...p256Jwk(b64uDecode(k)) } as import("node:crypto").JsonWebKey,
      format: "jwk",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${h}.${p}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(b64uDecode(s)),
      ),
    ).toBe(true);
  });

  it("keeps the private key out of the generated public material", async () => {
    const keys = await generateVapidKeys();
    expect(b64uDecode(keys.publicKey)).toHaveLength(65);
    expect(JSON.parse(keys.privateJwk)).toMatchObject({
      kty: "EC",
      crv: "P-256",
    });
    expect(keys.publicKey).not.toContain(JSON.parse(keys.privateJwk).d);
  });
});

describe("sendPush", () => {
  it("posts an aes128gcm body with VAPID, TTL and urgency, and returns the status", async () => {
    const device = newDevice();
    const vapid = await testVapid();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const status = await sendPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/x",
        p256dh: device.p256dh,
        auth: device.authB64,
      },
      new TextEncoder().encode("{}"),
      vapid,
      { ttl: 3600, urgency: "high" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(status).toBe(201);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://fcm.googleapis.com/fcm/send/x");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("3600");
    expect(headers.Urgency).toBe("high");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(
      decrypt(init.body as Uint8Array, device.priv, device.pub, device.auth),
    ).toBe("{}");
  });

  it("maps a network failure to 0 instead of throwing", async () => {
    const device = newDevice();
    const status = await sendPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/x",
        p256dh: device.p256dh,
        auth: device.authB64,
      },
      new Uint8Array(2),
      await testVapid(),
      { ttl: 60, urgency: "normal" },
      (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
    );
    expect(status).toBe(0);
  });
});

describe("messages", () => {
  it("says when an event is, in Portuguese", () => {
    expect(whenText(0, null)).toBe("hoje");
    expect(whenText(0, "14:00")).toBe("hoje às 14:00");
    expect(whenText(1, null)).toBe("amanhã");
    expect(whenText(3, "09:00")).toBe("em 3 dias");
  });

  it("builds every kind, opening a whitelisted route", () => {
    const planner = buildMessage({
      kind: "planner",
      hide_details: false,
      data: { title: "Física", type: "exam", days: 1, time: null },
    });
    expect(planner).toEqual({
      title: "Prova amanhã",
      body: "Física",
      route: "planner",
      tag: "planner",
    });
    const nudge = buildMessage({
      kind: "nudge",
      hide_details: false,
      data: { from: "Matheus", commitment: "2h de foco" },
    });
    expect(nudge).toMatchObject({
      title: "Matheus deu um toque",
      body: "Compromisso: 2h de foco",
      route: "partner",
    });
    for (const kind of [
      "review_day",
      "review_week",
      "plan_week",
      "test",
    ] as const) {
      const m = buildMessage({ kind, hide_details: false, data: {} });
      expect(m && m.route in PUSH_ROUTES).toBe(true);
    }
    expect(
      buildMessage({ kind: "plan_week", hide_details: false, data: {} })?.route,
    ).toBe("plan-week");
  });

  it("hides details on request and never carries the event or the commitment then", () => {
    const planner = buildMessage({
      kind: "planner",
      hide_details: true,
      data: { title: "Física", type: "exam", days: 1 },
    });
    const nudge = buildMessage({
      kind: "nudge",
      hide_details: true,
      data: { from: "Matheus", commitment: "2h de foco" },
    });
    expect(JSON.stringify([planner, nudge])).not.toMatch(
      /Física|Matheus|2h de foco/,
    );
  });

  it("returns null when the source is gone (event deleted, nudge gone)", () => {
    expect(
      buildMessage({ kind: "planner", hide_details: false, data: null }),
    ).toBeNull();
    expect(
      buildMessage({ kind: "nudge", hide_details: false, data: {} }),
    ).toBeNull();
  });

  it("trims long titles and rejects a malformed time", () => {
    const m = buildMessage({
      kind: "planner",
      hide_details: false,
      data: { title: "x".repeat(300), type: "??", days: 0, time: "25:99:00" },
    });
    expect(m?.body).toHaveLength(80);
    expect(m?.title).toBe("Evento hoje");
  });
});

describe("push service allowlist", () => {
  it("accepts the real push services only", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ])
      expect(isPushService(ok)).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com/",
      "https://localhost:3100/push",
      "https://169.254.169.254/latest",
    ])
      expect(isPushService(bad)).toBe(false);
  });
});

describe("deliver", () => {
  const vapidP = testVapid();
  const claimed = (
    subs: Claimed["subscriptions"],
    over: Partial<Claimed> = {},
  ): Claimed => ({
    delivery_id: "11111111-2222-4333-8444-555555555555",
    kind: "test",
    hide_details: false,
    data: {},
    subscriptions: subs,
    ...over,
  });

  it("sends to every device and reports each status (201 sent, 410 gone, 503 retry)", async () => {
    const a = newDevice();
    const b = newDevice();
    const c = newDevice();
    const statuses: Record<string, number> = { a: 201, b: 410, c: 503 };
    const fetchImpl = vi.fn(
      async (url: string) =>
        new Response(null, { status: statuses[url.slice(-1)] }),
    );
    const out = await deliver(
      claimed([
        {
          id: "sa",
          endpoint: "https://fcm.googleapis.com/fcm/send/a",
          p256dh: a.p256dh,
          auth: a.authB64,
        },
        {
          id: "sb",
          endpoint: "https://fcm.googleapis.com/fcm/send/b",
          p256dh: b.p256dh,
          auth: b.authB64,
        },
        {
          id: "sc",
          endpoint: "https://fcm.googleapis.com/fcm/send/c",
          p256dh: c.p256dh,
          auth: c.authB64,
        },
      ]),
      await vapidP,
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toEqual({
      results: [
        { sub: "sa", status: 201 },
        { sub: "sb", status: 410 },
        { sub: "sc", status: 503 },
      ],
      reason: null,
    });
    const body = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as Uint8Array;
    const payload = JSON.parse(decrypt(body, a.priv, a.pub, a.auth));
    expect(payload).toEqual({
      k: "test",
      t: "LOCKED IN",
      b: "Notificação de teste. Está funcionando.",
      r: "settings",
      g: "test-11111111",
    });
  });

  it("never posts to an endpoint outside the allowlist", async () => {
    const a = newDevice();
    const fetchImpl = vi.fn();
    const out = await deliver(
      claimed([
        {
          id: "x",
          endpoint: "https://evil.example/collect",
          p256dh: a.p256dh,
          auth: a.authB64,
        },
      ]),
      await vapidP,
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual({ results: [], reason: "no_device" });
  });

  it("skips a delivery whose source is gone", async () => {
    const fetchImpl = vi.fn();
    const out = await deliver(
      claimed([], { kind: "planner", data: null }),
      await vapidP,
      fetchImpl as unknown as typeof fetch,
    );
    expect(out.reason).toBe("source_gone");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("route whitelist", () => {
  it("is identical in the service worker", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    const m = /const ROUTES = (\{[\s\S]*?\});/.exec(sw);
    expect(m).not.toBeNull();
    const routes = Function(`return ${m![1]}`)() as Record<string, string>;
    expect(routes).toEqual(PUSH_ROUTES);
  });
});
