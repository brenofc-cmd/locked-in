# Database

Supabase Postgres 17. Schema lives in `supabase/migrations/` (the only source of truth); security
tests in `supabase/tests/`. Tables so far: **profiles, duos, duo_members** (Stage 3),
**routine_items, daily_tasks** (Stage 4), **activity_events** (Stage 5) and **focus_sessions**
(Stage 6), plus the functions / triggers they need and the Realtime Authorization policies on
`realtime.messages` (see [REALTIME.md](REALTIME.md)). Stage 7 adds **no table**: one profile column
(`daily_standard_percent`) and read functions over `daily_tasks` / `focus_sessions` (see
[ANALYTICS.md](ANALYTICS.md)). Stage 8 adds **user_settings**, **reactions** and **challenges**
(see [CHALLENGES.md](CHALLENGES.md), [NOTIFICATIONS.md](NOTIFICATIONS.md)).

## Projects

| Environment | Supabase project                                | Notes                                                |
| ----------- | ----------------------------------------------- | ---------------------------------------------------- |
| DEV         | `locked-in` (`oavhuxaanztrughyrckb`, sa-east-1) | Used by `.env.local`, Playwright and manual testing. |
| PROD        | not created yet                                 | Stage 10. Never point tests or test users at it.     |

Migrations applied to DEV (`supabase_migrations.schema_migrations`):

| Version          | File                                  | What                                                                             |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `20260923185849` | `…_profiles.sql`                      | `profiles`, updated_at + validation triggers, signup trigger                     |
| `20260923185852` | `…_duos.sql`                          | `duos`, `duo_members`, the two hard rules as constraints                         |
| `20260923185918` | `…_duo_functions.sql`                 | invite codes, `create_duo`, `join_duo`, `leave_duo`, `private.current_duo_id`    |
| `20260923185922` | `…_rls_and_grants.sql`                | RLS on, grants, policies                                                         |
| `20260923185945` | `…_profiles_single_select_policy.sql` | one permissive SELECT policy on profiles (advisor 0006)                          |
| `20260924110034` | `…_tasks_schema.sql`                  | `routine_items`, `daily_tasks`, constraints, normalisation / status triggers     |
| `20260924110146` | `…_tasks_functions.sql`               | `my_today`, `ensure_my_daily_tasks`, routine create / update / archive / reorder |
| `20260924110212` | `…_tasks_rls_and_grants.sql`          | RLS on, column grants, owner / partner policies                                  |
| `20260924125209` | `…_activity_events.sql`               | `activity_events`, feed trigger + database broadcasts, `partner_today()`         |
| `20260924125222` | `…_realtime_duo_authorization.sql`    | Realtime RLS on `realtime.messages` for private `duo:<id>` channels              |
| `20260924162212` | `…_focus_sessions.sql`                | `focus_sessions`, lifecycle trigger, one unfinished session per user             |
| `20260924162302` | `…_focus_functions.sql`               | start / pause / resume / complete, reflection, reconcile, partner projection     |
| `20260924162343` | `…_focus_realtime.sql`                | focus feed events + `focus` broadcasts                                           |
| `20260924172446` | `…_focus_server_clock.sql`            | `server_now()`                                                                   |
| `20260924172713` | `…_focus_server_clock_grants.sql`     | `server_now()` not callable by anon                                              |
| `20260924180106` | `…_daily_standard.sql`                | `profiles.daily_standard_percent` (1–100, default 80) (Stage 7)                  |
| `20260924180145` | `…_progress_functions.sql`            | progress / streak / habits / duo weeks functions, shared materialisation helper  |
| `20260924180531` | `…_summary_longest_closed.sql`        | `my_progress_summary` also returns `longest_closed`                              |
| `20260925112050` | `…_duo_weeks_together.sql`            | `duo_weeks`: no partner side for weeks before the duo was complete               |
| `20260925122722` | `…_user_settings.sql`                 | `user_settings` (owner only), trigger per profile, existing profiles backfilled  |
| `20260925122818` | `…_reactions.sql`                     | `reactions`, `set_reaction()`, `reaction` broadcast (Stage 8)                    |
| `20260925122919` | `…_challenges.sql`                    | `challenges`, `duo_challenges()`, `challenges_changed` broadcast                 |
| `20260925122957` | `…_duo_end_and_templates.sql`         | `leave_duo()` broadcasts `duo_ended`; `add_routine_items()`                      |
| `20260925123402` | `…_duo_joined_broadcast.sql`          | `join_duo()` broadcasts `duo_joined`                                             |
| `20260925125824` | `…_partner_reads_since_duo.sql`       | partner reads shared `daily_tasks` only from the date the duo formed             |

## Tables

### `public.profiles`

| Column                   | Type        | Rule                                                          |
| ------------------------ | ----------- | ------------------------------------------------------------- |
| `id`                     | uuid PK     | `references auth.users(id) on delete cascade`; = auth user id |
| `display_name`           | text        | not null, trimmed by trigger, 1–40 chars                      |
| `avatar_url`             | text        | nullable, ≤ 500 chars                                         |
| `timezone`               | text        | not null, default `UTC`, must be a real IANA name (trigger)   |
| `daily_standard_percent` | smallint    | not null, default 80, `check (1..100)` (Stage 7)              |
| `history_locked_through` | date        | nullable; database-owned closed-history boundary (Stage 9)    |
| `created_at`             | timestamptz | not null default now()                                        |
| `updated_at`             | timestamptz | not null default now(); always set by trigger on update       |

Created by `private.handle_new_user()` (AFTER INSERT on `auth.users`), never by the browser. It reads
`display_name` and `timezone` from signup metadata (user-controlled, so sanitised: name falls back to
the email local part, then `Member`; invalid timezone falls back to `UTC`).

### `public.duos`

| Column        | Type        | Rule                                                                      |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `id`          | uuid PK     | `gen_random_uuid()`                                                       |
| `name`        | text        | nullable, ≤ 60 chars (unused in V1)                                       |
| `invite_code` | text        | not null, **unique**, format `^LKD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$` |
| `created_by`  | uuid        | not null → `profiles(id)` on delete cascade                               |
| `created_at`  | timestamptz | not null default now()                                                    |

### `public.duo_members`

| Column      | Type        | Rule                                               |
| ----------- | ----------- | -------------------------------------------------- |
| `duo_id`    | uuid        | → `duos(id)` on delete cascade                     |
| `user_id`   | uuid        | → `profiles(id)` on delete cascade                 |
| `seat`      | smallint    | `check (seat in (1, 2))`; 1 = creator, 2 = partner |
| `joined_at` | timestamptz | not null default now()                             |

