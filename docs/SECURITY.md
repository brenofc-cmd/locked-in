# Security model

LOCKED IN is two people sharing a day. Everything below exists so that a person can only ever act as
themselves, only their duo partner sees their shared data, and a finished day is a permanent record.
Verified in Stage 9 (docs/PROGRESS.md). Tests: `supabase/tests/*.test.sql` (pgTAP, incl.
`stage9_integrity.test.sql`) and `tests/e2e/stage9.spec.ts` (attacks with real user tokens).

## Auth

- Supabase Auth, email + password (minimum 8 characters, checked in the app and by Supabase), email
  confirmation, password reset by email link. Sessions are cookies managed by `@supabase/ssr`;
  `src/proxy.ts` refreshes them and redirects signed-out requests for private routes to
  `/login?next=…` before anything renders.
- Redirects after sign-in / email links go through `safeNext()` (`src/lib/auth-routes.ts`): relative
  same-site paths only; `//x`, `https://x`, backslashes and control characters (`/\t/x` becomes
  `//x` in a browser) fall back to `/today`, and the result is re-serialised from a parsed URL.
- Email links use `SITE_URL` (server-only) in production, never a request header; Supabase's
  redirect allow-list is the second guard (docs/PRODUCTION_CHECKLIST.md).
- Sign-out is `POST /auth/signout`, `scope: "local"` (this browser only, ADR-018).
- **Leaked-password protection** (HaveIBeenPwned) is a dashboard setting, currently OFF in DEV
  (advisor `auth_leaked_password_protection`). **MANUAL STAGE 10 PRODUCTION GATE** — turned on in
  the production project (docs/PRODUCTION_CHECKLIST.md §2); not a code change.

## Data access (RLS + grants)

Grants say which operation a role may attempt (column by column for writes); RLS policies say on
which rows. `anon` has no table privilege and executes no function. Every public table has RLS on.

### Table matrix (Stage 9 audit, 2026-09-28)

Read from the DEV catalog (`pg_class.relrowsecurity`, `role_table_grants`, `column_privileges`,
`pg_policies`) and exercised by pgTAP (stage 3–9) and e2e (stage 3, 4, 9) with real tokens.
S / I / U / D = SELECT / INSERT / UPDATE / DELETE. **Owner** = the row's user; **partner** = the other
member of the owner's current duo; **outsider** = any other signed-in user; `anon` = no session.
"—" = refused (no grant → `42501`, or RLS → 0 rows).

