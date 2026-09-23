# Design Reference

The approved visual source of truth for LOCKED IN. **Do not redesign.** Stage 2 converts this
into real React/Tailwind components; everything below is what that conversion must match.

## Where the reference lives

```
design-reference/
├── original-zips/                          # byte-identical copies of the Claude Design exports
│   ├── Locked In accountability app.zip      # older export (v1 only)   sha1 0eb414b2…
│   └── Locked In accountability app (1).zip  # newer export (v1–v3)     sha1 af6ebfb8…
└── export/                                 # unzipped copy of the newer export (read-only)
    ├── Locked In v3.dc.html      ← PRIMARY VISUAL REFERENCE
    ├── Locked In v2.dc.html      ← reference for BEHAVIOUR (full simulated logic)
    ├── Locked In.dc.html         ← v1, superseded
    ├── Locked In Breakpoints.dc.html  ← canvas showing v2 at 5 viewports
    ├── support.js                ← Claude Design runtime (generated, do not edit)
    └── .thumbnail                ← WebP preview image
```

Originals in `E:\BrendonData\Downloads\` were not touched.
Live project: `claude.ai/design/p/9d0b43da-1f73-4e66-9f8d-6c79d0bec84a` (file `Locked In v3.dc.html`).

## Versions

| File                     | Size       | Status                       | Notes                                                                                                                                                                                                                                       |
| ------------------------ | ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Locked In.dc.html` (v1) | 1053 lines | Superseded                   | Screens: Today, Partner, Battle, Stats, Focus setup, Routine, Challenges, Invite, Settings, Empty states, Live states, Focus running, Briefing, End of day, Weekly review, Auth. Viewport prop `auto`/`mobile`.                             |
| `Locked In v2.dc.html`   | 1219 lines | Behaviour reference          | Same screen set as v1, adds explicit viewports (375/390/430/tablet/desktop) and a `connection` prop. Contains the **complete simulated logic** (~285 lines of JS).                                                                          |
| `Locked In v3.dc.html`   | 746 lines  | **Primary visual reference** | Consolidated IA (see below). **Its logic script is an empty stub** (`renderVals(){ return {}; }`), so opened on its own it renders placeholders. Bindings (`{{ sz.h1 }}`, `{{ me.pct }}`…) follow v2's naming, so v2's logic explains them. |

### v2 → v3 changes (most important)

- **Battle + Stats merged**: weekly comparison and head-to-head moved into **Partner**; stats became **Progress**.
- Mobile tabs: `TODAY · PARTNER · FOCUS · PROGRESS · MORE` (v2 had `STATS`).
- Auth / Empty-states screens removed; replaced by an **Onboarding** overlay (5 steps) and inline empty states (`NO PARTNER YET`, `Day 1 is today.`).
- Invite screen renamed **Duo** (`LOCKED IN DUO`, code `LKD-8X29A`).
- New: task **options sheet** (skip with reason / edit / delete), **streak sheet**, **day detail sheet**, **template sheet**, **"Apply change to: Today only / Today and future days"** confirm, per-task **Visible to Lucas** toggle, **YOUR STANDARD** threshold in Settings, **perfect-day** glow banner (`100% STANDARD MET.`).

## Format of the prototype

- `.dc.html` = Claude Design component: HTML template inside `<x-dc>`, a `<helmet>` with fonts and
  global CSS/keyframes, and a `<script type="text/x-dc" data-dc-script>` class extending `DCLogic`
  (React class component; `renderVals()` returns the bindings).
- Template language: `{{ expr }}` bindings, `<sc-if value>`, `<sc-for list as>`, `style-hover`,
  `style-active`, `style-focus`, `<dc-import>` (used by the Breakpoints canvas).
- `support.js` is the runtime; it needs `window.React`/`ReactDOM`. Not reusable in the app.
- **All styling is inline**; no CSS classes, no image assets, all icons are inline SVG. The only
  external resource is Google Fonts (Geist, Geist Mono).
