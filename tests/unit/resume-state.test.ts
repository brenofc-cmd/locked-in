import { describe, expect, it } from "vitest";
import {
  DRAFT_TTL_MS,
  FALLBACK_ROUTE,
  MAX_BYTES,
  RESTORABLE_ROUTES,
  ROUTE_TTL_MS,
  SCROLL_TTL_MS,
  clearDraft,
  clearResume,
  isRestorableRoute,
  loadDraft,
  loadResume,
  parseResume,
  rememberProgress,
  rememberRoute,
  rememberScroll,
  restoreTarget,
  resumeKey,
  saveDraft,
  serializeResume,
  type TaskDraft,
} from "@/lib/resume-state";

/** In-memory Storage (the same surface the module uses). */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const BRENDON = "11111111-1111-4111-8111-111111111111";
const LUCAS = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 8, 29, 12);

const draft = (
  over: Partial<TaskDraft> = {},
): Omit<TaskDraft, "updatedAt"> => ({
  name: "Revisar Física",
  repeat: false,
  repeatMode: "daily",
  days: ["MON", "WED"],
  time: "",
  reminder: false,
  category: "work_study",
  visible: true,
  notes: "",
  ...over,
});

describe("resume state: keys and user scoping", () => {
  it("namespaces and versions the key per user", () => {
    expect(resumeKey(BRENDON)).toBe(`locked-in:v2:${BRENDON}:resume`);
    expect(resumeKey(BRENDON.toUpperCase())).toBe(resumeKey(BRENDON));
  });

  it("refuses anything that is not a user id (no generic key)", () => {
    for (const bad of ["", "anon", "undefined", "../x", `${BRENDON}:x`])
      expect(resumeKey(bad)).toBeNull();
    const s = memory();
    rememberRoute("", "/progress", NOW, s);
    expect(s.data.size).toBe(0);
  });

  it("keeps two users on the same device apart", () => {
    const s = memory();
    rememberRoute(BRENDON, "/progress", NOW, s);
    rememberProgress(BRENDON, { range: "30" }, NOW, s);
    saveDraft(BRENDON, "task", draft(), NOW, s);
    expect(restoreTarget(LUCAS, NOW, s)).toBe(FALLBACK_ROUTE);
    expect(loadResume(LUCAS, NOW, s)).toEqual({ v: 1 });
    expect(loadDraft(LUCAS, "task", NOW, s)).toBeNull();
    rememberRoute(LUCAS, "/focus", NOW, s);
    expect(restoreTarget(BRENDON, NOW, s)).toBe("/progress");
    expect(restoreTarget(LUCAS, NOW, s)).toBe("/focus");
  });
});

describe("resume state: routes", () => {
  it("allows only the private screens", () => {
    for (const r of RESTORABLE_ROUTES) expect(isRestorableRoute(r)).toBe(true);
  });

  it("never restores auth, onboarding, 404, root, queries or foreign paths", () => {
    for (const bad of [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/auth/confirm",
      "/auth/signout",
      "/onboarding",
      "/",
      "/nope",
      "/history",
      "/today?dev=1",
      "/today/",
      "//evil.example",
      "https://evil.example/today",
      42,
      null,
    ])
      expect(isRestorableRoute(bad)).toBe(false);
  });

  it("remembers the last safe route and ignores unsafe ones", () => {
    const s = memory();
    rememberRoute(BRENDON, "/progress", NOW, s);
    rememberRoute(BRENDON, "/reset-password", NOW + 1, s);
    rememberRoute(BRENDON, "/onboarding", NOW + 2, s);
    expect(restoreTarget(BRENDON, NOW + 3, s)).toBe("/progress");
  });

  it("falls back to Today with nothing stored or an old route", () => {
    const s = memory();
    expect(restoreTarget(BRENDON, NOW, s)).toBe("/today");
    rememberRoute(BRENDON, "/partner", NOW, s);
    expect(restoreTarget(BRENDON, NOW + ROUTE_TTL_MS + 1, s)).toBe("/today");
  });

  it("works without storage (server, blocked storage)", () => {
    expect(restoreTarget(BRENDON, NOW, null)).toBe("/today");
    expect(() => rememberRoute(BRENDON, "/today", NOW, null)).not.toThrow();
    expect(() => clearResume(BRENDON, null)).not.toThrow();
  });
});