| Table             | RLS | anon | Owner                                                                                                                   | Partner                                                    | Outsider |
| ----------------- | --- | ---- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| `profiles`        | on  | —    | S · U (name, avatar, timezone, standard) · I by trigger · no D                                                          | S (name, avatar, timezone, standard) · no writes           | —        |
| `duos`            | on  | —    | S (own duo) · writes only via `create_duo` / `join_duo` / `leave_duo`                                                   | S (same duo) · same RPCs                                   | —        |
| `duo_members`     | on  | —    | S (own duo) · writes only via the RPCs                                                                                  | S (same duo)                                               | —        |
| `routine_items`   | on  | —    | S · I (start ≥ today) · U (template columns, history guard) · no D (archive RPC)                                        | S shared only · no writes                                  | —        |
| `daily_tasks`     | on  | —    | S · I / U / D open day only (closed day `LI_HISTORY_LOCKED`; future only pending); timestamps, date, owner not writable | S shared, dated since the duo formed · no writes           | —        |
| `focus_sessions`  | on  | —    | S · I (trigger owns every timestamp, day, duo) · U status / reflection (completed: reflection only) · no D              | no table access; `partner_current_focus()` projection only | —        |
| `activity_events` | on  | —    | S (own duo) · no writes (triggers)                                                                                      | S (same duo) · no writes                                   | —        |
| `reactions`       | on  | —    | S (own duo's events) · I / U own, on the partner's events only · D own                                                  | cannot change or delete another member's reaction          | —        |
| `challenges`      | on  | —    | S (own duo) · I (complete duo, start ≥ today, duo / author / standards set by the database) · D before start · no U     | same as owner (duo-level rows)                             | —        |
| `user_settings`   | on  | —    | S · U preference columns · I by trigger · no D                                                                          | —                                                          | —        |

Every RPC that reads another member's data derives the partner from `auth.uid()` → membership; none
takes a user id (IDOR is impossible by construction). Cross-owner ids are refused by composite
foreign keys: `daily_tasks (routine_item_id, owner_id)` and `focus_sessions (daily_task_id,
user_id)`.

## Duo isolation

- Membership is one row per user (`duo_members.user_id` unique, seats 1–2); `join_duo` locks the duo
  row, so concurrent joiners get exactly one winner.
- Ending a duo is one `delete` (cascade): its feed, reactions and challenges disappear for both;
  personal tasks / focus stay with their owners. A new partner never sees the old duo, and reads
  shared tasks only from the day the new duo formed.

## Realtime

- One **private** channel per duo, topic `duo:<duo_id>`; the client always subscribes with
  `private: true` and the user's JWT.
- `realtime.messages` policies: receive broadcast + presence, and publish presence, only when the
  topic is the caller's current duo. Clients never publish broadcasts: every broadcast comes from
  a database trigger / function (`realtime.send`), carries ids, counts and shared titles only
  (never a private title, a note or a reflection).
- After `duo_ended` the app untracks and unsubscribes immediately (the channel is then removed); the ended duo's
  topic never receives anything again (its id is never reused), and a new duo is a new topic.
- **"Allow public access" must be OFF** (dashboard setting) so no client can use a public channel.
  **MANUAL STAGE 10 PRODUCTION GATE** (docs/PRODUCTION_CHECKLIST.md §2): not readable or changeable
  through SQL / MCP, so not changed in DEV. The app itself never uses public channels, and duo data
  only ever travels on private channels guarded by `realtime.messages` RLS.

## Functions (privilege model)

- `SECURITY INVOKER` by default (RLS and grants apply as for direct API calls).
- `SECURITY DEFINER` only where a projection or a trusted write is needed — the reviewed set is
  asserted by `stage9_integrity.test.sql`:
  - duo RPCs: `create_duo`, `join_duo`, `leave_duo` (membership has no client grant);
  - partner projections: `partner_today`, `partner_current_focus`, `partner_progress_summary`,
    `duo_weeks`, `duo_challenges` — no user-id parameter, the partner is derived from `auth.uid()`
    → membership, integers / dates / shared titles only;
  - helpers: `private.current_duo_id`, `private.duo_is_complete`, `private.materialize_tasks`
    (catch-up; only for the caller or the caller's partner);
  - triggers: `handle_new_user`, `handle_new_profile_settings`, `sync_*` (feed + broadcasts;
    V2 Phase 2 adds `sync_planner_event`, same pattern: ids and the operation only; V2 Phase 6 adds
    `sync_accountability`: the feed line of a proven commitment + ids / status broadcasts).
- Every DEFINER function: `set search_path = ''`, schema-qualified names, identity from
  `auth.uid()` only, `revoke all … from public, anon`, `grant execute` to `authenticated` only
  (triggers: to nobody). PostgreSQL's global default gives PUBLIC `EXECUTE` on new functions, so each
  migration revokes it explicitly; the pgTAP suite fails if any function in `public` / `private`
  is executable by PUBLIC or anon.
- The `private` schema is not exposed by the Data API.

## Closed history (integrity)

A local day that has ended is final (ADR-050):

- `daily_tasks` of a closed day cannot be inserted, updated or deleted by the API roles (including
  through INVOKER RPCs); tasks for future days can only be planned (pending).
- Routine templates cannot manufacture or suppress past occurrences (no past start date,
  `materialized_through` database-owned, no edit before catch-up, no reopening an old archive).
- Catch-up (`private.materialize_tasks`) is trusted database code and still fills missed days.
- The boundary is monotonic: `profiles.history_locked_through` (database-owned) keeps the boundary
  reached under the old timezone, so a timezone change never reopens a day.
- Focus: every timestamp and the session's day (`local_date`) are set by the database; a completed
  session's competitive fields are immutable (only the reflection can be written); a paused session
  of a closed day cannot be resumed (it is completed with the time before the pause).
- Challenges: `standard_days` uses the standards snapshotted at creation; focus counts the effective
  seconds of sessions that started in the period. A closed challenge's result cannot change.
- Trusted roles (migrations, support, DEV fixtures) are not blocked; they are not reachable by users.

## Private data

Private tasks / sessions count in aggregates but are never listed, broadcast or titled to the
partner. Reflections, notes, settings and email never leave their owner. User text (names, titles,
reflections) is rendered as React text only (no `dangerouslySetInnerHTML`, `eval` or `innerHTML`
anywhere in `src/`).

## HTTP

`next.config.ts`: Content-Security-Policy (`default-src 'self'`, connections only to this origin
and the project's Supabase API / Realtime, `frame-ancestors 'none'`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (no camera,
microphone, geolocation, payment, usb), no `X-Powered-By`. HSTS is added by Vercel on HTTPS.

## Secrets

- Only `NEXT_PUBLIC_SUPABASE_URL`, the publishable key and (V2 Phase 10) the VAPID **public** key
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` reach the browser. No service-role / secret key is used by the app or
  the tests. `SITE_URL` is server-only. The VAPID private key and the push dispatch secret are
  generated inside Supabase (Edge Function / database) and live only in Supabase Vault — nobody
  types, copies or sees them (docs/WEB_PUSH.md).
- `.env*` (except `.env.example`), `tests/e2e/.auth/`, `test-results/`, `playwright-report/` are
  git-ignored; the git history was scanned in Stage 9 (no key, password or token ever committed).
- DEV-only fixtures (`supabase/dev/test_fixtures.sql`) are never migrations and must not exist in
  production (checklist).

## Supabase advisors (final Stage 9 run, DEV, 2026-09-28)

| Advisor finding                                                                                                                                                                                                                                        | Level | Classification                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0029 DEFINER executable by `authenticated`: `create_duo`, `join_duo`, `leave_duo`, `partner_today`, `partner_current_focus`, `partner_progress_summary`, `duo_weeks`, `duo_challenges`, `duo_duels`                                                    | WARN  | **ACCEPTED WITH JUSTIFICATION** — the reviewed set above; no user-id parameter, identity from `auth.uid()`, projections only (ADR-015 / 034 / 040 / 044)                   |
| 0029 DEFINER executable by `authenticated`: `dev_fixture_add_tasks`, `dev_fixture_backdate_routine`, `dev_fixture_reset_history` (+ V2 Phase 6: `dev_fixture_close_today`, `dev_fixture_reset_accountability`; V2 Phase 7: `dev_fixture_backdate_duo`) | WARN  | **NOT APPLICABLE** to production — DEV-only, limited to `li-…@example.com` test accounts, never a migration (ADR-052); checklist verifies absence                          |
| `auth_leaked_password_protection` disabled                                                                                                                                                                                                             | WARN  | **STAGE 10 / MANUAL CONFIGURATION REQUIRED** — dashboard setting (checklist §2)                                                                                            |
| 0001 unindexed FK `daily_tasks_routine_same_owner_fkey (routine_item_id, owner_id)`                                                                                                                                                                    | INFO  | **ACCEPTED WITH JUSTIFICATION** — leading column indexed by `daily_tasks_routine_date_key`; the FK is checked only when a routine is hard-deleted, which clients cannot do |
| 0001 unindexed FK `focus_sessions_task_same_owner_fkey (daily_task_id, user_id)`                                                                                                                                                                       | INFO  | **ACCEPTED WITH JUSTIFICATION** — leading column indexed by `focus_sessions_task_idx`, which serves the set-null on task delete                                            |
| 0005 unused index `duos_created_by_idx`, `activity_events_actor_idx`                                                                                                                                                                                   | INFO  | **ACCEPTED WITH JUSTIFICATION** — DEV traffic is tiny; both cover FK cascades from `profiles` (account deletion)                                                           |
| Realtime "Allow public access" (not an advisor; dashboard)                                                                                                                                                                                             | —     | **STAGE 10 / MANUAL CONFIGURATION REQUIRED** (checklist §2)                                                                                                                |

No finding is FIXED in this run because no code-fixable finding remained; the Stage 9 fixes are in
the commits (history lock, duplicate challenges, headers, redirects, realtime leave, contrast).

## Accepted risks

- Invite codes: 31⁶ ≈ 887 million codes, only open duos (one seat free) are joinable, and a code
  dies with its duo. There is no per-RPC rate limit beyond Supabase's API limits, so guessing is
  theoretically possible but impractical; a successful guess only joins a stranger's empty duo,
  which the creator sees immediately and can end.
- `script-src` / `style-src` allow inline code: Next.js bootstraps with inline scripts; a nonce
  policy would force dynamic rendering of every page. Other CSP directives still limit origins,
  connections and framing. Revisit after V1.
- ~~Notifications only while the app is open (ADR-045)~~ — superseded in V2 Phase 10 by opt-in Web
  Push (ADR-092…099). Remaining push risks: a session that ends without Sair leaves that device's
  row until the next sign-in on the browser drops the subscription (the push service then answers
  410); a lock-screen preview shows the planner title / partner name unless "Ocultar detalhes" is on.
- A viewer's week is framed by their own Monday: with far-apart timezones the partner's side of a
  just-closed week can still receive their last hours (both in São Paulo in practice).
- A focus session that started on a challenge's last day and is still running keeps adding its time
  (capped at its plan, ≤ 12 h) until it ends.
- The Daily Standard recalculates the streak (a personal view, ADR-038); competitions never use the
  standard and challenges use their snapshot.

## V2 Phase 2 — last seen and planner (2026-09-29)

| Table            | RLS | anon | Owner                                                                            | Current partner                                   | Old partner / outsider |
| ---------------- | --- | ---- | -------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `user_presence`  | on  | —    | S · I own (`user_id` only) · U `last_seen_at` (always the database clock) · no D | S                                                 | —                      |
| `planner_events` | on  | —    | S · I / U (no `owner_id` / `duo_id` grant) · D                                   | S shared rows of the current duo only · no writes | —                      |

- `public.touch_last_seen()` is INVOKER and takes no argument: it can only touch the caller's row.
  A client-sent time is replaced by `now()` (trigger); `user_id` is not writable.
- `planner_events.duo_id` is derived by the database from the owner's current complete duo when
  shared, cleared when unshared, and set to null (event private again) when that duo ends — an old
  partner loses access and a new partner never inherits old events. Sharing without a partner →
  `LI_PLANNER_NO_PARTNER`.
- New DEFINER function: `private.sync_planner_event` (trigger, executable by nobody) — required
  because `realtime.send` is not granted to users; the reviewed set in `stage9_integrity` includes
  it. No other DEFINER was added.
- Advisors after the migrations (DEV): no new finding (same items as the Stage 9 table above).
- Verified: pgTAP `v2_phase2_presence_planner` (63) + full suite on DEV (520/520), e2e `v2-phase2`
  (API attacks by the partner and an outsider, old duo → new duo).

## V2 Phase 3 — goals, vision and the mirror (2026-09-29)

| Table                  | RLS | anon | Owner                                                          | Partner / outsider |
| ---------------------- | --- | ---- | -------------------------------------------------------------- | ------------------ |
| `vision_items`         | on  | —    | S · I / U (title, description, sort_order, is_archived) · D    | —                  |
| `goals`                | on  | —    | S · I / U (no owner_id / achieved_at grant) · D                | —                  |
| `goal_milestones`      | on  | —    | S · I / U (goal_id insert only; title, is_completed, sort) · D | —                  |
| `accountability_items` | on  | —    | S · I / U (text, is_active, sort_order) · D                    | —                  |

- Owner-only policies, no partner / duo condition, no broadcast, no realtime, no DEFINER function
  (the reviewed DEFINER set is unchanged). `owner_id` is never granted.
- IDOR impossible by composite foreign keys (`goals (vision_id, owner_id)`, `goal_milestones
(goal_id, owner_id)`): pointing at another user's vision / goal fails with `23503`.
- Verified: pgTAP `v2_phase3_goals` (61) + the full suite on DEV (581/581), e2e `v2-phase3` (partner
  and outsider read / change nothing via the API, IDOR, spoofing). Advisors: one new INFO finding
  (unindexed `goal_milestones.owner_id`) fixed by `…152035_goal_milestones_owner_idx`.

## V2 Phase 4 — North Star and the Top 3 (2026-09-29)

- `is_featured` on `vision_items`, `goals`, `accountability_items`: update-only grant (not on
  insert), owner-only RLS unchanged; one per owner and table by partial unique index (not only the
  trigger — the pgTAP disables the trigger and still gets `23505`); an archived / achieved / inactive
  item cannot be featured (check constraint). Trigger `private.keep_one_featured` is INVOKER, not
  callable, and only updates rows of `new.owner_id`.
- `daily_tasks.priority_rank`: update-only grant, check 1..3, unique per owner and date; RLS and the
  Stage 9 history guard unchanged (a closed day's Top 3 is frozen; a private task stays private — for
  a shared task the partner could read the rank like any other column of that row, no partner screen
  shows it). `public.set_my_priorities(uuid[])` is INVOKER: only my tasks of my today, at most 3,
  distinct; `execute` for `authenticated` only.
- No new SECURITY DEFINER function (stage 9 asserts the reviewed set); no broadcast, no feed event.
- Device marks (`locked-in:v2:<userId>:daily`) hold two dates only; the unscoped V1 keys are removed.
- Verified: pgTAP `v2_phase4_north_star` (57) + the full suite on DEV (638/638); e2e `v2-phase4`
  (private priority invisible to the partner through the API and the UI, partner / outsider cannot
  set or clear A's Top 3).

## V2 Phase 5 — goal links and proof (2026-09-30)

- Goal links are in owner-only side tables (`daily_task_goals`, `routine_item_goals`): the partner can
  read shared task / routine rows, and a `goal_id` column there would leak. `focus_sessions.goal_id`
  is on an owner-only table; `partner_current_focus()` has no goal column (asserted by pgTAP).
- Ownership is structural (composite FKs) and the active-goal check names the owner explicitly
  (`private.goal_is_active(goal, owner)`): another user's goal is refused with `LI_GOAL_INACTIVE`,
  exactly like a missing one (no existence oracle); another user's task with `LI_NOT_FOUND`;
  `owner_id` cannot be spoofed. `/goals/[id]` of someone else is a plain 404.
- Closed history: a closed day's link cannot be set, changed or removed (`LI_HISTORY_LOCKED`); a
  completed focus session's goal is fixed; the routine snapshot never rewrites past occurrences.
- No new SECURITY DEFINER function (the reviewed set of 18 is unchanged), no view, no broadcast; feed
  events and payloads carry no goal id or title. Anon cannot execute the proof functions.
- Found and fixed during the phase: a trigger's plpgsql plan cached while trusted code
  (`materialize_tasks`) ran could evaluate an RLS-dependent helper without RLS; the helper now filters
  by owner itself (the composite FK already refused the link — no data was exposed).

## V2 Phase 6 — duo accountability (2026-09-30)

| Table                | RLS | anon | Owner                                                        | Partner (current duo) / outsider               |
| -------------------- | --- | ---- | ------------------------------------------------------------ | ---------------------------------------------- |
| `commitments`        | on  | —    | S · I (title, kind, focus target) · U (status) · no D        | S rows of the current duo only · no writes / — |
| `commitment_sources` | on  | —    | S · I · no U / D                                             | — / —                                          |
| `nudges`             | on  | —    | S own sent / received (current duo) · I (commitment_id only) | recipient reads / —                            |
| `checkins`           | on  | —    | S · I (state) · no U / D                                     | S rows of the current duo only / —             |

- Everything else is stamped by the database: owner, duo, day, standard snapshot, status, proof,
  sender, recipient, recipient day. `owner_id`, `duo_id`, `to_user` are never granted.
- The private proof source is a separate owner-only table; no commitment column, function output,
  feed event or broadcast names a task or a goal (pgTAP asserts the columns; the e2e checks the
  partner's page and API).
- Closed history: after the owner's day closes a commitment never changes — the lifecycle trigger
  keeps the old values even for trusted code; a client status change gets `LI_HISTORY_LOCKED`.
- Nudge limits are database rules (trigger + advisory lock per pair), not client rules.
- Old duo isolation: ending a duo nulls `commitments.duo_id` / `checkins.duo_id` and deletes its
  nudges; policies compare with the **current** duo, so an ex-partner and a future partner read
  nothing (pgTAP + e2e).
- New DEFINER function: `private.sync_accountability` (trigger, executable by nobody) — needed
  because `realtime.send` and `activity_events` are not writable by users. The reviewed set in
  `stage9_integrity` is now 19. `create_commitment`, `duo_commitments` and the helpers are INVOKER.
- DEV-only fixtures added (never in production): `dev_fixture_close_today`,
  `dev_fixture_reset_accountability`, limited to the `li-…@example.com` accounts.

## V2 Phase 7 — daily duel (2026-10-01)

- The duel is derived (ADR-074): no duel / score table, no broadcast. New setting table
  `daily_standard_history` (ADR-078): RLS on, owner SELECT only, no client write grant, anon nothing;
  versions are written only by the trigger and only for the owner's local today (never a closed day).
  New column `duos.duel_since` (ADR-079): written only by a trigger, no client grant.
- New DEFINER function: `public.duo_duels(p_days)` — the partner is derived from `auth.uid()` →
  current duo membership (no user-id parameter), routines are materialised only for the caller and
  the caller's partner, the output is dates / integers / booleans only (pgTAP asserts the types).
  Same justification as `duo_weeks` under advisor 0029 (ADR-040). New DEFINER trigger
  `private.record_daily_standard` (callable by nobody; derives user and day from the profile row).
  The reviewed set in `stage9_integrity` is now 21. `private.duel_side`, `private.standard_on` and
  `private.stamp_duel_since` are INVOKER and executable by no API role.
- Private tasks and sessions count in the numbers, never by title; pre-duo days and an old duo's
  days are never returned (pgTAP + e2e).
- DEV-only fixture added (never in production): `dev_fixture_backdate_duo`, refused unless both
  members of the caller's duo are `li-…@example.com` accounts.

## V2 Phase 8 — monthly champion, records, milestones (2026-10-05)

- No table, column or grant on a table: months, records and milestones are derived (ADR-083).
- New DEFINER function `public.duo_duel_months(p_months)` — the Phase 7 projection over whole months:
  the partner is derived from `auth.uid()` → current duo (no user-id parameter), routines are
  materialised only for the caller and the caller's partner, from `duos.duel_since` only (no pre-duo
  day, no old duo), dates / integers / booleans only (pgTAP asserts the types; e2e checks the JSON
  holds no title or id). Same justification as `duo_duels` (advisor 0029, ADR-040). The reviewed set in
  `stage9_integrity` is now 22.
- `public.my_records()` is SECURITY INVOKER: RLS plus an owner filter, so a caller only ever reads
  their own rows; the partner, outsiders and anon get nothing of anyone else (pgTAP).
- `anon` and `PUBLIC` have no EXECUTE on either function.
- DEV-only fixtures (never in production): `dev_fixture_add_focus` (bypasses the focus lifecycle
  trigger for the caller's own past sessions) and `dev_fixture_reset_focus`, both refused unless the
  caller is a `li-…@example.com` test account.

## V2 Phase 9 — celebrations, non-negotiables, weekly planning, reviews (2026-10-05)

- Five new tables, all owner-only (RLS `owner_id = auth.uid()`, column grants, anon / PUBLIC
  nothing): `celebrations`, `daily_task_non_negotiables`, `routine_non_negotiables`,
  `weekly_priorities`, `reviews`. No partner policy, no broadcast, no channel.
- **No new SECURITY DEFINER function** (the reviewed set stays at 22, `stage9_integrity`). Guards
  and snapshots are INVOKER triggers that tell the API path (`current_user` in authenticated / anon)
  from the trusted one (materialisation, migrations, DEV fixtures).
- A celebration is a claim the database verifies against the real numbers; a client cannot write
  `baseline`, `seen_at`, `source_value` or the owner, cannot delete, and can update only `seen_at`
  (stamped once by the database).
- The non-negotiable flag never sits on `daily_tasks` / `routine_items` (the partner reads those
  rows); a closed day's flag, a closed week's priority and a review's period are frozen.
- `private.records`, `private.milestone_value`, `private.milestone_threshold` are executable by
  `authenticated` only because INVOKER code calls them; the private schema is not exposed by the API
  and they read through RLS.
- DEV-only fixtures (never in production): `dev_fixture_reset_celebrations`,
  `dev_fixture_baseline_milestones`, `dev_fixture_reset_reflection`, refused unless the caller is a
  `li-…@example.com` test account.

## V2 Phase 10 — Web Push and the final V2 audit (2026-10-06)

- **Tables**: `push_subscriptions` and `notification_deliveries`, owner-only (RLS `user_id =
auth.uid()`), column grants, anon / PUBLIC nothing, partner and outsider zero (pgTAP
  `v2_phase10_push`, e2e). A client cannot write delivery bookkeeping, choose a dedup key, create any
  delivery but a rate-limited test, change or delete a delivery, move an endpoint, or take over an
  endpoint still owned by someone else (RLS `42501` on the upsert).
- **Endpoints**: only FCM / Mozilla / Apple / WNS (database check + the same allowlist in the
  sender) — the sender can never be pointed at an arbitrary host (no SSRF through a subscription).
- **No new SECURITY DEFINER** (the set stays 22, asserted by `stage9_integrity`); every push
  function is `private`, INVOKER and executable by no API role. The sender runs as the database
  owner inside Supabase (Edge Function + `SUPABASE_DB_URL`), so no service-role key exists in Vercel.
- **Scheduler**: `pg_cron` → `private.push_tick()` → `pg_net` → Edge Function. The function has
  `verify_jwt = false` and checks `x-li-dispatch` against the Vault secret in constant time (401
  otherwise, verified). Without the secret nothing runs; with it, it can only send what the
  database already queued (no arbitrary text, no arbitrary recipient).
- **Payload**: built at send time from minimal fields; never goals, vision, mirror, reflections,
  non-negotiables or private tasks; "Ocultar detalhes" for generic text; encrypted end to end
  (RFC 8291). Logs: counts only (checked in the function logs).
- **Click routes**: a key mapped by a whitelist in the worker and the app; anything else → `/today`.
- **Shared device**: sign-out deletes the device row server-side; a browser subscription that is not
  the signed-in user's is unsubscribed on open (ADR-093, e2e test 5).
- **Service worker**: caches only the static offline page; never an API, auth or Supabase response.
  `/sw.js` and `/offline` are outside the auth proxy (static, no data) and `/sw.js` is `no-store`.

### Final audit (2026-10-06, DEV)

- Every `public` table: RLS on, at least one policy, anon / PUBLIC no table privilege (30 tables).
- DEFINER (non-`dev_*`): exactly the reviewed 22, all `search_path=""`, none executable by anon; no
  function executable by PUBLIC; trigger functions not callable by users (stage9_integrity 69/69).
- IDOR coverage (pgTAP + e2e with real tokens): planner, goals, goal proof, weekly plan, reviews,
  milestone unlocks, non-negotiables, push subscriptions, notification deliveries — partner,
  outsider and anon get nothing, and the old partner loses access when a duo ends.
- Secrets: tracked files and the whole git history scanned (JWTs, `sb_secret_`, service role, PEM /
  JWK private keys, SMTP, connection strings) — nothing; `.env*` and `tests/e2e/.auth/` ignored.
- Advisors: security — only the reviewed DEFINER 0029 set and the DEV fixtures (not applicable to
  PROD) and `auth_leaked_password_protection` (manual / plan gate, checklist §2); performance — INFO
  only: composite owner FKs whose leading column is indexed (accepted, same justification as
  0001 above) and unused indexes on a low-traffic DEV database.
