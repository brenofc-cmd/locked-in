# Database

Supabase Postgres 17. Schema lives in `supabase/migrations/` (the only source of truth); security
tests in `supabase/tests/`. Tables so far: **profiles, duos, duo_members** (Stage 3),
**routine_items, daily_tasks** (Stage 4) and **activity_events** (Stage 5), plus the functions /
triggers they need and the Realtime Authorization policies on `realtime.messages` (see
[REALTIME.md](REALTIME.md)).

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

## Tables

### `public.profiles`

| Column         | Type        | Rule                                                          |
| -------------- | ----------- | ------------------------------------------------------------- |
| `id`           | uuid PK     | `references auth.users(id) on delete cascade`; = auth user id |
| `display_name` | text        | not null, trimmed by trigger, 1–40 chars                      |
| `avatar_url`   | text        | nullable, ≤ 500 chars                                         |
| `timezone`     | text        | not null, default `UTC`, must be a real IANA name (trigger)   |
| `created_at`   | timestamptz | not null default now()                                        |
| `updated_at`   | timestamptz | not null default now(); always set by trigger on update       |

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

| Column           | Type        | Rule                                                        |
| ---------------- | ----------- | ----------------------------------------------------------- |
| `id`             | uuid PK     | identity used by the client to de-duplicate                 |
| `duo_id`         | uuid        | → `duos(id)` on delete cascade (ending a duo ends its feed) |
| `actor_id`       | uuid        | → `profiles(id)` on delete cascade; always the task owner   |
| `event_type`     | text        | `task_completed` (Stage 6 / 8 add focus / reaction types)   |
| `target_type`    | text        | `daily_task`                                                |
| `target_id`      | uuid        | the task; `unique (event_type, target_id)`                  |
| `title_snapshot` | text        | task title at completion time (≤ 80)                        |
| `created_at`     | timestamptz | the completion time                                         |

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

Advisor 0001 reports the composite FK `(routine_item_id, owner_id)` as not covered by an exact index.
Accepted: the unique `(routine_item_id, task_date)` index already serves lookups by routine, and the
FK is only checked when a routine is hard-deleted, which clients cannot do.

## Functions

| Function                             | Security | Callable by                          | Purpose                                                         |
| ------------------------------------ | -------- | ------------------------------------ | --------------------------------------------------------------- |
| `public.create_duo()`                | DEFINER  | `authenticated`                      | duo + creator membership (seat 1) + invite code, atomically     |
| `public.join_duo(p_code text)`       | DEFINER  | `authenticated`                      | normalise code, lock duo, take seat 2                           |
| `public.leave_duo()`                 | DEFINER  | `authenticated`                      | V1: deletes the duo, memberships cascade (ends it for both)     |
| `public.normalize_invite_code(text)` | invoker  | nobody (internal)                    | `lkd 8x29ab` → `LKD-8X29AB`                                     |
| `private.generate_invite_code()`     | invoker  | nobody (internal)                    | CSPRNG (`gen_random_bytes`), rejection sampling, no modulo bias |
| `private.current_duo_id()`           | DEFINER  | `authenticated` (schema not exposed) | caller's duo id for RLS, avoids policy recursion                |
| `private.handle_new_user()`          | DEFINER  | trigger only                         | creates the profile                                             |
| `private.set_updated_at()`           | invoker  | trigger only                         | `updated_at = now()`                                            |
| `private.validate_profile()`         | invoker  | trigger only                         | trims name, rejects non-IANA timezone (`22023`)                 |
| `public.my_today()`                  | invoker  | `authenticated`                      | caller's local date (profiles.timezone)                         |
| `public.ensure_my_daily_tasks()`     | invoker  | `authenticated`                      | materialise + catch-up for `auth.uid()`; returns today          |
| `public.create_routine_item(...)`    | invoker  | `authenticated`                      | new routine item starting today                                 |
| `public.update_routine_item(...)`    | invoker  | `authenticated`                      | "Today and future days"                                         |
| `public.archive_routine_item(id)`    | invoker  | `authenticated`                      | "Delete" = archive                                              |
| `public.reorder_routine_items(ids)`  | invoker  | `authenticated`                      | persist manual order                                            |
| `private.normalize_routine_item()`   | invoker  | trigger only                         | trims title / notes, sorts and de-duplicates weekdays           |
| `private.normalize_daily_task()`     | invoker  | trigger only                         | trims, owns status timestamps                                   |
| `private.sync_task_activity()`       | DEFINER  | trigger only                         | feed events + `realtime.send` broadcasts (Stage 5)              |
| `public.partner_today()`             | DEFINER  | `authenticated`                      | partner's local date + done / total (Stage 5)                   |

Stage 4 functions are all SECURITY INVOKER (ADR-020): they run as the caller, so RLS and column
grants apply exactly as for direct API calls, and none of them takes an owner id. Errors:
`LI_NOT_AUTHENTICATED`, `LI_NOT_FOUND` (mapped by `taskErrorMessage()` in `src/lib/task-model.ts`).

