# Goals, vision and the mirror (V2 Phase 3)

**Direction, not daily execution.** A private place to write down what the user wants to build, what
has to happen first and what they need to face — without turning LOCKED IN into Notion, a journal, a
motivation wall or a project manager. ADR-058 / ADR-059.

## Where

More → **Metas & Visão** (`/goals`; desktop sidebar). No new bottom tab. Three sections, one open at a
time (the choice is remembered): **VISÃO**, **METAS**, **ESPELHO**. Nothing on Today, Partner,
Progress or Focus in this phase.

## Vision (`vision_items`)

Life directions ("Ter independência financeira"). Title (≤ 120) + optional description (≤ 1000).
No checkbox, no percentage, no streak, no competition. Archive (kept, collapsed under ARQUIVADAS) or
delete (explicit, confirmed; linked goals keep existing, unlinked).

## Goals (`goals`)

| Field         | Values                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| `goal_type`   | `90_day` (90 DIAS) · `monthly` (ESTE MÊS) · `long_term` (LONGO PRAZO)                   |
| `status`      | `active` · `achieved` · `archived` — nothing else (no paused / failed / cancelled)      |
| `vision_id`   | optional; must be one of the owner's visions (composite FK)                             |
| `target_date` | optional local date; label ATÉ 20 DEZ · EM 3 DIAS · 2 OUT · HOJE · PRAZO PASSOU · 1 SET |
| `achieved_at` | stamped by the database when a goal becomes achieved, cleared when reactivated          |

Active goals are grouped 90 DIAS → ESTE MÊS → LONGO PRAZO (sort order, then nearest target, then
title). **MARCAR COMO CONCLUÍDA** moves a goal to CONCLUÍDAS (collapsed, newest first, "Concluída em
DD/MM/AAAA"); **Arquivar** to ARQUIVADAS; both stay accessible and can be reactivated. Delete is
explicit and confirmed.

**No percentage.** There is no progress bar or number that does not come from something real
(ADR-059). Phase 5 (Goal → Action → Proof) will derive progress from real actions; `achieved_at` is
there for Progress later.

### Milestones (`goal_milestones`)

Simple checkpoints inside a goal (title, done), managed in the goal's sheet. The list shows a count
("1 de 2 marcos"), never a percentage, and milestones are not a second daily task list.

## Accountability mirror (`accountability_items`)

"O que você precisa encarar." Short statements (≤ 300) the user needs to face ("Eu adio coisas
difíceis."). Shown large, with a thin rule — firm, not aggressive, no red. Deactivate (kept under
DESATIVADOS) or delete (confirmed).

## Ordering

Keyboard-accessible **↑ / ↓** buttons on visions, active goals (within their group) and active mirror
items; the new order is saved as `sort_order` 10, 20, 30 … (no drag library).

## Privacy and access (ADR-058)

All four tables are **private to their owner**: one owner-only policy each, no partner condition, no
sharing column, no broadcast, no realtime. The partner, an outsider and anon get nothing. `owner_id`
defaults to `auth.uid()` and has no grant (cannot be spoofed or moved). Composite foreign keys
`goals (vision_id, owner_id) → vision_items (id, owner_id)` and `goal_milestones (goal_id, owner_id)
→ goals (id, owner_id)` make it impossible to point at another user's vision or put a milestone in
another user's goal (IDOR → `23503`). No SECURITY DEFINER function. Sharing goals / vision is a future
product decision, not a default.

## Data flow

`/goals` is a Server Component that reads the four tables (RLS) and renders `GoalsScreen`; writes are
Server Actions in `src/app/(app)/goals-actions.ts` (never sending `owner_id`). Not loaded with the app
layout; no realtime — another tab of the same user sees changes on the next load.

## Resume State and drafts

`/goals` is restorable and scrollable; the open section is remembered. Drafts of a **new** vision,
goal or mirror item are kept for 24 h per user and come back when the form is opened again (the sheet
never opens by itself); edits are never drafted. Sign-out clears them. Data is never stored on the
device (docs/RESUME_STATE.md).

## Future (not in Phase 3)

- Phase 4 — North Star + Morning Experience: **done** — see docs/NORTH_STAR.md (featured ◇ / ◆
  toggle on each active item, one per kind, shown on Today).
- Phase 5 — Goal → Action → Proof (real progress from actions, no manual percentage).

## Code and tests

`src/lib/goals.ts` (pure), `src/lib/goals-data.ts`, `src/app/(app)/goals-actions.ts`,
`src/components/screens/GoalsScreen.tsx`. Tests: `tests/unit/goals.test.ts`,
`supabase/tests/v2_phase3_goals.test.sql`, `tests/e2e/v2-phase3.spec.ts`.

## Featured (V2 Phase 4)

Each active vision, goal and mirror item has a discreet ◇ / ◆ button ("Destacar no Hoje: …",
`aria-pressed`) and shows **EM DESTAQUE** when featured. One per kind and user (database); featuring
another replaces it; archiving, achieving or deactivating removes the flag, and Today falls back to
the documented order (docs/NORTH_STAR.md).
