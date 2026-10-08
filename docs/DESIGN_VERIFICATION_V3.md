# LOCKED IN — Design verification V3 (2026-10-08)

What was checked for the V3 mobile pass (ADR-107), how, and what is still open. Branch
`v2-design-polish` (from `main` at `033bdf1`), **uncommitted**; a checkpoint of the three earlier
polish fixes is the ref `refs/checkpoints/pre-v3`.

## Method

- Local production build (`npm run build && npm run start -- --port 3100`), DEV data, the suite's own
  seeds and resets.
- Visual matrix `tests/e2e/visual.spec.ts`: **before** at 320 / 390 / 768 / 1440 / 1920 (103 shots);
  **after** at 320 / 360 / 390 / 430 / 600 / 768 / 1024 / 1440 / 1920 (179 shots), plus a re-shot of
  320 and 1024 after the last two fixes. Every main screen reviewed by eye. A curated before / after
  set and the direction prototypes live outside the repo in
  `C:\Users\brendon.castellani\locked-in-evidence\2026-10-08-design-v3\`.
- Viewport heights: phones at 844 (matrix) and 740 (test 8); 568 / 667 / 812 / 932 were **not**
  checked one by one.

## Screens changed

| Screen / part       | Change                                                                                 | Verified by                                                       |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| HOJE                | PRÓXIMA pointer; segmented day bar; tactile LOCK IN; LOCK IN pinned up to 1179 px      | shots 320–1440; design.spec 1, 2, 6b, 9; app.spec                 |
| FOCO                | tactile LOCK IN / PRONTO; Pausar / Encerrar as 56 px buttons                           | shots; design.spec 3, 6; focus-390 / -1440                        |
| DUPLA               | duel two lines per category on phones; compact empty head-to-head; 320 px overflow fix | shots 320 / 390 / 600 / 1440; design.spec 4, 7, 8; stage5, stage7 |
| PROGRESSO           | short sparse chart + sentence; header wraps at 320; month score never breaks           | shots 320 / 390; design.spec 8; v2p8                              |
| All primary buttons | `btn-primary` (14 places: sheets, onboarding, Duo, goals, challenges, 404)             | build, lint, typecheck; suites below                              |
| Tabs                | 10 px labels under 360 px                                                              | design.spec 8 (labels never touch / leave the screen)             |
| Tokens              | `accent-deep`, `strike`, `marker`, `rook-glow`, `text-tab`                             | lint, build                                                       |

## Results (all `--retries=0`)

| Gate                                                                                              | Result                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` / `lint` / `typecheck` / `build`                                           | pass                                                                                                                                                                          |
| `npm test` (Vitest)                                                                               | 413 passed, 1 skipped (3 new `nextTaskId` tests)                                                                                                                              |
| E2E `setup` + `mobile-390`, `desktop-1440`, `mobile-375`, `mobile-430`, `focus-390`, `focus-1440` | 25 passed                                                                                                                                                                     |
| E2E `design-390` (11 tests: 2 new — 8: 320 / 360 boxes + tabs, 9: PRÓXIMA)                        | all passed on 6 of the 7 runs since the write-race fix (the first 3 before test 9 existed); **1 run failed 6b by timeout** with the machine under memory pressure (see below) |
| E2E `stage5`                                                                                      | 4 passed (a first run lost the browser: "session closed")                                                                                                                     |
| E2E `stage7`, `v2p8-390`, `v2p10-390` (responsive audit 375–1440)                                 | 37 passed                                                                                                                                                                     |
| E2E `v2-390`, `v2p4-390`, `v2p5-390`                                                              | passed (36 with v2p9's first part) — on the build **before** the last Today change (LOCK IN pinned to 1179 px, month score)                                                   |
| E2E `v2p9-390`                                                                                    | 15 passed, 2 skipped (date window of the Monthly Champion tests, documented in CELEBRATIONS.md)                                                                               |
| E2E `ia-390`                                                                                      | 7 passed when run after its chain (`v2p7` → `issue001`); out of order it fails on data (no duo), unrelated to design                                                          |
| Full E2E suite in one run                                                                         | **not run** (~1–1.9 GB free RAM on 7.9 GB)                                                                                                                                    |
| axe (design.spec 7, 390 + 1440, 9 screens)                                                        | 0 serious / critical. axe is part of the check, not proof of full WCAG conformance                                                                                            |
| Lab performance (local build, Pixel 7 390 px, 4× CPU, 3 runs each)                                | LCP 840–1612 ms, CLS 0 on /today, /partner, /focus, /progress. Lab only — no field data; no before-build measured, so no comparison claimed                                   |
| `npm audit`                                                                                       | **high advisories in `next` 16.0–16.3.7 and `braces`** (via eslint-config-next). No dependency changed in this pass; production has them too                                  |

## Problems found and fixed during verification

- **A hidden 320 px overflow** in three grids (R9) — invisible to `scrollWidth` because `<main>` clips;
  test 8 now measures every box. It also found the Progress range picker (R10).
- **axe `aria-prohibited-attr`** on the head-to-head week marks once they lost their inner text → they
  are now `role="img"` with their label.
- **A data race in `design.spec.ts`**: tests 1 / 2 closed the page before the undo write landed; a lost
  write left Morning Run done on DEV and test 6b's click undid it. Tests 1, 2, 6b and 9 now wait for
  their writes (`trackWrites().idle()`, as app.spec does). No assertion was weakened.
- **PRÓXIMA in the accessible description** broke the exact description v2-phase9 asserts → the
  pointer is visual only.

## Known remaining

- design.spec 6b failed once in 7 runs after the race fix, by test timeout (60 s) while the machine was
  loaded; the click on Morning Run did not register. Not reproduced in isolation (4 / 4) nor in the 6
  other suite runs. Same family as the earlier flaky completion tests (commit `72264b6`).
- Not checked: real devices, iOS Safari / standalone PWA safe areas, virtual keyboard over sheets,
  200 % zoom, screen readers by hand, heights 568 / 667 / 812 / 932.
- Desktop DUPLA's table still spreads values across 1024 px (readable; no change made).
- Human acceptance still pending from V2 (two devices, Web Push with the app closed).
