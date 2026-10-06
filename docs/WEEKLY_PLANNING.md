# Weekly Planning, Non-Negotiables, Reviews 2.0 (V2 Phase 9)

PLANEJAR → EXECUTAR → PROVAR → REFLETIR → CELEBRAR → AJUSTAR. Everything here is owner-only,
self-declared where it is a plan, and derived where it is a fact. Nothing has weight in completion,
the Daily Standard, the streak, the duel or the month. Scope: docs/ROADMAP.md → "V2 Phase 9".
Decisions: ADR-089…091. Celebrations: docs/CELEBRATIONS.md.

## Non-Negotiables

A routine or a one-off task can be marked **NÃO NEGOCIÁVEL** (task sheet → Mais opções → switch).

- Side tables (the Phase 5 pattern — the partner reads `daily_tasks` / `routine_items` rows, so they
  never carry the flag): `public.daily_task_non_negotiables(daily_task_id)` and
  `public.routine_non_negotiables(routine_item_id)`, owner-only, composite FKs to the owner's rows.
- A routine's flag is **snapshotted** on every occurrence it generates (`seed_task_non_negotiable`,
  after insert on `daily_tasks`) and **follows today's occurrence** when it changes
  (`sync_routine_non_negotiable_today`); missed occurrences are materialised first with the old flag.
- A closed day's flag never changes (`LI_HISTORY_LOCKED`); a task of another user: `LI_NOT_FOUND`.
- Today: a discreet "◇ NÃO NEGOCIÁVEL" line under the task (also its accessible description).
  Reviews: "NÃO NEGOCIÁVEIS 5 / 7" (completed / flagged).
- Server actions: `addTask` / `updateTaskToday` / `updateRoutine` take `nonNegotiable` (undefined =
  keep) and return the flags like the goal links (`taskFlags`, `routineFlags`).

## Weekly priorities

PRIORIDADES DA SEMANA — distinct from TOP 3 DE HOJE. `public.weekly_priorities`:

- At most 3 per Monday–Sunday week (`position` 1..3, unique), title 1..120 (trimmed), status
  `open` / `done` (`done_at` stamped by the database).
- This week and the next can be planned; a closed week is frozen (`LI_HISTORY_LOCKED`); two weeks
  ahead: `LI_WEEK_TOO_FAR`. Week / position never change after creation.
- Self-declared: a plan, never proof — not in the duel, the month, records or milestones.
- UI: PLANEJAR has one row (ESTA SEMANA · "2 prioridades" · "1 / 2 feitas", or "Planeje sua
  semana") → `/plan/week` (ESTA SEMANA / PRÓXIMA SEMANA). **No draft**: each add, edit, tick or
  removal saves at once (a tick is optimistic, rolled back with a toast). Not on Today. Not a
  restorable route (Resume State unchanged). The PRÓXIMA SEMANA tab speaks of the next week
  ("Uma prioridade da próxima semana", "Nenhuma prioridade para a próxima semana." — fixed in V2
  Phase 10; it always saved to the right week).
- Loaded with the layout (this and next week) — `src/lib/reflection-data.ts`; pure helpers in
  `src/lib/weekly-plan.ts`.

## Reviews 2.0

The existing **Day Review** (Today → Revisar o dia) and **Weekly Review** (DUPLA → Revisar esta
semana, PROGRESSO → HISTÓRICO → weeks) evolve; there is no parallel system.

- Three optional reflections (`public.reviews`, one row per owner / kind / period):
  O que funcionou? · O que me atrapalhou? · O que vou mudar amanhã? / na próxima semana?
  ≤ 500 characters each, empty = null, saved on an explicit tap. Never for a period that has not
  started (`LI_FUTURE_TASK`). Editable: today (Day Review), the current and the last week (Weekly
  Review); older weeks and past days (calendar → day) are shown read-only.
- Facts, stated and never interpreted (no AI, no generated text): `public.my_review_facts(from, to)`
  (INVOKER, ≤ 31 days, capped at today) — days with tasks, planned, completed, effective focus,
  Perfect Days, Daily Standard days **with the standard in force on each day** (a closed day its
  version), non-negotiables planned / completed. The Weekly Review adds DIAS COM PADRÃO, NÃO
  NEGOCIÁVEIS and PRIORIDADES to its existing numbers; the Day Review adds NÃO NEGOCIÁVEIS (live).
- After a weekly review: **PLANEJAR PRÓXIMA SEMANA** → `/plan/week?w=next`.
- The once-a-week toast stays the start-of-week moment (no new modal).

## Web Push (V2 Phase 10)

With push on for a device (docs/WEB_PUSH.md): **Review do dia** at 21:00 for a day with tasks and no
reflection (→ `/today`), **Review semanal** Sunday 19:00 for a week with tasks and no reflection
(→ `/progress`), **Planejamento semanal** Monday 08:00 for a week without priorities
(→ `/plan/week`) — once per period each, outside quiet hours, never after the period ended. The text
never contains a reflection or a priority.

## Privacy

Partner, outsider and anon read nothing of it (pgTAP, e2e 15). No new channel, no broadcast, no
SECURITY DEFINER function (the reviewed set stays at 22), no polling.