Primary key `(duo_id, user_id)`.

### `public.routine_items` (Stage 4) — the recurring template

"Gym happens MON / WED / FRI." Never hard-deleted once it has history; "Delete" in the UI archives it.

| Column                      | Type        | Rule                                                                                     |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `id`                        | uuid PK     | `gen_random_uuid()`; `unique (id, owner_id)` for the composite FK                        |
| `owner_id`                  | uuid        | not null, default `auth.uid()`, → `profiles(id)` on delete cascade                       |
| `title`                     | text        | not null, trimmed by trigger, 1–80 chars                                                 |
| `category`                  | text        | `morning`, `work_study`, `body`, `night`, `custom`                                       |
| `days_of_week`              | smallint[]  | ISO weekdays **1 = Monday … 7 = Sunday**, 1–7 entries, sorted / de-duplicated by trigger |
| `scheduled_time`            | time        | nullable                                                                                 |
| `sort_order`                | integer     | manual order (10, 20, 30 …)                                                              |
| `visible_to_partner`        | boolean     | default true                                                                             |
| `notes`                     | text        | ≤ 200 chars, shown under the name ("5 KM")                                               |
| `reminder`                  | boolean     | stored preference; notifications are not built yet                                       |
| `start_date`                | date        | owner's local date the routine starts (set to "today" on create)                         |
| `end_date`                  | date        | nullable; last local date it may produce a task; `>= start_date - 1`                     |
| `materialized_through`      | date        | nullable; last local date already turned into `daily_tasks`                              |
| `created_at` / `updated_at` | timestamptz | `updated_at` set by trigger                                                              |

### `public.daily_tasks` (Stage 4) — one task on one local date

"Gym was planned for 2026-09-24." A routine occurrence (`routine_item_id` set) or a one-off
(`routine_item_id` null). **Each row is a snapshot**: title, category, time, order, visibility,
notes and reminder are copied when the row is created, so later edits to the routine never rewrite
the past (Stage 7 builds history, streaks and competition from these rows).

| Column               | Type        | Rule                                                                    |
| -------------------- | ----------- | ----------------------------------------------------------------------- |
| `id`                 | uuid PK     |                                                                         |
| `owner_id`           | uuid        | not null, default `auth.uid()`, → `profiles(id)` on delete cascade      |
| `routine_item_id`    | uuid        | nullable; `(routine_item_id, owner_id)` → `routine_items(id, owner_id)` |
| `task_date`          | date        | not null, default `public.my_today()`; not editable by clients          |
| `title` … `reminder` | —           | snapshot columns, same rules as `routine_items`                         |
| `status`             | text        | `pending` \| `completed` \| `skipped`                                   |
| `skip_reason`        | text        | ≤ 24 chars, only while skipped ("Rest", "Sick" …)                       |
| `completed_at`       | timestamptz | set by trigger when status becomes `completed`                          |
| `skipped_at`         | timestamptz | set by trigger when status becomes `skipped`                            |

Integrity guaranteed by the database:

| Rule                                                                     | How                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| One occurrence per routine per date (refresh, double click, concurrency) | `unique (routine_item_id, task_date)` (NULLs distinct, so one-offs are free)                                        |
| An occurrence belongs to its routine's owner                             | composite FK `(routine_item_id, owner_id)`                                                                          |
| A routine with history cannot be hard-deleted                            | that FK is NO ACTION; clients have no DELETE on `routine_items`                                                     |
| No impossible status rows                                                | check `daily_tasks_status_timestamps` (pending ⇒ no timestamps, completed ⇒ `completed_at`, skipped ⇒ `skipped_at`) |
| Timestamps are server-owned                                              | trigger `private.normalize_daily_task()`; no client grant on them                                                   |

### `public.activity_events` (Stage 5) — the duo's feed

Proof of work, not an audit log. Maintained only by the database; clients can read their own duo's
rows and nothing else.

| Column             | Type        | Rule                                                        |
| ------------------ | ----------- | ----------------------------------------------------------- |
| `id`               | uuid PK     | identity used by the client to de-duplicate                 |
| `duo_id`           | uuid        | → `duos(id)` on delete cascade (ending a duo ends its feed) |
| `actor_id`         | uuid        | → `profiles(id)` on delete cascade; always the task owner   |
| `event_type`       | text        | `task_completed`, `focus_started`, `focus_completed`        |
| `target_type`      | text        | `daily_task` or `focus_session` (Stage 6)                   |
| `target_id`        | uuid        | the task; `unique (event_type, target_id)`                  |
| `title_snapshot`   | text        | task / focus title at event time (≤ 80); null if private    |
| `duration_seconds` | integer     | focus_completed only: actual focus seconds (Stage 6)        |
| `created_at`       | timestamptz | the completion time (focus: start / end time)               |

Trigger `private.sync_task_activity()` (SECURITY DEFINER, AFTER INSERT / UPDATE OF status,
visible_to_partner / DELETE on `daily_tasks`) keeps the invariant **"an event exists exactly while
its task is completed and shared, and its owner is in a duo"**:

| Change on the task                        | Feed                                        | Broadcast on `duo:<id>`    |
| ----------------------------------------- | ------------------------------------------- | -------------------------- |
| becomes completed (shared)                | event inserted (re-completion refreshes it) | `activity`                 |
| completed → pending / skipped, or deleted | event deleted (undo never leaves a lie)     | `activity_removed`         |
| shared → private while completed          | event deleted                               | `activity_removed`         |
| private → shared while completed          | event inserted                              | `activity`                 |
| shared skip / unskip                      | —                                           | `tasks_changed` (no title) |
| private task, any change                  | —                                           | nothing                    |
| title, notes, order, time edits           | — (the snapshot keeps the old title)        | nothing                    |

Indexes: `activity_events_duo_created_idx (duo_id, created_at desc)` (feed query and RLS),
`activity_events_actor_idx (actor_id)` (FK cascade), unique `(event_type, target_id)`.

`public.partner_today()` (SECURITY DEFINER, `authenticated` only) returns the duo partner's local
date and `done` / `total` for that day, **private tasks included in the counts** (they count toward
the score) but never listed. It returns nothing for outsiders or users without a partner. Accepted
under advisor 0029 like the duo RPCs (ADR-028). Partner counts refresh on the partner's shared
events, on reconnect and on page load; a private completion does not notify (that would reveal
timing), so counts can lag until one of those.

### `public.focus_sessions` (Stage 6) — persistent Focus

A Focus session is database state. The browser never saves a timer; it derives the clock from these
timestamps. Owner-only table (RLS); the partner sees a limited projection, never the row.

