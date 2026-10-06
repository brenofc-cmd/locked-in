# School planner (V2 Phase 2)

Exams, assignments, homework, deadlines and school events for the duo — without turning LOCKED IN
into a calendar app. ADR-057.

## What it is

- `/planner` (More → Planner; desktop sidebar). Two views: **PRÓXIMOS** (today → 60 days, grouped
  HOJE / AMANHÃ / ESTA SEMANA / DEPOIS, chronological, untimed events first in a day) and
  **CALENDÁRIO** (one month, a dot per event, up to three; tap a day to list it).
- **Today** shows a compact PRÓXIMOS card (at most three events, mine and the partner's shared ones)
  with VER PLANNER; hidden when nothing is coming.
- Types (stored → shown): `exam` PROVA · `assignment` TRABALHO · `homework` LIÇÃO · `deadline`
  ENTREGA · `school_event` EVENTO. No colour per subject; subject is free text (no table).
- Priority: `normal` / `important` (a single accent dot).
- Countdown: HOJE · AMANHÃ · EM X DIAS (2–7) · then the date ("SEX, 3 OUT"). Past events stay in the
  calendar and never appear in PRÓXIMOS; nothing is deleted automatically.

## Data (`public.planner_events`)

| Column                 | Notes                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `owner_id`             | default `auth.uid()`, no client grant (spoofing → `42501`)                                  |
| `duo_id`               | set by the database from the owner's current complete duo when shared; `ON DELETE SET NULL` |
| `title`                | 1–80 chars, trimmed                                                                         |
| `event_type`           | one of the five types                                                                       |
| `subject`              | optional, ≤ 40                                                                              |
| `event_date`           | local school date (`date`, never UTC), 2000-01-01 … 2100-12-31                              |
| `event_time`           | optional local time (`time`, no zone)                                                       |
| `description`          | optional notes, ≤ 1000                                                                      |
| `priority`             | `normal` / `important`                                                                      |
| `shared_with_partner`  | always equal to `duo_id is not null` (constraint)                                           |
| `reminder_days_before` | null (none) or 0 / 1 / 3 / 7                                                                |

Indexes: `(owner_id, event_date)` and partial `(duo_id, event_date) where duo_id is not null`.

## Access (RLS)

| Who             | Access                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Owner           | select / insert / update / delete own rows                              |
| Current partner | select shared rows of the current duo only; no update, no delete        |
| Old partner     | nothing (the duo row is gone → `duo_id` null → private again)           |
| Outsider / anon | nothing (anon has no grant)                                             |
| No duo          | can create private events; sharing is refused (`LI_PLANNER_NO_PARTNER`) |

A private event (`shared_with_partner = false`) never reaches the partner: not the title, subject,
date, reminder or any metadata — the row is invisible and no broadcast is sent for it.

**Duo isolation.** Sharing stores the duo, not "the partner". When A and B end their duo, every
shared event of both turns private (kept by its owner). If A later forms a duo with C, C sees only
what A shares in the new duo. Tested in pgTAP (`v2_phase2_presence_planner`) and e2e.

## Realtime

The duo channel `duo:<duo_id>` carries `planner_changed` `{actor_id, event_id, operation}` (ids and
the operation only — never a title or date), sent by `private.sync_planner_event` (DEFINER trigger,
like every `sync_*`) on insert / update / delete of a shared event, and to the old duo when an event
stops being shared. The partner re-reads the upcoming window through RLS; an open month grid
re-reads its month. No new channel, no polling; the app also re-reads when it becomes visible.

## Reminders

In-app toast (+ browser notification while the app is open in a background tab and permitted),
through the existing `notify()` — the **Lembretes** preference (`notify_task_reminders`) and quiet
hours apply. A reminder is due from **08:00 local** of `event_date − reminder_days_before`; if the app
was closed then, it shows on the next open while the event is still ahead. Once per event and due
date per device (`locked-in:v2:<userId>:planner-reminded`, cleared on sign-out). Only my own events
remind me. With the app closed: Web Push (below).

## Add to tasks

ADICIONAR ÀS TAREFAS (owner and partner) opens Quick Add pre-filled with a suggestion
("Estudar para Prova de Física", "Fazer Trabalho de História"). Nothing is created until the user
confirms there. Event and task stay independent: completing the task never completes the event and
the event's date never touches the task. A pre-filled form never overwrites the Quick Add draft.

## Resume State

`/planner` is restorable; the view (upcoming / calendar), an explicitly chosen month, the scroll and
a 24 h draft of a **new** event are remembered (docs/RESUME_STATE.md). Events are never stored on the
device.

## Web Push (V2 Phase 10)

With push on for a device (docs/WEB_PUSH.md), the same `reminder_days_before` also arrives with the
app closed: 08:00 local of the reminder day (NO DIA / 1 / 3 / 7 DIAS ANTES); for NO DIA of a timed
event at most 2 h before it; never after the event started; held back by quiet hours and sent when
they end if still useful; once per event / reminder / date (`planner:<event>:<n>:<date>`). Text:
"Prova amanhã" + the event title ("Lembrete do Planner" with Ocultar detalhes). Only my own events;
a partner's shared event never reminds me. Tap → `/planner`.

## Performance

Upcoming: one query for today → +60 days, loaded with the layout. Calendar: one query per month
(≤ 70 days per read, 500 rows cap). No N+1; both served by the two indexes.

## Code

`src/lib/planner.ts` (pure: model, validation, grouping, countdown, grid, reminders),
`src/lib/planner-data.ts`, `src/app/(app)/planner-actions.ts`, `src/components/use-planner.ts`,
`src/components/screens/PlannerScreen.tsx`, `src/components/sheets/PlannerSheet.tsx`,
`src/components/today/UpcomingCard.tsx`. Tests: `tests/unit/planner.test.ts`,
`supabase/tests/v2_phase2_presence_planner.test.sql`, `tests/e2e/v2-phase2.spec.ts`.