- Reuse: layout, tokens, copy and SVG paths transfer directly. The code itself does not — it is
  rewritten as typed React components in Stage 2.

## Screens (v3)

Primary (mobile tabs / desktop sidebar):

1. **Today** — date + day label, `GOOD MORNING, BRENDON.`, hero `%`, `done / total`, streak link,
   progress bar with a _standard_ marker, "next" line, perfect-day banner, task list grouped by section
   (MORNING, WORK / STUDY, BODY, NIGHT, CUSTOM), rest-today line. Rail: partner card, LOCK IN (desktop),
   LIVE feed (short), "Review today". Mobile: sticky bottom bar with `+` and `LOCK IN`.
2. **Partner** — header (avatar, name, presence line), partner's today `%`, THIS WEEK (you vs partner,
   `YOU'RE AHEAD +6%`, focus/streak rows), HEAD TO HEAD (8-week strip, past weeks), partner's task list
   with react buttons, ACTIVITY feed. Empty: `NO PARTNER YET` + INVITE PARTNER.
3. **Focus** — `WHAT ARE YOU WORKING ON?`, task picker (radio), durations 25/50/90/custom, LOCK IN;
   side: FOCUS TODAY total, sessions list, partner presence.
4. **Progress** — range segmented control, hero `%`, 3 stats (streak / focus / perfect days), bar chart,
   month calendar (standard met / perfect / missed), weekly reviews list, collapsible insights +
   30-day habit consistency. Empty: `Day 1 is today.`
5. **More** — list rows + "Prototype flows" (design-only navigation; not a product feature).

Secondary: **Routine** (reorderable list, + Add item, Use template), **Challenges** (private duo
challenges), **Duo** (invite/share/join code), **Settings** (profile, YOUR STANDARD, notification
switches, privacy, Sign out / Leave duo), **Live states** (engineering reference of every realtime state,
what goes in the feed and what never does, loading skeleton).

Overlays (full-screen): **Focus running** (ring timer, pause/end, partner status), **Focus complete**
(minutes + optional note + DONE), **Morning briefing**, **Review day**, **Weekly review** (prev/next week),
**Onboarding** (brand → name → build routine path → items → invite partner).

Sheets (bottom sheet on mobile, centred dialog on desktop): add/edit task, apply-change confirm,
task options, react, focus quick-start, streak rules, day detail, template, new challenge.

Transient: **snackbar** (undo-style), **toasts** (partner events with quick reactions),
**connection pill** (connected / reconnecting / offline).

## Navigation

- **Mobile (< 780px)**: top bar (logo mark + `LOCKED IN`, partner pill with presence dot + `%`),
  scrolling main, bottom tab bar of 5 (icon in a 28px pill + 10px label), height 58px + safe-area inset.
- **Desktop (≥ 780px)**: 228px left sidebar — logo, main nav (4 items with a
  status dot), sub nav (4 items), "Prototype flows", user footer. No bottom bar. Item labels are
  produced by the (empty) v3 logic; implemented in Stage 2 as Today/Partner/Focus/Progress and
  Routine/Challenges/Duo/Settings (inferred from the v3 screens and mobile tabs).
- Content max-width 1120px, centred.

## Breakpoints

From v2 logic (`VP`) and the Breakpoints canvas:

| Name            | Viewport   | Behaviour                                   |
| --------------- | ---------- | ------------------------------------------- |
| Small mobile    | 375 × 812  | `small` (< 385px): h1 23px, briefing 38px   |
| Standard mobile | 390 × 844  | default design target                       |
| Large mobile    | 430 × 932  |                                             |
| Tablet          | 834 × 1112 | desktop layout, single column (< 1180px)    |
| Desktop         | 1440 × 900 | two-column Today (`1fr 340px`), sticky rail |

Rules: `mobile = width < 780`; `780 ≤ width < 1180` collapses grids to one column with padding
`36px 32px 80px`.

## Sizing (`sz` tokens)

