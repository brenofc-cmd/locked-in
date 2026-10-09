# LOCKED IN — Design System

The system behind every screen after the final V2 design pass (2026-10-07), evolved by the V3 mobile
pass (2026-10-08, ADR-107: [DESIGN_DIRECTION_V3.md](DESIGN_DIRECTION_V3.md),
[DESIGN_VERIFICATION_V3.md](DESIGN_VERIFICATION_V3.md)) and re-skinned the same day as **Obsidian
Energy** from the owner's Claude Design handoff "LOCKED IN V3" (ADR-108,
[DESIGN_OBSIDIAN_V3.md](DESIGN_OBSIDIAN_V3.md)). Research and audit:
[FINAL_DESIGN_RESEARCH.md](FINAL_DESIGN_RESEARCH.md). Motion: [MOTION.md](MOTION.md). Mascot:
[ROOK.md](ROOK.md). Tokens live in one place — `src/app/globals.css` (`@theme`) — and components use
their utilities; an arbitrary value (`text-[13px]`, `rounded-[10px]`, `border-white/9`, `#1b1b1e`) is a
bug unless it is geometry that has no token (a 296 px ring, a 52 px field height).

The IA and layout still come from the approved Claude Design (`design-reference/`, see
[DESIGN_REFERENCE.md](DESIGN_REFERENCE.md)); this document supersedes its literal values.

## Brand

**LOCKED IN — Sem hype. Só prova.** Focus, execution, consistency, accountability, progress. The
interface is **Expressive Discipline** in the **Obsidian Energy** skin (V3): warm charcoal, proof
lime, condensed type for the numbers; FOCO changes room to an ink stage with a serif timer. Calm and
quiet for everyday use, expressive only when the user has proved something. Signature: the **Proof
Pill** — the vertical pill in the mark and in Rook's chest is the app's unit (one per commitment:
empty, pointed at, dashed when skipped, filled when proved). Dark, premium, focused, tactile, disciplined, alive — never cyberpunk, neon
gamer, fintech, admin dashboard or a game full of coins.

## Colour

| Token                             | Value                             | Role                                                             |
| --------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `page`                            | `#0a0c0d`                         | Behind the app                                                   |
| `bg`                              | `#101315`                         | App background — warm charcoal, not pure black                   |
| `overlay`                         | `#0b0d0e`                         | Full-screen moments (reviews, milestones)                        |
| `card`                            | `#1b2022`                         | Surface: duel, records, invite code, floating nav                |
| `sheet`                           | `#191e20`                         | Sheets, profile menu                                             |
| `chip` / `selected` / `raised`    | `#1f2527` / `#242a2d` / `#2a3134` | Segmented controls / disabled primary / toast, active tab pill   |
| `avatar`                          | `#2c3336`                         | The partner's avatar                                             |
| `field`                           | `#111416`                         | Inputs                                                           |
| `text`                            | `#f5f3ec`                         | Primary text (17.4 : 1)                                          |
| `muted`                           | `#a9ada6`                         | Secondary text (8.4 : 1)                                         |
| `dim`                             | `#868b85`                         | Meta / tertiary on `bg` (5.4 : 1) — use `muted` on `chip` and up |
| `ghost`                           | `#5a5e5b`                         | Non-text only: chevrons, empty values, skipped outline           |
| `faint` / `off`                   | `#474b49` / `#333a3d`             | Decorative only; `off` = a switch's off track                    |
| `line` / `-strong` / `-bold`      | ivory 7 / 12 / 24 %               | Hairline / control outline / emphasis                            |
| `line-check`                      | ivory 32 %                        | An open checkbox                                                 |
| `accent`                          | `#c5f277`                         | **Lime = proof**: done, progress, the primary action, the brand  |
| `accent-deep`                     | `#7e9c45`                         | The primary button's 4 px edge — never a fill                    |
| `accent-strong` / `accent-done`   | `#3b482d` / `#9dbe5f`             | A done checkbox: quiet fill / its border (the check stays lime)  |
| `accent-dim` / `accent-met`       | `#5d7036` / `#2c3523`             | A met (not perfect) chart bar / calendar day                     |
| `accent-wash`                     | `#1c2419`                         | Selection, the row's flash after completing                      |
| `streak`                          | `#f2be6e`                         | Streak, milestones, pending (amber)                              |
| `focus`                           | `#9db7e0`                         | Focus time, shared events                                        |
| `danger` / `missed`               | `#ee8b6e` / `#c98370`             | Destructive, error / a day below the standard (always dashed)    |
| `partner`                         | `#e6e1d3` at 45 %                 | The partner's bar                                                |
| `stage` / `stage-field`           | `#1c201d` / `#232825`             | The FOCO ink stage / its fields                                  |
| `stage-text` / `-soft` / `-muted` | `#f4f1e8` / `#c9c5b9` / `#a8a497` | Ivory text on the stage                                          |
| `strike` / `marker`               | ivory 30 % / 35 %                 | Line-through on done work / the standard's tick                  |
| `rook-glow`                       | `rgb(0 230 118 / .55)`            | Rook's emerald glow only (ROOK.md palette), never UI             |

