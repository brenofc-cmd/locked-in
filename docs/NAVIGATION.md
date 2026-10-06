# Navigation and information architecture

UI polish after V2 Phase 7 (2026-10-01). No feature was added or removed; nothing in the database,
analytics, duel, goal proof, focus, commitments, streak, Daily Standard, Planner or realtime changed.
Only where things live and how dense each screen is.

## Principle

Each primary tab answers one question:

| Tab           | Route       | Question                      |
| ------------- | ----------- | ----------------------------- |
| **HOJE**      | `/today`    | What do I do now?             |
| **DUPLA**     | `/partner`  | How is my partner / our duel? |
| **FOCO**      | `/focus`    | Lock in.                      |
| **PLANEJAR**  | `/plan`     | What is coming, and why?      |
| **PROGRESSO** | `/progress` | What did I achieve?           |

Account things (settings, duo management, install, sign-out) live in the **profile menu** (avatar in
the mobile header and at the bottom of the desktop sidebar), not in a tab.

Per mobile viewport: at most one dominant element and two secondary ones. Prefer rows, dividers and
spacing to bordered cards; collapse only what is history or detail.

## Bottom navigation (mobile)

`HOJE · DUPLA · FOCO · PLANEJAR · PROGRESSO` — FOCO keeps the accent pill.

Active tab (`aria-current="page"`):

- HOJE: `/today`
- DUPLA: `/partner`
- FOCO: `/focus`
- PLANEJAR: `/plan`, `/planner`, `/goals`, `/routine`, `/challenges`
- PROGRESSO: `/progress`
- `/duo`, `/settings`: no tab; the avatar shows the active state.

The route `/partner` keeps its name; only the label is DUPLA.

## Desktop sidebar

Main: Hoje, Dupla, Foco, Planejar, Progresso. Under Planejar, the four planning screens (Planner,
Metas & Visão, Rotina, Desafios). The footer is the profile menu button.

## Profile menu

Conta (→ `/settings#conta`), Configurações (`/settings`), Dupla (`/duo`), Instalar app (only when the
browser offers it — the same `beforeinstallprompt` rule as Settings), Sair (the same
`/auth/signout` form, which still calls `clearResume()`).

A disclosure button (`aria-expanded`, `aria-controls`); Escape and a click outside close it and
return focus to the button; Tab moves through the items; it closes on navigation.

## Screens

**HOJE** — header (date, day, greeting, %, streak, bar, next action) → morning card (once a day) →
TOP 3 (compact rows) → tasks (dominant; a Top 3 task shows a small rank marker) → context rows:
`DUELO · AO VIVO  Você 2 — 1 Ana ›` (→ `/partner#duel`), `PRÓXIMO  event ›` (only the next event),
`◇ LEMBRE-SE DO PORQUÊ  text ›` (→ `/goals`) → Revisar o dia. On a phone the partner card left Today (the
header chip and DUPLA cover it, including the partner's running focus clock); it stays on desktop.
Without a partner the invite card shows on every width. Wide desktop: the context rows and the live feed sit in the aside.

**DUPLA** — person (avatar, name, status, check-in, today's % inline) → DUELO DE HOJE → one month row
(V2 Phase 8: MÊS · AO VIVO · Você 8 — 5 Matheus › → `/progress#month`) → COMPROMISSOS (active first) → CHECK-IN / DAR UM TOQUE as rows → the partner's tasks + ATIVIDADE →
ESTA SEMANA / head-to-head → commitment history (collapsed).

**PLANEJAR** (`/plan`, new hub, no new query) — rows: PRÓXIMO (next event → `/planner`), METAS
(featured goal → `/goals`), ROTINA (N active items → `/routine`), DESAFIOS (→ `/challenges`; the
count would need a new query, so it keeps the "with your duo / needs a duo" line). V2 Phase 9 adds
ESTA SEMANA ("2 prioridades · 1 / 2 feitas" or "Planeje sua semana") → `/plan/week` (this / next
week's priorities, docs/WEEKLY_PLANNING.md); `/plan/week` is under the PLANEJAR tab (`/plan/…`) and is
not a restorable route.

**PROGRESSO** — VISÃO GERAL (%, streak, focus, perfect days: first viewport) → METAS (goal proof) →
DUELOS (V2 Phase 8: the current month — details and previous months collapsed —, then the last 7) →
RECORDES and MARCOS (compact rows; all milestones collapsed) → HISTÓRICO (chart, calendar, weekly
reviews, insights / habits). Today, Focus and Plan gained nothing in Phase 8. V2 Phase 9: Today
gains only the "◇ NÃO NEGOCIÁVEL" line of a flagged task and the ≈2 s celebration card (no route);
the Day / Weekly Reviews gain facts and reflections (a past day in the calendar shows its
reflection); DUPLA and FOCO gain nothing; still five tabs.

**FOCO** — unchanged.

## What happened to MAIS

The tab is gone. `/more` still exists and redirects to `/plan` (old bookmarks / installed PWAs keep
working). A Resume State saved on `/more` restores `/plan` (same v1 shape; no version bump). Its six
rows moved to PLANEJAR (4) and the profile menu (2).

## Deep links

Every route still works directly: `/today`, `/partner`, `/partner#duel`, `/focus`, `/plan`,
`/progress`, `/planner`, `/goals`, `/goals/<id>`, `/routine`, `/challenges`, `/duo`, `/settings`,
`/more` (→ `/plan`).

## Verification (2026-10-05)

- `tests/e2e/ia.spec.ts` (project `ia-390`, Alice): five tabs in order with `aria-current`; PLANEJAR
  rows and Back; profile menu by keyboard, Escape and outside click; every deep link above; Resume
  State at `/` (PLANEJAR restored, an old `/more` value restores `/plan`, drafts kept) and the PWA
  `start_url`; Sair clears the resume; 375 / 390 / 430 / 768 / 1180 / 1440 without horizontal scroll.
- The rest of the suite follows this navigation (docs/PROGRESS.md → UI Information Architecture
  Polish): full E2E 149 passed, 1 skipped (`LI_SHOTS`), 0 failed.

## V2 Phase 10 (2026-10-06)

No new tab, no new route in the navigation. Configurações gains **Notificações push** (this device:
state in text, Ativar / Desativar, test notification, the kinds and Ocultar detalhes). A
notification opens one of `/today`, `/partner`, `/planner`, `/plan/week`, `/progress`, `/settings`
(explicit, so Resume State never overrides it). `/offline` is a static page shown by the service
worker when a navigation fails without network; it is not a destination. Responsive audit
(e2e v2-phase10 test 21): 375 / 390 / 430 / 768 / 958 / 1180 / 1440 × Today, DUPLA, FOCO,
PLANEJAR, Semana, Planner, Metas, PROGRESSO, Configurações — no horizontal scroll.