Values come from v2 logic; v3 reuses the same token names except the hero number (`sz.hero`,
v2 `huge`).

| Token                                         | Mobile            | Desktop             |
| --------------------------------------------- | ----------------- | ------------------- |
| h1                                            | 25px (23px small) | 38px                |
| hero `%` (v3 `sz.hero`; value from v2 `huge`) | 64px              | 112px (84px < 1180) |
| page padding                                  | 20px 18px 28px    | 44px 52px 96px      |
| large gap                                     | 32px              | 48px                |
| Today gap                                     | 26px              | 40px                |
| task row min-height                           | 64px              | 66px                |
| checkbox                                      | 34px, radius 10   | 30px                |
| task font                                     | 16.5px            | 16px                |
| focus timer                                   | 76px              | 168px               |
| briefing title                                | 44px (38 small)   | 64px                |

## Colours

| Role                  | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Page background       | `#050506`                                                          |
| App surface           | `#0A0A0B`                                                          |
| Overlay background    | `#070708` / focus `#060607`                                        |
| Card / partner card   | `#111113`                                                          |
| Sheet                 | `#121214`                                                          |
| Raised control / chip | `#141416`, `#151517`, `#18181B`, `#1C1C1F`                         |
| Text                  | `#ECEBE6`                                                          |
| Secondary text        | `#A09F99`                                                          |
| Dim text              | `#7C7B76`                                                          |
| Faint / chevrons      | `#55544F`, `#5E5D59`, `#6F6E6A`                                    |
| **Accent** (default)  | `#C6E07B` via `--acc` (alternatives offered: `#9FD4A8`, `#E6E3D8`) |
| Danger                | `#E0715F` (soft `#F0A496`), missed `#B8695C`                       |
| Hairlines             | `rgba(255,255,255, .04–.12)`                                       |

Accent tints use `color-mix(in oklab, var(--acc) N%, #0A0A0B)`. Partner data is rendered in greys
(`#5E5D59` bars, `#A09F99` numbers); **the accent belongs to "you" and to primary actions.**

## Typography

- **Geist** (300/400/500/600/700) for text and numbers; **Geist Mono** (400/500/600) for labels.
- Labels: Geist Mono, 10–12.5px, UPPERCASE, letter-spacing `.14em–.34em`.
- Headlines: uppercase, weight 600, letter-spacing `-0.025em`.
- Big numbers: weight 500 (300 for timers), tight tracking `-0.04em…-0.06em`, line-height ~0.82,
  `font-variant-numeric: tabular-nums`, `%` sign in a smaller dim span.
- Primary CTA text: Geist Mono 12.5–14px, weight 600, spacing `.22em–.34em` (e.g. `LOCK IN`).

## Shapes and spacing

- Radii: buttons 12–16px, cards 14–18px, chips 8–12px, checkbox 10px, pills 999px, sheet radius set by logic (`shp.rad`, not in v3 markup).
- Tap targets ≥ 44px everywhere; primary CTAs 56–62px tall.
- Structure comes from **hairline dividers and whitespace**, not cards. Cards appear only for the
  partner summary, challenges and live-state references.

## Interaction patterns

- **Task row**: tap = toggle; checkbox pops (`scale .8`, spring) and the tick draws via
  `stroke-dashoffset`. Swipe right > 80px = complete (accent reveal "DONE"), swipe left = OPTIONS.
  Long-press/context menu → options. `touch-action: pan-y`.
- **Unsynced** marker: hollow 7px dot "Will sync".
- **Skip** leaves the day's total (neither for nor against). Moved = `MOVED · WED`.
- **Routine reorder**: drag handle with pointer capture, drop indicator line.
- **Presence**: dot colour + `pulse` keyframe while live/focusing; states Online / Focusing / Offline.
- **Feed** entries animate in with `enter`; newest on top (`column-reverse`).
- **Toasts** for partner events with 🔥/🫡 quick reactions; reactions: 🔥 ⚡ 🫡 "Respect." "Good work."
  "Keep going."
