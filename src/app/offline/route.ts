import { LOCALE, t } from "@/i18n/pt-BR";

/**
 * The page the service worker shows when a navigation fails without network
 * (V2 Phase 10, docs/WEB_PUSH.md → Offline). Static, the same for everyone,
 * no data and no script: it only says so and offers to try again.
 */
export const dynamic = "force-static";

const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const html = `<!doctype html>
<html lang="${LOCALE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#101315">
<title>${escape(t.offline.title)} · LOCKED IN</title>
<style>
  html,body{margin:0;height:100%;background:#101315;color:#f5f3ec;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:16px;max-width:420px;margin:0 auto;padding:24px;box-sizing:border-box}
  .mark{width:28px;height:28px;box-sizing:border-box;border:2.5px solid #868b85;border-radius:9px;display:flex;align-items:center;justify-content:center}
  .mark i{width:6px;height:13px;border-radius:3px;background:#868b85}
  .eyebrow{font:500 11px/1.35 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#f2be6e}
  h1{margin:0;font-size:28px;line-height:1.15;font-weight:700;font-stretch:88%}
  p{margin:0;color:#a9ada6;font-size:15px;line-height:1.5}
  a{display:inline-flex;align-items:center;justify-content:center;min-height:54px;margin-top:8px;padding:0 22px;box-sizing:border-box;border-radius:14px;border:1px solid rgba(245,243,236,.24);color:#f5f3ec;font-size:15px;font-weight:600;text-decoration:none}
  a:focus-visible{outline:2px solid #c5f277;outline-offset:2px}
</style>
</head>
<body>
<main>
  <span class="mark" aria-hidden="true"><i></i></span>
  <span class="eyebrow">LOCKED IN</span>
  <h1>${escape(t.offline.title)}</h1>
  <p>${escape(t.offline.text)}</p>
  <a href="/today">${escape(t.offline.retry)}</a>
</main>
</body>
</html>`;

export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
