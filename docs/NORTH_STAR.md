# North Star, Top 3 and the morning (V2 Phase 4)

**Remember why.** Today stays the execution screen; a small part of the direction written on
`/goals` (docs/GOALS.md) comes back every day — without a motivational feed, random quotes, an AI
coach or a blocking screen. ADR-060 / ADR-061 / ADR-062.

## Today order

1. Header — date, DIA N, greeting by daypart, %, count, streak, standard line
2. **Morning card** — only on the first open of the local day (inline, never a modal)
3. **TOP 3 DE HOJE** — up to three of today's tasks
4. The task list (sections)
5. Side column (after the tasks on a phone): partner, PRÓXIMOS (planner), **LEMBRE-SE DO PORQUÊ**,
   LOCK IN, live feed, review

The North Star sits with the partner and the planner, not above the tasks, so on a 390 px phone the
task list starts on the first screen once the morning card is closed (and within the first two
screens with it open — e2e `v2-phase4` test 11).

## North Star — LEMBRE-SE DO PORQUÊ

At most **1 vision, 1 goal ("META ATUAL"), 1 mirror item**, exactly as the user wrote them. Missing
categories are simply not shown; with none at all the card becomes **DEFINA SUA DIREÇÃO** with a link
to `/goals`. Compact (2 lines each), "Ver tudo" expands; **GERENCIAR** opens `/goals` (no editing on
Today).

### Selection (`pickNorthStar`, `src/lib/north-star.ts`)