| Column                      | Type        | Rule                                                                             |
| --------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `id`                        | uuid PK     |                                                                                  |
| `user_id`                   | uuid        | default `auth.uid()`, → `profiles(id)` on delete cascade                         |
| `duo_id`                    | uuid        | duo at start (from membership, set by the trigger), → `duos` on delete set null  |
| `daily_task_id`             | uuid        | optional; composite FK `(daily_task_id, user_id)` → `daily_tasks(id, owner_id)`  |
| `title`                     | text        | 1–80 chars (task title or a preset: Project, Physics, Reading, Study)            |
| `planned_seconds`           | integer     | 1…43200 (the UI offers 25 / 50 / 90 / custom 5–240 min)                          |
| `status`                    | text        | `active`, `paused`, `completed` (no "cancelled": ending early is a real session) |
| `started_at`                | timestamptz | database `now()` at insert                                                       |
| `paused_at`                 | timestamptz | set while paused, null otherwise                                                 |
| `accumulated_pause_seconds` | integer     | ≥ 0, sum of finished pauses                                                      |
| `ended_at`                  | timestamptz | set on completion                                                                |
| `actual_focus_seconds`      | integer     | 0…planned, set on completion                                                     |
| `reflection`                | text        | ≤ 1000, optional, **owner only**                                                 |
| `visible_to_partner`        | boolean     | false → partner and feed never see the title (forced false for a private task)   |
| `local_date`                | date        | owner's local date at start, set by the trigger, never changes (Stage 9)         |

Constraints: a state check (active ⇒ no `paused_at` / `ended_at`; paused ⇒ `paused_at`; completed ⇒
`ended_at` + `actual_focus_seconds`); partial unique index `focus_sessions_one_unfinished (user_id)
where status in ('active','paused')` — **one unfinished session per user**, so a double tap, two tabs
or two devices cannot start two. `daily_tasks` gained `unique (id, owner_id)` as the FK target.

### `public.user_settings` (Stage 8) — owner-only preferences

One row per profile (created by `private.handle_new_profile_settings()` after a profile insert;
existing profiles backfilled with `onboarding_completed_at = now()`).

| Column                                             | Type        | Rule                                                            |
| -------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `user_id`                                          | uuid PK     | references profiles, cascade                                    |
| `onboarding_completed_at`                          | timestamptz | null = onboarding open; the first non-null write becomes now()  |
| `show_morning_briefing`                            | boolean     | default true                                                    |
| `share_new_tasks`                                  | boolean     | default true — default "Visible to partner" for new tasks       |
| `notify_partner_activity` … `notify_weekly_review` | boolean     | default true (4 columns)                                        |
| `quiet_hours_enabled`                              | boolean     | default false                                                   |
| `quiet_hours_start` / `quiet_hours_end`            | time        | default 22:00 / 07:00, must differ (start > end wraps midnight) |

RLS: SELECT / UPDATE own row only (not even the partner); UPDATE granted on the preference columns;
no INSERT / DELETE for clients.

### `public.reactions` (Stage 8) — attached to activity

| Column              | Type    | Rule                                                            |
| ------------------- | ------- | --------------------------------------------------------------- |
| `id`                | uuid PK |                                                                 |
| `activity_event_id` | uuid    | references activity_events, cascade (undo / duo end removes it) |
| `from_user_id`      | uuid    | default `auth.uid()`, not writable by clients                   |
| `reaction_type`     | text    | `fire` / `lightning` / `salute` / `respect`                     |
| unique              |         | `(activity_event_id, from_user_id)` — one reaction per user     |

RLS: read = events of my duo; insert / update = own row on the partner's event in my duo
(`private.can_react`); delete = own. `set_reaction(event, type)` (INVOKER) upserts. A trigger
broadcasts `reaction` (ids and type, no title).

### `public.challenges` (Stage 8)

| Column                    | Type    | Rule                                                         |
| ------------------------- | ------- | ------------------------------------------------------------ |
| `duo_id`                  | uuid    | default `private.current_duo_id()`, cascade with the duo     |
| `created_by`              | uuid    | default `auth.uid()`                                         |
| `title`                   | text    | trimmed, 1–40                                                |
| `challenge_type`          | text    | `standard_days` / `focus_seconds`                            |
| `target_value`            | integer | > 0; standard days ≤ days in the period; focus ≤ 24 h × days |
| `start_date` / `end_date` | date    | end ≥ start, at most 365 days apart                          |
| `creator_standard`        | integer | author's Daily Standard at creation (trigger, Stage 9)       |
| `partner_standard`        | integer | partner's Daily Standard at creation (trigger, Stage 9)      |

RLS: read = my duo; insert = my complete duo, author = me, start ≥ my today; delete = my duo and not
started yet; no update. Progress: `duo_challenges()` (DEFINER, CHALLENGES.md). A trigger broadcasts
`challenges_changed`. The standard snapshots have no client grant; `standard_days` is judged with
them, so a later Settings change never moves a result (ADR-051). `challenges_no_duplicate_idx`
unique `(duo_id, lower(title), challenge_type, start_date, end_date)` refuses a double submit.

## Closed history (Stage 9, ADR-050 / ADR-051)

A local day that has ended is final. Enforced by triggers for the API roles (`anon`,
`authenticated`, also through INVOKER RPCs); trusted database code (migrations, `postgres`-owned
DEFINER functions, DEV fixtures) is not blocked.

- **Boundary:** `private.history_locked_through(user)` =
  `greatest(profiles.history_locked_through, local today − 1)`. `profiles.history_locked_through`
  has no client grant; `private.keep_history_boundary()` stores the boundary reached under the old
  timezone whenever the timezone changes, so it only moves forward and a move west never reopens a
  day.
- **`daily_tasks`** (`private.guard_task_history()`, BEFORE INSERT / UPDATE / DELETE): a row dated on
  or before the boundary cannot be inserted, updated or deleted (`LI_HISTORY_LOCKED`); a row dated
  after the open day (boundary + 1) can only be `pending` (`LI_FUTURE_TASK`).
- **`routine_items`** (`private.guard_routine_history()`): no `start_date` in the past, no client
  write of `materialized_through`, no template change while missed days are not yet materialised
  (`LI_ROUTINE_STALE`), no archive date moved into closed days, no reopening an old archive.
- **Catch-up** still fills missed closed days as `pending`: `private.materialize_tasks` is SECURITY
  DEFINER (runs as the owner the guards trust) and only creates occurrences from protected
  templates, for the caller or the caller's partner.
