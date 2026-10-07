# ROOK — the LOCKED IN mascot

Component: `src/components/brand/Rook.tsx` (`Rook`, `RookDuo`, `ROOK_POSES`). Tests:
`tests/unit/rook.test.tsx` (`ROOK_SHEET=<dir>` also writes the character sheet as HTML).

## Who is Rook

**The Proof Keeper.** A small corvid sentinel — a rook, from the crow family. He watches, he does not
cheer. Rook does not believe promises; he reacts to **proof**.

## Why Rook

Corvids are attentive, strategic and persistent; they remember, plan and come back. That is the
product: attention, discipline, constancy, observation. The name is also the chess piece that holds
a line — quiet, structural, decisive.

## Personality

Calm · observant · disciplined · loyal · slightly dry · proud when the user executes · persistent ·
minimal.

Never: aggressive, a motivational coach, military, "alpha", depressive, threatening, loud, childish.

**Central rule — Rook never humiliates.** No "Você falhou de novo." He states the fact and leaves a
door open ("Amanhã tem outra chance."), and he never fakes motivation.

## Voice

Rook speaks rarely, in very short lines. Spirit: "Feito." · "Prova registrada." · "Dia fechado." ·
"Você apareceu." · "Mais um." · "Continua." · "Sem hype." · "Bom trabalho."

- Rook speaks only where he adds personality (moments, empty states). Ordinary microcopy is not a
  Rook line.
- At most one Rook line on a screen; never two moments in a row with a line.
- Copy lives in `src/i18n/pt-BR.ts` (`t.rook.*`), like all copy.

## Visual grammar

The approved character sheet ("ROOK — The Proof Keeper", supplied by the owner on 2026-10-07) is the
reference at `public/brand/rook/rook-reference.png`; `Rook.tsx` is an original inline SVG rebuild
of it. The PNG is visual reference only: it is never imported, embedded or rendered by Rook.

- **View**: front-facing and compact, with a broad head above a smaller rounded body.
- **Shape language**: a wide head with cheek tufts + a rounded chest + three asymmetrical crest
  feathers (tall centre swept left) + two layered side wings + two grey feet with toe seams + a
  small faceted grey beak. Simple paths, ellipses and rounded rectangles; soft vector gradients
  give the charcoal volume and mint rim light from the reference.
- **Signature features** (from the sheet): the iconic silhouette with the **three-feather crest**;
  **expressive eyes** — large white eyes, dark pupils with an emerald iris ring and white highlights,
  under a straight graphite lid that dips towards the beak (focused, confident; never angry);
  the **proof core** — a vertical lock-inspired pill on the chest that glows with proof; **the
  wings**, rounded and minimal.
- **Proportions** (120-unit grid): head x 13–107, y 28–82; chest y 65–109; eyes centred at
  x 40.5 / 79.5, y 57, with white contours that follow the brows; beak 16 wide; proof core
  12 × 21 at x 54, y 83; crest up to y 4; feet on y 113.
- **Expressions**: only the eyes (open with a lid of variable depth, closed "happy" arcs, half
  lids) and the beak (closed / open) change; everything else is posture.

### Palette (from the sheet)

| Role               | Colour                                      |
| ------------------ | ------------------------------------------- |
| Graphite (lids)    | `#0d0f12`                                   |
| Head / body        | `#3a4148` → `#1f2429` → `#0d0f12` radial     |
| Wings / crest      | `#3a4148` → `#0d0f12` linear                 |
| Core slot          | `#07080a` with emerald outline              |
| Light grey (beak / feet) | `#a7afb7` + beak shade `#727a82`       |
| Eyes               | sclera `#f3f1ea`, pupil `#08090b`           |
| Emerald (iris, glow) | `#00e676`                                |
| Mint (core, rim)    | `#7cffb3`                                  |

Rook uses the approved sheet's Emerald / Mint palette. The interface accent is independent;
the character colours live in `ROOK_COLORS`.

## Poses