Rules: lime is never decoration — it is not the colour of every button, icon or label. Done work is
quiet (`accent-strong` fill, `accent-done` border, lime check); open work stays the loudest thing. No
colour carries meaning alone (presence has words, milestones say QUASE / CONQUISTADO, the duel prints
the leader, a missed day is dashed).

## Typography

**Archivo** (interface and numbers, with its width axis), **JetBrains Mono** (eyebrows, meta, states,
primary button labels — short caps only) and **Newsreader** (FOCO stage only: the timer, the task in
italics, minutes done). Loaded with `next/font/google` in `src/app/layout.tsx`
(`--font-sans` / `--font-mono` / `--font-stage`). Sizes in `rem`:

| Utility                        | Size                    | Use                                                        |
| ------------------------------ | ----------------------- | ---------------------------------------------------------- |
| `text-tab`                     | 10.5                    | Condensed tab labels, PRÓXIMA / PULADA marks               |
| `text-meta`                    | 11                      | Mono eyebrows, meta, timestamps, labels                    |
| `text-small`                   | 13                      | Secondary lines, notes, facts                              |
| `text-body`                    | 15                      | Rows, body copy (inputs stay `text-base` 16 → no iOS zoom) |
| `text-lead`                    | 17                      | Task names, plan rows, sheet titles                        |
| `text-title`                   | 22                      | Section-level titles, record values                        |
| `text-heading`                 | 26                      | Statements                                                 |
| `text-number`                  | 32                      | Stat numbers                                               |
| `text-display`                 | 38                      | Page title on desktop                                      |
| `text-num-l` … `text-num-hero` | 44 / 64 / 76 / 96 / 112 | Scores, hero %, timers                                     |
| `text-num-today`               | 108                     | Today's % on a phone (64 under 360 px)                     |

- `page-title` = Archivo 700 at 88 % width, 31 px (28 under 360 px, 38 from 780 px).
- `num` = Archivo 800 at 68 % width, −.02em, tabular — every big number (Today's %, scores, stats,
  streak). `cond` = 88 % width for statements and sheet titles.
- `eyebrow` = mono 11 px caps, `tracking-eyebrow`. **Caps only for eyebrows / meta / tabs**.
- Tracking roles: `tracking-meta` (.08em), `tracking-eyebrow` (.16em), `tracking-brand` (.24em).
- Numbers that change (focus, streak, duel, progress, timers) are tabular.

## Spacing

A 4 px grid (Tailwind steps). Page gutter 20 px on phones (`px-5`), 32 / 52 px on desktop / wide.
Vertical rhythm between sections: 32 px phone, 48 px desktop (`gap-8 desk:gap-12`). Half steps (6, 10,
14 px) only inside a component (icon ↔ label). No arbitrary pixel spacing.

## Radius

`rounded-xs` 2 (bars) · `-sm` 4 (ticks) · `-lg` 8 (chips) · 11 px (checkbox) · `-xl` 12 (fields) ·
14 px (secondary buttons) · `-2xl` 16 (primary buttons, cards) · 22 px (floating nav) · `-3xl` 24
(sheets, the duel card) · `-full` (Proof Pills, avatars, dots).

## Surfaces