- **Focus:** `local_date` is set at start and frozen; a completed session changes only its
  reflection; a paused session of a closed day cannot be resumed — `resume_focus_session()` /
  `reconcile_my_focus()` complete it with the time before the pause.
- **Challenges:** standards snapshotted at creation; focus challenges count every session's
  effective seconds (`private.focus_seconds`), so finalising a session never changes a result.

## Focus lifecycle and timer maths (Stage 6)

Trigger `private.focus_lifecycle()` (BEFORE INSERT / UPDATE) owns every timestamp; clients only send
the status they want (column grants: INSERT `title, planned_seconds, daily_task_id,
visible_to_partner`; UPDATE `status, reflection`).

```
active seconds = (coalesce(paused_at, now()) - started_at) - accumulated_pause_seconds
remaining      = planned_seconds - active seconds            (never below 0)
```

| Transition           | Database does                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------- |
| insert               | `status = active`, `started_at = now()`, `duo_id` from membership, private task ⇒ private   |
| active → paused      | `paused_at = now()`                                                                         |
| paused → active      | `accumulated_pause_seconds += round(now() - paused_at)`, `paused_at = null`                 |
| active/paused → done | `actual = min(active seconds, planned)`, `ended_at = now()` — or the planned end if expired |
| completed → anything | refused (`LI_FOCUS_FINISHED`); only `reflection` may still be written                       |

Example: start 10:00, pause 10:10–10:20, end 10:40 → `actual_focus_seconds = 1800` (30 min).

**Expiry / reconciliation (no cron).** An `active` session whose planned time has passed (the app
may have been closed) is completed on demand by `public.reconcile_my_focus()`, called by
`my_active_focus()` on every load and by every transition. It stores `actual = planned` and
`ended_at = started_at + pauses + planned` — the real end, not the time the app was reopened. The
open app also ends the session itself at 00:00. A **paused** session never expires.

**Focus today** = completed sessions + the running one, attributed to the local day (profile
timezone) the session **started** on; a session across midnight stays with its start day.

## Status semantics (Stage 4)

- Stored: `pending`, `completed`, `skipped`. Clients send only `status` (+ `skip_reason`).
- **Missed is derived, never stored**: `task_date < my_today()` and `status = 'pending'`. No job
  flips rows to missed.
- Corrections are plain updates: `completed → pending` (undo), `skipped → pending` (unskip).
- Completion % of a day = completed / all tasks of the day. A skipped task **stays in the total**
  and is not completed (10 tasks, 8 completed, 1 skipped, 1 pending → 80%). Perfect day = 100%
  completed. See ADR-022.

## Timezone semantics (Stage 4)

A LOCKED IN day is a calendar date in `profiles.timezone`. `public.my_today()` —
`(now() at time zone profiles.timezone)::date` for `auth.uid()` — is the single definition, used by
materialisation, the `task_date` default (Quick Add) and returned to the app by
`ensure_my_daily_tasks()`. The app never derives "today" from UTC; `src/lib/local-date.ts` only
formats and does calendar arithmetic on the `YYYY-MM-DD` strings the database returns.

## Materialisation (Stage 4)

No cron, no Edge Function, no worker. `public.ensure_my_daily_tasks()` runs when the app loads
(`(app)/layout.tsx` → `loadAppData()`), and first inside every routine-changing function:

1. `today := my_today()` for the caller.
2. For each of the caller's routine items, walk the dates from
   `max(start_date, materialized_through + 1)` to `min(today, end_date)` (`generate_series`).
3. Insert a snapshot row for every date whose ISO weekday is in `days_of_week`,
   `ON CONFLICT (routine_item_id, task_date) DO NOTHING`.
4. Advance `materialized_through` to `min(today, end_date)`.

Since Stage 7 the steps live in `private.materialize_tasks(user)`, shared by
`ensure_my_daily_tasks()`, `my_progress_summary()` and `duo_weeks()` (which runs it for the partner
too, as DEFINER, so a partner who has not opened the app today is compared on their scheduled day).

Days the app was not opened are therefore filled in on the next open (catch-up). Repeating the call,
refreshing, or 5 concurrent calls create nothing twice — the unique constraint is the final
guarantee (tested in pgTAP and with concurrent API calls).

Routine changes:

| Action (UI)                    | Function                     | Effect                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add routine item               | `create_routine_item(...)`   | `start_date = my_today()`, appended to the order, today's occurrence created if scheduled today                                                                                                                           |
| Edit → "Today only"            | plain `update daily_tasks`   | only today's row changes; the routine is untouched                                                                                                                                                                        |
| Edit → "Today and future days" | `update_routine_item(...)`   | catch-up first (old values), then template + today's row; past rows never change. Today: pending and no longer scheduled → removed; completed / skipped → kept with status, snapshot refreshed; newly scheduled → created |
| Delete a routine item          | `archive_routine_item(id)`   | `end_date = today - 1`; today's pending row removed; completed / skipped rows and history kept                                                                                                                            |
| Reorder                        | `reorder_routine_items(ids)` | `sort_order = 10, 20 …`; today's rows follow; past rows keep their order                                                                                                                                                  |
| Skip today                     | `update daily_tasks`         | `status = skipped` (V1 has no recurrence exceptions)                                                                                                                                                                      |

## The two hard rules (enforced by the schema)

| Rule                          | Constraint                                                       |
| ----------------------------- | ---------------------------------------------------------------- |
| A user is in at most one duo  | `duo_members_one_duo_per_user unique (user_id)`                  |
| A duo has at most two members | `seat in (1, 2)` + `duo_members_two_seats unique (duo_id, seat)` |

These are plain unique / check constraints, so they hold under concurrency with no application
logic: of two concurrent inserts for the same seat, the second one to commit fails with a unique
violation. `join_duo` additionally locks the duo row (`select … for update`) so joiners queue and the
loser gets a clean `LI_DUO_FULL` instead of a raw constraint error. Verified with real concurrent
requests (B and C racing for the same code, 10 + 5 rounds: always exactly one winner).

## Indexes

