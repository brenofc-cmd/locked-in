# Decisions

Only decisions that shape the project. Newest at the bottom.

# ADR-001 — Next.js App Router on Vercel

Decision: Use Next.js with the App Router, deployed on Vercel.
Reason: First-class Vercel support, Server Components by default, simple integration with Supabase via `@supabase/ssr`.
Alternatives considered: Vite SPA (no server rendering or cookie auth out of the box), Remix/React Router (fine, but less direct Vercel/Supabase path).
Status: Accepted.

# ADR-002 — Versions chosen by the `create-next-app` compatibility set

Decision: Pin the versions `create-next-app@latest` resolved on 2026-09-23 and add the rest at their latest stable:
Next 16.3.6 · React / React DOM 19.2.8 · TypeScript 5.9.3 · Tailwind CSS 4.3.3 · ESLint 9.39.5 + eslint-config-next 16.3.6 · @supabase/supabase-js 2.117.1 · @supabase/ssr 0.12.7 · Vitest 5.0.1 · Playwright 1.63.0 · Prettier 3.9.9 · Node ≥ 22 (@types/node 22).
Reason: That set is the one Next.js itself tests together. Newer majors exist (TypeScript 7.0, ESLint 10, React 19.3) but `eslint-config-next` and the Next TS plugin target TS 5 / ESLint 9, so jumping ahead would trade stability for nothing. `npm audit`: 0 vulnerabilities.
Alternatives considered: TypeScript 7 / ESLint 10 now (not yet the Next.js default set); `--legacy-peer-deps` to force Vitest peers (rejected: aligned `@types/node` to the Node 22 runtime instead).
Status: Accepted. Revisit when `create-next-app` moves to the new majors.

# ADR-003 — Supabase is the only backend

Decision: Supabase Postgres + Auth + Realtime + Presence, accessed with the official SDK. No ORM, no custom server, no second database.
Reason: Two-user app; RLS gives per-row security without an API layer; Realtime/Presence cover the partner features directly.
Alternatives considered: Firebase (rejected by product brief), Prisma/Drizzle (extra layer with no gain here), custom Express/Nest API (unneeded).
Status: Accepted.

# ADR-004 — Design reference preserved read-only; v3 visual + v2 behaviour

Decision: Keep both Claude Design ZIPs byte-identical in `design-reference/original-zips/` and an unzipped copy in `design-reference/export/`. `Locked In v3.dc.html` is the primary visual reference; `Locked In v2.dc.html` is the behaviour reference because v3's logic script is an empty stub.
Reason: v3 is the latest layout and IA, but only v2 contains the working simulated logic (swipe thresholds, sizing tokens, feed rules).
Alternatives considered: Rendering the `.dc.html` runtime inside the app (rejected: prototype runtime, inline styles, not maintainable).
Status: Accepted.

# ADR-005 — Libraries added when first used