Elevation by lighter charcoal, not by shadow: `bg` → `card` → `sheet` → `raised`. Shadows only on
things that float over content (the tab bar, sheets, toasts, dialogs). **A card exists only when grouping
helps** (the morning card, a celebration); otherwise sections are typography + a hairline.

## Icons

One family: 1.6 px strokes, round caps and joins, 22 px boxes (`src/components/icons.tsx`),
`currentColor`. Chevrons are the `›` glyph in `ghost`. No filled / outlined mix.

## Buttons

| Kind    | Look                                                       | Use                                     |
| ------- | ---------------------------------------------------------- | --------------------------------------- |
| Primary | `btn-primary`, 56–58 px, mono 700 caps .2em, `rounded-2xl` | One per context (LOCK IN, PRONTO)       |
| Light   | `bg-text text-bg` / `bg-stage-text` on the stage           | Closing a moment, RETOMAR               |
| Outline | `border-line-bold`, 48 px, 14 px radius, 15 px semibold    | Secondary actions                       |
| Text    | no border, `text-muted` → `text-text`, 44 px tall          | Tertiary (Reagir, Ver toda a atividade) |

States: rest · hover (desktop: text brightens) · **pressed** (the primary sinks 3 px onto its edge in
100 ms; others `active:scale-[.96–.98]`) · focus (2 px lime outline, 2 px offset) · disabled
(`opacity-60` or `bg-selected text-ghost`) · pending (inline "Salvando…", never a big spinner).
Targets ≥ 44 px; primaries 56–58 px.

## Rows

A row is the unit of the app: min 52 px (tasks 66 px), hairline below. **Task rows (V3)**: the text
(PRÓXIMA eyebrow, rank, name, meta) is one button that opens the options; the **check sits on the
right edge** (thumb side) — a 32 px box with an 11 px radius inside a 52 px target. Open: ivory 32 %
outline; PRÓXIMA: lime outline; skipped: dashed `ghost`; completing: a lime beat (scale .9, spring),
then the quiet done state. Swipe, long-press and right-click still work.

## Forms

Fields: `bg-field`, 1.5 px `border-line-strong`, `rounded-xl`, 54 px, 16 px text, focus →
`border-line-bold`.
Labels above, hints in `text-small text-dim`, errors in words (what happened + what to do), never raw
server messages.

**Depth is reserved for the primary button** (V3): `btn-primary` = proof lime on a 4 px
`accent-deep` edge; pressed, it sinks 3 px onto the edge (transform + shadow, 100 ms). Every primary
button in the app uses the utility — never hand-rolled `bg-accent text-bg`. A disabled primary
(`aria-disabled`) drops to `bg-selected text-ghost` with no edge.

## Today: Proof Pills, PRÓXIMA and LOCK IN (V3)

- **PRÓXIMA**: Today marks one open task in place — the best-ranked open Top 3 task, else the first
  open task in list order (`nextTaskId` in `src/lib/today.ts`; never done or skipped): a lime mono
  eyebrow above the name and a lime checkbox outline. Visual only (`aria-hidden`).
- **Proof Track** (V3.3, `ProofTrack` in `src/components/proof-track.tsx`; `dayPills()` +
  `trackOrder()` in `src/lib/today.ts`): the Proof Pills as one segmented track — a 12 px segment
  per task, 4 px gaps, full width, in **fill order**: proof (lime), the PRÓXIMA task (lime inner
  outline), open (`line-strong`), skipped (dashed) last — so the day fills from the left. The Daily
  Standard is a tick in the gap after the segment that meets it (`marker`, lime once met). Up to 24
  segments, a continuous bar above that. The Morning Ritual uses the same track at 8 px. Beside it:
  the next line and `PADRÃO n%`. (Replaced the 34 px pills in list order, whose glow was a rectangle
  over the first n % of the width — not over the proved pills.)
- **LOCK IN** (pinned above the tab bar on a phone, until `wide`): names the PRÓXIMA task under the
  label and opens the duration sheet already on it (only when no task was picked by hand).

## Navigation

