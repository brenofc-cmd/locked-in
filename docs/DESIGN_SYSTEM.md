# LOCKED IN — Design System

The system behind every screen after the final V2 design pass (2026-10-07), evolved by the V3 mobile
pass (2026-10-08, ADR-107: [DESIGN_DIRECTION_V3.md](DESIGN_DIRECTION_V3.md),
[DESIGN_VERIFICATION_V3.md](DESIGN_VERIFICATION_V3.md)). Research and audit:
[FINAL_DESIGN_RESEARCH.md](FINAL_DESIGN_RESEARCH.md). Motion: [MOTION.md](MOTION.md). Mascot:
[ROOK.md](ROOK.md). Tokens live in one place — `src/app/globals.css` (`@theme`) — and components use
their utilities; an arbitrary value (`text-[13px]`, `rounded-[10px]`, `border-white/9`, `#1b1b1e`) is a
bug unless it is geometry that has no token (a 296 px ring, a 52 px field height).

The IA and layout still come from the approved Claude Design (`design-reference/`, see
[DESIGN_REFERENCE.md](DESIGN_REFERENCE.md)); this document supersedes its literal values.

## Brand

**LOCKED IN — Sem hype. Só prova.** Focus, execution, consistency, accountability, progress. The
interface is **Expressive Discipline**: calm and quiet for everyday use, expressive only when the user
has proved something. Dark, premium, focused, tactile, disciplined, alive — never cyberpunk, neon
gamer, fintech, admin dashboard or a game full of coins.

## Colour

| Token                        | Value                  | Role                                                                    |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `page`                       | `#08080a`              | Behind the app (desktop margins)                                        |
| `bg`                         | `#0c0c0e`              | App background — deep graphite, not pure black                          |
| `overlay` / `stage`          | `#0a0a0c` / `#09090b`  | Full-screen moments (reviews / focus)                                   |
| `card`                       | `#131316`              | Surface (cards, morning)                                                |
| `sheet`                      | `#151518`              | Sheets                                                                  |
| `chip` / `raised`            | `#18181b` / `#1b1b1f`  | Chips, toasts, celebrations (elevated)                                  |
| `selected`                   | `#1f1f23`              | Selected control, active tab pill                                       |
| `field`                      | `#111114`              | Inputs                                                                  |
| `text`                       | `#eceae4`              | Primary text — off-white (no glare)                                     |
| `muted`                      | `#a6a59f`              | Secondary text (≥ 6.9 : 1)                                              |
| `dim`                        | `#8e8d87`              | Meta / tertiary text (≥ 5.1 : 1 on every surface)                       |
| `ghost`                      | `#64635e`              | Non-text: chevrons, disabled labels, empty values (≥ 3 : 1 on `bg`)     |
| `faint` / `off`              | `#4a4a4e` / `#333337`  | Decorative only: strokes, empty tracks — never text                     |
| `line` / `-strong` / `-bold` | white 7 / 12 / 24 %    | Hairline divider / outline of a control / emphasis                      |
| `accent`                     | `#c6e07b`              | **LOCKED green = proof**: done, progress, the primary action, the brand |
| `accent-deep`                | accent 58 % on black   | The primary button's edge (V3) — never a fill                           |
| `strike` / `marker`          | text 25 % / 35 %       | Line-through on done work / the standard's tick on a bar                |
| `rook-glow`                  | `rgb(0 230 118 / .55)` | Rook's emerald glow only (ROOK.md palette), never UI                    |
| `streak`                     | `#e6b45e`              | Streak / celebration warmth (amber)                                     |
| `focus`                      | `#9fb3d1`              | Focus time (a discreet cool tone)                                       |
| `danger`                     | `#e5765f`              | Destructive, failed day (as fact)                                       |
| `missed`                     | `#c27463`              | Missed day in the calendar                                              |

Rules: green is never decoration — it is not the colour of every button, icon or label. Done work is a
quiet green (`accent-strong` fill + `accent` check); open work stays the loudest thing. No colour
carries meaning alone (presence has words, milestones say QUASE / CONQUISTADO, the duel prints the
leader).

## Typography

Geist (sans) and Geist Mono. Thirteen sizes in `rem`, so the user's font size is respected:

