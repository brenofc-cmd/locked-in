# LOCKED IN — Motion

Motion **explains, confirms, connects and celebrates**. It never delays: state changes first, the
animation follows. Every day is calm; proof may be loud, briefly. Keyframes and easings live in
`src/app/globals.css`; tests in `tests/e2e/design.spec.ts` and `tests/e2e/v2-phase9.spec.ts`.

## Duration scale and easing

| Level | Name        | Duration    | Use                                                        |
| ----- | ----------- | ----------- | ---------------------------------------------------------- |
| 0     | Static      | —           | Data and reading                                           |
| 1     | Micro       | 100–250 ms  | Press, check, toggle, chevron, chip, nav tap               |
| 1½    | Character   | 350–700 ms  | Rook's one-shot actions (ack, tap, lock)                   |
| 2     | Transition  | 180–350 ms  | Sheet, accordion, screen entry (fade + 10 px), pose change |
| 3     | Celebration | 700–1800 ms | Perfect Day, streak milestones, Monthly Champion — rare    |

Easings: `--ease-out-quick` `cubic-bezier(.2,.8,.2,1)` (most things), `--ease-settle`
`cubic-bezier(.32,.72,0,1)` (landing, settling), `--ease-spring` `cubic-bezier(.34,1.3,.64,1)` (the
check only — a hint of spring, never elastic). Only `transform` and `opacity` animate (plus colour
transitions and SVG stroke drawing); never layout properties.

## Task completion (the core microinteraction)

Tap → the checkbox is checked at once (`aria-checked`, optimistic write) → the box presses and springs
back in full lime (`li-check-pop`: 78 % → 110 % → 100 %, 420 ms) while one ring leaves it
(`li-check-ring`, 500 ms) and the check draws (280 ms, 100 ms in) → after ~420 ms it settles to the
quiet done state (`accent-strong` + green check); the name dims and its strike **draws** across it
(per line, 300 ms; retracts on undo) → on the Proof Track (V3.3) the new segment's fill slides in from
the left (500 ms) and one light passes over every proved segment, left to right (`li-sheen`, 650 ms,
260 ms in, 45 ms apart; only when proof goes **up**, never on load or undo) →
a light haptic (`navigator.vibrate(8)`) where the platform allows, only from the user's own tap →
Today's Rook acknowledges (`ack`: Core lights, blink, nod, wings, settle, ~650 ms). No confetti.
Interaction is never blocked.

## The primary button (V3)

The one element with depth: pressed, `btn-primary` sinks 3 px onto its darker edge (transform + box
shadow, 100 ms, `--ease-out-quick`); with reduced motion the edge still changes, the move is instant.
Secondary buttons keep the 150 ms press scale.

## Morning Ritual (V3.2)

Opening: the ritual fades up (400 ms), its surface settles (`li-settle`, 60 ms later), Rook lands and
looks up, then stands. Starting: the button presses, the ritual closes at once, Rook `ack`s, the numbers
fade up, "Pronto. Agora é executar." for 2.6 s, the next row lights once (900 ms) and takes focus. No
confetti. docs/MORNING_RITUAL.md.

## Navigation

Tabs: colour change + a 150 ms press scale. Screens enter with a 400 ms fade + 10 px rise
(`li-fade-up`). No heavy route transitions.

## Focus

The quietest screen; the timer dominates; nothing competitive moves. LOCK IN → the session fades in
(700 ms); Rook (52 px, above the task) goes `focused` and `lock`s in — the wings come in towards the
Proof Core, a slight lean, the Core turns ACTIVE — then stays almost still: an occasional blink every
~7 s, nothing else (no blink with reduced motion; Core IDLE while paused). The ring advances once a
second (linear, local clock — no network). Paused: the timer dims. Complete: Rook `proud` + `ack`
(the wings relax, a nod, the Core pulses once) above the real minutes, then the reflection.

## Streak — a hierarchy, not one animation made bigger

LOCKED IN's own streak language (not a flame): the Proof Core and **the Ring** (emerald, the Core's
colour).

- **Ordinary day** (the standard is met while the app is open): small — the streak number on Today
  settles in the streak colour inside a thin ring that closes once and fades; Today's Rook Core
  turns PROOF. No takeover.
- **7 days** (stage, the first real milestone): calm → anticipation (Rook crouches, watching) → the
  Proof Core charges (MILESTONE) → Rook opens his wings (`celebrating`) as the Ring draws closed →
  the **7** badge lands → he settles `proud`.
- **30 days** (stage, rarer): the same arc, plus a second inner ring and a Core that stays at
  MILESTONE through the settle.
- **100 days** (stage, rare): a silhouette (Rook at 12 % brightness, Core OFF) → the Proof Core
  ignites through the silhouette → Rook is revealed `proud` → a strong Ring → the **100** badge →
  "100 DIAS DE PROVA." Premium, not spectacle: no particles, no flashes.

## Perfect Day

The day's peak-end moment: when the last valid task closes the day, the screen quiets for a beat (a
35 % dim that fades out, behind the card), the Proof Core turns PROOF with an `ack`, Rook settles
`proud` over a small disc of light, DIA PERFEITO and the count. Shown once per day (database
`seen_at`). No particles, no sound.

## Milestones

Focus 10 h (card) / 50 h, 100 h (stage): a clock ring of 12 ticks in the focus tone appearing one by one
— never the streak Ring. Perfect Days 5 / 10 (card) / 30 (stage): the Ring. Locked / near / reached
are distinct in words and colour on PROGRESSO (no animation there).

## Monthly Champion

The biggest competitive moment, still premium: the stage opens (`li-stage-in`, 500 ms, ≤ 4 % scale),
the Core charges to MILESTONE, Rook lifts his wings and a geometric **rook-tower crown** (the chess
rook's battlements) draws itself above him, then he settles `proud`; CAMPEÃO DE <MÊS> + the real
score. No trophy, coins, XP, fireworks or confetti. A draw gets the stage without the crown.

## Duo

Small, human feedback: nudge sent / received → a toast with a 32 px Rook doing `tap`; a reaction to
my task → `ack`; the daily duel's numbers settle when the score changes (`li-settle`). No celebration
on DUPLA.

## Daily duel

No celebration: when the score changes the numbers settle (`li-settle`, 450 ms). Intensity is saved for
the month.

## Rook

Pose changes are 300 ms `--ease-settle` transitions of his parts. He moves once and stays still; he
never loops. Rarity rules apply: morning (Mondays and day 1), empty states, moments.

## Failure

Never animated aggressively: no shake, no red flash, no sad mascot. A missed day is shown as a fact
with a way forward.

## Celebration rules (unchanged from Phase 9)

Shown once (database `seen_at`), one at a time, non-modal (`role=status`), auto-close after 2 s (card)
or 4.2 s (stage) of visible time, held while pointed at or focused, OK / CONTINUAR to close. Never a
live month, a partner's result or anything not verified.

## Reduced motion

`prefers-reduced-motion: reduce` (system setting — no separate in-app switch, to avoid a second source
of truth):

- every keyframe animation is `motion-safe:` and/or jumps to its end state (global rule:
  `animation-duration: .01ms`);
- transforms change instantly (`transition-property` limited to colour / opacity / stroke);
- colour and opacity feedback remain (the check still fills, the row still dims);
- no zoom, no translate, no bounce, no particles, no loop (the Focus idle blink is off); Rook's
  actions do not play (`lock` shows its end state); celebration stories show their last frame at
  once.

No information depends on motion: every moment has its text, every state its ARIA.