| Index                                                              | Serves                                           |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| `profiles_pkey (id)`                                               | profile lookups, RLS `id = auth.uid()`           |
| `duos_pkey (id)`                                                   | RLS `id = current_duo_id()`                      |
| `duos_invite_code_key (invite_code)` unique                        | `join_duo` lookup                                |
| `duos_created_by_idx (created_by)`                                 | FK cascade from profiles                         |
| `duo_members_pkey (duo_id, user_id)`                               | RLS `duo_id = current_duo_id()`, partner lookups |
| `duo_members_one_duo_per_user (user_id)` unique                    | `current_duo_id()` (every RLS check)             |
| `duo_members_two_seats (duo_id, seat)` unique                      | seat-2 check in `join_duo`                       |
| `routine_items_owner_idx (owner_id, sort_order)`                   | own routine list, RLS `owner_id = auth.uid()`    |
| `routine_items_id_owner_key (id, owner_id)` unique                 | target of the composite FK                       |
| `daily_tasks_owner_date_idx (owner_id, task_date)`                 | Today query, RLS, future history (Stage 7)       |
| `daily_tasks_routine_date_key (routine_item_id, task_date)` unique | one occurrence per date, routine lookups         |
| `focus_sessions_one_unfinished (user_id)` unique partial           | one active / paused session per user             |
| `focus_sessions_user_started_idx (user_id, started_at desc)`       | active session, recent sessions                  |
| `focus_sessions_user_day_idx (user_id, local_date)`                | focus per day (progress, challenges)             |
| `focus_sessions_task_idx (daily_task_id)`                          | FK set-null when a task is deleted               |
| `focus_sessions_duo_idx (duo_id)`                                  | FK set-null when a duo ends                      |
| `challenges_no_duplicate_idx (duo_id, lower(title), …)` unique     | no duplicate challenge from a double submit      |

Advisor 0001 reports the composite FKs `(routine_item_id, owner_id)` and `(daily_task_id, user_id)`
(focus_sessions) as not covered by an exact index. Accepted: the leading-column indexes serve them.
For routines, the unique `(routine_item_id, task_date)` index serves lookups by routine and the FK is only
checked when a routine is hard-deleted, which clients cannot do.

## Functions

| Function                                             | Security | Callable by                          | Purpose                                                          |
| ---------------------------------------------------- | -------- | ------------------------------------ | ---------------------------------------------------------------- |
| `public.create_duo()`                                | DEFINER  | `authenticated`                      | duo + creator membership (seat 1) + invite code, atomically      |
| `public.join_duo(p_code text)`                       | DEFINER  | `authenticated`                      | normalise code, lock duo, take seat 2                            |
| `public.leave_duo()`                                 | DEFINER  | `authenticated`                      | V1: deletes the duo, memberships cascade (ends it for both)      |
| `public.normalize_invite_code(text)`                 | invoker  | nobody (internal)                    | `lkd 8x29ab` → `LKD-8X29AB`                                      |
| `private.generate_invite_code()`                     | invoker  | nobody (internal)                    | CSPRNG (`gen_random_bytes`), rejection sampling, no modulo bias  |
| `private.current_duo_id()`                           | DEFINER  | `authenticated` (schema not exposed) | caller's duo id for RLS, avoids policy recursion                 |
| `private.handle_new_user()`                          | DEFINER  | trigger only                         | creates the profile                                              |
| `private.set_updated_at()`                           | invoker  | trigger only                         | `updated_at = now()`                                             |
| `private.validate_profile()`                         | invoker  | trigger only                         | trims name, rejects non-IANA timezone (`22023`)                  |
| `public.my_today()`                                  | invoker  | `authenticated`                      | caller's local date (profiles.timezone)                          |
| `public.ensure_my_daily_tasks()`                     | invoker  | `authenticated`                      | materialise + catch-up for `auth.uid()`; returns today           |
| `public.create_routine_item(...)`                    | invoker  | `authenticated`                      | new routine item starting today                                  |
| `public.update_routine_item(...)`                    | invoker  | `authenticated`                      | "Today and future days"                                          |
| `public.archive_routine_item(id)`                    | invoker  | `authenticated`                      | "Delete" = archive                                               |
| `public.reorder_routine_items(ids)`                  | invoker  | `authenticated`                      | persist manual order                                             |
| `private.normalize_routine_item()`                   | invoker  | trigger only                         | trims title / notes, sorts and de-duplicates weekdays            |
| `private.normalize_daily_task()`                     | invoker  | trigger only                         | trims, owns status timestamps                                    |
| `private.sync_task_activity()`                       | DEFINER  | trigger only                         | feed events + `realtime.send` broadcasts (Stage 5)               |
| `public.partner_today()`                             | DEFINER  | `authenticated`                      | partner's local date + done / total (Stage 5)                    |
| `public.reconcile_my_focus()`                        | invoker  | `authenticated`                      | complete my expired session (Stage 6)                            |
| `public.my_active_focus()`                           | invoker  | `authenticated`                      | reconcile, then my unfinished session                            |
| `public.start_focus_session(...)`                    | invoker  | `authenticated`                      | title, planned seconds, optional task, visibility                |
| `public.pause_focus_session(id)`                     | invoker  | `authenticated`                      | idempotent; returns the row                                      |
| `public.resume_focus_session(id)`                    | invoker  | `authenticated`                      | idempotent; returns the row                                      |
| `public.complete_focus_session(...)`                 | invoker  | `authenticated`                      | end (early or on time), optional reflection                      |
| `public.save_focus_reflection(...)`                  | invoker  | `authenticated`                      | reflection after completion                                      |
| `public.partner_current_focus()`                     | DEFINER  | `authenticated`                      | partner's unfinished, unexpired session: limited projection      |
| `public.server_now()`                                | invoker  | `authenticated`                      | database clock: the timers' reference on page load (Stage 6)     |
| `private.focus_lifecycle()`                          | invoker  | trigger only                         | owns status timestamps and duration maths                        |
| `private.sync_focus_activity()`                      | DEFINER  | trigger only                         | focus feed events + `focus` broadcasts                           |
| `public.my_progress_summary()`                       | invoker  | `authenticated`                      | my streak, longest, standard, today's counts (Stage 7)           |
| `public.my_daily_progress(from, to)`                 | invoker  | `authenticated`                      | my daily series: planned / completed / focus (≤ 400 days)        |
| `public.my_habits(from, to)`                         | invoker  | `authenticated`                      | recurring tasks' consistency over closed days                    |
| `public.duo_weeks(p_weeks)`                          | DEFINER  | `authenticated`                      | current + completed weeks, me and partner, integers only         |
| `public.partner_progress_summary()`                  | DEFINER  | `authenticated`                      | partner's streak and standard (aggregate)                        |
| `private.materialize_tasks(user)`                    | DEFINER  | `authenticated` (schema not exposed) | materialisation for the caller or the caller's partner only      |
| `private.day_stats(user, from, to)`                  | invoker  | `authenticated` (schema not exposed) | one row per day; RLS applies to the caller                       |
| `private.streaks(user)`                              | invoker  | `authenticated` (schema not exposed) | closed-day streak inputs                                         |
| `private.local_today / standard_met / focus_seconds` | invoker  | `authenticated` (schema not exposed) | helpers                                                          |
| `public.set_reaction(event, type)`                   | invoker  | `authenticated`                      | set / replace my reaction on a partner event (Stage 8)           |
| `public.duo_challenges()`                            | DEFINER  | `authenticated`                      | my duo's challenges with both members' derived progress          |
| `public.add_routine_items(...)`                      | invoker  | `authenticated`                      | template / onboarding items, serialised per user, skips existing |
| `private.can_react(event)`                           | invoker  | `authenticated` (schema not exposed) | event in my duo and not mine                                     |
| `private.duo_is_complete()`                          | DEFINER  | `authenticated` (schema not exposed) | my duo has two members                                           |
| `private.duo_together_since(owner)`                  | invoker  | `authenticated` (schema not exposed) | date the duo became complete, in the owner's calendar            |
| `private.challenge_value(...)`                       | invoker  | nobody (called by `duo_challenges`)  | one member's progress in a period                                |
| `private.history_locked_through(user)`               | invoker  | `authenticated` (schema not exposed) | closed-history boundary (Stage 9)                                |
| `private.guard_task_history()`                       | invoker  | trigger only                         | refuses closed-day / premature task writes                       |
| `private.guard_routine_history()`                    | invoker  | trigger only                         | refuses template writes that would rewrite the past              |
| `private.keep_history_boundary()`                    | invoker  | trigger only                         | keeps the boundary monotonic across timezone changes             |
| `private.normalize_challenge()`                      | invoker  | trigger only                         | trims the title, snapshots both standards at creation            |