Decision: `lucide-react`, `date-fns` and `recharts` are part of the official stack but are installed in the stage that first uses them (Stage 2 / 4 / 7), not in Stage 1.
Reason: No unused dependencies; each install is then checked against the current version and the design (the design's icons are custom inline SVGs, so Lucide may only be needed for secondary icons).
Alternatives considered: Install everything up front.
Status: Accepted.

# ADR-006 — Tests: Vitest (jsdom) + Playwright on a mobile profile

Decision: Unit/component tests with Vitest + Testing Library in jsdom (`tests/unit`). E2E with Playwright against a production build (`next build && next start` on port 3100). Projects: `mobile-390` and `desktop-1440` run the full suite; `mobile-375` and `mobile-430` run the `@layout` tests (Stage 2).
Reason: Mobile-first product; testing the production build catches build-only issues.
Status: Accepted.

# ADR-007 — Breakpoints follow the reference: sidebar from 780px, two columns from 1180px

Decision: `< 780px` = mobile shell (top bar + bottom tabs). `≥ 780px` = desktop shell (228px sidebar, no tabs). `≥ 1180px` = Today and Focus switch to two columns and the Today rail becomes sticky. Implemented as Tailwind breakpoints `desk` (48.75rem) and `wide` (73.75rem) in `globals.css`.
Reason: v2 logic (`mobile = width < 780`, single column below 1180) and the Breakpoints canvas (tablet 834 renders with the sidebar) both say so. The Stage 2 brief suggested the sidebar at 1180, but the approved design wins.
Status: Accepted.

# ADR-008 — Mock state in one React context

Decision: All Stage 2 state (tasks, feed, partner, focus timer, sheets, overlays, toasts, snackbar) lives in `src/components/app-state.tsx`, provided by the `(app)` layout. Mock data only in `src/lib/mock-data.ts`. Pure derivations in `src/lib/today.ts` and `src/lib/partner.ts` (unit-tested).
Reason: One small provider is enough for two users. No Redux/Zustand. Stage 3+ replaces the initial data and mutations with Supabase calls behind the same shape.
Alternatives considered: per-page state (loses state between tabs), a store library (not needed).
Status: Accepted.

# ADR-009 — Routes for screens; sheets and overlays are state

Decision: Screens are routes: `/today`, `/partner`, `/focus`, `/progress`, `/more` (main) and `/routine`, `/challenges`, `/duo`, `/settings`, `/onboarding` (secondary, from More / sidebar). `/` redirects to `/today`. Bottom sheets and full-screen moments (focus running/complete, review day, weekly review, briefing) are UI state, not routes.
Reason: Matches the design's navigation; keeps the focus timer alive while navigating.
Status: Accepted.

# ADR-010 — Dev simulation only in development with ?dev=1

Decision: `DevPanel` renders only when `NODE_ENV === "development"` and the URL had `?dev=1` (remembered in sessionStorage). It simulates Lucas online / focusing / offline, Lucas completing a task, Lucas reacting, removing the partner (empty states), connection reconnecting / offline / back online, and opens the morning briefing.
Reason: Lets the partner and realtime states be exercised without a backend, without polluting production UI.
Status: Accepted. Remove or replace with real events in Stage 5.

# ADR-011 — No new dependencies in Stage 2

Decision: Charts are CSS/SVG, icons are the design's inline SVGs, animations are CSS keyframes/transitions. `lucide-react`, `date-fns` and `recharts` remain deferred (ADR-005).
Reason: Nothing in the v3 design needs them yet; fidelity is higher with the design's own SVGs.
Status: Accepted.

# ADR-012 — Filling values v3 leaves undefined

Decision: v3's logic script is empty, so some sizes/copy are not defined anywhere. Chosen values (all listed in `docs/DESIGN_REFERENCE.md` → "Stage 2 implementation notes"): hero `%` sign 26/40px, focus ring 296px mobile and `min(520px, 58dvh)` desktop with timer `min(168px, 17dvh)`, head-to-head number 56/72px, weekly-review number 64/96px, reactions 🔥 ⚡ 🫡 "Respect." (4 columns as in v3), skip reasons Rest/Sick/Travel/Other, repeat options Every day/Weekdays/Custom, "next" line copy, More row subtitles, onboarding CTAs.
Reason: Simplest values consistent with the surrounding v3 tokens and v2 behaviour.
Status: Accepted; revisit if the design is updated.

# ADR-013 — Morning briefing is not shown automatically yet

Decision: The briefing overlay exists but opens only from the dev panel.
Reason: "Show the first time you open the app each day" needs persisted state (Stage 3+). Showing it on every load would block OPEN → UNDERSTAND → ACT.
Status: Accepted; implement the daily trigger with persistence.

# ADR-014 — Auth: cookie sessions via @supabase/ssr, Server Actions, two gates

Decision: Email + password with Supabase Auth, sessions in cookies (`@supabase/ssr` 0.12). Three clients: browser (`src/lib/supabase/client.ts`), server (`server.ts`, per request) and the proxy (`src/lib/supabase/proxy.ts`, Next 16 `proxy.ts` convention) which calls `getClaims()` on every request to validate and refresh the session. Forms post to Server Actions (`src/app/(auth)/actions.ts`); errors go through `authErrorMessage()` so raw `AuthApiError` text never reaches the UI. Private routes are guarded twice: the proxy redirects before rendering, and `(app)/layout.tsx` redirects if `getSession()` returns null. `/auth/confirm` accepts both `token_hash`+`type` (verifyOtp) and `code` (PKCE exchange), so it works with the default Supabase email templates and with the recommended `{{ .TokenHash }}` template. Sign-out is POST-only (`/auth/signout`). Email confirmation stays **on** in DEV.
Reason: Official SSR pattern for the installed versions; no auth state in localStorage; no flash of private content.
Status: Accepted.

# ADR-015 — Duo writes only through SECURITY DEFINER RPCs; hard rules as constraints

Decision: `authenticated` has SELECT on `duos` / `duo_members` and no INSERT / UPDATE / DELETE. `create_duo`, `join_duo`, `leave_duo` are SECURITY DEFINER with `search_path = ''`, act only for `auth.uid()`, and raise stable `LI_*` codes. "One duo per user" and "two members per duo" are unique constraints (`unique (user_id)`, `seat in (1,2)` + `unique (duo_id, seat)`), so they hold under concurrency regardless of code paths. Supabase advisor 0029 (definer function executable by authenticated) is accepted for exactly these three functions.
Reason: Atomic multi-row writes with a database-level guarantee; the client cannot fabricate memberships.
Status: Accepted.

# ADR-016 — Leaving ends the duo for both (V1)

Decision: `leave_duo()` deletes the duo; memberships cascade. The creator uses the same call to cancel an unjoined duo ("Cancel duo"). Settings asks for a second tap before leaving.
Reason: A duo with one seat free and history attached raises questions (who keeps the history, can a stranger join?) that V1 does not need to answer.
Status: Accepted; revisit when history exists (Stage 7+).

# ADR-017 — Real session state separate from mock product state

Decision: `src/lib/session.ts` (`getSession()`) loads user, profile, duo and partner on the server in `(app)/layout.tsx` and passes them to `SessionProvider` (`src/components/session.tsx`). `app-state.tsx` stays the mock product context but reads identity from `useSession()`: `userName`, `hasPartner`, and the partner's name / initial are real; presence, %, streak, tasks, feed, focus, stats, challenges and reactions remain mock. Mutations (create / join / leave duo, display name) are Server Actions that `revalidatePath("/", "layout")`. No realtime: the creator sees the partner after a refresh (Stage 5).
Reason: Clear seam for later stages to replace mocks one by one without a large refactor.
Status: Accepted.

# ADR-018 — Tests run against the DEV project with confirmed test users

Decision: Playwright's `setup` project signs in through `/login` as the Brendon test user (duo with Lucas, rebuilt each run through the RPCs) and saves the cookies; the Stage 2 UI suite reuses that state. Stage 3 flows (`tests/e2e/stage3.spec.ts`) use Alice / Bruno / Carla in their own serial project. Test users are created confirmed with `supabase/dev/create_test_users.sql`; the password lives only in `.env.test.local` (git-ignored). pgTAP runs locally with `supabase test db` when Docker is available, otherwise on DEV inside an aborted transaction (docs/DATABASE.md).
Reason: Real auth and RLS must be exercised end to end; fake email addresses must never trigger confirmation emails.
Status: Accepted. A separate test project or local stack is preferable once available.

# ADR-019 — Routine template + materialised daily snapshot; status on the task

Decision: `routine_items` is the recurring template; `daily_tasks` holds one row per task per local date, copying title, category, time, order, visibility, notes and reminder (a snapshot). A one-off task is a `daily_tasks` row with `routine_item_id` null. Status (`pending` / `completed` / `skipped`, with `completed_at` / `skipped_at` / `skip_reason`) lives on the task row: no separate `task_checkins` table. Missed is derived (`task_date < today` and pending), never stored. Extra columns beyond the Stage 4 brief, each required by the approved UI: `skip_reason` (row shows "SKIPPED · SICK"), `notes` (the "5 KM" line and the Notes field), `reminder` (the switch must not lie after a reload; notifications come later).
Reason: History must not be rewritten when a routine changes (Gym MON/WED/FRI becoming MON/TUE/THU/SAT keeps the old days in the past). One task has exactly one state per day, so a check-ins table would add joins and no information.
Status: Accepted.

# ADR-020 — On-demand, idempotent materialisation with SECURITY INVOKER functions

Decision: No cron, worker or Edge Function. `ensure_my_daily_tasks()` runs when the app loads and at the start of every routine-changing function; it fills every scheduled date from `materialized_through + 1` (or `start_date`) to the owner's today, so days the app was not opened are caught up. `unique (routine_item_id, task_date)` + `ON CONFLICT DO NOTHING` makes it idempotent and safe under concurrency. All Stage 4 functions are SECURITY INVOKER with `search_path = ''`, identity from `auth.uid()` only, EXECUTE revoked from public / anon and granted to `authenticated`; column grants limit what clients can write. The composite FK `(routine_item_id, owner_id)` makes a cross-owner link impossible, and it also blocks hard-deleting a routine with history (clients have no DELETE on `routine_items`; "Delete" archives with `end_date`).
Reason: Two users do not need infrastructure; invoker functions keep RLS as the single security model (no definer escape hatches added in this stage).
Status: Accepted.

# ADR-021 — "Today" is the owner's local date, defined once in the database

Decision: `public.my_today()` = `(now() at time zone profiles.timezone)::date`. It drives materialisation, the `task_date` default for Quick Add, and is returned to the app by `ensure_my_daily_tasks()`. The client never derives the day from UTC; `src/lib/local-date.ts` formats and does calendar arithmetic on the database's `YYYY-MM-DD` strings (ISO weekdays 1 = Monday … 7 = Sunday everywhere). "DAY N" on Today counts local days since the profile was created.
Reason: One semantics for Today, Quick Add, routine and tests; no timezone logic spread across the code.
Status: Accepted.

# ADR-022 — Completion counts skipped tasks in the total (supersedes Stage 2 rule)

Decision: Completion % = completed / all tasks of the day. A skipped task stays in the total and is not completed: 10 tasks, 8 completed, 1 skipped, 1 pending → 80% (not 89%). Perfect day = every task completed. Copy updated in the options and streak sheets; PRODUCT.md principle 5 updated.
Reason: Explicit product instruction for Stage 4. It replaces the Stage 2 rule "skipped tasks leave the total", which made skipping a way to raise the score.
Status: Accepted.

# ADR-023 — Five stored categories; UI chips follow them

Decision: Stored categories are `morning`, `work_study`, `body`, `night`, `custom` (the five Today sections). The Section chips in the task sheet show Morning, Work / Study, Body, Night, Custom — the previous separate "Study" and "Work" chips already mapped to the same section.
Reason: One value per section; a chip that cannot round-trip through the database would lie.
Status: Accepted.

# ADR-024 — Real task state: server-loaded, optimistic, no revalidation

Decision: `(app)/layout.tsx` loads session and today's tasks together (`loadAppData()`: ensure + two queries, in parallel with the profile / duo queries). Client state for tasks and routine lives in `src/components/use-tasks.ts`, separate from the mock product state in `app-state.tsx`. Every change updates the UI first (tap → check in ~10 ms, no spinner), then calls a Server Action (`src/app/(app)/task-actions.ts`); success reconciles with the returned row, failure rolls back and shows a toast. A per-task version counter drops stale responses so fast repeated taps never flicker. Task actions do not revalidate the layout; a reload always renders from the database (the layout is dynamic: it reads cookies).
Reason: The daily core loop must feel instant; the server stays the source of truth on every load.
Status: Accepted. Stage 5 adds realtime on top.

# ADR-025 — Sign-out ends only this browser's session

Decision: `/auth/signout` calls `signOut({ scope: "local" })`. Test helpers also sign out locally.
Reason: Supabase's default scope is global: signing out on a laptop would silently end the session on the phone. Found by the Stage 4 E2E suite.
Status: Accepted.

# ADR-026 — E2E: one seeded user per Playwright project

Decision: The Stage 2 UI suite runs on real data: `auth.setup.ts` seeds the design's Today (12 routine items, 8 completed; `tests/fixtures/design-day.ts`) for three users — one per project group (390, 1440, 375 + 430) — so parallel projects never share mutable rows; `app.spec.ts` runs serially inside a project and restores what it changes. The `stage4` project depends on `stage3` because both use Alice / Bruno / Carla. `mockTasks` was removed from the app.
Reason: Real persistence makes shared test users race; per-project users keep the suite parallel and deterministic.
Status: Accepted.

# ADR-027 — One private Realtime channel per duo, authorized by RLS

Decision: Topic `duo:<duo_id>`, `private: true`, carrying Presence and database Broadcasts; no public channels and no other channels. Realtime Authorization policies on `realtime.messages`: members of the duo (`private.current_duo_id()`) may receive broadcast / presence and may publish **presence only**. Everyone else — the other duo, users without a duo, fake topics, anon — is refused at join time. supabase-js refreshes the socket's JWT on every token refresh. Recommended for production: disable "Allow public access" in Realtime settings (Stage 10).
Reason: Server-enforced isolation between duos; least privilege (clients never need to broadcast).
Status: Accepted. Known window: a user who leaves a duo keeps an already-joined socket until it reconnects (REALTIME.md).

# ADR-028 — Activity feed and broadcasts are produced by the database

Decision: `activity_events` is maintained by a SECURITY DEFINER trigger on `daily_tasks`: an event exists exactly while a task is completed and shared (undo / skip / private / delete remove it), with a title snapshot and the completion time. The same trigger sends minimal broadcasts with `realtime.send` (`activity`, `activity_removed`, `tasks_changed`). `realtime.broadcast_changes()` was not used because it ships whole rows (notes etc.). Clients cannot insert, edit or delete events. Skips are not proof of work and never enter the feed. `public.partner_today()` (SECURITY DEFINER) returns only the partner's date and done / total, private tasks included in the counts, never listed; accepted under advisor 0029 like the duo RPCs.
Reason: Events cannot be forged, cannot survive an undo, and cannot leak private tasks, whatever the client does.
Status: Accepted.

# ADR-029 — Presence is ephemeral: online / focusing / offline only

Decision: Presence key = user id (tabs and devices collapse into one user); payload `{ user_id, state }` plus, while focusing, `focus_title`, `focus_started_at`, `focus_planned_minutes`, tracked once per state change. Offline = no presence. Focusing wins over online. The viewer computes the countdown locally; no timer ticks over the network. No "last seen".
Reason: Minimal data, no battery / network noise, correct with multiple tabs.
Status: Accepted. Stage 6 makes focus durable.

# ADR-030 — Postgres is the source of truth; Realtime only delivers sooner

Decision: The server renders the feed and the partner's day on every load; the client refetches them (debounced) after partner events, after every re-subscribe following a disconnect, when the browser comes back online and when the tab becomes visible. Feed lines are keyed by `activity_events.id`; my optimistic line is replaced by the real event for the same task, so reconnects and refetches never duplicate. No polling.
Reason: Lost messages must never leave the UI wrong; refresh always shows the truth.
Status: Accepted.

# ADR-031 — Realtime state lives in its own provider

Decision: `DuoRealtimeProvider` (`src/components/duo-realtime.tsx`) owns the channel, presence, connection state, feed and partner's day; `app-state.tsx` composes it and keeps only mock product state (reactions, focus sessions, stats, streak, challenges). The Stage 2 dev simulator no longer fakes partner status, partner completions, reactions or connection (it would fight real state); it keeps the briefing shortcut. Reactions stay local (Stage 8) and no longer add fake feed lines; focus sessions no longer add feed lines (Stage 6).
Reason: Clear boundary between real and mock; no monster context.
Status: Accepted.

# ADR-032 — E2E: real partners and a two-browser Stage 5 project

Decision: `auth.setup.ts` gives each UI-suite partner (Lucas) a real day whose last completion is in the duo feed, so the Partner screen tests run on real data. `tests/e2e/stage5.spec.ts` (project `stage5`, after `stage4`) opens two or three isolated browser contexts: live completion / undo / private task without reload, presence online → focusing → online → offline, multiple tabs, missed-while-offline recovery, connection loss, and socket-level authorization for members, outsider, fake topic and anon.
Reason: The stage is only done when two users see each other live.
Status: Accepted.

# ADR-033 — Focus sessions are persistent; Postgres owns every timestamp

Decision: `focus_sessions` stores `started_at`, `paused_at`, `accumulated_pause_seconds`, `ended_at` and `actual_focus_seconds`, all set by a BEFORE trigger with `now()`; clients send only the status they want (column grants). The clock is derived: `remaining = planned - ((paused_at ?? now) - started_at - pauses)`, never decremented, never saved per second. Status is `active | paused | completed` — no "cancelled": ending early is a valid session with its real duration. One unfinished session per user is a partial unique index (double tap, two tabs, two devices). A linked task must belong to the same user (composite FK); a private task makes the session private. Focus today counts sessions on the local day they started.
Reason: Refresh, closing the app, sleep and background tabs cannot lose or distort a session; there is nothing to fake from the client.
Status: Accepted.

# ADR-034 — Expiry is reconciled on demand; partner sees a limited projection

Decision: No cron. `reconcile_my_focus()` (called by `my_active_focus()` on every load and by every transition) completes an active session whose planned time has passed, storing `actual = planned` and `ended_at = started_at + pauses + planned` (the real end, not the reopening time). A paused session never expires. The partner never reads `focus_sessions`; `partner_current_focus()` (SECURITY DEFINER, `search_path = ''`, EXECUTE for `authenticated` only, accepted under advisor 0029 like `partner_today`) returns the partner's unfinished, unexpired session with timer fields and the title only if shared — never the reflection, task id or history.
Reason: Correct durations without background jobs; least data for the partner.
Status: Accepted.

# ADR-035 — Live Focus: one broadcast per transition, persistent focus wins over presence

Decision: A DEFINER trigger on `focus_sessions` sends one `focus` broadcast on `duo:<duo_id>` per start / pause / resume / complete, and writes `focus_started` / `focus_completed` feed events (with `duration_seconds`; pause / resume stay out of the feed; private sessions have no title). Presence becomes `{ user_id, state: "online" }` only. Partner status = FOCUSING if a valid persistent session exists (even with the app closed), else presence ONLINE / OFFLINE. The owner's tabs treat `focus` broadcasts as "refetch"; transitions are queued in order and a refetch that raced a local transition is discarded; the partner's refetch never overwrites a newer broadcast. Each viewer ticks locally once a second only while a clock is on screen, corrected to the database clock (`server_now()` on load, refined by every written row: the app server or device clock can be seconds off — found in acceptance testing); E2E proves 12 s of a running session produce no requests, broadcasts or presence updates.
Reason: Live without noise; correct under reordering, multiple tabs and closed apps.
Status: Accepted. Supersedes the focus part of ADR-029.

# ADR-036 — E2E: @focus UI tests run after the rest of their user's suite; stage6 project

Decision: A running session overlays every screen of its user, so the UI focus test is tagged `@focus` and runs in `focus-390` / `focus-1440`, which depend on `mobile-390` and `desktop-1440`. `tests/e2e/stage6.spec.ts` (project `stage6`, after `stage5`, serial) covers refresh while running / paused, expiry while closed, two-browser live focus, private session, multi-tab, double start, outsider, and the no-per-second-traffic network test.
Reason: Deterministic parallel suite with real persistence.
Status: Accepted.

# ADR-037 — Progress is derived from daily_tasks and focus_sessions; no statistics tables

Decision: Every Stage 7 number (streak, completion, perfect days, focus, weekly competition, habits) is computed by SQL functions reading `daily_tasks` and `focus_sessions` on demand: `my_progress_summary`, `my_daily_progress`, `my_habits` (INVOKER) and `duo_weeks`, `partner_progress_summary` (DEFINER). No `daily_stats`, `weekly_results` or streak columns; nothing written by cron or trigger. The client does only presentation maths on the returned counts (`src/lib/progress.ts`, pure and unit-tested) and adds today live from the tasks on screen. Definitions and formulas: `docs/ANALYTICS.md`.
Reason: Postgres stays the single source of truth; a derived number can never disagree with its source, and a history edit or standard change is reflected everywhere at once. Two users' history is small (indexed by owner + date). A cache can be added later if measurements demand it.
Status: Accepted.

# ADR-038 — Daily Standard: personal, default 80 %, exact ratio, streak only

Decision: `profiles.daily_standard_percent` (1–100, not null, default 80), editable by its owner only (column grant + RLS). A day meets it when `completed · 100 ≥ standard · planned` (exact, never the rounded %). Skipped tasks stay in `planned`. A day with nothing planned is neutral (neither counts nor breaks). The streak counts consecutive standard-met closed days, and today adds one only once it meets the standard — an incomplete today never breaks it. Changing the standard recalculates the streak over all history (V1 keeps no standard history). A Perfect Day is 100 % regardless of the standard.
Reason: One clear, honest rule; rounding can never turn 66.7 % into "67 % met"; skipping cannot inflate a day.
Status: Accepted.

# ADR-039 — Weekly competition on raw completion; head-to-head on completed weeks together only

Decision: The week (Monday–Sunday, local `task_date`) is won on raw completion % (`completed / planned`), compared by exact ratio; the standard and focus play no part (focus is shown alongside). The current week shows a leader but never a result. A completed week is a head-to-head result only if both members had tasks; equal ratios are a draw. Weeks that started before the duo was complete (second member's `joined_at`, in the caller's calendar) return no partner side at all (migration `…_duo_weeks_together.sql`), so they are never a result and the partner's pre-duo history is not exposed.
Reason: The standard is personal — lowering it must not help anyone win; "no hype" means a week is only a result once it is over and was shared.
Status: Accepted.

# ADR-040 — Partner progress through two DEFINER functions returning integers only

Decision: `duo_weeks` and `partner_progress_summary` are SECURITY DEFINER because the competition must count the partner's private tasks, which RLS hides. They take no user id (partner = the other member of `private.current_duo_id()`), set `search_path = ''`, EXECUTE only for `authenticated`, and return integers / dates only — pgTAP asserts no `text` output column. Private tasks count in aggregates but are never listed and send no broadcast. `duo_weeks` materialises the partner's routine up to their today first. Accepted under advisor 0029 like `partner_today` (ADR-028) and `partner_current_focus` (ADR-034).
Reason: Fair numbers without leaking any private detail.
Status: Accepted.

# ADR-041 — Live progress without new realtime traffic; refetch on the first channel join

Decision: My own progress is live from local state (today's tasks and focus on top of the loaded series). The partner's side is re-read (`duo_weeks` + `partner_progress_summary`, one server action) whenever the realtime provider refetches the partner — partner events, reconnect, back online, tab visible — via a `partnerVersion` counter; no new broadcast, no channel, no polling. The provider now also refetches on the **first** `SUBSCRIBED`, closing the gap between the server render and the channel join (found by the Stage 7 E2E). Private completions emit nothing (ADR-028), so they reach the partner's numbers on the next re-read. The app reloads when the local date changes (timer to local midnight on the database-corrected clock, and on tab visible).
Reason: Correct live competition within the Stage 5 realtime rules.
Status: Accepted. Amends ADR-030's recovery rule (refetch also on the first join).

# ADR-042 — pgTAP on DEV through a script; E2E stage7 project

Decision: `supabase/dev/pgtap_dev.mjs` rewrites a pgTAP file for the aborted-transaction run on DEV (every assertion's line captured, a final exception reports `TAP FAILED / PLANNED / RAN` and rolls everything back), replacing the hand-made procedure while Docker is unavailable. `tests/e2e/stage7.spec.ts` (project `stage7`, after `stage6`, serial, Alice / Bruno / Carla) seeds history through the public API as each user. `trackWrites()` tracks Server Actions only (Supabase reads sent as POST are not writes) with a set of requests.
Reason: Repeatable database verification; deterministic E2E with real persistence.
Status: Accepted.
