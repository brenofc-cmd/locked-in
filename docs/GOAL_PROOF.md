# Goal → Action → Proof (V2 Phase 5)

LOCKED IN stops only asking "what do you want?" and starts answering **"what did you do that proves
you are moving?"**. A goal (docs/GOALS.md) is linked to real actions; the actions that were actually
done are its **proof**. ADR-064 … ADR-068.

```
VISÃO  →  META  →  AÇÃO (task · routine · focus)  →  PROVA (done, recorded by LOCKED IN)
```

## What is proof

Proof is **derived** from the tables that already record execution — never typed in, never stored
twice, never a score:

| Source                                        | Counts as                                                              | Proof day                       |
| --------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `daily_tasks` linked to the goal, `completed` | **1 action**                                                           | its `task_date` (local)         |
| `focus_sessions.goal_id`, `completed`         | its **effective seconds** (`actual_focus_seconds`: pauses never count) | `local_date` (day it started)   |
| `goal_milestones` of the goal, `is_completed` | **1 milestone**                                                        | `completed_on` (local, stamped) |

Not proof: pending, **skipped** or missed tasks; **active / paused** focus; an unchecked milestone; a
routine by itself. There is **no "add proof" button** and no free-text proof.

**No double counting (routine + task).** A routine's goal link only seeds the goal of the occurrences
it generates. The proof is the completed occurrence (a `daily_task`), once.

**Undo.** Undoing a task today removes its proof until it is completed again; a closed day can no
longer change (Stage 9). Unchecking a milestone removes its proof.

**No percentage.** A goal never shows "67 % done" (ADR-059 stays): the screens show evidence —
actions, focus time, milestones. Measurable targets are a later decision.

## Linking actions

### Task → goal (`public.daily_task_goals`)

- Quick Add / edit sheet → **Mais opções → META** (`<select>`: Nenhuma or one of my **active** goals).
  The collapsed row shows `META · <goal>`. Today's row shows a discreet `META · <goal>` line (also
  exposed to screen readers through `aria-describedby`).
- One goal per task. Only today's (open) tasks can be linked, changed or unlinked: a **closed day's
  link is part of the record** (`LI_HISTORY_LOCKED`).
- Editing a task that still points at a goal that is no longer active keeps that link (the form only
  writes when the choice changes).

### Routine → goal (`public.routine_item_goals`)

- Routine edit sheet (**META**) or, on the goal's page, **VINCULAR AÇÃO** → pick an existing routine.
  Nothing is created without a tap.
- **Snapshot:** when an occurrence is generated (catch-up `materialize_tasks` or a routine RPC), it
  receives the routine's goal **at that moment** (trigger `private.seed_task_goal`, only while the
  goal is active). Changing the routine's goal later never touches past occurrences; before the change
  the missed days are materialised with the OLD goal (`private.guard_routine_goal`). Like every
  template edit, the new goal also applies to **today's** occurrence.

### Focus → goal (`focus_sessions.goal_id`)

- Focus setup → **TRABALHANDO EM** (`<select>`, active goals). Choosing a task that feeds a goal
  pre-selects it. **INICIAR FOCO** on a goal opens `/focus?goal=<id>` (the real Focus, no second
  timer); the id is kept only if it is one of my active goals.
- **While the session runs or is paused the goal can be changed** (the running screen shows the same
  selector); **once completed it is fixed** — the final goal is the proof (ADR-067,
  `LI_FOCUS_FINISHED`). Never on a closed day.
- `start_focus_session` gained a trailing `p_goal_id uuid default null`; the old four-argument call
  still resolves (rollout-safe).

### Milestones

Already inside a goal. Completing one stamps `completed_at` and `completed_on` (the owner's local date,
database-owned); existing completed milestones took `updated_at` when the column was added.

## Goal states

| Goal status | Keeps its proof                                 | Takes new actions       |
| ----------- | ----------------------------------------------- | ----------------------- |
| active      | yes                                             | yes                     |
| achieved    | yes                                             | no (`LI_GOAL_INACTIVE`) |
| archived    | yes                                             | no                      |
| reactivated | yes                                             | yes again               |
| deleted     | — (links removed, tasks / focus / history kept) | —                       |

Pickers only list **active** goals. A goal's title is not snapshotted: its page shows the current
title; the history stays linked by id while the goal exists.

## Screens