Every function: `set search_path = ''`, all objects schema-qualified, `revoke all … from public`
then minimal `grant execute`. RPCs act only for `auth.uid()` (no user id parameter), take no dynamic
SQL, and raise stable error codes that the app maps to copy (`src/lib/invite-code.ts`):
`LI_NOT_AUTHENTICATED`, `LI_ALREADY_IN_DUO`, `LI_INVALID_CODE`, `LI_DUO_FULL`, `LI_NOT_IN_DUO`.

Supabase advisor 0029 flags the three public RPCs as "SECURITY DEFINER executable by authenticated".
That is intentional (they are the only write path into duos / memberships); see ADR-015.

## Invite codes

`LKD-` + 6 symbols from a 31-symbol alphabet without `0 O 1 I L` → 31⁶ ≈ 887 million codes. Random
(not incremental), unique, readable aloud, does not expose any UUID. Input is normalised (case,
spaces, dashes, optional `LKD` prefix) in the database and mirrored in the UI for early validation.

## Grants and RLS

Grants decide which operations a role may attempt; policies decide which rows.

| Role            | profiles                                                  | duos   | duo_members | RPCs                  |
| --------------- | --------------------------------------------------------- | ------ | ----------- | --------------------- |
| `anon`          | —                                                         | —      | —           | —                     |
| `authenticated` | SELECT; UPDATE (`display_name`, `avatar_url`, `timezone`) | SELECT | SELECT      | create / join / leave |

No INSERT / DELETE grants on these three: profiles come from the trigger, duos and memberships from
the RPCs.

| Role            | routine_items                                                                                                                             | daily_tasks                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon`          | —                                                                                                                                         | —                                                                                                                                                                                                                                   |
| `authenticated` | SELECT; INSERT (template columns, `owner_id`, `start_date`); UPDATE (template columns, `end_date`, `materialized_through`); **no DELETE** | SELECT, DELETE; INSERT (snapshot columns, `owner_id`, `routine_item_id`, `task_date`, `status`, `skip_reason`); UPDATE (snapshot columns, `status`, `skip_reason`) — never `task_date`, `owner_id`, `routine_item_id` or timestamps |

`activity_events`: `authenticated` SELECT only (no INSERT / UPDATE / DELETE); `anon` nothing.

RLS is enabled on all six tables, and on `realtime.messages` (Realtime Authorization, see
REALTIME.md).

| Policy                                                  | Table             | Rule                                                        |
| ------------------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| `profiles: read own or duo partner`                     | profiles          | SELECT: `id = auth.uid()` or id is a member of my duo       |
| `profiles: update own`                                  | profiles          | UPDATE: `id = auth.uid()` (using + with check)              |
| `duos: read own duo`                                    | duos              | SELECT: `id = private.current_duo_id()`                     |
| `duo_members: read own duo`                             | duo_members       | SELECT: `duo_id = private.current_duo_id()`                 |
| `routine_items: read own or shared by duo partner`      | routine_items     | SELECT: own, or `visible_to_partner` and owner is in my duo |
| `routine_items: insert own` / `update own`              | routine_items     | `owner_id = auth.uid()` (with check blocks spoofing)        |
| `daily_tasks: read own or shared by duo partner`        | daily_tasks       | SELECT: own, or `visible_to_partner` and owner is in my duo |
| `daily_tasks: insert own` / `update own` / `delete own` | daily_tasks       | `owner_id = auth.uid()`                                     |
| `activity_events: read own duo`                         | activity_events   | SELECT: `duo_id = private.current_duo_id()`                 |
| `duo members receive duo broadcasts and presence`       | realtime.messages | SELECT: broadcast / presence on topic `duo:<my duo>`        |
| `duo members publish presence`                          | realtime.messages | INSERT: presence only, topic `duo:<my duo>`                 |

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
- `supabase/tests/stage4_tasks.test.sql` — pgTAP, 71 assertions: timezone (UTC+14 vs UTC-11 users),
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

Each file runs in one transaction and rolls back (broadcasts sent inside it are never delivered).

How to run:

- **Local** (needs Docker): `npx supabase init` once (creates `supabase/config.toml`, not committed yet), then `npx supabase start` and `npx supabase test db`.
- **DEV project** (what Stages 3 and 4 used, because Docker Desktop's VM does not start on this
  machine): run the file's statements in one transaction against DEV, with each
  `select <assertion>(…)` captured into a temp table and a final `raise exception` that prints the
  TAP lines. The exception aborts the transaction, so users, rows and the pgtap extension are all
  rolled back. Results on 2026-09-24 (after the Stage 5 migrations): stage 3 `51/51 ok`, stage 4
  `71/71 ok`, stage 5 `40/40 ok`, `FAILED=0`.

End-to-end coverage of the same rules through the public API (publishable key, real sessions):
`tests/e2e/stage3.spec.ts` → "database rules hold through the public API" and
`tests/e2e/stage4.spec.ts` (partner / outsider / spoofing, 5 concurrent `ensure_my_daily_tasks`
calls, catch-up, snapshot, timezone).

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