Stage 4 functions are all SECURITY INVOKER (ADR-020): they run as the caller, so RLS and column
grants apply exactly as for direct API calls, and none of them takes an owner id. Errors:
`LI_NOT_AUTHENTICATED`, `LI_NOT_FOUND` (mapped by `taskErrorMessage()` in `src/lib/task-model.ts`).

Every function: `set search_path = ''`, all objects schema-qualified, `revoke all … from public`
then minimal `grant execute`. RPCs act only for `auth.uid()` (no user id parameter), take no dynamic
SQL, and raise stable error codes that the app maps to copy (`src/lib/invite-code.ts`):
`LI_NOT_AUTHENTICATED`, `LI_ALREADY_IN_DUO`, `LI_INVALID_CODE`, `LI_DUO_FULL`, `LI_NOT_IN_DUO`.

Supabase advisor 0029 flags the three public RPCs as "SECURITY DEFINER executable by authenticated".
That is intentional (they are the only write path into duos / memberships); see ADR-015.

Stage 7: the owner progress functions are INVOKER (RLS applies). `duo_weeks` and
`partner_progress_summary` are DEFINER (they must count the partner's private tasks), derive the
partner from `auth.uid()` → membership, take no user id and return integers only; accepted under
advisor 0029 like `partner_today` (ADR-040). Errors: `LI_NOT_AUTHENTICATED`, `LI_INVALID_RANGE`.

Stage 9 audit (2026-09-28, catalog + source review on DEV): the SECURITY DEFINER set is exactly
`create_duo`, `join_duo`, `leave_duo`, `partner_today`, `partner_current_focus`,
`partner_progress_summary`, `duo_weeks`, `duo_challenges`, `private.current_duo_id`,
`private.duo_is_complete`, `private.materialize_tasks` and the triggers `handle_new_user`,
`handle_new_profile_settings`, `sync_task_activity`, `sync_focus_activity`, `sync_reaction`,
`sync_challenge` (asserted by `stage9_integrity.test.sql`). All pin `search_path = ''`, use
schema-qualified names, derive identity from `auth.uid()` → membership, are owned by `postgres`,
and are not executable by PUBLIC or `anon`; triggers are executable by nobody. The only DEFINER with
a user-id parameter, `private.materialize_tasks(p_user)`, returns `null` unless `p_user` is the
caller or the caller's current partner. Cross-owner ids cannot be injected: `daily_tasks` and
`focus_sessions` reference their parent through composite `(id, owner)` foreign keys. Advisor 0029
lists the eight public ones: accepted (ADR-015 / 034 / 040 / 044). DEV additionally contains the
three `dev_fixture_*` functions (ADR-052), which must never exist in production.

## Invite codes

`LKD-` + 6 symbols from a 31-symbol alphabet without `0 O 1 I L` → 31⁶ ≈ 887 million codes. Random
(not incremental), unique, readable aloud, does not expose any UUID. Input is normalised (case,
spaces, dashes, optional `LKD` prefix) in the database and mirrored in the UI for early validation.

## Grants and RLS

Grants decide which operations a role may attempt; policies decide which rows.

| Role            | profiles                                                                            | duos   | duo_members | RPCs                  |
| --------------- | ----------------------------------------------------------------------------------- | ------ | ----------- | --------------------- |
| `anon`          | —                                                                                   | —      | —           | —                     |
| `authenticated` | SELECT; UPDATE (`display_name`, `avatar_url`, `timezone`, `daily_standard_percent`) | SELECT | SELECT      | create / join / leave |

No INSERT / DELETE grants on these three: profiles come from the trigger, duos and memberships from
the RPCs.

| Role            | routine_items                                                                                                                                          | daily_tasks                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon`          | —                                                                                                                                                      | —                                                                                                                                                                                                                                   |
| `authenticated` | SELECT; INSERT (template columns, `owner_id`, `start_date`); UPDATE (template columns, `end_date`); **no DELETE** (Stage 9: no `materialized_through`) | SELECT, DELETE; INSERT (snapshot columns, `owner_id`, `routine_item_id`, `task_date`, `status`, `skip_reason`); UPDATE (snapshot columns, `status`, `skip_reason`) — never `task_date`, `owner_id`, `routine_item_id` or timestamps |

`activity_events`: `authenticated` SELECT only (no INSERT / UPDATE / DELETE); `anon` nothing.

`focus_sessions`: `authenticated` SELECT; INSERT (`user_id`, `title`, `planned_seconds`,
`daily_task_id`, `visible_to_partner`); UPDATE (`status`, `reflection`); **no DELETE**; `anon`
nothing. Policies: read / insert / update **own** only (`user_id = auth.uid()`). The partner never
reads the table; `partner_current_focus()` (SECURITY DEFINER, accepted under advisor 0029 like
`partner_today`, ADR-034) returns only `id, user_id, title (null if private), status, started_at,
planned_seconds, paused_at, accumulated_pause_seconds` — never the reflection, the task id or
history. Outsiders get nothing. Focus errors: `LI_FOCUS_RUNNING`, `LI_FOCUS_FINISHED`,
`LI_NOT_FOUND`, `LI_NOT_AUTHENTICATED` (mapped by `focusErrorMessage()` in `src/lib/focus.ts`).

RLS is enabled on all twelve tables (V2 Phase 2 adds `user_presence`, `planner_events`), and on `realtime.messages` (Realtime Authorization, see
REALTIME.md).

| Policy                                                                | Table             | Rule                                                                                                     |
| --------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `profiles: read own or duo partner`                                   | profiles          | SELECT: `id = auth.uid()` or id is a member of my duo                                                    |
| `profiles: update own`                                                | profiles          | UPDATE: `id = auth.uid()` (using + with check)                                                           |
| `duos: read own duo`                                                  | duos              | SELECT: `id = private.current_duo_id()`                                                                  |
| `duo_members: read own duo`                                           | duo_members       | SELECT: `duo_id = private.current_duo_id()`                                                              |
| `routine_items: read own or shared by duo partner`                    | routine_items     | SELECT: own, or `visible_to_partner` and owner is in my duo                                              |
| `routine_items: insert own` / `update own`                            | routine_items     | `owner_id = auth.uid()` (with check blocks spoofing)                                                     |
| `daily_tasks: read own or shared by duo partner`                      | daily_tasks       | SELECT: own, or `visible_to_partner`, owner in my duo and `task_date` ≥ the day the duo formed (Stage 8) |
| `daily_tasks: insert own` / `update own` / `delete own`               | daily_tasks       | `owner_id = auth.uid()`                                                                                  |
| `activity_events: read own duo`                                       | activity_events   | SELECT: `duo_id = private.current_duo_id()`                                                              |
| `duo members receive duo broadcasts and presence`                     | realtime.messages | SELECT: broadcast / presence on topic `duo:<my duo>`                                                     |
| `duo members publish presence`                                        | realtime.messages | INSERT: presence only, topic `duo:<my duo>`                                                              |
| `user_settings: read own` / `update own`                              | user_settings     | `user_id = auth.uid()`                                                                                   |
| `reactions: read own duo`, insert / update / delete own               | reactions         | see the reactions table above                                                                            |
| `challenges: read own duo` / `members create` / `delete before start` | challenges        | see the challenges table above                                                                           |

Partner = read-only and only shared rows; private tasks (`visible_to_partner = false`) are invisible
to them at the database level. Outsiders read and write nothing. Queries in the app still filter
`owner_id = me`, because the partner's shared rows are readable too.

Tables created after 2026-10-30 in `public` need explicit grants (Supabase platform change). These
migrations already grant explicitly; keep doing so.

## Tests

- `supabase/tests/stage3_auth_duo.test.sql` — pgTAP, 51 assertions: signup trigger, updated_at,
  anon denied everywhere, A / B / C (own profile, partner visibility, outsider isolation, no
  cross-profile updates, duo full, already in a duo, invalid code, direct-write denial, schema
  backstops, leave).
- `supabase/tests/stage4_tasks.test.sql` — pgTAP, 72 assertions: timezone (UTC+14 vs UTC-11 users),
  generation on the right ISO weekdays, nothing before `start_date` or after `end_date`,
  idempotency, one occurrence per date, catch-up of unopened days, status timestamps, missed not
  storable, snapshots (rename, Today only, Today and future incl. completed occurrences), archive,
  reorder, constraints, partner shared-only read and no writes, private tasks, outsider, anon,
  `owner_id` spoofing, cross-owner routine link, admin-level backstops.

- `supabase/tests/stage5_realtime.test.sql` — pgTAP, 40 assertions: event on completion (actor,
  duo, title snapshot, time), no event on unrelated updates, undo / re-completion, private tasks,
  shared ↔ private, skip, delete, feed read by partner / not by outsider or anon, clients cannot
  insert / edit / delete events, `partner_today` counts incl. private, Realtime Authorization
  (receive / publish presence for A and B; denied for the other duo, no-duo user, fake topic,
  another duo's topic, anon; clients cannot send broadcasts), duo break removes feed and access.

- `supabase/tests/stage6_focus.test.sql` — pgTAP, 63 assertions: anon denied; start sets database
  timestamps and duo; one unfinished session per user (`LI_FOCUS_RUNNING`, index backstop); pause /
  resume maths (pauses excluded); complete early; completed immutable except reflection; expired
  session reconciled with `actual = planned` and the planned end; paused never expires; linked task
  must be mine; private task ⇒ private session; partner projection (no reflection, no private title,
  no history) and no table read / write; outsider nothing; feed events `focus_started` /
  `focus_completed` only (no pause / resume), private without title; column-grant spoofing refused; `server_now()` returns the database clock, anon denied.

- `supabase/tests/stage7_progress.test.sql` — pgTAP, 78 assertions: standard default 80 and range;
  streak over closed days with neutral days, the exact 80 % boundary, skipped in the total, an open
  today that never breaks it, live longest streak and undo, recalculation when the standard changes;
  daily series (one row per day, neutral = 0 planned, capped at today, `LI_INVALID_RANGE`); focus by
  start day and running sessions; habits (recurring, closed days, current name / archived snapshot);
  `duo_weeks` (current first, exact draw, skipped and private tasks in the counts, pre-duo weeks
  without a partner side, 26-week cap, standard never changes it, partner's routine materialised);
  partner summary with the partner's own standard; outsider / no-duo / anon isolation; no `text`
  column in the partner functions; no stats tables; grants.

- `supabase/tests/stage8_product.test.sql` — pgTAP, 84 assertions: settings (defaults, owner only,
  onboarding time, constraints), profile edits, reactions (replace, self, outsider, other duo,
  spoofing, approved set, broadcast without title, undo cascade), challenges (create, validation,
  derived progress of both types incl. private data and past periods, delete rules, isolation,
  broadcast), templates (dedupe, double click), duo end (atomic, third party untouched, personal
  history kept, old duo data gone, broadcast), a new partner seeing nothing of the old duo, grants.

- `supabase/tests/v2_phase2_presence_planner.test.sql` — pgTAP, 63 assertions (V2 Phase 2): last
  seen (database clock, one row per user, no update / insert / delete for someone else, no spoofed
  time or user id, partner reads, outsider / no duo / anon nothing, old partner loses it, new partner
  gets it), planner (owner CRUD, trimmed text, owner / duo from the database, spoofed `owner_id` /
  `duo_id`, invalid type / title / priority / reminder / length, partner read-only both ways, private
  invisible, outsider / no duo / anon, broadcasts with ids only, unsharing tells the old duo, duo end
  makes shared events private, new partner sees none of them), grants / RLS / INVOKER heartbeat.
  Full DEV run 2026-09-29 after the V2 migrations: stage 3–9 unchanged (457/457) + 63 = **520/520**.
- `supabase/tests/stage9_integrity.test.sql` — pgTAP, 69 assertions: closed history (complete /
  undo / skip / delete / rename / visibility / backdated insert refused, future only pending,
  today fully editable), routine guards (past start, stale template, `materialized_through`,
  archive into the past, reopening an old archive), catch-up still materialises missed days as
  locked, closed week / streak unchanged after every attempt, focus immutability (duration, start,
  day, reopening, backdated insert; a closed day's paused session completes instead of resuming),
  closed challenges stable after both standards change, standard snapshot, duplicate challenge,
  timezone move west keeps the boundary, outsider (tasks, challenges, catch-up for someone else,
  realtime topic), and the privilege model (exact DEFINER set, empty `search_path`, nothing for
  PUBLIC / anon, triggers not callable, RLS on every table, no views, default privileges).

Each file runs in one transaction and rolls back (broadcasts sent inside it are never delivered).

How to run:

- **Local** (needs Docker): `npx supabase init` once (creates `supabase/config.toml`, not committed yet), then `npx supabase start` and `npx supabase test db`.
- **DEV project** (because Docker Desktop's VM does not start on this machine):
  `node supabase/dev/pgtap_dev.mjs supabase/tests/<file>.test.sql > out.sql`, then run `out.sql` on
  DEV (SQL editor or the Supabase MCP `execute_sql`). The script captures every assertion's TAP line
  into a temp table and ends with a `raise exception` that prints
  `TAP FAILED=<n> PLANNED=<p> RAN=<r>` and any failing lines. The exception aborts the transaction,
  so users, rows and the pgtap extension are all rolled back. Results on 2026-09-28 (final Stage 9
  run, all 29 migrations): stage 3 `51/51`, stage 4 `72/72`, stage 5 `40/40`, stage 6 `63/63`,
  stage 7 `78/78`, stage 8 `84/84`, stage 9 `69/69` (457/457), `FAILED=0`; DEV verified free of
  fixtures afterwards.

End-to-end coverage of the same rules through the public API (publishable key, real sessions):
`tests/e2e/stage3.spec.ts` → "database rules hold through the public API" and
`tests/e2e/stage4.spec.ts` (partner / outsider / spoofing, 5 concurrent `ensure_my_daily_tasks`
calls, catch-up, snapshot, timezone) and `tests/e2e/stage9.spec.ts` (closed-history, focus,
challenge and IDOR attacks with real user tokens; DEV-only fixtures prepare past days, ADR-052).

## Test users (DEV only)

Created by `supabase/dev/create_test_users.sql` (confirmed, so no email is sent), all
`@example.com`, timezone `America/Sao_Paulo`:

| Email                        | Name    | Used by                                         |
| ---------------------------- | ------- | ----------------------------------------------- |
| `li-e2e-brendon@example.com` | Brendon | Playwright UI suite (signed in; duo with Lucas) |
| `li-e2e-lucas@example.com`   | Lucas   | partner of Brendon                              |
| `li-e2e-a@example.com`       | Alice   | Stage 3 flow: creates the duo                   |
| `li-e2e-b@example.com`       | Bruno   | Stage 3 flow: joins                             |
| `li-e2e-c@example.com`       | Carla   | Stage 3 / 4 flows: outsider / third member      |
| `li-e2e-desk@example.com`    | Brendon | UI suite on desktop-1440 (duo with lucas2)      |
| `li-e2e-lucas2@example.com`  | Lucas   | partner of the desk user                        |
| `li-e2e-layout@example.com`  | Brendon | UI layout tests on mobile-375 / 430 (read-only) |

Alice / Bruno are also the Stage 4 owner / partner. The Playwright setup seeds the UI users with the
design's Today (12 routine items, 8 completed) through the real RPCs (`tests/fixtures/design-day.ts`).
The E2E reset archives routine items (clients cannot hard-delete them), so archived rows accumulate;
`supabase/dev/reset_test_users.sql` wipes the test users' tasks and routine items in DEV.
The shared password is `E2E_PASSWORD` in `.env.test.local` (git-ignored; template below). Playwright
loads `.env.local` and `.env.test.local` itself.

```
E2E_PASSWORD=
E2E_BRENDON_EMAIL=li-e2e-brendon@example.com
E2E_LUCAS_EMAIL=li-e2e-lucas@example.com
E2E_A_EMAIL=li-e2e-a@example.com
E2E_B_EMAIL=li-e2e-b@example.com
E2E_C_EMAIL=li-e2e-c@example.com
E2E_DESK_EMAIL=li-e2e-desk@example.com
E2E_LUCAS2_EMAIL=li-e2e-lucas2@example.com
E2E_LAYOUT_EMAIL=li-e2e-layout@example.com
```

## Regenerating types

After each migration regenerate `src/types/database.ts` with the Supabase type generator
(`npx supabase gen types typescript --project-id oavhuxaanztrughyrckb`, or the Supabase MCP
`generate_typescript_types`) and keep the header comment.

## V2 Phase 2 tables (migrations `20260929114849_user_presence_last_seen`, `20260929114909_planner_events`)

### `public.user_presence` — partner last seen (ADR-056)

| Column         | Type        | Notes                                                 |
| -------------- | ----------- | ----------------------------------------------------- |
| `user_id`      | uuid PK     | default `auth.uid()`, FK `profiles` on delete cascade |
| `last_seen_at` | timestamptz | always `now()` (trigger `user_presence_stamp`)        |

Written only through `public.touch_last_seen()` (INVOKER upsert of the caller's row). Grants:
select; insert (`user_id`); update (`last_seen_at`). Policies: read own or current duo member;
insert / update own. A separate table (not a `profiles` column) so heartbeats never run the profile
triggers.

### `public.planner_events` — school planner (ADR-057)

Columns, constraints and access: docs/PLANNER.md. Triggers: `planner_events_normalize` (INVOKER:
trims, keeps `owner_id`, derives `duo_id` from sharing, `LI_PLANNER_NO_PARTNER`; after a duo ends
turns the event private), `planner_events_set_updated_at`, `planner_events_broadcast`
(`private.sync_planner_event`, DEFINER). Indexes `(owner_id, event_date)`, partial
`(duo_id, event_date) where duo_id is not null`. FK `duo_id → duos on delete set null`.
