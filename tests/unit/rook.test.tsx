import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Rook, RookDuo, ROOK_POSES } from "@/components/brand/Rook";

describe("Rook (docs/ROOK.md)", () => {
  it("is decorative by default: hidden from assistive tech, never focusable", () => {
    const html = renderToStaticMarkup(<Rook />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain("role=");
  });

  it("carries a label only when it means something", () => {
    const html = renderToStaticMarkup(<Rook label="Rook, orgulhoso" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Rook, orgulhoso"');
    expect(html).not.toContain("aria-hidden");
  });

  it("every pose keeps the proof core and moves only by transforms", () => {
    for (const pose of ROOK_POSES) {
      const html = renderToStaticMarkup(<Rook pose={pose} />);
      expect(html).toContain(`data-rook="${pose}"`);
      // The proof core (slot + glow + pill) is in every pose.
      expect((html.match(/<rect/g) ?? []).length).toBe(3);
      // Motion stays on the compositor: transforms only, no layout props.
      expect(html).not.toMatch(/style="[^"]*(width|height|top|left):/);
    }
  });

  it("two Rooks on one page never share gradient / clip ids", () => {
    const html = renderToStaticMarkup(
      <>
        <Rook />
        <Rook />
      </>,
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is a small asset (no raster, no external reference)", () => {
    const html = renderToStaticMarkup(<Rook pose="celebrating" />);
    expect(html.length).toBeLessThan(8_000);
    expect(html).not.toMatch(/<image|href=|url\((?!#)/);
  });

  // Visual review only (ROOK_SHEET=<dir>): the character sheet as HTML.
  it.runIf(!!process.env.ROOK_SHEET)("writes the character sheet", () => {
    const dir = process.env.ROOK_SHEET!;
    const cell = (inner: string, label: string) =>
      `<div class="cell">${inner}<span>${label}</span></div>`;
    const poses = ROOK_POSES.map((p) =>
      cell(renderToStaticMarkup(<Rook pose={p} size={128} />), p),
    ).join("");
    const sizes = [24, 32, 48, 96, 192, 512]
      .map((s) => cell(renderToStaticMarkup(<Rook size={s} />), `${s}`))
      .join("");
    const sil = [24, 32, 64]
      .map((s) => cell(renderToStaticMarkup(<Rook size={s} />), `${s}`))
      .join("");
    const duo = cell(renderToStaticMarkup(<RookDuo size={96} />), "duo");
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#0c0c0e;color:#8e8d87;font:11px ui-monospace,monospace;letter-spacing:.12em}
      h2{margin:0;padding:18px 28px 0;font-size:11px;font-weight:400}
      .row{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap;padding:16px 28px 22px}
      .cell{display:flex;flex-direction:column;align-items:center;gap:8px}
      .light{background:#eceae4}.sil svg *{fill:#000!important;stroke:none!important}
    </style>
    <h2>POSES</h2><div class="row">${poses}</div>
    <h2>DUO</h2><div class="row">${duo}</div>
    <h2>SIZES</h2><div class="row">${sizes}</div>
    <h2>SILHOUETTE</h2><div class="row light sil">${sil}</div>`;
    fs.writeFileSync(path.join(dir, "rook-sheet.html"), html);
  });
});
