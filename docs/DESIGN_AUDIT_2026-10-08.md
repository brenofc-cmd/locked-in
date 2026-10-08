# LOCKED IN — Design audit and polish (2026-10-08)

Scope: audit the final V2 design as shipped (`main` at `033bdf1`, in production since 2026-10-07) and
fix what the screenshots prove, **inside** [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Not a new
direction: the three-direction study and the choice of _Expressive Discipline_ already live in
[FINAL_DESIGN_RESEARCH.md](FINAL_DESIGN_RESEARCH.md), and CLAUDE.md forbids a redesign without an
explicit instruction. No business rule, migration, auth, RLS, API or polling change.

## Method

- Production build served locally (`npm run build && npm run start -- --port 3100`), DEV data.
- `tests/e2e/visual.spec.ts` (project `visual`) seeded the design day + duo and captured every main
  screen. Before: 320 / 390 / 768 / 1440 / 1920 (103 shots). After: 320 / 390 / 768 / 1440.
- Every shot reviewed by eye. Scores are heuristic judgements, not user research or measurements.

## Scores (0–10, heuristic)

| Dimension         | Before | After | Evidence                                                                |
| ----------------- | ------ | ----- | ----------------------------------------------------------------------- |
| Visual identity   | 8      | 8     | Dark graphite + proof green + Rook; unchanged                           |
| Colour            | 8      | 8     | Semantic tokens, green = proof; unchanged                               |
| Typography        | 8      | 8     | One page-title, mono eyebrows; unchanged                                |
| Layout            | 6      | 7     | 768 px no longer a stretched phone; duel scoreboard compact on desktop  |
| Spacing           | 8      | 8     | 4 px grid holds on every screen                                         |
| Navigation        | 8      | 8     | Five tabs / sidebar; unchanged                                          |
| UX                | 8      | 8     | One primary action per screen (LOCK IN visible on first view)           |
| Feedback          | 8      | 8     | Unchanged (MOTION.md)                                                   |
| Components        | 8      | 8     | Unchanged                                                               |
| Micro-interaction | 8      | 8     | Unchanged; reduced motion honoured                                      |
| Responsiveness    | 6      | 7     | 320 presence line readable; tablet measure; duel table still wraps (P3) |
| Accessibility     | 8      | 8     | axe: 0 serious / critical at 390 and 1440 (design-390, after)           |
| Performance       | n/m    | n/m   | Not measured in this pass (no Lighthouse run)                           |
| States            | 7      | 7     | Empty states have context; H2H empty strip remains (see below)          |
| Finish            | 8      | 8     | —                                                                       |

## Findings

| #   | Screen / component       | Evidence (shot)                                                                    | Impact                                       | Pri | Status                                                                  |
| --- | ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------- | --- | ----------------------------------------------------------------------- |
| F1  | DUPLA → duel scoreboard  | `1440-partner-fold`: VOCÊ and BRUNO ~1000 px from the score                        | The score loses its owners; reads as a table | P1  | **Fixed**: scoreboard row `max-w-md`, centred                           |
| F2  | Shell, 600–779 px        | `768-today-fold`: rows and the LOCK IN bar 728 px wide                             | Stretched phone on tablets                   | P2  | **Fixed**: content `max-w-2xl` below `desk`                             |
| F3  | DUPLA header, 320 px     | `320-partner-fold`: "Visto por último on…"                                         | Presence time unreadable                     | P2  | **Fixed**: `line-clamp-2` instead of `truncate`                         |
| F4  | DUPLA → duel table, 320  | `320-partner-fold`: "8/12 · 67%", "não bateu" wrap to two lines                    | Taller rows; still readable (reflow is OK)   | P3  | Open — no fix without shrinking type or dropping a column               |
| F5  | DUPLA → Confronto, empty | `390-partner-full`: giant 0—0 + eight "·" cells before any contested week          | Space spent on nothing                       | P2  | Open — owner decision: stage7 asserts the "sem disputa" cells are shown |
| F6  | Progress → 7 days chart  | `390-progress-full`: six empty bars + a 150 px blank area with one day of data     | Empty space early in a duo                   | P3  | Open                                                                    |
| F7  | Tabs, 320 px             | `320-today-fold`: PLANEJAR / PROGRESSO nearly touch (already `tracking-tighter`)   | Cramped, no overlap                          | P3  | Open — sentence-case labels would fix it; brand choice                  |
| F8  | Token hygiene            | `TaskRow` strike colour `rgba(236,235,230,.25)`; Rook glow `rgb(0 230 118)` in CSS | Values outside `@theme`                      | P3  | Open (Rook's emerald is documented in ROOK.md)                          |

## Verification (2026-10-08, after the change)

| Gate                                                                                   | Result                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                                 | pass                                                                                                                                        |
| `npm run lint`                                                                         | pass                                                                                                                                        |
| `npm run typecheck`                                                                    | pass                                                                                                                                        |
| `npm test`                                                                             | 410 passed, 1 skipped on 4 later runs; **the first run had 1 failure** that did not reproduce (unidentified, machine under memory pressure) |
| `npm run build`                                                                        | pass                                                                                                                                        |
| E2E `setup` + `mobile-390`, `desktop-1440`, `mobile-375`, `mobile-430` (`--retries=0`) | 23 passed                                                                                                                                   |
| E2E `stage5`, `stage7` (`--retries=0`)                                                 | 7 passed                                                                                                                                    |
| E2E `design-390` (axe, Rook, responsive; `--retries=0`)                                | 8 passed                                                                                                                                    |
| E2E `visual` (before / after shots)                                                    | pass                                                                                                                                        |
| Full E2E suite                                                                         | **not run** (RAM: ~1 GB free on a 7.9 GB machine)                                                                                           |
| Lighthouse / Core Web Vitals                                                           | **not run**                                                                                                                                 |
