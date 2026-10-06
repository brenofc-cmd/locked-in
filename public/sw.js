/*
 * LOCKED IN service worker (V2 Phase 10, docs/WEB_PUSH.md). The only one.
 *
 * - push: shows the notification the server sent (title, short body, a
 *   route KEY). Text is clipped; the route is looked up in ROUTES — a URL is
 *   never taken from the payload.
 * - notificationclick: focuses an open LOCKED IN window and navigates it to
 *   that route, or opens one. An explicit route beats Resume State (which
 *   only acts at "/").
 * - fetch: page navigations only, network first; when the network fails the
 *   offline page is shown. Nothing else is intercepted or cached — no app
 *   page, no API / Supabase / auth response, no token.
 * - Updates: a new version activates at once (skipWaiting + claim); there is
 *   no cached app shell that could be stale.
 */
const OFFLINE_URL = "/offline";
const CACHE = "locked-in-offline-v1";
const ROUTES = {
  today: "/today",
  partner: "/partner",
  planner: "/planner",
  "plan-week": "/plan/week",
  progress: "/progress",
  settings: "/settings",
};
const FALLBACK = "/today";

const routeFor = (key) =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(ROUTES, key)
    ? ROUTES[key]
    : FALLBACK;

const clip = (value, max) =>
  typeof value === "string" ? value.slice(0, max) : "";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key !== CACHE) await caches.delete(key);
      if (self.registration.navigationPreload)
        await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = clip(data.t, 80) || "LOCKED IN";
  const options = {
    body: clip(data.b, 160),
    tag: clip(data.g, 64) || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    lang: "pt-BR",
    data: { route: routeFor(data.r) },
  };
  event.waitUntil(
    (async () => {
      // A focused LOCKED IN window already shows it in the app (a test
      // notification is always shown: the user is waiting for it).
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = windows.some(
        (w) => w.focused && new URL(w.url).origin === self.location.origin,
      );
      if (focused && data.k !== "test") return;
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const wanted = event.notification.data && event.notification.data.route;
  const route = Object.values(ROUTES).includes(wanted) ? wanted : FALLBACK;
  const url = new URL(route, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      if (!open) {
        await self.clients.openWindow(url);
        return;
      }
      try {
        await open.focus();
      } catch {
        // Focus can be refused; navigating still helps.
      }
      try {
        if (typeof open.navigate === "function") {
          await open.navigate(url);
          return;
        }
      } catch {
        // Not controlled by this worker yet: let the page navigate itself.
      }
      open.postMessage({ type: "li:navigate", route });
    })(),
  );
});
