// Generates the PWA / home-screen icons in public/icons from the existing
// LogoMark (accent square outline with a filled inner square, on the app
// surface). Run once after a brand change: node scripts/generate-icons.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const ACCENT = "#C6E07B";
const BG = "#0A0A0B";

/** The LogoMark at `size` px; `pad` = safe-zone share (maskable icons). */
function html(size, pad) {
  const mark = size * (1 - 2 * pad) * 0.5;
  const border = mark * 0.16;
  const inner = mark * 0.3;
  const radius = mark * 0.2;
  return `<!doctype html><html><body style="margin:0;background:${BG}">
  <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${BG}">
    <div style="box-sizing:border-box;width:${mark}px;height:${mark}px;border:${border}px solid ${ACCENT};border-radius:${radius}px;display:flex;align-items:center;justify-content:center">
      <div style="width:${inner}px;height:${inner}px;background:${ACCENT};border-radius:${radius * 0.35}px"></div>
    </div>
  </div></body></html>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, pad: 0.1 },
  { file: "icon-512.png", size: 512, pad: 0.1 },
  { file: "icon-maskable-512.png", size: 512, pad: 0.2 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.12 },
];

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const i of ICONS) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(html(i.size, i.pad));
  await page.screenshot({
    path: `public/icons/${i.file}`,
    omitBackground: false,
  });
  console.log(`public/icons/${i.file}`);
}
await browser.close();
