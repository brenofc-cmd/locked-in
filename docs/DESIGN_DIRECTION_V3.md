# LOCKED IN — Design direction V3 (2026-10-08)

Research: [DESIGN_RESEARCH_V3.md](DESIGN_RESEARCH_V3.md). Decision: ADR-107. Rules now in force:
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (canonical).

## Three directions, same screens, same data

Static high-fidelity prototypes of HOJE, DUPLA and FOCO at 390 px with the DEV design day's real
numbers (8 / 12, duel 2 — 0, a 50 min session), rendered and compared side by side. Prototype file and
screenshot: kept outside the repo (`locked-in-evidence/2026-10-08-design-v3/directions.png`).

- **A — Expressive Discipline evolved**: the current graphite + proof green; a PRÓXIMA pointer on one
  task; a segmented day bar; the duel as two lines per category; real Pausar / Encerrar buttons.
- **B — Tactile Discipline**: cards around every group, thick 3D bars and checkboxes, sentence case,
  avatars in a "2 vs 0" duel, raised buttons everywhere.
- **C — Focused Premium**: a 120 px monochrome number, white CTA, no green, no Rook, no mono labels;
  Focus is a bare timer with "Toque para pausar".

## Comparison (0–10, heuristic — not user research)

| Criterion            | A   | B   | C   | Evidence                                                                  |
| -------------------- | --- | --- | --- | ------------------------------------------------------------------------- |
| Own identity         | 9   | 5   | 6   | B reads as a generic friendly app; C loses the proof green and Rook       |
| Fit to the product   | 9   | 5   | 7   | "Dark, serious, minimal, premium"; B adds the cards the declutter removed |
| Mobile quality       | 8   | 7   | 6   | C hides Pause behind a gesture; A keeps every control visible             |
| Legibility           | 8   | 8   | 8   |                                                                           |
| Clarity of execution | 9   | 7   | 7   | Only A says what to do next                                               |
| Satisfaction         | 7   | 9   | 5   | B's depth is the most tactile — A borrows it for the primary button only  |
| Navigation           | 8   | 8   | 7   | C's text-only tabs lose recognition                                       |
| Visual quality       | 8   | 6   | 8   |                                                                           |
| Accessibility        | 8   | 8   | 6   | C: gesture-only pause, colour-less states                                 |
| Scalability          | 9   | 6   | 7   | A is the existing token system; B needs a parallel card system            |
| Coherence            | 9   | 7   | 7   |                                                                           |
| Performance          | 9   | 8   | 9   | B's shadows everywhere cost paint                                         |

**Chosen: A, plus B's tactile primary button.** The current identity is an asset (the audit scored it
8 / 10); the gaps were next-step clarity, the feel of the one action and layouts beyond 390 px.

## What stayed, what changed

**Preserved**: Expressive Discipline; graphite surfaces; green = proof; Geist / Geist Mono (no font
change — no visible gain to justify it); caps tab labels (brand and the `ia.spec` contract); Rook's
scarcity; every motion rule; the IA and the five tabs.

**Replaced**: the flat primary button (now `btn-primary`); the continuous day bar on Today (segments);
faint Focus controls (buttons); the four-column duel table on phones (two lines); the big empty
head-to-head; the full-height sparse chart; LOCK IN in the aside between 780 and 1179 px (pinned).

## Rejected ideas (and why)

- Collapsing done tasks into "3 feitas" (A's prototype): hides rows tests and people use to undo.
- A separate "next task" card: duplicates the checkbox (two controls with one name).
- Sentence-case tab labels: narrower, but breaks the brand and the five-tab contract in `ia.spec`.
- New Rook placements: ROOK.md's scarcity rules already cover the right moments; no new art needed.
