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
<meta name="theme-color" content="#0c0c0e">
<title>${escape(t.offline.title)} · LOCKED IN</title>
<style>
  html,body{margin:0;height:100%;background:#0c0c0e;color:#f2f2f0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;justify-content:center;gap:14px;max-width:420px;margin:0 auto;padding:24px 18px;box-sizing:border-box}
  .mark{font:600 12px/1 ui-monospace,monospace;letter-spacing:.24em}
  h1{margin:0;font-size:25px;font-weight:600;letter-spacing:-.02em}
  p{margin:0;color:#a3a3a0;font-size:15px;line-height:1.5}
  a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:8px;border-radius:12px;background:#f2f2f0;color:#0c0c0e;font-weight:600;text-decoration:none}
  a:focus-visible{outline:2px solid #f2f2f0;outline-offset:3px}
</style>
</head>
<body>
<main>
  <span class="mark">LOCKED IN</span>
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
