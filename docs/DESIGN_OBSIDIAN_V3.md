# LOCKED IN — Obsidian Energy (Design V3 handoff), 2026-10-08

The owner's Claude Design project "LOCKED IN V3" applied to the app (ADR-108). Source: the project
exported as a zip (`Design direction decision_ V3 Directions.zip`: `LOCKED IN V3.dc.html` — the
interactive prototype, 34 screens / states —, `Design System V3.dc.html`, `Rook.jsx`, `support.js`,
`V3 Directions.dc.html`, the V2 baseline). Nothing from it is committed; the rules now live in
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Branch `v3-obsidian-energy` (from `main` at `66c48a6`);
checkpoint ref `refs/checkpoints/pre-obsidian`.

## What was applied (the handoff's eight steps, then every screen)

| Handoff step                                       | Where                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Tokens (same names, new values)                 | `globals.css` `@theme`: charcoal surfaces, lime, ivory text, stage, done-check, partner, heat      |
| 2. Archivo + JetBrains Mono; Newsreader on FOCO    | `layout.tsx` (`next/font`, `wdth` axis); `page-title`, `num`, `cond` utilities                     |
| 3. Check on the right, 52 px target                | `TaskRow.tsx`: the text opens the options, the check toggles; swipe / long-press kept              |
| 4. Proof Pills                                     | `ProgressBar pills` + `dayPills()` (34 px, full radius, 5 px gap, dashed when skipped)             |
| 5. Floating tab bar                                | `AppShell.tsx` `BottomNav` (10 / 26 px + safe area, 22 radius, condensed 82 % labels)              |
| 6. LOCK IN names PRÓXIMA and opens the sheet on it | `TodayScreen.tsx` (subtitle, `setFocusTask` only when nothing was picked), `FocusSheet` header     |
| 7. Duel scoreboard + leader sentence               | `Duel.tsx` `DuelDetailed` (avatars, 72 px score, share bars via `categoryShare()`), partner header |
| 8. FOCO ink stage                                  | `FocusOverlay.tsx` (`#1c201d`, Newsreader 300 timer, 2 px progress line, ivory Pausar / Encerrar)  |

Also: the new mark (`LogoMark`) and PWA icons (`generate-icons.mjs`), theme colour `#101315`
(layout, manifest, `/offline`), the static offline page, auth frame and forms (lime primary, 54 px
fields), primary / secondary buttons, fields and switches on every screen (Settings, Duo, Goals,
Planner, Routine, Challenges, Week, Onboarding, sheets), condensed big numbers everywhere (`num`),
Progress (coloured stats, segmented range, V3 chart bars, calendar heat tiles), PLANEJAR hub rows,
profile menu, streak sheet.

## Deliberately not applied

- **Behaviour in the prototype**: a confirmation dialog before Encerrar, the profile menu as a bottom
  sheet, PLANEJAR rows in a new order, a skeleton loading state. They change flows that tests and
  NAVIGATION.md fix; they need a product decision, not a re-skin.
- **Prototype copy** ("8 de 12 provas", "Boa tarde,\nBrendon."): the app keeps its strings (headings,
  counts and button names are contracts in the E2E suite and for screen readers).
- **Screens the handoff marks PENDENTE / PARCIAL** (reset password, morning card / TOP 3 /
  commitments / check-in, monthly champion, desktop / tablet layouts) took the new tokens, type and
  components but no new layout.

## Verification (local production build, DEV data, `--retries=0`)

| Gate                                                               | Result                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck / build                                  | pass                                                                                                                                                                                                        |
| Vitest                                                             | 417 tests, 1 skipped (+5: `dayPills`, `categoryShare`); one full run had 1 failure in `push-dispatch` (untouched code), which passed 4 / 4 alone — the same flake as before                                 |
| E2E setup + mobile-390, desktop-1440, mobile-375, mobile-430       | 23 passed                                                                                                                                                                                                   |
| focus-390 / focus-1440                                             | 2 passed                                                                                                                                                                                                    |
| stage3 → stage6 / stage7 → stage9                                  | 20 / 22 passed                                                                                                                                                                                              |
| v2-390, v2-1440, v2p2 → v2p4                                       | 44 passed                                                                                                                                                                                                   |
| v2p5 → v2p7, issue001, ia                                          | 38 passed, 1 skipped                                                                                                                                                                                        |
| v2p8 → v2p10                                                       | 49 passed, 2 skipped (Monthly Champion date window)                                                                                                                                                         |
| design-390 (axe 390 + 1440, 320 / 360 boxes, PRÓXIMA, Rook, Focus) | all 10 on most runs; **6b timed out in about 1 of 4 full runs** (5 of ~19) (the check is already registered in the failure snapshot; passes alone every time) — the same family as the earlier 1-in-7 flake |
| Visual matrix 320 / 375 / 430 / 768 / 1024 / 1440 / 1920           | 137 shots, reviewed by eye; outside the repo: `locked-in-evidence/2026-10-08-obsidian/after`                                                                                                                |

Tests changed, and why (no assertion weakened): `design.spec.ts` — the accent colour constant
(`rgb(197, 242, 119)`), test 9 finds PRÓXIMA in the row's text (the check is now a separate button),
and a `tap()` helper centres a row before clicking (the pinned bar + floating nav cover the bottom
~180 px of a phone); `stage8.spec.ts` — the manifest / theme colour `#101315`.

Problems found and fixed while verifying: dim text on the lighter V3 surfaces failed axe contrast
(week tabs, profile footer, Progress ranges → `muted`); Today's header and the duel's screen-reader
header row stuck out at 320 px; the undecided duel no longer prints 0 — 0.

## Known remaining

- design.spec 6b intermittent timeout (above). Full E2E suite in one run: not run (RAM).
- Not checked: real devices, iOS standalone safe areas with the floating bar, virtual keyboard over
  sheets, 200 % zoom, screen readers by hand.
