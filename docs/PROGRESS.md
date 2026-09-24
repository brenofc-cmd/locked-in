# LOCKED IN DEVELOPMENT STATUS

Current Stage:
6 — Persistent Focus Sessions and live Focus synchronization — VERIFIED / COMPLETE (2026-09-24)

Next Stage:
7 — Progress + Competition (not started)

---

# Stage 6 record

Stage 6 — Persistent Focus Sessions and live Focus synchronization — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 6):

- `focus_sessions` (migrations `…162212` … `…172713`): statuses active / paused / completed (ending early = completed), every timestamp from `now()` in a lifecycle trigger, pauses excluded from the duration, one unfinished session per user (partial unique index), linked task must be mine (composite FK), private task ⇒ private session, reflection ≤ 1000 owner-only, owner-only RLS + column grants, no DELETE
- Invoker RPCs `start / pause / resume / complete_focus_session`, `save_focus_reflection`, `my_active_focus` + `reconcile_my_focus` (expired sessions completed on demand with `actual = planned` and the real planned end; no cron; paused never expires); `server_now()` (database clock); DEFINER `partner_current_focus()` limited projection
- Feed events `focus_started` / `focus_completed` (with real duration; no pause / resume; private without title) and one `focus` broadcast per transition on the duo channel, from a DEFINER trigger; never a reflection, never per second
- Presence reduced to online only; partner status = FOCUSING from the persistent session (even with the app closed), else presence ONLINE / OFFLINE
- Focus screen real: picker of today's open tasks + presets, 25 / 50 / 90 / custom, LOCK IN (not optimistic), pause / resume / end (optimistic with rollback, queued in order), completion with real duration and optional reflection, session list and Focus today from the database; the timer survives refresh, closing the app, sleep and a second tab; clock derived from timestamps + database clock offset, local 1 s tick only while a clock is on screen
- Removed: `mockFocus`, mock focus totals / sessions, focus in presence
- Docs: DATABASE (table, lifecycle, maths, reconciliation, privacy), REALTIME (focus events, presence change, ordering, clock), ARCHITECTURE, ADR-033…036, CLAUDE.md, README, ROADMAP