| Utility                        | Size                    | Use                                                        |
| ------------------------------ | ----------------------- | ---------------------------------------------------------- |
| `text-tab`                     | 10                      | Tab labels under 360 px only (the iOS tab-label size)      |
| `text-meta`                    | 11                      | Mono eyebrows, meta, timestamps, labels                    |
| `text-small`                   | 13                      | Secondary lines, notes, facts                              |
| `text-body`                    | 15                      | Rows, body copy (inputs stay `text-base` 16 → no iOS zoom) |
| `text-lead`                    | 17                      | Task names on phones, sheet titles                         |
| `text-title`                   | 22                      | Section-level titles, record values                        |
| `text-heading`                 | 26                      | Page title on phones                                       |
| `text-number`                  | 32                      | Stat numbers                                               |
| `text-display`                 | 38                      | Page title on desktop                                      |
| `text-num-l` … `text-num-hero` | 44 / 64 / 76 / 96 / 112 | Scores, hero %, timers                                     |

- `page-title` utility = the one page title (26 → 22 under 384 px → 38 from 780 px).
- `eyebrow` utility = mono 11 px caps with `tracking-eyebrow`. **Caps only for eyebrows / meta**,
  never paragraphs.
- Tracking roles: `tracking-meta` (.08em), `tracking-eyebrow` (.16em), `tracking-brand` (.24em,
  the wordmark and stamps), `tracking-display` (−.025em), `tracking-number` (−.05em).
- Numbers that change (focus, streak, duel, progress, timers) use `tabular-nums`.

## Spacing

A 4 px grid (Tailwind steps). Page gutter 20 px on phones (`px-5`), 32 / 52 px on desktop / wide.
Vertical rhythm between sections: 32 px phone, 48 px desktop (`gap-8 desk:gap-12`). Half steps (6, 10,
14 px) only inside a component (icon ↔ label). No arbitrary pixel spacing.

## Radius

`rounded-xs` 2 (bars) · `-sm` 4 (ticks, tiny marks) · `-lg` 8 (chips, small controls) · `-xl` 12
(buttons, fields, checkboxes) · `-2xl` 16 (cards, toasts, celebrations) · `-3xl` 24 (sheets) ·
`-full` (pills, avatars, dots).

## Surfaces

Elevation by lighter graphite, not by shadow: `bg` → `card` → `sheet` → `raised`. Shadows only on
things that float over content (toasts, celebrations, sheets). **A card exists only when grouping
helps** (the morning card, a celebration); otherwise sections are typography + a hairline.

## Icons

One family: 1.6 px strokes, round caps and joins, 22 px boxes (`src/components/icons.tsx`),
`currentColor`. Chevrons are the `›` glyph in `ghost`. No filled / outlined mix.

## Buttons

| Kind    | Look                                              | Use                                     |
| ------- | ------------------------------------------------- | --------------------------------------- |
| Primary | `btn-primary`, 52–62 px, mono caps, `rounded-2xl` | One per context (LOCK IN, CONCLUIR)     |
| Light   | `bg-text text-bg`                                 | Closing a moment (reviews)              |
| Outline | `border-line-strong`, 44 px, `rounded-xl`         | Secondary actions                       |
| Text    | no border, `text-dim` → `text-text`, 44 px tall   | Tertiary (Reagir, Ver toda a atividade) |

States: rest · hover (desktop: text brightens) · **pressed** (`active:scale-[.96–.98]`, phones feel the
tap) · focus (2 px accent outline, 2 px offset) · disabled (`opacity-60` or `ghost` text) · pending
(inline label "Salvando…", never a big spinner). Targets ≥ 44 px for primary actions, never under 24.

## Rows

A row is the unit of the app (tasks, partner tasks, activity, plan hub, settings): min 52 px (tasks
64 px), hairline below, primary text left, meta right in mono. One tap does the main thing; options
live behind `···` / long-press / swipe.

## Forms

Fields: `bg-field`, `border-line-strong`, `rounded-xl`, 52 px, 16 px text, focus → `border-line-bold`.
Labels above, hints in `text-small text-dim`, errors in words (what happened + what to do), never raw
server messages.

