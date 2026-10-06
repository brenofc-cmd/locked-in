// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * public/sw.js run as written, in a fake service-worker global: what a push
 * shows and where a click goes (V2 Phase 10, docs/WEB_PUSH.md).
 */
type Listener = (event: Record<string, unknown>) => void;

function loadWorker(windows: Record<string, unknown>[] = []) {
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://locked-in.test" },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(async () => undefined),
    registration: {
      showNotification: vi.fn(
        async (title: string, options: Record<string, unknown>) => {
          shown.push({ title, options });
        },
      ),
      navigationPreload: { enable: vi.fn(async () => undefined) },
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async (url: string) => {
        opened.push(url);
        return null;
      }),
    },
  };
  const cache = new Map<string, unknown>();
  const caches = {
    open: async () => ({
      add: async (r: { url?: string }) => cache.set("/offline", r),
    }),
    keys: async () => ["locked-in-offline-v1", "old-cache"],
    delete: vi.fn(async () => true),
    match: async (url: string) =>
      url === "/offline" ? "OFFLINE PAGE" : undefined,
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    caches,
    URL,
    Request: class {
      constructor(public url: string) {}
    },
    Response: { error: () => "ERROR" },
    fetch: vi.fn(async () => {
      throw new TypeError("offline");
    }),
  });
  /** Dispatch an extendable event and wait for its promise. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({
      ...event,
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
      respondWith: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    return pending;
  };
  return { self, fire, shown, opened, caches, listeners };
}

const push = (data: unknown) => ({
  data: {
    json: () => {
      if (typeof data === "string") throw new SyntaxError("bad");
      return data;
    },
  },
});

describe("service worker: push", () => {
  it("shows the server's title and body, opening a whitelisted route", async () => {
    const w = loadWorker();
    await w.fire(
      "push",
      push({
        k: "planner",
        t: "Prova amanhã",
        b: "Física",
        r: "planner",
        g: "planner-1",
      }),
    );
    expect(w.shown).toEqual([
      {
        title: "Prova amanhã",
        options: expect.objectContaining({
          body: "Física",
          tag: "planner-1",
          lang: "pt-BR",
          data: { route: "/planner" },
        }),
      },
    ]);
  });

  it("never takes a URL from the payload: unknown or malicious routes open Today", async () => {
    const w = loadWorker();
    for (const r of [
      "https://evil.example",
      "//evil.example",
      "/login",
      "__proto__",
      "constructor",
      7,
    ])
      await w.fire("push", push({ t: "x", r }));
    expect(
      w.shown.map((s) => (s.options.data as { route: string }).route),
    ).toEqual(Array(6).fill("/today"));
  });

  it("clips long text and survives a broken payload", async () => {
    const w = loadWorker();
    await w.fire("push", push({ t: "T".repeat(500), b: "B".repeat(500) }));
    await w.fire("push", push("not json"));
    expect(w.shown[0].title).toHaveLength(80);
    expect(w.shown[0].options.body).toHaveLength(160);
    expect(w.shown[1].title).toBe("LOCKED IN");
  });

  it("stays quiet while LOCKED IN is focused (the app shows it), except for a test", async () => {
    const w = loadWorker([
      { url: "https://locked-in.test/today", focused: true },
    ]);
    await w.fire(
      "push",
      push({ k: "nudge", t: "Beto deu um toque", r: "partner" }),
    );
    expect(w.shown).toHaveLength(0);
    await w.fire("push", push({ k: "test", t: "LOCKED IN", r: "settings" }));
    expect(w.shown).toHaveLength(1);
  });
});

describe("service worker: notification click", () => {
  const click = (route: unknown) => ({
    notification: { close: vi.fn(), data: { route } },
  });

  it("with no LOCKED IN tab: opens the route", async () => {
    const w = loadWorker([]);
    await w.fire("notificationclick", click("/planner"));
    expect(w.opened).toEqual(["https://locked-in.test/planner"]);
  });

  it("with a tab open: focuses it and navigates it there", async () => {
    const tab = {
      url: "https://locked-in.test/progress",
      focus: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
      postMessage: vi.fn(),
    };
    const w = loadWorker([tab]);
    await w.fire("notificationclick", click("/plan/week"));
    expect(tab.focus).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith(
      "https://locked-in.test/plan/week",
    );
    expect(w.opened).toEqual([]);
  });

  it("a tab it does not control yet is asked to navigate itself", async () => {
    const tab = {
      url: "https://locked-in.test/today",
      focus: vi.fn(async () => undefined),
      navigate: vi.fn(async () => {
        throw new TypeError("not controlled");
      }),
      postMessage: vi.fn(),
    };
    const w = loadWorker([tab]);
    await w.fire("notificationclick", click("/partner"));
    expect(tab.postMessage).toHaveBeenCalledWith({
      type: "li:navigate",
      route: "/partner",
    });
  });

  it("a tampered notification route falls back to Today; other origins are ignored", async () => {
    const other = {
      url: "https://evil.example/",
      focus: vi.fn(),
      navigate: vi.fn(),
      postMessage: vi.fn(),
    };
    const w = loadWorker([other]);
    await w.fire("notificationclick", click("https://evil.example/steal"));
    expect(other.navigate).not.toHaveBeenCalled();
    expect(w.opened).toEqual(["https://locked-in.test/today"]);
  });
});

describe("service worker: lifecycle and offline", () => {
  it("activates at once and drops old caches", async () => {
    const w = loadWorker();
    await w.fire("install", {});
    expect(w.self.skipWaiting).toHaveBeenCalled();
    await w.fire("activate", {});
    expect(w.caches.delete).toHaveBeenCalledWith("old-cache");
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it("serves the offline page only for a failed page navigation", async () => {
    const w = loadWorker();
    const nav = await w.fire("fetch", {
      request: { mode: "navigate", method: "GET" },
      preloadResponse: Promise.resolve(undefined),
    });
    expect(nav).toBe("OFFLINE PAGE");
    const respondWith = vi.fn();
    w.listeners.fetch({
      request: {
        mode: "cors",
        method: "GET",
        url: "https://x.supabase.co/rest/v1/tasks",
      },
      respondWith,
    });
    w.listeners.fetch({
      request: { mode: "navigate", method: "POST" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
});