| Kind   | Featured (user's choice)          | Fallback when nothing is featured                                                                  |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Vision | the featured, non-archived vision | first non-archived vision by the user's order                                                      |
| Goal   | the featured **active** goal      | first active goal: 90 DIAS → ESTE MÊS → LONGO PRAZO, then the `/goals` order (sort, target, title) |
| Mirror | the featured active item          | first active item by the user's order                                                              |

Never random. Archived visions, achieved / archived goals and inactive mirror items are never shown
(an achieved goal is never "META ATUAL"; celebrating it belongs to a later phase).

### Featured (`is_featured`)

- On `/goals`, each active vision, goal and mirror item has a discreet ◇ / ◆ toggle ("Destacar no
  Hoje: …", `aria-pressed`) and shows **EM DESTAQUE** when featured.
- **One per user and kind, enforced by the database**: partial unique indexes
  `vision_items_one_featured`, `goals_one_featured`, `accountability_items_one_featured` on
  `(owner_id) where is_featured`. Featuring another item replaces the previous one atomically
  (trigger `private.keep_one_featured`, INVOKER, owner's rows only).
- Archiving a vision, achieving / archiving a goal or deactivating a mirror item **drops** the flag
  (trigger); a check constraint refuses featuring an inactive item (23514). The fallback then applies.
- `is_featured` cannot be set on insert (no grant) — only by an explicit update.

### Data flow

`/today` is a Server Component: `loadNorthStar()` (`src/lib/north-star-data.ts`) reads the active
rows of the three owner-only tables in **parallel**, picks on the server and passes at most three
short items to `TodayScreen`. Not in the app layout; no realtime (private data) — coming back from
`/goals` re-renders the page with the new pick. A read failure only hides the card.

## TOP 3 DE HOJE

- Up to three of **today's real `daily_tasks`** (`daily_tasks.priority_rank` 1..3). No second list,
  no copied title or status: each row is the task itself (same toggle).
- The database guarantees it: check `priority_rank between 1 and 3`, partial unique index
  `daily_tasks_priority_key (owner_id, task_date, priority_rank)` → at most three per user and day,
  never two with the same rank.
- Writes go through `public.set_my_priorities(ids)` (INVOKER): replaces **my** Top 3 of **my today**
  with 0–3 distinct ids of my own tasks dated today, in order; > 3 → `LI_TOO_MANY_PRIORITIES`,
  duplicates → `LI_INVALID_PRIORITIES`, anything not mine / not today → `LI_NOT_FOUND`.
- Closed history: the Stage 9 guard covers the column like any other — a closed day's priorities can
  be neither added nor removed (`LI_HISTORY_LOCKED`).
- Completed and skipped priorities **stay** in the Top 3 (marked FEITA / the skip label). Deleting a
  one-off (or archiving a routine, which removes today's pending occurrence) removes its rank with
  the row. Nothing is ever chosen automatically.

### UX

- Today: header **TOP 3 DE HOJE** + **DEFINIR TOP 3** (empty) / **EDITAR**. Rows: rank, checkbox
  (`aria-label` "Prioridade 1: …", `aria-checked`, skip described), title.
- The priorities sheet: pick in order of importance, ↑ / ↓ to reorder, × to remove, counter "n / 3"
  (live region); a fourth task is disabled with "Máximo de 3. Remova uma para trocar."; **SALVAR**.
- Task options: **Marcar como prioridade** (adds at the end) or **Remover das prioridades**; with
  three already, **JÁ HÁ 3 PRIORIDADES — Escolha qual substituir** (the new task takes that rank).

## The morning (evolves the Stage 8 briefing)

- **Inline card** at the top of Today (`MorningCard`), on the **first open of the local day**, per
  user; never a modal, never full screen, never over onboarding, never restored once closed (it is not
  a route and not in Resume State).
- Content, all real: time · weekday, facts line (streak · PADRÃO n% · n TAREFAS HOJE · ONTEM n%),
  LEMBRE-SE DO PORQUÊ (the North Star lines), HOJE (Top 3 progress "1 / 3" or **DEFINIR TOP 3**),
  PRÓXIMO (the next planner event, one only — `nextEvent()`: today's past-time events skipped), the
  partner's status line from Presence 2.0 (`usePartnerView`, same logic as everywhere).
- **COMEÇAR O DIA** or × closes it (keyboard); "Mostrar toda manhã" is the existing
  `show_morning_briefing` setting (also in Ajustes).
- Greeting by **daypart in the user's timezone** (`daypartOf`: 05–11 BOM DIA · 12–17 BOA TARDE ·
  18–04 BOA NOITE) — never "BOM DIA" at 22h. Computed from the database-corrected clock the app
  already uses.
- Subtle fade-up entry; `prefers-reduced-motion` disables it (global rule).
- No quotes, no advice, no inferred judgement: the mirror text is shown exactly as saved.

### Once per user and day (storage)

`locked-in:v2:<userId>:daily` → `{ v: 1, briefing?: "YYYY-MM-DD", weekly?: "YYYY-MM-DD" }` through
`src/lib/resume-state.ts` (`loadMarks` / `setMark` / `clearMark`), validated on read. The day is the
database's `my_today()`. The mark is written when the card is shown, so a refresh does not bring it
back; the next local day it returns. Replaces the V1 unscoped `li:briefing-shown` /
`li:weekly-shown` (two accounts on one browser shared them): the old keys are removed on first read
and never trusted (they cannot say whose they were — at worst the briefing shows once more that day).
The weekly-result notice uses the same per-user mark. Sign-out clears the user's marks with the rest
of their Resume State.

## Privacy

- North Star data stays owner-only (Phase 3 RLS unchanged); the partner and outsiders read none of it.
- `priority_rank` is a column of `daily_tasks`: RLS is unchanged, so a **private task stays private**
  whatever its rank; for a shared task the partner could read the rank like any other column of that
  row, but no partner screen shows it. Setting priorities creates no feed event or broadcast (the
  activity trigger only reacts to status / visibility).
- No new SECURITY DEFINER function (the reviewed set is unchanged).

## Future

Phase 5 — Goal → Action → Proof: **done** (docs/GOAL_PROOF.md). META ATUAL shows
`Esta semana: 4 ações · 2h15 de foco` (a link to the goal's page) only when the goal has proof this
week, and the morning card adds `N AÇÕES NESTA SEMANA` under the goal — one batch call on the server,
nothing when there is no proof. The Top 3 stays a daily choice of tasks.

## Code and tests

`src/lib/north-star.ts` (pure), `src/lib/north-star-data.ts`, `src/components/today/{NorthStarCard,
TopThree,MorningCard}.tsx`, `src/components/sheets/PrioritiesSheet.tsx`, `setDailyPriorities` in
`src/app/(app)/task-actions.ts`, `setFeatured` in `src/app/(app)/goals-actions.ts`. Migration
`…162654_north_star_priorities`. Tests: `tests/unit/north-star.test.ts`,
`supabase/tests/v2_phase4_north_star.test.sql`, `tests/e2e/v2-phase4.spec.ts`.
