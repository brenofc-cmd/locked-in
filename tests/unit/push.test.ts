// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  PUSH_ROUTES,
  deviceLabel,
  pushState,
  pushSupport,
  safePushPath,
  subscriptionInput,
  vapidKeyBytes,
  type PushEnv,
} from "@/lib/push";
import { inQuietHours } from "@/lib/notifications";

const KEY =
  "BJJG_j2fJkHjzPkgHpAsAYNRQpnAvP-6oUkTui1y_BmLhP3RspFF3EEsfmkVU4yVqTpgxQe68mKvERXlskMp4yw";
const P256DH =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  serviceWorker: true,
  pushManager: true,
  notification: true,
  ios: false,
  standalone: false,
  key: KEY,
  ...over,
});

describe("push support", () => {
  it("needs a service worker, the Push API, notifications and a key", () => {
    expect(pushSupport(env())).toBe("supported");
    expect(pushSupport(env({ pushManager: false }))).toBe("unsupported");
    expect(pushSupport(env({ serviceWorker: false }))).toBe("unsupported");
    expect(pushSupport(env({ key: "" }))).toBe("unconfigured");
  });

  it("tells an iPhone in Safari to add the app to the Home Screen", () => {
    expect(
      pushSupport(env({ ios: true, pushManager: false, notification: false })),
    ).toBe("ios-install");
    // Installed (standalone) without Push (old iOS): honestly unsupported.
    expect(
      pushSupport(env({ ios: true, standalone: true, pushManager: false })),
    ).toBe("unsupported");
    expect(pushSupport(env({ ios: true, standalone: true }))).toBe("supported");
  });
});

describe("push state (what Settings says)", () => {
  it("covers default, granted, denied and unsupported", () => {
    expect(pushState("supported", "default", false)).toBe("off");
    expect(pushState("supported", "granted", false)).toBe("off");
    expect(pushState("supported", "granted", true)).toBe("on");
    expect(pushState("supported", "denied", false)).toBe("denied");
    expect(pushState("supported", "denied", true)).toBe("denied");
    expect(pushState("unsupported", "granted", true)).toBe("unsupported");
    expect(pushState("ios-install", "default", false)).toBe("ios-install");
    expect(pushState("unconfigured", "granted", true)).toBe("unconfigured");
  });
});

describe("VAPID public key", () => {
  it("converts the base64url key to the 65-byte applicationServerKey", () => {
    const bytes = vapidKeyBytes(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes?.[0]).toBe(4);
    expect(vapidKeyBytes(`${KEY}=`)).toHaveLength(65);
  });

  it("refuses anything that is not an uncompressed P-256 key", () => {
    expect(vapidKeyBytes("")).toBeNull();
    expect(vapidKeyBytes("abc")).toBeNull();
    expect(vapidKeyBytes(KEY.replace(/^B/, "A"))).toBeNull(); // not 0x04
    expect(vapidKeyBytes(`${KEY.slice(0, -1)}!`)).toBeNull();
  });
});

describe("subscription serialization", () => {
  const json = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc:def",
    expirationTime: null,
    keys: { p256dh: P256DH, auth: AUTH },
  };

  it("keeps endpoint + keys of a real push service", () => {
    expect(subscriptionInput(json)).toEqual({
      endpoint: json.endpoint,
      p256dh: P256DH,
      auth: AUTH,
    });
  });

  it("refuses unknown services, missing or malformed keys", () => {
    expect(
      subscriptionInput({ ...json, endpoint: "https://evil.example/x" }),
    ).toBeNull();
    expect(subscriptionInput({ ...json, keys: { auth: AUTH } })).toBeNull();
    expect(
      subscriptionInput({ ...json, keys: { p256dh: "x", auth: AUTH } }),
    ).toBeNull();
    expect(
      subscriptionInput({ ...json, keys: { p256dh: P256DH, auth: "a+b/" } }),
    ).toBeNull();
    expect(subscriptionInput(null)).toBeNull();
    expect(subscriptionInput("x")).toBeNull();
  });
});

describe("notification click route", () => {
  it("accepts only whitelisted paths; anything else opens Today", () => {
    for (const path of Object.values(PUSH_ROUTES))
      expect(safePushPath(path)).toBe(path);
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/today?x=1",
      "/login",
      "javascript:alert(1)",
      "/plan/week/../../logout",
      undefined,
      42,
    ])
      expect(safePushPath(bad)).toBe("/today");
  });
});

describe("device label", () => {
  it("names browser and system without any identifier", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      ),
    ).toBe("Chrome · Windows");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari · iOS");
    expect(deviceLabel("")).toBe("Navegador");
  });
});

describe("quiet hours (same rule as the scheduler, private.push_quiet)", () => {
  it("wraps midnight and is empty when start = end", () => {
    expect(inQuietHours("23:00", "22:30", "07:00")).toBe(true);
    expect(inQuietHours("06:59", "22:30", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:30", "07:00")).toBe(false);
    expect(inQuietHours("12:00", "13:00", "14:00")).toBe(false);
    expect(inQuietHours("13:30", "13:00", "14:00")).toBe(true);
    expect(inQuietHours("10:00", "10:00", "10:00")).toBe(false);
  });
});