describe("resume state: validation and corruption", () => {
  const key = resumeKey(BRENDON)!;

  it("survives invalid JSON and falls back to Today", () => {
    for (const junk of ["{", "null", "[]", '"x"', "42", "undefined", "💥"]) {
      const s = memory({ [key]: junk });
      expect(loadResume(BRENDON, NOW, s)).toEqual({ v: 1 });
      expect(restoreTarget(BRENDON, NOW, s)).toBe("/today");
    }
  });

  it("survives a storage that throws", () => {
    const s = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(restoreTarget(BRENDON, NOW, s)).toBe("/today");
    expect(() => rememberRoute(BRENDON, "/focus", NOW, s)).not.toThrow();
    expect(() => clearResume(BRENDON, s)).not.toThrow();
  });

  it("drops an unknown version (old or future schema)", () => {
    for (const v of [0, 2, "1", undefined])
      expect(
        parseResume({ v, lastRoute: { path: "/focus", at: NOW } }, NOW),
      ).toEqual({ v: 1 });
  });

  it("drops invalid fields one by one and unknown keys entirely", () => {
    const parsed = parseResume(
      {
        v: 1,
        lastRoute: { path: "/progress", at: NOW },
        progress: { range: "365", month: "2026-13" },
        scroll: {
          "/today": { y: 480, at: NOW },
          "/partner": { y: -5, at: NOW },
          "/settings": { y: 10, at: NOW },
          "/progress": { y: "12", at: NOW },
        },
        drafts: { task: { name: 5 }, routine: "x" },
        accessToken: "eyJhbGciOi…",
        password: "hunter2",
      },
      NOW,
    );
    expect(parsed).toEqual({
      v: 1,
      lastRoute: { path: "/progress", at: NOW },
      scroll: { "/today": { y: 480, at: NOW } },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/token|password|eyJ/i);
  });

  it("refuses timestamps from the future", () => {
    expect(
      parseResume({ v: 1, lastRoute: { path: "/focus", at: NOW + 3.6e6 } }, NOW)
        .lastRoute,
    ).toBeUndefined();
  });
});

describe("resume state: serialization", () => {
  it("round-trips", () => {
    const s = memory();
    rememberRoute(BRENDON, "/progress", NOW, s);
    rememberProgress(BRENDON, { range: "30", month: "2026-08" }, NOW, s);
    rememberScroll(BRENDON, "/progress", 612.4, NOW, s);
    saveDraft(BRENDON, "task", draft(), NOW, s);
    const raw = s.data.get(resumeKey(BRENDON)!)!;
    expect(JSON.parse(raw).v).toBe(1);
    expect(loadResume(BRENDON, NOW, s)).toEqual({
      v: 1,
      lastRoute: { path: "/progress", at: NOW },
      progress: { range: "30", month: "2026-08" },
      scroll: { "/progress": { y: 612, at: NOW } },
      drafts: { task: { ...draft(), updatedAt: NOW } },
    });
  });

  it("stays tiny: drops scroll and drafts first when too big", () => {
    const big = serializeResume({
      v: 1,
      lastRoute: { path: "/today", at: NOW },
      drafts: {
        task: { ...draft({ notes: "x".repeat(MAX_BYTES) }), updatedAt: NOW },
      },
    });
    expect(big.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(JSON.parse(big)).toEqual({
      v: 1,
      lastRoute: { path: "/today", at: NOW },
    });
  });

  it("clips long draft text", () => {
    const s = memory();
    saveDraft(BRENDON, "task", draft({ name: "a".repeat(900) }), NOW, s);
    expect(loadDraft(BRENDON, "task", NOW, s)?.name).toHaveLength(200);
  });

  it("only keeps scroll for long screens, and not forever", () => {
    const s = memory();
    rememberScroll(BRENDON, "/settings", 300, NOW, s);
    rememberScroll(BRENDON, "/today", 300, NOW, s);
    expect(loadResume(BRENDON, NOW, s).scroll).toEqual({
      "/today": { y: 300, at: NOW },
    });
    expect(
      loadResume(BRENDON, NOW + SCROLL_TTL_MS + 1, s).scroll,
    ).toBeUndefined();
  });
});

describe("resume state: drafts", () => {
  it("keeps a draft per kind and restores it", () => {
    const s = memory();
    saveDraft(BRENDON, "task", draft(), NOW, s);
    saveDraft(
      BRENDON,
      "routine",
      draft({ name: "Ler 20 min", repeat: true }),
      NOW,
      s,
    );
    expect(loadDraft(BRENDON, "task", NOW, s)?.name).toBe("Revisar Física");
    expect(loadDraft(BRENDON, "routine", NOW, s)?.name).toBe("Ler 20 min");
  });

  it("expires after 24 hours", () => {
    const s = memory();
    saveDraft(BRENDON, "task", draft(), NOW, s);
    expect(
      loadDraft(BRENDON, "task", NOW + DRAFT_TTL_MS - 1, s),
    ).not.toBeNull();
    expect(loadDraft(BRENDON, "task", NOW + DRAFT_TTL_MS + 1, s)).toBeNull();
  });

  it("an empty form removes the draft; clearing removes it", () => {
    const s = memory();
    saveDraft(BRENDON, "task", draft(), NOW, s);
    saveDraft(BRENDON, "task", draft({ name: "  " }), NOW, s);
    expect(loadDraft(BRENDON, "task", NOW, s)).toBeNull();
    saveDraft(BRENDON, "task", draft(), NOW, s);
    clearDraft(BRENDON, "task", s);
    expect(loadDraft(BRENDON, "task", Date.now(), s)).toBeNull();
  });
});

describe("resume state: logout cleanup", () => {
  it("clears everything of that user and nothing of another", () => {
    const s = memory({ "li:briefing-shown": "2026-09-29" });
    for (const u of [BRENDON, LUCAS]) {
      rememberRoute(u, "/progress", NOW, s);
      rememberScroll(u, "/today", 200, NOW, s);
      saveDraft(u, "task", draft(), NOW, s);
    }
    clearResume(BRENDON, s);
    expect(s.data.has(resumeKey(BRENDON)!)).toBe(false);
    expect(loadResume(BRENDON, NOW, s)).toEqual({ v: 1 });
    expect(restoreTarget(LUCAS, NOW, s)).toBe("/progress");
    expect(s.data.get("li:briefing-shown")).toBe("2026-09-29");
  });
});