**Depth is reserved for the primary button** (V3): `btn-primary` = proof green on a 4 px
`accent-deep` edge; pressed, it sinks 3 px onto the edge (transform + shadow, 100 ms). Every primary
button in the app uses the utility — never hand-rolled `bg-accent text-bg`. A disabled primary
(`aria-disabled`) drops to `bg-selected text-ghost` with no edge.

## Today's pointer and bar (V3)

- **PRÓXIMA**: Today marks one open task in place — the best-ranked open Top 3 task, else the first
  open task in list order (`nextTaskId` in `src/lib/today.ts`; never done or skipped). A mono
  `accent` eyebrow above the name and an `accent-line` checkbox border; the row is not duplicated and
  the list order does not change. Visual only (`aria-hidden`), so row descriptions stay as they were.
- **Day bar**: one segment per task (`ProgressBar steps`, 3 px gaps, `rounded-xs`) up to 24 tasks; a
  continuous bar above that. The standard's tick and the one-glow pulse stay.

## Navigation

Phone: five tabs (HOJE · DUPLA · FOCO · PLANEJAR · PROGRESSO), 58 px, safe-area padding; **one filled
pill for the current tab**; FOCO keeps its green icon as identity (filled only when current). Desktop:
the sidebar (dimmed chrome, bright content). Headers: the same `page-title` everywhere; the mobile top
bar is the wordmark + partner chip + profile. See [NAVIGATION.md](NAVIGATION.md).

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

Bars without grid lines or legends; values on the bars only when they fit (≤ 7); today's bar is never
judged before the day closes; each bar is a list item with an accessible name. Calendar: dots +
shapes + words in the legend (standard met / perfect / missed), never colour alone.

## Responsive

Mobile-first; first-class at 320 / 360 / 375 / 390 / 430. Auto-fit grids use
`minmax(min(300px,100%),1fr)` — a fixed 300 px minimum overflowed 320 px screens while `<main>`'s
`overflow-x: hidden` hid it (test 8 in `design.spec.ts` now measures every box). Today's LOCK IN bar
stays pinned until `wide`, where the aside sits beside the tasks. The daily duel on phones is two
lines per category (name + winner, then both values); a table from `desk`. Breakpoints: `desk` 780 px (sidebar), `wide` 1180 px
(two columns). Desktop uses width with intent (max 1120 px content, a side rail) — never a stretched
phone, never a 4-column dashboard. Tablets below `desk` keep a phone measure (content `max-w-2xl`,
672 px, centred; top bar and tabs stay full width) instead of rows stretched edge to edge. Verified at 320 → 1920 with no horizontal scroll. Sticky action
bars (Today, Focus) respect the safe area; `main` has `scroll-padding-bottom` so focus never hides
under them.

## Accessibility

WCAG 2.2 AA: text ≥ 4.5 : 1, UI / graphics ≥ 3 : 1, visible 2 px focus everywhere, targets ≥ 24 px
(44 px for primary), full keyboard (Tab / Enter / Space / Escape), state in text and ARIA, decorative
art `aria-hidden`, animation never the only carrier of information, reduced motion honoured
([MOTION.md](MOTION.md)). Axe: 0 serious / critical on every main screen at 390 and 1440
(`tests/e2e/design.spec.ts`).

## App icon

Candidates compared at 16 / 32 / 64 / 192 / 512 px (Rook character sheet, `ROOK_SHEET`):
**A** the current square mark (legible everywhere); **B** Rook's head (excellent at 192–512, illegible
at 16–32); **C** the square mark with the proof core inside (legible from 16 px, ties the mark to
Rook). Recommendation: C for favicon / small icons and B as a possible large PWA icon — **not
applied**; the current icon stays until the owner chooses.

## Visual regression

`tests/e2e/visual.spec.ts` (project `visual`, `LI_SHOTS=<dir>`, optional `LI_SHOTS_WIDTHS`): seeds a
real day and duo on DEV and captures HOJE, DUPLA, FOCO, PLANEJAR, PROGRESSO, Planner, Metas, Semana,
Ajustes (first viewport + full page) and both reviews at each width. Skipped in normal runs.