Verified (2026-09-24):

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` — pass
- `npm test` — 6 files, 55 tests passed (timer maths incl. pauses, expiry, paused never expiring, partner status, focus today across midnight, clock offset, feed mapping, error copy)
- `npm run test:e2e` — 45 passed, four consecutive green full runs after the last fix: setup, UI suite at 390 / 1440 (+ @focus after it), 375 / 430 layout, stage3 5, stage4 4, stage5 4, stage6 7 — refresh while running and while paused (pause excluded, reflection saved), expired while closed → reconciled, two-browser live start / pause / resume / app closed (still FOCUSING) / end → ONLINE and private title hidden, second tab restores and syncs, double LOCK IN and concurrent starts → one session, outsider no access, network test (12 s running: no HTTP requests, no broadcast / focus frames, no presence tracking; only heartbeats)
- Database: pgTAP on DEV (aborted-transaction method) — stage 3 51/51, stage 4 71/71, stage 5 40/40, stage 6 63/63 (225/225)
- Responsive smoke with a real session (setup, running, paused, complete, partner) at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow, no console errors; clock right after start 25:00 and 24:57 after a reload 3.4 s later
- Advisors: nothing new beyond the accepted DEFINER `partner_current_focus` (ADR-034) and the INFO about the composite FK index
- Security review: no timer written / broadcast / tracked per second, no client broadcast, partner never reads `focus_sessions`, reflections never leave the owner, no service role in client code, no secrets committed

Fixed during verification:

- END right after RESUME was dropped (busy flag) → transitions are queued in order
- Late `focus` broadcasts / refetches could resurrect an ended session or overwrite a newer partner state → refetch treated as truth, stale results discarded
- DONE before the END response reopened the completion screen → the response only updates the screen it belongs to; the note waits for the completion
- Initial clock used the app server's clock (≈ 10 s off from Postgres here) → `server_now()` measured on every load
- `server_now()` was callable by anon (Supabase default privileges) → caught by pgTAP, fixed in a new migration

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop VM does not start); pgTAP ran on DEV
- With the app closed, an expired session is completed in the database the next time its owner opens the app; until then the partner already sees ONLINE / OFFLINE (computed locally) but the `focus_completed` feed line appears only after reconciliation
- Outside a duo there is no channel: a second tab of the same user syncs when it becomes visible (or on reload)
- Backgrounded mobile tabs may throttle timers; the clock is recomputed from timestamps as soon as the tab is visible again
- Still mock: standard, streak, weekly competition, head-to-head, stats, challenges, reaction persistence, notifications
- Realtime "Allow public access" still to be disabled before production (Stage 10); leaked-password protection off in DEV

---

# Stage 5 record

Stage 5 — Realtime partner, presence and live activity — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)
- 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)
- 4 — Real Today, recurring routines, one-off tasks and task check-ins — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 5):

- One private Realtime channel per duo (`duo:<duo_id>`) for Presence + database Broadcasts; architecture in `docs/REALTIME.md`
- Realtime Authorization (RLS on `realtime.messages`): duo members receive broadcast / presence and publish presence only; other duo, no duo, fake topic and anon refused at join
- `activity_events` feed maintained by a trigger on `daily_tasks` (exists exactly while a task is completed and shared; undo / skip / private / delete remove it; title snapshot); broadcasts `activity`, `activity_removed`, `tasks_changed` with minimal payloads; clients cannot write the feed
- `partner_today()`: the partner's local date and done / total (private tasks counted, never listed)
- `DuoRealtimeProvider`: presence (key = user id, multi-tab safe), connection state (connected / reconnecting / offline pill), feed (20, newest first, de-duplicated by event id, optimistic own line replaced by the real event), partner's day; refetch from Postgres after events, reconnect, online and tab visible; serialized channel teardown; JWT kept current by supabase-js on token refresh
- Partner real: name, ONLINE / FOCUSING / OFFLINE (no last seen), countdown from shared start + planned minutes (no per-second updates), today's % and counts, shared task list with "+ N private", live feed and toasts, card / avatar flash
- Removed: mock feed, mock partner tasks, dev simulation of partner / connection, fake feed lines from reactions and focus; head-to-head uses real initials
- Docs: REALTIME.md (new), DATABASE.md, ADR-027…032, ARCHITECTURE, CLAUDE.md, README

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 5 files, 44 tests passed
- `npm run build` — pass
- `npm run format:check` — pass
- `npm run test:e2e` — 38 passed: setup, 24 UI tests on real data (partners with a real day and feed), 5 Stage 3, 4 Stage 4, 4 Stage 5 (two / three real browser contexts, no reload on the watching side)
- Database: pgTAP on DEV — stage 3 51/51, stage 4 71/71, stage 5 40/40 (162/162; aborted-transaction method, broadcasts inside never delivered)
- Realtime integration with real sockets: A and B `SUBSCRIBED`; C, fake topic and anon refused (`Unauthorized`); B received `activity` ≈ 150–180 ms after A's update; private completion sent nothing; payload without notes / timezone / email
- Manual two-browser acceptance (production build, Brendon = A, Lucas = B, isolated contexts at 390px): 1 both see each other ONLINE; 2 A taps Morning Run → B's toast "Brendon completed Morning Run" in 124–147 ms without reload, feed line on /partner; 3 B starts focus → A sees LUCAS FOCUSING (≈ 1–3 s); 4 B ends → ONLINE (≈ 3 s); 5 B closes → OFFLINE (≈ 3 s); 6 B reopens → ONLINE; 7 A completes a private task → B sees nothing (0 matches, 0 toasts); 8 B closed, A completes Gym, B reopens → "Brendon completed Gym" from the persisted feed; no console errors
- Multi-tab: B with two tabs, one closed → still ONLINE after 5 s; last closed → OFFLINE (E2E)
- Responsive smoke: /today and /partner at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow
- Clean clone (`npm ci`): lint, typecheck, unit, build pass without secrets
- Security review: one channel, no client broadcast, no polling, presence only on state change, no service role in client code, no secrets committed, new SECURITY DEFINER functions reviewed (`search_path = ''`, minimal EXECUTE)

Pending:

- Nothing for Stage 5

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop VM does not start); pgTAP ran on DEV
- Realtime settings "Allow public access" not changed in DEV (not verifiable from the tools used); disable it in the Dashboard before production (REALTIME.md)
- A user who leaves a duo keeps an already-joined socket until it reconnects (join-time authorization); after the duo ends there is nothing left to receive and the next join is refused
- Partner counts can lag after a private completion (it sends nothing, by design) until the next shared event, reconnect or load
- Presence depends on the browser keeping the socket alive; backgrounded mobile tabs may show OFFLINE
- First channel join of a day can log a transient `MissingPartition` error that the client retries
- Still mock: focus sessions / totals / history, standard, streak, weekly competition, head-to-head, stats, challenges, reaction persistence, notifications
- Supabase advisors: definer RPCs incl. `partner_today` (ADR-015 / ADR-028), leaked-password protection off in DEV, INFO about the composite FK index and an unused `activity_events_actor_idx` (FK cascade)

Next Stage (at the end of Stage 5):
6 — Persistent Focus Sessions and live Focus synchronization

---

# Stage 5 start

Stage 5 — started 2026-09-24

---

# Stage 4 record

Stage 4 — Real Today, recurring routines, one-off tasks and task check-ins — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)
- 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 4):

- Schema (DEV, 3 migrations): `routine_items` (recurring template) and `daily_tasks` (materialised snapshot per local date, or one-off); status on the task (pending / completed / skipped, database-owned timestamps, missed derived); details in `docs/DATABASE.md`
- Guarantees in the database: one occurrence per routine per date, same-owner composite FK, no hard delete of routines with history, no impossible status rows, ISO weekdays 1..7 sorted / de-duplicated, title / notes / category / date checks
- `my_today()` from `profiles.timezone` is the single definition of the day; `ensure_my_daily_tasks()` materialises on demand with catch-up of unopened days, idempotent under concurrency (no cron)
- Routine functions (all SECURITY INVOKER): create (starts today), update "Today and future days" (history untouched, today's occurrence added / refreshed / removed by the documented rule), archive (= Delete), reorder
- RLS: owner full control; duo partner reads only `visible_to_partner` rows and writes nothing; outsider and anon nothing; column grants keep ids, dates and timestamps server-owned
- Today real: tasks from the database grouped by section in manual order, real local date and DAY N, NO ROUTINE YET empty state, Rest today from the real routine, completion = completed / all tasks (skipped stays in the total, ADR-022)
- Task actions real and optimistic (tap → check ≈ 7 ms, no spinner): complete, undo (snackbar), skip with reason, unskip, Quick Add one-off, Edit → Today only / Today and future days, Delete (one-off deleted, routine item archived); failures roll back with a toast
- Routine screen real: add, edit (today and future), archive, drag / keyboard reorder persisted, templates create real routine items; onboarding's chosen items too
- Review today / morning briefing / streak sheet use today's real tasks; Progress "today" bar is real
- Sign-out now ends only the current browser session (ADR-025)
- Mock feed keeps only partner events; the user's own events come from real completions
- Docs: DATABASE.md (tables, materialisation, timezone, status, RLS, snapshots), ADR-019…026, ARCHITECTURE, CLAUDE.md, PRODUCT (principle 5)

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 4 files, 32 tests passed
- `npm run build` — pass
- `npm run format:check` — pass
- `npm run test:e2e` — 34 passed: setup (seeds 3 users with the design's Today as real data), 24 Stage 2 tests on real data (390, 1440, 375, 430), 5 Stage 3, 4 Stage 4
- Database: pgTAP on the DEV database — `stage3_auth_duo` 51/51, `stage4_tasks` 71/71 (aborted-transaction method; DEV verified free of fixtures afterwards)
- Concurrency: 5 simultaneous `ensure_my_daily_tasks()` calls → no duplicates; catch-up of 3 unopened days; snapshot rename (past keeps the old title)
- Clean clone (`git clone` + `npm ci`): lint, typecheck, unit and build pass without any secrets
- Manual acceptance (production build, fresh browser context at 390px, user Alice): created Wake Up (every day, 06:00), Gym (MON / WED / FRI) and Read (every day); on Thursday Gym correctly rests ("Rest today: Gym"); Quick Add "Finish Physics Assignment"; completed Wake Up (tap → check 7 ms); skipped Read (Rest); reload → identical (1 / 3, 33%); sign out → /today redirects to /login; sign in → identical; no console errors
- Responsive smoke: /today, /routine, /partner, /progress, /settings at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow; screenshots checked against the design at 390 and 1440
- Security review: RLS on all five tables, anon has no grants, owner_id spoofing and cross-owner links rejected, partner read-only and private tasks hidden, outsider blocked (pgTAP + API), no SECURITY DEFINER added, every new function with `search_path = ''` and EXECUTE only for `authenticated`, no service role in client code, no secrets committed

Pending:

- Nothing for Stage 4

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop's VM does not start); pgTAP was run on DEV instead (docs/DATABASE.md → Tests)
- No realtime: the partner sees changes on their next load (Stage 5)
- Streak (13 days), yesterday %, Progress history / calendar, weekly and head-to-head numbers, partner completion / tasks / presence, focus sessions and challenges are still mock (Stages 5–8)
- Past-day corrections in the Progress calendar are still local mock (Stage 7 reads `daily_tasks` history)
- The standard (70–100%) is still local state, not persisted
- Reminders are stored but no notification is sent yet
- The live feed is local: the user's own completions appear there but are not persisted (Stage 5)
- Day rollover while the app stays open needs a reload to show the new day
- E2E resets archive routine items, so archived rows accumulate for test users; `supabase/dev/reset_test_users.sql` cleans them
- Supabase advisors: accepted definer-RPC notice (ADR-015), leaked-password protection off in DEV Auth (enable before production), INFO about the composite FK index (docs/DATABASE.md → Indexes)

Next Stage (at the end of Stage 4):
5 — Realtime Partner, Presence and live activity

---

# Stage 3 record

Stage 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)

Completed (Stage 3):

- Database (DEV project `locked-in`): `profiles`, `duos`, `duo_members`; 5 migrations applied; details in `docs/DATABASE.md`
- Hard rules in the schema: one duo per user (`unique (user_id)`), two members per duo (`seat in (1,2)` + `unique (duo_id, seat)`); concurrency-safe
- Profile created by an `auth.users` trigger (SECURITY DEFINER, `search_path = ''`); timezone validated against IANA names; `updated_at` set by trigger
- RPCs `create_duo` (atomic duo + seat 1 + invite code), `join_duo` (normalise, lock, seat 2), `leave_duo` (ends the duo for both, ADR-016); stable `LI_*` error codes
- Invite codes `LKD-XXXXXX`: CSPRNG, 31-symbol alphabet without 0/O/1/I/L, unique, normalised input
- RLS on all three tables; anon has no grants; authenticated: SELECT + UPDATE of 3 profile columns; no direct INSERT / DELETE anywhere
- Auth UI (design v2 "Sign in" frame): sign up (name, email, password × 2, browser timezone), email confirmation (`/auth/confirm`, token_hash or PKCE code), sign in with friendly errors, forgot / reset password, sign out (POST)
- Route protection: `src/proxy.ts` (session refresh + redirects) and `(app)/layout.tsx` backstop; no private content rendered for signed-out requests
- Real identity in the app: greeting, sidebar, Settings (email · timezone · since), Duo screen (NO DUO / WAITING / COMPLETE with create, join, copy, share, cancel), partner name everywhere Lucas was hard-coded, Today / Partner empty states
- Mock product state kept (tasks, feed, focus, stats, presence, reactions, challenges) and separated from real session state (ADR-017)
- Tests: pgTAP suite extended to 51 assertions; Playwright setup signs in for real; new `stage3.spec.ts`; unit tests for auth / invite / route helpers
- Docs: DATABASE.md (new), ARCHITECTURE, DECISIONS (ADR-014…018), CLAUDE.md, ROADMAP, README

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 3 files, 17 tests passed
- `npm run build` — pass (auth pages static, app routes dynamic, proxy active)
- `npm run format:check` — pass
- `npm run test:e2e` — 30 passed: setup (real sign-in), 24 Stage 2 tests signed in as Brendon with Lucas as partner, 5 Stage 3 tests
- Database: pgTAP `supabase/tests/stage3_auth_duo.test.sql` on the DEV database — 51/51 ok (run inside an aborted transaction because Docker was unavailable; DEV verified clean afterwards)
- Concurrency: B and C joining the same code at the same time through the public API — 10 + 5 rounds, always exactly one winner, loser gets `LI_DUO_FULL`, duo never exceeds 2
- Real email (Supabase default SMTP): sign-up confirmation link → `/auth/confirm` → signed in on `/today`; forgot password → recovery link → `/reset-password` → new password works, old one rejected
- Manual pass in three isolated browser contexts (A 390px, B 1440px, C 390px): A creates → B joins with the code → A (refresh) and B see each other's real names → C refused ("already full") → refresh keeps state → A signs out, private route redirects, A signs in again, duo intact; no console errors
- Supabase security advisors: only the intentional definer-RPC notice (ADR-015) and leaked-password protection (dashboard setting, see Known Issues)

Pending:

- Nothing for Stage 3

Known Issues:

- No realtime yet: the duo creator sees the partner after a refresh (Stage 5)
- Partner presence, %, streak, focus and all tasks / stats are still mock (Stages 4–7)
- `npx supabase test db` could not run locally (Docker Desktop VM failed to start); the same pgTAP file was executed against DEV instead
- Supabase default SMTP: only team-member addresses receive email and the hourly limit is low; configure custom SMTP before real users (Stage 10)
- Email templates are Supabase defaults (PKCE `?code=` links): open the link in the browser that requested it. The recommended `{{ .TokenHash }}` template is already supported by `/auth/confirm`
- Leaked password protection (HaveIBeenPwned) is off in DEV Auth settings; enable before production
- DEV contains the five `@example.com` test users and one real account created during the email check

Next Stage (at the end of Stage 3):
4 — Real Today, recurring routines, one-off tasks and task check-ins

---

# Stage 2 record

Completed (Stage 2):

- v3 design converted to Next.js + React + TypeScript + Tailwind with mock data (no backend)
- Shared shell: mobile top bar + bottom tabs (< 780px), 228px sidebar (≥ 780px), two-column Today/Focus (≥ 1180px)
- Routes: `/` → `/today`; `/today`, `/partner`, `/focus`, `/progress`, `/more`; `/routine`, `/challenges`, `/duo`, `/settings`, `/onboarding`
- Today: header, hero %, count, streak, progress bar with standard marker, sections, task rows (tap / keyboard / swipe right to complete, swipe left or long-press for options), perfect-day banner, partner card, live feed, review today, mobile Quick Add + LOCK IN bar
- Undo snackbar; unchecking withdraws the feed event
- Quick Add / edit sheet (today or repeat, days, time, reminder, section, visible to Lucas, notes); "apply change to" prompt for routine items
- Task options: skip with reason (leaves the total), unskip, edit, delete
- Partner: status, today %, this week (87% vs 81%), focus / streak comparison, head to head (5 — 3), past weeks, Lucas' tasks, activity, reactions
- Focus: activity + duration picker (25 / 50 / 90 / custom), LOCK IN, running overlay (ring timer, pause / resume, end), complete screen with note, session recorded in list and feed
- Progress: ranges 7D / 30D / 90D / YEAR, completion rate, streak, focus, perfect days, bar chart (today is live), September calendar with day detail + corrections, weekly reviews overlay, insights + 30-day consistency
- More, Routine (add, edit, drag + keyboard reorder, templates), Challenges (list + new challenge), Duo (share / copy code / join placeholder), Settings (standard 70–100% drives Today, notification switches), Onboarding (5 steps → Today, name updates greeting)
- Review day, weekly review and morning briefing overlays
- Toasts, snackbar, connection pill, unsynced marker, empty states (no partner)
- Dev-only simulation panel (`/today?dev=1` in `npm run dev`): Lucas online / focusing / offline, completes a task, reacts; remove partner; connection states; briefing
- Centralised mocks in `src/lib/mock-data.ts`; state in `src/components/app-state.tsx`
- Accessibility: semantic buttons / links / nav landmarks, checkbox / radio / switch roles, aria-labels on icon buttons, focus-visible ring, Escape closes sheets, state never by colour alone (strike-through, labels), `prefers-reduced-motion`
- Docs: DECISIONS ADR-007…013, DESIGN_REFERENCE implementation notes, ARCHITECTURE and CLAUDE.md updated

Pending:

- Nothing for Stage 2

Verified (2026-09-23, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 2 files, 9 tests passed
- `npm run build` — pass, all routes static
- `npm run format:check` — pass
- `npm run test:e2e` — 24 passed (mobile-390 and desktop-1440 full suite; mobile-375 and mobile-430 layout)
- Visual inspection with screenshots at 375, 390, 430, 768, 1180, 1440 on every screen: no horizontal overflow, no console errors; compared against the v2 prototype and the Breakpoints canvas rendered from `design-reference/`
- Scripted manual pass (dev server): swipe both directions, skip / unskip, edit with scope prompt, streak / day / template / challenge sheets, Escape to close, dev simulation (focusing, reaction, completion toast with quick react, offline + unsynced marker, reconnect, empty partner), weekly review navigation, insights, keyboard and drag reorder, onboarding → Today with new name, standard change reflected on Today, copy code

Known Issues:

- Mock only: nothing persists across reloads; "Today only" and "Today and future days" apply the same edit; Visible to Lucas / reminder / notes have no effect; Join and Leave duo show a Stage 3 toast
- Morning briefing is not shown automatically (needs persistence; ADR-013)
- The 🫡 emoji renders as an empty box in headless Chromium without an emoji font; fine on real devices
- A focus session ended within the first minute is recorded as 1 minute
- Differences from the reference are listed in `docs/DESIGN_REFERENCE.md` → "Stage 2 implementation notes"
