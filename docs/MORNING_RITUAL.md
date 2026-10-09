# Morning Ritual (V3.2)

**Design the moment. Protect the focus.** Opening the day on HOJE should feel like preparing for a
personal mission — the user's own commitments, a first step, and then out of the way. It evolves the
V2 Phase 4 morning card (docs/NORTH_STAR.md → The morning). ADR-110.

Component: `src/components/today/MorningRitual.tsx` (`useMorningRitual`, `MorningRitual`); state:
`ritualState()` in `src/lib/today.ts` (pure, unit-tested); hand-off: `startDay()` in
`src/components/screens/TodayScreen.tsx`; Rook: `TodayRook` (`greeting`, `started`). E2E:
`tests/e2e/ritual.spec.ts` (project `ritual-390`; `LI_SHOTS=<dir>` also captures 320 / 390 / 1440).

## Diagnosis of the V2 card

- A conventional stats card _below_ a header that already said the same things: streak, standard and
  task count appeared twice, and the header's huge **0 %** greeted a day that had not begun.
- Every fact had the same weight (one mono line); the question "what do I do now?" had no answer.
- Rook was beside the greeting but took no part; nothing marked the start of the day.
- At 320 × 640 the card started below the fold and COMEÇAR O DIA wrapped onto two lines; the button
  and LOCK IN were two equally strong white / green blocks with unclear roles.

## Three directions (explored as prototypes at 390 px, then implemented)

| Direction                  | Strength                                                                 | Weakness                                              |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| A — The Daily Brief        | Editorial sentence, very calm, short                                     | The task is a word inside a sentence; low personality |
| **B — The Morning Ritual** | One surface for the first step + the action; Rook hosts; the day's pills | Tallest — needed compacting                           |
| C — Ready to Execute       | Lowest height, tasks visible at once                                     | Reads as a banner; Rook incidental                    |

**Chosen: B, with C's economy.** The first step is the protagonist, the action sits inside the same
surface, the facts are quiet rows, and the ritual's Proof Pills are the same pieces that Today's bar
shows once the ritual hands over — so the transition has continuity instead of a new screen.

## Structure

Card, sheet or immersive? **Neither a sheet nor an immersive moment**: it is _Today's header in its
morning state_. The ritual takes the place of the day's numbers (%, count, streak, bar) under the
greeting and Rook, until the user starts. Never a modal, a route or Resume State; Today stays usable
below it; the pinned LOCK IN is never covered.

1. **Welcome** — the existing greeting by daypart (`daypartAt`, user's timezone) and Rook, a little
   larger, landing and looking up (`watching` for ~650 ms) before he stands `ready`.
2. **Lead** — one sentence that depends on the day (below).
3. **The step** — one surface: eyebrow, the next task (`nextTaskId`: best-ranked open Top 3 task,
   else the first open task in list order) in heading size with its section · time · `PASSO n DE m`,
   the day as Proof Pills, and the one action.
4. **Facts** — only what is real and not already on screen: META (standard), SEQUÊNCIA (only when
   > 0), PRÓXIMO (next planner event), the partner's status (only with a partner), POR QUÊ (the North
   > Star: current goal → vision → mirror, as written, with `N AÇÕES NESTA SEMANA` when there are some).
   > Yesterday's % and the Top 3 count are no longer repeated (the Top 3 is right below).
5. **Mostrar toda manhã** — the existing `show_morning_briefing` setting (also in Ajustes); × closes.

## States

| State   | When                                     | Lead                                                      | Surface                   | Action           |
| ------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------- | ---------------- |
| `fresh` | tasks, none done                         | `N compromissos hoje. Um passo de cada vez.`              | SEU PRIMEIRO PASSO + task | COMEÇAR O DIA    |
| `going` | some done, something open                | `Você já cumpriu X de N. Siga daqui.`                     | PRÓXIMO PASSO + task      | CONTINUAR O DIA  |
| `done`  | nothing open (all done, or rest skipped) | `Tudo o que você planejou…` / `Nada mais em aberto hoje.` | DIA CUMPRIDO + count      | VER MEU DIA      |
| `empty` | no tasks today                           | `Seu dia ainda não tem compromissos.`                     | PLANEJAR + one line       | PLANEJAR MEU DIA |

No partner → no partner row. Streak 0 → no streak row (never a failure line). Briefing off → no
ritual (unchanged); DEV panel "Resumo do dia de novo" still clears the mark. While it is open the
Perfect Day banner and the empty-routine invitation wait (the ritual already says it).

## The hand-off (state first, motion after)

Tap → the button presses (scale .97) → the ritual closes at once → Rook `ack`s (the user's explicit
start — never on load) and settles back to his size → the day's numbers return with the screen's
`li-fade-up` → the standard line reads **"Pronto. Agora é executar."** (`role=status`) for 2.6 s →
the next task's row lights (`bg-accent-wash`, 900 ms) and **focus moves to its check** (scrolled
into view only when hidden by the pinned LOCK IN; instant scroll with reduced motion). Nothing is
completed, started or navigated; no write is sent. `done` focuses the page title; `empty` opens the
add sheet (as a routine when there are none yet). No confetti — starting a day is not an achievement.

Reduced motion: every keyframe is `motion-safe:`; Rook's pose change is instant; the ritual is fully
readable on the first frame (asserted by e2e).

## Mobile

Checked at 320 × 640, 390 × 844 and 1440 × 900: no horizontal overflow; at 320 the action sits above
the pinned LOCK IN (asserted), the task name clamps to 2 lines (3 above 360 px); on desktop the surface
and facts are `max-w-xl`. Once closed, the task list starts within the first screen (v2-phase4 #11).