- Overlays fade in (`fadeIn`), screens `fadeUp .4s`, sheets `slideUp`.
- `prefers-reduced-motion` disables all animation — keep that.
- Keyframes defined in the reference: `pulse`, `enter`, `rise`, `fadeIn`, `fadeUp`, `slideUp`, `glow`,
  `breathe`.

## Reusable components found

Logo mark · top bar · bottom tab bar · sidebar nav item · section header (mono label + count, hairline) ·
task row (checkbox, name, meta, right label, options button, swipe layers) · big-number `%` hero ·
progress bar (with standard marker) · partner card · presence dot · feed item · react pill ·
primary CTA (accent) · secondary CTA (light `#ECEBE6`) · outline button · chip/segmented option ·
toggle switch · radio row · duration tile · bottom sheet (with grabber) · full-screen overlay ·
snackbar · toast · connection pill · stat block (number + mono label) · calendar day cell ·
bar chart · loading skeleton row.

## Copy and tone

Short, factual, uppercase labels. Examples: `NO HYPE. JUST PROOF.`, `STANDARD MET.`, `LOCK IN`,
`YOU'RE AHEAD`, `Discipline is easier when somebody knows whether you showed up.` No emoji outside
reactions, no exclamation marks, no motivational fluff.

## Sample data used by the design

User **Brendon**, partner **Lucas**, date **Tue, Sep 23**, week 39, streak 13, duo code `LKD-8X29A`.
These are mock values — Stage 2 may use them as mock data, Stage 3+ replaces them.

## Stage 2 implementation notes

Where each part of the reference lives in the app:

| Reference                                                              | Implementation                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Frame, top bar, sidebar, tab bar                                       | `src/components/shell/AppShell.tsx`                                                                              |
| Snackbar, toasts, connection pill                                      | `src/components/shell/Feedback.tsx`                                                                              |
| Today                                                                  | `src/components/screens/TodayScreen.tsx`, `today/TaskRow.tsx`, `today/PartnerCard.tsx`, `today/ActivityItem.tsx` |
| Partner / Focus / Progress / More                                      | `src/components/screens/*Screen.tsx`                                                                             |
| Routine / Challenges / Duo / Settings / Onboarding                     | `src/components/screens/*Screen.tsx`                                                                             |
| Sheets (task, options, react, focus, streak, day, template, challenge) | `src/components/sheets/*`                                                                                        |
| Focus running / complete                                               | `src/components/overlays/FocusOverlay.tsx`                                                                       |
| Review day / weekly review / briefing                                  | `src/components/overlays/MomentOverlays.tsx`                                                                     |
| Colour tokens, keyframes, breakpoints                                  | `src/app/globals.css`                                                                                            |

Known differences from the reference (deliberate, see `DECISIONS.md` ADR-007…013):

- "Prototype flows" (sidebar and More) and the "Live states" screen are design tooling, not product
  screens; not implemented. Overlays are reached from their real entry points instead (Review today,
  weekly reviews, Sign out → onboarding); the briefing opens from the dev panel.
- Overlays close instantly (v2 faded them out over ~430ms).
- Reactions sheet shows 4 options (🔥 ⚡ 🫡 "Respect.") to fit v3's 4-column grid; v2 had 6. On desktop
  it opens as the centred dialog (v2 used an inline popover; v3 only has the sheet).
- Values v3 does not define were chosen (ADR-012): `%` sign 26/40px, focus ring 296px /
  `min(520px,58dvh)`, desktop timer `min(168px,17dvh)`, head-to-head 56/72px, weekly number 64/96px.
- Mock-only behaviour: "Today only" and "Today and future days" apply the same edit; "Visible to Lucas",
  reminder and notes are stored but have no effect; Join / Leave duo show a "Stage 3" toast.
- Focus complete records at least 1 minute.
- The date is fixed to Tue, Sep 23 (mock); completion times use the real clock.