Phone: a **floating tab bar** (V3) — 64 px, 10 px from the sides, 26 px above the safe area, 22 px
radius, `card` with a hairline and the one floating shadow; centred at 672 px on tablets. Five tabs
(HOJE · DUPLA · FOCO · PLANEJAR · PROGRESSO), condensed caps (10.5 px at 82 % width — PROGRESSO fits
320 px); the current tab = a filled `raised` pill + weight 800; FOCO keeps its lime icon. It hides
under the FOCO stage and full-screen moments. Content scrolls under it (`main` pads 112 px + safe area,
`scroll-padding-bottom` 200 px). Desktop: the sidebar. See [NAVIGATION.md](NAVIGATION.md).

## States

- **Sparse data** (V3): a chart with fewer than 3 recorded days in its window is shorter (96 px) and
  says so in a sentence; every bar stays (each is a fact). An empty head-to-head (no contested week)
  leads with its sentence, a 32 px dim score and a thin strip of labelled week marks.
- **Empty**: context + an action, never "Nenhum dado". Important empty states (vision, the week, no
  partner) may carry Rook; the rest a sentence.
- **Loading**: screens arrive with their data (server-loaded, `loadAppData`), so there is no loading
  screen; actions show an inline pending label; no full-screen spinner. If a deferred section is ever
  added, it gets a skeleton of its known layout.
- **Error**: what happened and what the user can do; toasts for transient failures.
- **Offline**: the branded `/offline` page.
- **Toasts**: one stack, max 3, same radius / motion, top on phones, bottom-right on desktop.

## Charts

Bars without grid lines; values on the bars only when they fit (≤ 7); 100 % lime, met `accent-dim`,
below the standard a dashed `missed` outline; today's bar is a dashed outline until the day closes;
each bar is a list item with an accessible name. Calendar (V3 heat): perfect = lime tile, met =
`accent-met` tile, missed = dashed outline, with a legend in words — never colour alone.

## Responsive

Mobile-first; first-class at 320 / 360 / 375 / 390 / 430. Auto-fit grids use
`minmax(min(300px,100%),1fr)` — a fixed 300 px minimum overflowed 320 px screens while `<main>`'s
`overflow-x: hidden` hid it (test 8 in `design.spec.ts` now measures every box). Today's LOCK IN bar
stays pinned until `wide`, where the aside sits beside the tasks. The daily duel (V3) is a card: both
avatars with the score between them, the leader in a sentence, then per category the name and leader,
a share bar (`categoryShare`, lime vs the partner's ivory) and both values. Breakpoints: `desk` 780 px (sidebar), `wide` 1180 px
(two columns). Desktop uses width with intent (max 1120 px content, a side rail) — never a stretched
phone, never a 4-column dashboard. Tablets below `desk` keep a phone measure (content `max-w-2xl`,
672 px, centred; the top bar stays full width, the tab bar is centred) instead of rows stretched edge to edge. Verified at 320 → 1920 with no horizontal scroll. Sticky action
bars (Today, Focus) float above the tab bar and respect the safe area; `main` has `scroll-padding-bottom` so focus never hides
under them.

## Accessibility

WCAG 2.2 AA: text ≥ 4.5 : 1, UI / graphics ≥ 3 : 1, visible 2 px focus everywhere, targets ≥ 24 px
(44 px for primary), full keyboard (Tab / Enter / Space / Escape), state in text and ARIA, decorative
art `aria-hidden`, animation never the only carrier of information, reduced motion honoured
([MOTION.md](MOTION.md)). Axe: 0 serious / critical on every main screen at 390 and 1440
(`tests/e2e/design.spec.ts`).

## App icon

V3 (applied, from the owner's handoff): the rounded lime square holding one Proof Pill on `bg`
(`scripts/generate-icons.mjs` → `public/icons`; `LogoMark` in `src/components/ui.tsx`). Legible from
16 px and tied to Rook's Proof Core.

## Visual regression

`tests/e2e/visual.spec.ts` (project `visual`, `LI_SHOTS=<dir>`, optional `LI_SHOTS_WIDTHS`): seeds a
real day and duo on DEV and captures HOJE, DUPLA, FOCO, PLANEJAR, PROGRESSO, Planner, Metas, Semana,
Ajustes (first viewport + full page) and both reviews at each width. Skipped in normal runs.