- **/goals** — every goal row has a **PROVAS** link with `ESTA SEMANA · 3 ações · 2h15 de foco ·
1 marco` (only what exists). Tapping the row still edits the goal (Phase 3).
- **/goals/[id]** — owner-only (anyone else: 404, the page never reveals the goal exists):
  `PROVAS — ESTA SEMANA` (✓ ações · ◷ foco · ◆ marcos), **CRIAR TAREFA** (Quick Add with the goal
  pre-selected) and **INICIAR FOCO** (active goals only), `ÚLTIMAS PROVAS` grouped HOJE / ONTEM / date,
  20 per page with **CARREGAR MAIS** (never twice the same proof), `AÇÕES VINCULADAS` (routines with
  their schedule, unlink ×; today's linked one-off tasks) and **VINCULAR AÇÃO**.
- **Progress** — **PROGRESSO DAS METAS · <range>**: at most 3 goals with proof in 7 / 30 / 90 days or
  the year (most actions, then focus), **VER METAS**. Nothing else in Progress changed.
- **Today** — the North Star's META ATUAL shows `Esta semana: 4 ações · 2h15 de foco` (a link to the
  goal) only when there is proof; the morning card adds `N AÇÕES NESTA SEMANA` under the goal.

Focus is shown as time (`1h35`, `45 min`, `<1 min`), never as points.

## Periods and time zones

Days are the user's local dates (`profiles.timezone`) and never move afterwards: tasks by
`task_date`, focus by `local_date` (fixed at start), milestones by `completed_on` (fixed at
completion). "Esta semana" = Monday → today (like the weekly competition); Progress ranges =
`rangeFrom()` (7 / 30 / 90 days, year) ending today.

## Privacy (ADR-068)

Goals, vision and the mirror stay **owner-only**. The partner may see that I am **EM FOCO** and the
titles of tasks I share — **never a goal**:

- The links live in **owner-only side tables** because the partner can read shared `daily_tasks` /
  `routine_items` rows and RLS cannot hide a column (a `goal_id` there would leak).
- `focus_sessions` was already owner-only; `partner_current_focus()` returns timer fields and the
  shared title only (no goal column).
- No broadcast, feed event or reaction carries a goal id or title (payloads are explicit
  `jsonb_build_object`s; there is no `postgres_changes` publication).
- Partner, outsider and anon: zero rows from `goals`, `daily_task_goals`, `routine_item_goals`,
  `my_goal_proofs`, `my_goal_proof_summaries` (anon cannot even call them).

## Database

- `daily_task_goals (daily_task_id pk, owner_id, goal_id)`, `routine_item_goals (routine_item_id pk,
owner_id, goal_id)`: composite FKs `(action, owner)` and `(goal, owner)` (on delete cascade), RLS
  "owner only" for all commands, `owner_id` defaults to `auth.uid()` (insertable only so trusted
  triggers can name the owner; the policy pins it).
- `focus_sessions.goal_id` with FK `(goal_id, user_id) → goals (id, owner_id) on delete set null
(goal_id)`; `goal_milestones.completed_at / completed_on` + check constraint.
- Guards (INVOKER triggers, `search_path = ''`, not callable): `guard_task_goal`, `guard_routine_goal`,
  `guard_focus_goal`, `sync_routine_goal_today`, `seed_task_goal`, `stamp_milestone_completion`;
  helper `private.goal_is_active(goal, owner)` (compares the owner itself — no reliance on RLS inside
  a trigger, see migration `…_goal_link_owner_check`).
- Reads: `my_goal_proof_summaries(p_from, p_to)` (all my goals with proof, one call — no N+1) and
  `my_goal_proofs(p_goal_id, p_limit ≤ 50, p_offset)` (newest first). Both INVOKER SQL functions with
  explicit owner filters.
- Indexes: `daily_task_goals (goal_id, owner_id)`, `routine_item_goals (goal_id, owner_id)`,
  `focus_sessions (goal_id, local_date) where goal_id is not null`, `goal_milestones (goal_id,
completed_on) where is_completed`.
- **No new SECURITY DEFINER function, no view, no stats / cache table.**

Errors: `LI_GOAL_INACTIVE` (not one of my active goals — the same answer for another user's or a
missing goal), `LI_NOT_FOUND` (not my task), `LI_HISTORY_LOCKED`, `LI_FOCUS_FINISHED`.

## Code and tests

`src/lib/goal-proof.ts` (pure), `src/lib/goal-proof-data.ts`, `src/app/(app)/proof-actions.ts`, goal
links in `src/app/(app)/task-actions.ts` and `focus-actions.ts`, `src/app/(app)/goals/[id]/page.tsx`,
`src/components/screens/GoalDetailScreen.tsx`. Tests: `tests/unit/goal-proof.test.ts`,
`supabase/tests/v2_phase5_goal_proof.test.sql`, `tests/e2e/v2-phase5.spec.ts`.

Not in Phase 5 (by instruction): measurable targets, planner events linked to goals (an event turned
into a task can pick a goal in Quick Add), Daily Duel, Monthly Champion, XP, coins, AI coach, Web Push.