| Pose          | Eyes                                     | Wings | Beak   | Core | Other            | Use                                       |
| ------------- | ---------------------------------------- | ----- | ------ | ---- | ---------------- | ----------------------------------------- |
| `neutral`     | open, light lid                          | rest  | closed | .7   | —                | Default, empty states                     |
| `focused`     | open, deep lid                           | rest  | closed | .8   | —                | Focus start (transition only)             |
| `ready`       | open, high lid                           | +10°  | closed | .85  | stands up        | Morning, onboarding, push setup           |
| `proud`       | happy arcs                               | +14°  | closed | 1    | stands up        | Perfect Day, 30 / 100-day streak, records |
| `celebrating` | happy arcs                               | +62°  | open   | 1    | four green marks | Monthly Champion, 7-day streak            |
| `watching`    | open, looks up                           | −6°   | closed | .55  | crouched         | Duo, waiting for proof                    |
| `supportive`  | happy arcs                               | +6°   | closed | .9   | small heart      | Nudges received, a hard day acknowledged  |
| `tired`       | half lids                                | −8°   | closed | .4   | crouched         | End of a long day — fact, never drama     |
| `reviewing`   | open, looks up                           | rest  | closed | .7   | head tilt −7°    | Day / week review                         |
| Duo           | two small Rooks side by side (`RookDuo`) |       |        |      |                  | DUPLA empty state, duo moments            |

## Motion

- Between poses: CSS transitions on the part transforms (wings, irises, the whole bird), 300 ms,
  `--ease-settle`; eye shapes swap. Core opacity also transitions. Reduced motion makes both instant.
- Stable SVG groups expose `data-part`: `posture`, `feet`, `body`, `wing-left`, `wing-right`,
  `head`, `crest`, `eyes`, `beak`, `proof-core`. Wings pivot at their shoulders; the crest and
  head can be animated independently without tracing or replacing an image.
- Rook never loops. He moves once at a moment (settles, nods, lifts the wing) and stays still.
- Focus: Rook may appear only at the start (READY → FOCUSED) and at the end (a nod); never beside
  the running timer.
- See [MOTION.md](MOTION.md) for the moment choreography (Perfect Day, streak Ring, champion).

## Usage

**Where Rook appears**: onboarding, the morning card (occasionally), important empty states (vision,
week plan, duo), Perfect Day, streak milestones (the Ring), milestones, Monthly Champion, reviews,
push setup.

**Where Rook never appears**: on tasks, on cards in general, in navigation, beside trivial numbers,
continuously during Focus. Scarcity is the point.

## Do / Don't

- Do keep him small (24–96 px in the app; up to 192 px in a celebration).
- Do pair him with words; he never carries information alone.
- Don't recolour him, add accessories, or make him jump; the open beak is for celebrating only.
- Don't put the users' faces or names on Rooks; the duo is two birds, not two avatars.
- Don't make him sad on failure. `tired` is for the end of a long day, not for punishment.

## Accessibility

- Decorative by default: `aria-hidden`, not focusable. A `label` is passed only when Rook himself
  carries meaning (rare); the visible text next to him always says the same thing.
- No information in motion alone; every moment has its text.
- Contrast: the eyes (sclera ≈ 17 : 1) and the proof core carry the figure on dark; the body is
  graphite on graphite by design, outlined by the green rim light.

## Uniqueness check

Checked against Duolingo's Duo, the Twitter / X bird, GitHub's Octocat, Discord's Clyde, Angry
Birds and the generic esports raven. Rook shares the "big eyes, compact body" family of friendly
mascots, so his identity rests on what is his alone: graphite (never green) body, the three-feather
crest, the straight focused lid, the small grey beak and the glowing proof core. Never give him a
green body, round "owl" eye discs, a big orange beak or a flame.

## Sizes

Checked at 24, 32, 48, 96, 192 and 512 px on dark and as a pure black silhouette (24 / 32 / 64):
the crest + round body + wings read at 24 px; the eyes and core read from 32 px. In the app he is
used between 40 and 160 px.
