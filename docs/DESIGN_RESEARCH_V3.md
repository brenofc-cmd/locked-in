# LOCKED IN — Design research V3 (2026-10-08)

Input for the V3 mobile pass ([DESIGN_DIRECTION_V3.md](DESIGN_DIRECTION_V3.md), ADR-107). Builds on
[FINAL_DESIGN_RESEARCH.md](FINAL_DESIGN_RESEARCH.md) (V2 final pass) and
[DESIGN_AUDIT_2026-10-08.md](DESIGN_AUDIT_2026-10-08.md); does not repeat them.

## Sources actually read (2026-10-08)

| Source                                                                                        | Read?       | Take-away for LOCKED IN                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duolingo — New home screen design                                                             | Yes         | **One clear next step**; progress shown by position and a state change (done nodes change colour); chunks with headers; descriptive labels.                                                        |
| Duolingo — Core tabs redesign                                                                 | Yes         | Consistent header position; few type styles; whitespace instead of containers; flatter cards; art only when it says something.                                                                     |
| Linear — Behind the latest design refresh                                                     | Yes         | Navigation dimmer than content; warmer, less saturated greys; fewer and smaller icons; fewer, softer separators; actions in predictable places.                                                    |
| Apple HIG — Tab bars                                                                          | **No**      | The page renders with JavaScript and returned only its title. Guidance used from general HIG knowledge, flagged as such: 3–5 tabs, short labels, 44 pt targets, hide the bar in immersive screens. |
| design.duolingo.com, Duolingo product principles, M3, NN/g, Laws of UX, WCAG 2.2, web.dev CWV | Not re-read | Already summarised in FINAL_DESIGN_RESEARCH.md; applied from there and from general knowledge.                                                                                                     |

## Problems the V3 pass addressed (found on the real build, DEV data, 320–1920 px)

| #   | Where                                | Evidence                                                                                                                                                              | Kind               |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| R1  | HOJE                                 | The list says what is done; nothing says what to do **next** (Duolingo's core lesson).                                                                                | UX                 |
| R2  | HOJE / FOCO                          | LOCK IN is a flat green slab; nothing marks it as the thing to press beyond colour.                                                                                   | Interaction        |
| R3  | FOCO session                         | PAUSAR / ENCERRAR were 11 px grey text at the bottom edge — hard to find under stress.                                                                                | Usability          |
| R4  | DUPLA duel table, 320 px             | Audit F4: four columns wrap ("8/12 ·" / "67%").                                                                                                                       | Responsive         |
| R5  | DUPLA head-to-head, empty            | Audit F5: a 64 px "0 — 0" and eight boxes before any contested week.                                                                                                  | Empty state        |
| R6  | PROGRESSO chart, sparse              | Audit F6: one bar of data in a 170 px chart.                                                                                                                          | Empty state        |
| R7  | Tabs, 320 px                         | Audit F7: PROGRESSO reached the screen edge.                                                                                                                          | Responsive         |
| R8  | Tokens                               | Audit F8: inline colours.                                                                                                                                             | System             |
| R9  | DUPLA / PROGRESSO / Desafios, 320 px | **New**: `minmax(300px,1fr)` grids were 20 px wider than the screen; `<main>`'s `overflow-x: hidden` hid it from every overflow test ("FALTAM 3 DIAS", "0 dias" cut). | Bug (pre-existing) |
| R10 | PROGRESSO header, 320 px             | **New**: the range picker stuck out of the screen (found by the new test 8).                                                                                          | Bug (pre-existing) |
| R11 | PROGRESSO month, 320 px              | **New**: the month score broke as "0 –" / "0".                                                                                                                        | Bug (pre-existing) |
| R12 | HOJE, 780–1179 px                    | **New**: LOCK IN lived in the aside, which falls below the whole task list there — off the first view.                                                                | UX (pre-existing)  |

## Hypotheses

- H1 (R1): pointing at one open task in place lowers "what now?" without adding a second list.
- H2 (R2): depth on the primary action only keeps the app calm and makes the one action unmistakable.
- H3 (R4–R7, R9–R12): most mobile debt lives at 320 px and at the 780–1179 band; measuring boxes (not
  `scrollWidth`) finds it.
