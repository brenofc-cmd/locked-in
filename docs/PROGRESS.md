# LOCKED IN DEVELOPMENT STATUS

Current Stage:
4 — Real Today, recurring routines, one-off tasks and task check-ins — VERIFIED / COMPLETE (2026-09-24)

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

Next Stage:
5 — Realtime Partner, Presence and live activity — PENDING (not started)

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
