# LOCKED IN — Motion

Motion **explains, confirms, connects and celebrates**. It never delays: state changes first, the
animation follows. Every day is calm; proof may be loud, briefly. Keyframes and easings live in
`src/app/globals.css`; tests in `tests/e2e/design.spec.ts` and `tests/e2e/v2-phase9.spec.ts`.

## Duration scale and easing

| Level | Name        | Duration    | Use                                                        |
| ----- | ----------- | ----------- | ---------------------------------------------------------- |
| 0     | Static      | —           | Data and reading                                           |
| 1     | Micro       | 100–200 ms  | Press, check, toggle, chevron, chip, nav tap               |
| 2     | Transition  | 180–350 ms  | Sheet, accordion, screen entry (fade + 10 px), pose change |
| 3     | Celebration | 700–1800 ms | Perfect Day, streak milestones, Monthly Champion — rare    |

Easings: `--ease-out-quick` `cubic-bezier(.2,.8,.2,1)` (most things), `--ease-settle`
`cubic-bezier(.32,.72,0,1)` (landing, settling), `--ease-spring` `cubic-bezier(.34,1.3,.64,1)` (the
check only — a hint of spring, never elastic). Only `transform` and `opacity` animate (plus colour
transitions and SVG stroke drawing); never layout properties.

## Task completion (the core microinteraction)

Tap → the checkbox is checked at once (`aria-checked`, optimistic write) → the box presses ~8 % and
flashes full green while the check draws (300 ms) → after ~420 ms it settles to the quiet done state
(`accent-strong` + green check), the name dims and strikes through → the progress bar's fill grows and
a single glow passes over it (`li-bar-pulse`, 600 ms, only when progress goes **up**, never on load) →
a light haptic (`navigator.vibrate(8)`) where the platform allows, only from the user's own tap. No
confetti. Interaction is never blocked.

## Navigation

Tabs: colour change + a 150 ms press scale. Screens enter with a 400 ms fade + 10 px rise
(`li-fade-up`). No heavy route transitions.

## Focus

The quietest screen. LOCK IN → the session fades in (700 ms); Rook appears focused for ~1.9 s at the
top (`li-cameo`), then leaves the timer alone — Rook never animates beside a running timer. The ring
advances once a second (linear). Paused: the timer dims and breathes. Complete: Rook lands proud above
the real minutes (`li-rook-land`), then the reflection.

## Streak — The Ring

LOCKED IN's own streak language (not a flame): a thin ring of light behind Rook.

- **7 days** (card): the Ring draws itself closed (`li-ring-draw`, 900 ms), Rook lifts his wings
  (`celebrating`).
- **30 days** (stage): the Ring closes and a second, inner ring fades in; Rook `proud`.
- **100 days** (stage, rare): the full Ring with **100** at its top; Rook `proud`; title + "SEM HYPE.
  SÓ PROVA."; CONTINUAR.

## Perfect Day

The day's peak-end moment: when the last valid task closes the day, a card with Rook landing proud
over a small disc of light, DIA PERFEITO and the count. No particles, no sound.

## Milestones

Focus 10 h (card) / 50 h, 100 h (stage): a clock ring of 12 ticks in the focus tone appearing one by one
— never the streak Ring. Perfect Days 5 / 10 (card) / 30 (stage): the Ring. Locked / near / reached
are distinct in words and colour on PROGRESSO (no animation there).

## Monthly Champion

The biggest competitive moment, still premium: the stage opens (`li-stage-in`, 500 ms, ≤ 4 % scale),
the crest of light draws itself above Rook (`celebrating`), CAMPEÃO DO MÊS + the score. No trophy, no
fireworks, no confetti. A draw gets the same stage without the crest.

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
or 3.2 s (stage) of visible time, held while pointed at or focused, OK / CONTINUAR to close. Never a
live month, a partner's result or anything not verified.

## Reduced motion

`prefers-reduced-motion: reduce` (system setting — no separate in-app switch, to avoid a second source
of truth):

- every keyframe animation is `motion-safe:` and/or jumps to its end state (global rule:
  `animation-duration: .01ms`);
- transforms change instantly (`transition-property` limited to colour / opacity / stroke);
- colour and opacity feedback remain (the check still fills, the row still dims);
- no zoom, no translate, no bounce, no particles; the Focus cameo is not shown; celebrations appear in
  their final frame.

No information depends on motion: every moment has its text, every state its ARIA.
