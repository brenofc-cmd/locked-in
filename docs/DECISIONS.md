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

# ADR-043 — User settings in an owner-only table; onboarding completion persisted

Decision: `public.user_settings` (one row per profile, created by trigger, backfilled as onboarded for existing accounts) holds onboarding completion, the morning briefing and default task sharing preferences, notification preferences and quiet hours. RLS: the owner reads and updates their row only; no client insert / delete; `onboarding_completed_at` is set to the database time when first written and cannot be rewritten (null restarts it). The Daily Standard, name and timezone stay on `profiles`. Onboarding replaces the app (any path) until completed and resumes at the duo step when a routine exists; the slide is not persisted. The day the briefing was last shown is per browser (`localStorage`), the preference itself is the setting.
Reason: Profiles are readable by the duo partner; nobody else needs someone's quiet hours or onboarding state. Onboarding must survive devices and never come back once finished.
Status: Accepted.

# ADR-044 — Reactions and challenges: attached, derived, private to the duo

Decision: `reactions` (fire / lightning / salute / respect) attach to `activity_events`: one per user per event (`set_reaction()` upserts, INVOKER), only on the partner's events in my duo (RLS + `private.can_react`), never on my own, never a feed line; a `reaction` broadcast carries ids and the type, no title. `challenges` store title, type (`standard_days` / `focus_seconds`), target and period; progress is derived by `duo_challenges()` (DEFINER, because the partner's private data counts in the aggregate; integers, dates and the challenge's own text only); status and winner are derived on the client. Members of a complete duo create from today on; delete only before start; no edits; a `challenges_changed` broadcast triggers re-reads. Both tables cascade with the duo. Accepted under advisor 0029 like the other partner aggregates.
Reason: No stored number can disagree with the record; nothing leaves the duo.
Status: Accepted.

# ADR-045 — Notifications: in-app first, browser Notification while open, no push in V1

Decision: Notifications are in-app toasts filtered by the user's preferences, mirrored by the browser Notification API only in a background tab, with permission granted by an explicit click, outside quiet hours. Task reminders are timers while the app is open. No service worker, VAPID, push provider, Edge Function, queue or cron. Details: docs/NOTIFICATIONS.md.
Reason: Real push is infrastructure with its own security surface; V1 does not fake it.
Status: Accepted.

# ADR-046 — Ending a duo: one atomic delete, broadcast first, nothing survives for a new partner

Decision: `leave_duo()` (either member) sends `duo_ended` on the duo channel and deletes the duo row in the same transaction; memberships, feed, reactions and challenges cascade. Personal data (tasks, routine, focus, progress, settings) stays. `join_duo()` sends `duo_joined` so a waiting creator updates live. The provider also re-renders the session when a refetch finds the partner arrived or gone (a missed broadcast cannot leave a stale duo). A partner reads shared `daily_tasks` only from the date the duo formed (new RLS condition, `private.duo_together_since`), so a new partner cannot read history from before them. The UI asks for an explicit confirmation ("Leaving will end this Duo for both members.").
Reason: A duo is two people; there is no owner / member state to maintain, and the old duo's history must never reach a new partner.
Status: Accepted. Refines ADR-016.

# ADR-047 — Templates are constants; applying one is serialised in the database

Decision: Routine templates (Morning, Study, Night, Training) are constants in `src/lib/routine-templates.ts`; the user edits the items, then `add_routine_items()` creates them in one call, taking a per-user advisory lock and skipping titles already active (case-insensitive). The client also ignores a second click while one is in flight.
Reason: No template table; a double click can never create the same routine twice.
Status: Accepted.

# ADR-048 — Installable app without offline mode

Decision: A web manifest (`src/app/manifest.ts`: standalone, app surface colours, LogoMark icons incl. maskable), apple-touch icon and web-app metadata; the manifest is served without a session (proxy matcher). Icons are generated once from the LogoMark by `scripts/generate-icons.mjs`. No service worker and no offline cache; Settings offers "Install" only when the browser reports it installable.
Reason: App-like on the home screen without pretending to work offline.
Status: Accepted.

# ADR-049 — E2E: stage8 project, Stage 8 defaults for older suites

Decision: `tests/e2e/stage8.spec.ts` (project `stage8`, after `stage7`, serial, Alice / Bruno / Carla) covers onboarding, reactions, challenges, settings, notification preferences (stubbed Notification API, forced background visibility), briefing, reviews / history, duo end with a new partner, and the manifest. `support.testSettings()` (called by `resetTasks` / `resetDuo`) keeps the older suites on onboarded users with the briefing and weekly notice off. Waits for the channel join use the browser's first `partner_today` read.
Reason: Deterministic suites that still exercise the first-open behaviour where it is tested.
Status: Accepted.

# ADR-050 — Closed history is immutable, enforced by the database

Decision: A local day that has ended is final. Triggers refuse, for the API roles (`anon`, `authenticated`, also through INVOKER RPCs), any insert / update / delete of a `daily_tasks` row dated on a closed day, completing / skipping a future day in advance, and routine-template changes that would manufacture or suppress past occurrences (past `start_date`, client writes of `materialized_through`, edits before catch-up, reopening an old archive). Catch-up stays possible because `private.materialize_tasks` is SECURITY DEFINER (runs as the owner, which the guards trust) and only creates occurrences from protected templates, for the caller or the caller's partner. The boundary is `greatest(profiles.history_locked_through, local date − 1)`; `history_locked_through` has no client grant and a timezone change stores the boundary reached under the old timezone, so it only moves forward and "today" never moves back (moving west keeps the later date until the new local date catches up). Errors: `LI_HISTORY_LOCKED`, `LI_FUTURE_TASK`, `LI_ROUTINE_STALE`.
Reason: Hiding buttons is not integrity. The weekly winner, head-to-head, streak, perfect days and challenge results must be a record nobody can rewrite, while missed days still materialise.
Status: Accepted. Replaces the Stage 4 rule that owners could edit any of their rows.

# ADR-051 — Focus days and challenge results are frozen

Decision: `focus_sessions.local_date` is set by the lifecycle trigger at start (owner's today) and never changes; progress and challenges group focus by it (a timezone change no longer moves sessions between days). A paused session of a closed day cannot be resumed; `reconcile_my_focus()` completes it with the time before the pause. Challenges store `creator_standard` / `partner_standard` at creation (no client grant) and judge `standard_days` with them; focus challenges count every session's effective seconds (`private.focus_seconds`), so finalising a session never changes a result. Identical challenges (duo, title case-insensitive, type, period) are refused by a unique index.
Reason: A closed challenge must not flip because of a later Settings change, a late reconciliation or a double submit. The streak keeps recalculating with the current standard (ADR-038): it is personal and never part of a competition.
Status: Accepted. Refines ADR-044.

# ADR-052 — DEV-only fixtures for past data in end-to-end tests

Decision: `supabase/dev/test_fixtures.sql` (not a migration, applied to DEV by hand) defines SECURITY DEFINER `dev_fixture_reset_history`, `dev_fixture_add_tasks`, `dev_fixture_backdate_routine`, limited to the `li-…@example.com` test accounts. Playwright uses them to prepare closed days; every permission / attack assertion still uses real user tokens on the public API. Production must never contain them (docs/PRODUCTION_CHECKLIST.md).
Reason: With closed history locked, no client can create yesterday; tests still need yesterday. No service-role key in tests.
Status: Accepted.

# ADR-053 — HTTP security headers and redirect hardening

Decision: `next.config.ts` sends a CSP (self + the project's Supabase host for `connect-src`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` / `form-action 'self'`; inline scripts / styles allowed), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and no `X-Powered-By`. `safeNext()` refuses control characters and backslashes and re-serialises the path from a parsed URL. Auth email links use `SITE_URL` when set. After `duo_ended` the client leaves the channel immediately.
Reason: Defence in depth without breaking Next.js; a nonce-based `script-src` would force dynamic rendering of every page and is left for after V1.
Status: Accepted.

# ADR-054 — Interface in Brazilian Portuguese from one typed catalog

Decision: Every user-facing string (screens, sheets, overlays, toasts, aria labels, validation and error copy, page titles, manifest, dates) lives in `src/i18n/pt-BR.ts`: one `as const` object `t`, with functions for interpolation and plurals (`plural(n, one, many)`) and `LOCALE = "pt-BR"` for `<html lang>`, the manifest and `Intl` dates. No i18n library and no locale routing: the product ships in one language, and the catalog keeps a second one possible without touching components. The name stays in English (LOCKED IN, the LOCK IN button); the tagline is "Sem hype. Só prova.". Internal identifiers do not change (`Day` codes `MON`…`SUN`, categories, statuses, database values, error codes); only their display labels come from the catalog. Weekday abbreviations are three letters (SEG, QUA) because two would be ambiguous (QUA / QUI). Tests assert the Portuguese copy.
Reason: The users are Brazilian. A single typed file catches a missing or misspelled key at compile time, adds no dependency or bundle cost, and keeps the copy reviewable in one place.
Status: Accepted.

# ADR-055 — V2 Resume State: device-local interface context, never product data

Decision: Reopening the app at `/` (including the installed app, `start_url: "/"`) restores the user's last safe private route; Progress keeps its range and an earlier calendar month; long screens keep their scroll; an unsent new task / routine item keeps its draft. It lives in `localStorage` under `locked-in:v2:<auth user id>:resume` as one versioned (`v: 1`), validated, ≤ 4 KB JSON value behind `src/lib/resume-state.ts` (the only module that touches it). Restore happens only at `/`; explicit URLs, auth links, reset, `?next` and onboarding always win. Only an allow-list of nine private routes can be restored. Scroll is restored once per page load after content; drafts and scroll expire after 24 h, the route after 30 days. No sheet or dialog is ever restored. An explicit sign-out removes the user's value; per-user keys isolate people who share a device. Focus, tasks, partner, progress numbers and settings are never stored here. No migration, no provider, no new dependency. Details: docs/RESUME_STATE.md.
Reason: The app is used on phones that kill tabs and installed apps; landing back on Today after every reopen loses the user's place. Keeping this on the device avoids a server table for pure UI state, and keeping it tiny, validated and user-scoped means a corrupted, old or foreign value can only ever cost the user a trip to /today.
Status: Accepted.

# ADR-056 — Partner last seen: a heartbeat table, presence stays the truth for ONLINE

Decision: One status function for the whole app (`partnerView()` through `usePartnerView()`): a valid persistent focus session → EM FOCO; Realtime Presence → ONLINE; otherwise OFFLINE with "Visto por último …" when known. Last seen lives in its own table `public.user_presence (user_id, last_seen_at)`, written only by the INVOKER RPC `touch_last_seen()` (database clock via trigger, own row only) on open, on return to visible and about every 5 minutes while visible — never while hidden, never on close. The current duo partner reads it (RLS through current membership); an old partner, an outsider and anon cannot. The client shows the later of that value and the moment it saw the partner's presence drop. Replaces the first draft (a `profiles.last_seen_at` column), which would have run the profile triggers on every heartbeat and mixed a volatile value into the identity table.
Reason: A useful "when was Lucas last here" without polling, a new channel or a second source of truth for ONLINE, with a privacy rule as small as the duo itself. V1's "no last seen by design" is relaxed by the product owner's explicit decision (V2 Phase 2): the partner sees EM FOCO / ONLINE / OFFLINE + last seen, never more.
Status: Accepted. Refines ADR-031.

# ADR-057 — School planner: owner events shared by duo, never coupled to tasks

Decision: `public.planner_events` holds exams, assignments, homework, deadlines and school events (local `date` / `time`, never UTC). The owner has full CRUD; sharing is stored as the duo it was shared with — `duo_id` is set by the database from the owner's current complete duo (clients cannot write `duo_id` or `owner_id`), and `ON DELETE SET NULL` + the normalise trigger make the event private again when that duo ends, so an old partner loses it and a new partner never inherits it. The partner reads shared events only. Changes of shared events are announced on the existing duo channel as `planner_changed` with ids only (DEFINER `sync_planner_event`, the one new DEFINER); the partner re-reads through RLS. Reminders reuse the in-app / open-browser notification path (Lembretes preference, quiet hours); Web Push waits for Phase 10. "Add to tasks" pre-fills Quick Add — an event and a task are independent entities.
Reason: School deadlines are the main planning need of the duo; keeping the planner as a small owned table with a derived share keeps the privacy and isolation rules the same shape as tasks and challenges, and keeps LOCKED IN from becoming a calendar.
Status: Accepted.

# ADR-058 — Goals, vision and the mirror are private by default; no realtime

Decision: `vision_items`, `goals`, `goal_milestones` and `accountability_items` are owner-only (one policy each, `owner_id = auth.uid()`, no partner condition, no sharing column, no broadcast, no DEFINER function). `owner_id` defaults to `auth.uid()` and is not granted; composite foreign keys tie a goal to the owner's own vision and a milestone to the owner's own goal, so another user's rows can never be referenced. The mirror is as private as the rest. No realtime: the data is only the owner's, and another tab sees changes on its next load. `/goals` reads its data on the page, not with the app layout.
Reason: Visions, goals and especially the mirror are personal; building the private structure first keeps the privacy rule trivial to audit. Sharing with the partner is a future, explicit product decision — never added "because it is easy".
Status: Accepted.

# ADR-059 — No manual progress percentage for goals

Decision: A goal is active, achieved or archived — nothing else — and never shows a percentage or a progress bar. Milestones are shown as a count ("1 de 2 marcos"). `achieved_at` is stamped by the database (set on achieve, cleared on reactivate, kept on archive) so later phases can use it. Real progress will come from Goal → Action → Proof (Phase 5).
Reason: LOCKED IN is "proof over hype": a number the user types is not proof, and a fake 73 % would make the whole Progress area less trustworthy.
Status: Accepted.

# ADR-060 — North Star: the user's own words, manual featured + deterministic fallback; no generated content

Decision: Today shows at most one vision, one active goal and one active mirror item, exactly as the user wrote them. The user features one per kind on /goals (`is_featured`, one per owner and table by partial unique index; featuring replaces the previous one in a trigger; leaving the active state drops the flag; an inactive item cannot be featured). Without a featured item a documented, deterministic fallback applies (first active vision / mirror by order; first active goal 90 DIAS → ESTE MÊS → LONGO PRAZO). No random pick, no motivational quote, no AI-generated coaching, recommendation or inferred judgement anywhere; objective facts only (streak, standard, planned tasks, planner). The pick is made on the server from owner-only rows and loaded by /today, not by the app layout; no realtime.
Reason: The reminder only works if it is the user's own direction; random or generated phrases are noise and erode trust. The fallback makes the card useful on day one while leaving control to the user; the database guarantees the "one" so no client bug can show two.
Status: Accepted.

# ADR-061 — Top 3 points to real daily tasks (`daily_tasks.priority_rank`)

Decision: The Top 3 is a nullable rank 1..3 on today's `daily_tasks`, unique per owner and date (partial unique index), set only through the INVOKER function `set_my_priorities(ids)` (or a direct update, same constraints). No separate priorities table, no copied title or status. Completion and skip keep the rank; deleting the task removes it; closed days are frozen by the Stage 9 guard; RLS is unchanged (a private task stays private). Nothing is chosen automatically.
Reason: A second list would drift from the real tasks and double the model; a column on the task keeps one source of truth and inherits ownership, privacy and history rules for free.
Status: Accepted.

# ADR-062 — The morning is an inline card once per user and local day; device marks are user-scoped

Decision: The Stage 8 full-screen briefing becomes an inline card at the top of Today, shown on the first open of the local day (database `my_today()`), closable, never a modal and never restored; the greeting follows the daypart in the user's timezone. "Already shown" marks live in `locked-in:v2:<userId>:daily` (briefing and weekly notice), validated in `src/lib/resume-state.ts`; the V1 unscoped `li:briefing-shown` / `li:weekly-shown` are removed on first read and never trusted; sign-out clears the user's marks.
Reason: A blocking screen every morning is irritating and hides Today; a card keeps the task list reachable. Unscoped keys let one account's "already seen" silence another account on the same browser.
Status: Accepted.

# ADR-063 — One repeat for PostgREST's spurious "JWT issued at future" (ISSUE-001)

Decision: Every Supabase client of the app (server, proxy, browser) uses one fetch, `src/lib/supabase/fetch.ts`, that repeats a request **exactly once, immediately, with the same URL, headers and body** when — and only when — PostgREST answers `401` with `code = PGRST303` and message "JWT issued at future". Every other response, including every other 401, is returned untouched, and a second rejection is returned as is. When the `(app)` layout still fails, `isSessionRejected()` asks once (same cookies, `server_now()`): no claims or a 401 means the database refuses the session and the user goes to `/login?reason=session` ("Sua sessão expirou…"); anything else stays a real error. The proxy never bounces that one login URL to `/today`, so the two cannot loop. (Numbered 063 so it does not collide with Phase 4's ADR-060…062.)
Reason: Production logs of 2026-09-29 (13:06:01 server render, 17:11:34 browser) show one request of a parallel batch refused with PGRST303 while its siblings, sent the same millisecond with the **same** JWT (valid for another 45 min), got 200; the 79-byte body is exactly "JWT issued at future". Both happened on the first REST traffic after PostgREST had been idle while a new token was issued (browser refresh 12:51 → render 13:06; 16:38 → 17:11), never after idle gaps where the token pre-dated the gap: PostgREST's cached clock was behind the new token's `iat`. The proxy → render cookie path was verified correct (one refresh, the render gets the new session, all parallel queries carry one token), so the session was never stale. A general retry, a sleep, a reload or ignoring 401 would hide real expiries; this repeat is limited to one error that a valid token cannot deserve, is safe for POST (PostgREST rejects the JWT before running anything) and is bounded.
Status: Accepted.

# ADR-064 — Goal links live in owner-only side tables (tasks, routines); a column on focus

Decision: A task's and a routine's goal live in `daily_task_goals` / `routine_item_goals` (one goal per action, composite FKs `(action, owner)` and `(goal, owner)`, owner-only RLS), not in `daily_tasks.goal_id` / `routine_items.goal_id`. The focus link is `focus_sessions.goal_id`. A routine's goal is copied to each occurrence when it is generated (snapshot); later changes never rewrite past occurrences.
Reason: The partner reads shared `daily_tasks` / `routine_items` rows and RLS cannot hide a column, so a goal id there would leak a private goal. `focus_sessions` is already owner-only (the partner reads `partner_current_focus()` only). The composite FKs make a link to another user's action or goal structurally impossible; the snapshot keeps history true to what the user chose at the time.
Status: Accepted.

# ADR-065 — Proof is derived from the source tables; no manual proof, no cache

Decision: Proof = completed linked `daily_tasks` (1 action each) + completed linked `focus_sessions` (their effective `actual_focus_seconds`) + completed `goal_milestones` (1 each), read by two INVOKER functions (`my_goal_proof_summaries`, `my_goal_proofs`). There is no proof table, no stats / cache table, no view, and no "add proof" with free text. A routine is never proof by itself — only its completed occurrences (no double count). Skipped, missed, active and paused are not proof.
Reason: Same philosophy as Stage 7 (ADR-037): a derived number cannot disagree with its source, and "proof over hype" means only what LOCKED IN recorded counts.
Status: Accepted.

# ADR-066 — Only active goals take new actions; history stays with any status

Decision: New or changed links (task, routine, focus) must point at one of the owner's ACTIVE goals (`LI_GOAL_INACTIVE` otherwise, the same answer for another user's or a missing goal). Achieved and archived goals keep all their proof; reactivating a goal lets it take actions again; deleting a goal removes its links (tasks, focus and history stay). Still no percentage (ADR-059): the screens show evidence, not completion.
Reason: An achieved or archived goal is closed direction; its record must stay, but new work belongs to a current goal. A percentage without an explicit measurable target would be invented.
Status: Accepted.

# ADR-067 — A focus session's goal can change while it runs; fixed once completed

Decision: TRABALHANDO EM is chosen at start (or pre-selected from a linked task / INICIAR FOCO) and may be changed while the session is active or paused; once completed, `goal_id` is fixed (`LI_FOCUS_FINISHED`) and that final goal is the proof. Never on a closed day. `start_focus_session` gained a trailing `p_goal_id default null` so the old call keeps working during the rollout.
Reason: People realise mid-session what they are really working on; a completed session is history.
Status: Accepted.

# ADR-068 — Goal metadata never reaches the partner

Decision: The partner may see EM FOCO and the titles of tasks I share, never a goal: no goal column in `partner_current_focus()`, no goal id or title in any broadcast, feed event or reaction, owner-only link tables. The "active goal" check compares the owner explicitly (`private.goal_is_active(goal, owner)`) instead of relying on RLS inside a trigger (a trigger plan cached while trusted code ran could skip RLS).
Reason: Goals, vision and the mirror are private (ADR-058); linking actions to them must not become a side channel.
Status: Accepted.

# ADR-069 — Commitment status is materialised, MISSED is derived at the owner's day close

Decision: A commitment stores `active` / `proven` / `cancelled` plus the proof fields; triggers on `daily_tasks` and `focus_sessions` re-resolve the owner's open commitments from the real sources while the owner's day is open. Once the day is closed (`private.history_locked_through(owner)`, the Stage 9 boundary) the row is frozen — the lifecycle trigger keeps the old values even for trusted code, and a client status change gets `LI_HISTORY_LOCKED`. MISSED is never stored: an ACTIVE commitment of a closed day is returned as `missed` by `duo_commitments()`.
Reason: Deriving the status on every read would let a closed result move (a late completion of a paused focus session, a standard change); materialising it with the same boundary as the rest of the app makes "after the close the result is immutable" a database fact. Deriving MISSED needs no cron.
Status: Accepted.

# ADR-070 — The public commitment and its private proof source are separate

Decision: `commitments` holds only public fields (title written for the partner, kind, status, proof kind and time); the task behind a `task` commitment lives in the owner-only `commitment_sources`. No commitment column, function output, feed event or broadcast carries a task id, a goal or a private title. The partner's interface rows go through `partnerProjection()`.
Reason: The partner reads commitment rows through RLS and RLS cannot hide a column; a source column would leak a private task (and through Phase 5 links, a goal).
Status: Accepted.

# ADR-071 — Commitments belong to the duo they were made to; the standard is snapshotted

Decision: The database sets `duo_id` (current complete duo, `LI_NO_PARTNER` otherwise); ending the duo sets it to null (the owner keeps the history, the ex-partner loses it, a new partner never gets it). The partner reads only commitments whose `duo_id` is their current duo. A `standard` commitment snapshots the Daily Standard in force when it is made and uses exactly the existing rule `completed·100 ≥ standard·planned`.
Reason: Same isolation rule as planner events (ADR-057). The snapshot keeps a promise from changing after it was made, as challenges do (ADR-044); the rule itself is not duplicated or altered (pgTAP compares it with `private.standard_met`).
Status: Accepted.

# ADR-072 — Commitments without verifiable proof are self-declared, never a second score

Decision: A `simple` commitment is proven only by its owner's CUMPRI and is stored and shown as `self_declared` / AUTODECLARADO (verified kinds are `verified` / COM PROVA). Nothing ranks, scores or weighs the two differently in this phase.
Reason: "No hype. Just proof." — the product never presents a claim as proof, but people still promise things LOCKED IN cannot observe. Scoring belongs to a later phase.
Status: Accepted.

# ADR-073 — Nudges and check-ins are limited in the database; one DEFINER broadcasts

Decision: DAR UM TOQUE has no text and is limited by a BEFORE INSERT trigger (never on my own, only ACTIVE on an open day, 1 per commitment every 2 h, at most 3 per recipient-local day to the same partner, advisory lock per pair). Check-ins are append-only rows (latest of the day wins, at most 30 changes per day). `private.sync_accountability` (SECURITY DEFINER, callable by nobody) writes the feed line of a proven commitment and sends `commitment_changed` / `nudge_received` / `checkin_changed` on `duo:<duo_id>` with ids and status only — the 19th function of the reviewed DEFINER set.
Reason: Limits enforced only in the client are not limits; `realtime.send` and `activity_events` are not writable by users, so broadcasting needs one trusted trigger, following `sync_planner_event` (ADR-057).
Status: Accepted.

# ADR-074 — The daily duel is derived, never stored; one DEFINER reads both sides

Decision: `public.duo_duels(p_days)` derives each day's duel inputs from `daily_tasks` and `focus_sessions` for both members of the current duo (the partner's private tasks and sessions count, like `duo_weeks`), returning dates, integers and booleans only. There is no duel, score or winner table; categories and the result are decided by `src/lib/duel.ts`. `private.duel_side` is an INVOKER helper no API role can execute. `duo_duels` is the 20th function of the reviewed DEFINER set.
Reason: The closed-day guards of Stage 9 already freeze every input of a past day, so a derived duel cannot drift from its sources and needs no materialisation (ADR-037). Reading the partner's private rows needs a trusted function, exactly as the weekly competition.
Status: Accepted.

# ADR-075 — Duel categories reuse existing definitions; more categories won decides the day

Decision: Execution = completion ratio (exact `compareRatio`, both sides need tasks). Focus = effective focus seconds of the day (`private.focus_seconds`, pauses never count), compared exactly; **both at 0 seconds is NEUTRAL / not comparable**, never a tie (official rule, 2026-10-01). Consistency (official rule, 2026-10-01) = each member's Daily Standard of that day with `standardMet()`: MET beats NOT_MET, equal states tie, a NEUTRAL side is not comparable. The day goes to the side with more categories won; equal counts tie; nothing decided is SEM RESULTADO SUFICIENTE. No weights or points.
Reason: "No hype. Just proof." — every number in the duel is one the user already sees elsewhere. The absence of focus is not evidence: counting 0 × 0 as a tie would let an empty category make up the minimum needed to declare a result. Exact seconds avoid any rounding rule; the detailed view shows the seconds so a narrow win stays visible.
Status: Accepted (revised 2026-10-01: exact seconds, 0 × 0 neutral).

# ADR-076 — Final only when the day is closed for both; the Standard of the day is versioned

Decision: A duel is FINAL when its date is `<= private.history_locked_through()` for both members and no focus session of that date is still running; otherwise it is LIVE and shows only ESTÁ NA FRENTE / EMPATE / SEM RESULTADO SUFICIENTE. VENCEU O DIA exists only on a final duel. Consistency uses the Daily Standard **in force on that day**: an open day the current value (a change while the day is open moves only that open day), a closed day its recorded version (ADR-078). Changing the standard later — mine or my partner's, before or after a timezone move — never changes the Consistency, score or winner of a FINAL duel.
Reason: Members can live in different time zones and a session can cross midnight; a result shown before both days are closed could flip. A final result must be historically stable; reading a single current value (ADR-038) would let a later settings change rewrite it.
Status: Accepted (revised 2026-10-01: replaces the earlier "the standard is read as it is now" limitation).

# ADR-077 — The live duel ticks locally; the partner side is re-read on events

Decision: `duo_duels` returns settled focus plus a running flag; the client adds the running session's elapsed time from the clock already on screen (my session, `partner_current_focus()`). My side of today comes from the screen (tasks, focus, standard). The partner's side is re-read with the duo numbers on `partnerVersion` and on the partner's focus transitions (the existing `focus` broadcast). No new channel, broadcast or timer that fetches.
Reason: Same contract as Progress (my numbers live, the partner's re-read after realtime) and Focus (never send a timer value).
Status: Accepted.

# ADR-078 — The Daily Standard keeps effective versions per local day

Decision: `public.daily_standard_history (user_id, effective_from, standard_percent)` holds a baseline (`-infinity`, the value known at the Phase 7 migration or at signup) and one version per local day on which the standard changed. `private.record_daily_standard` (SECURITY DEFINER trigger on `profiles`, callable by nobody) upserts the owner's local-today version on every change; clients have no write grant (owner SELECT only). `private.standard_on(user, day)` returns the current value for an open day and the newest version `<= day` for a closed day. The duel reads it; the formula stays `standardMet` / `private.standard_met`. The streak is analysed and left on the current standard (ADR-038) so no existing streak changes silently.
Reason: The only place where a past standard must be stable is a final duel. Versions dated only on the local today can never land on a closed day, because the Stage 9 boundary never moves back (also on a timezone change). Days before the migration read the baseline — a documented pre-Phase-7 limitation.
Status: Accepted. The 21st function of the reviewed DEFINER set.

# ADR-079 — The first duel day is stamped on the duo when it becomes complete

Decision: `duos.duel_since` is set by `private.stamp_duel_since` (INVOKER trigger on `duo_members`, which only `join_duo` and fixtures write) to the later of both members' local dates at the moment the second member joined; it is recomputed only if `joined_at` changes, never on a timezone change. `duo_duels` starts there. Clients cannot write it (no grant on `duos`).
Reason: Computing the start from each member's current timezone (`private.duo_together_since`) let a timezone move hide a FINAL duel or expose a pre-duo day (found by pgTAP). Partner reads of shared tasks still use `duo_together_since` (unchanged, out of scope).
Status: Accepted.

# ADR-080 — The Monthly Champion counts Daily Duel wins; the client decides with the duel rules

Decision: A month's score is literally the number of FINAL daily duels each member won; draws are counted apart and SEM RESULTADO SUFICIENTE days count for nobody. No points, weights or XP. `public.duo_duel_months(p_months default 6)` (SECURITY DEFINER, the 22nd function of the reviewed set) returns, for the current month of the caller's local today and up to `p_months − 1` (≤ 11) months before it, **the same per-day numbers as `duo_duels`** — built on `private.duel_side` / `private.standard_on`, from `duos.duel_since`, dates / integers / booleans only. Each day is decided by the existing `decideDuel` and the month by `decideMonth` in `src/lib/monthly.ts`.
Reason: The Daily Duel stays the unit: porting its rules to SQL would create a second competition to keep in sync. The database owns which days exist, which are FINAL and every number (pgTAP); the decisions are pure and unit-tested; e2e compares the screen with both.
Status: Accepted.

# ADR-081 — A month needs 3 official duels; live months have no champion

Decision: An official day is a FINAL win or draw. Fewer than 3 in a month → SEM RESULTADO SUFICIENTE (also no live leader). A month is FINAL only when its last calendar day is a FINAL duel (closed for both members, nothing running — the Phase 7 closing, no new concept); before that it is MÊS · AO VIVO (ESTÁ NA FRENTE / EMPATADOS / SEM RESULTADO SUFICIENTE AINDA). CAMPEÃO DE <MÊS> / EMPATE DO MÊS only on a final month.
Reason: One day is not a month. A live month can still change; a champion shown early could flip. The same minimum live and final keeps one rule.
Status: Accepted.

# ADR-082 — Monthly tiebreaks: execution, then effective focus, then draw

Decision: Equal daily wins → monthly Execution `Σ completed / Σ planned` over the FINAL days of the month where **both** had tasks (Execution comparable), compared exactly (cross-multiplication) → equal or not comparable → total effective focus seconds of the FINAL days (pauses never count) → equal → EMPATE DO MÊS. No fourth tiebreak. The deciding rule is always written next to the result ("Desempate: execução mensal").
Reason: Execution and focus are the duel's own measures; restricting execution to comparable days keeps a day where only one member planned tasks from creating an artificial advantage.
Status: Accepted.

# ADR-083 — No monthly result, record or milestone table

Decision: Months, records and milestones are derived on every read. A FINAL month cannot change because every input of a FINAL day is frozen (closed history, Daily Standard versions, focus fixed at start, `duel_since`).
Reason: ADR-037. A cache could disagree with its source; two users' history is small.
Status: Accepted.

# ADR-084 — Personal records are owner-only and derived

Decision: `public.my_records()` (SECURITY INVOKER, own rows only) returns the best focus day (settled effective focus by `local_date` — a running session is not settled), the best closed Monday–Sunday focus week, the most Perfect Days in a calendar month (closed days, `planned > 0 and completed = planned`), and the totals milestones need. Ties keep the first date / period. The longest streak is the existing one (`my_progress_summary` + today live; ADR-038 unchanged). No count of tasks created / completed is a record. The partner never receives records.
Reason: Records answer "my best so far" — personal, explainable and not gamable by splitting tasks.
Status: Accepted.

# ADR-085 — Milestones are fixed, derived thresholds — no XP, no currency

Decision: MARCOS: streak 7 / 30 / 100 (from the longest streak, so losing the current run takes nothing back), effective focus 10 / 50 / 100 h (settled total, whole hours), Perfect Days 5 / 10 / 30 (closed days). Locked shows progress ("23 de 30 dias"), reached shows CONQUISTADO. No unlock date, no unlock table, no XP, coins, levels, power-ups or duo milestones; celebrations belong to Phase 9.
Reason: A milestone is a fact about the history, verifiable at any time from the same numbers.
Status: Accepted.

# ADR-086 — One owner-only `celebrations` table holds milestone unlocks and celebration receipts

Decision: V2 Phase 9 adds `public.celebrations (owner_id, kind, key, achieved_at, source_value, baseline, seen_at)`, primary key `(owner_id, kind, key)`. `milestone` rows are unlocks: the INVOKER guard validates them against the real numbers (`private.milestone_value`) and stores the value at unlock; `perfect_day` rows (today only, while perfect) and `monthly` rows (a month that has ended) are receipts. Clients insert `(kind, key)` and update `seen_at` only; the database stamps the rest; nothing is deleted. Progress shows a milestone CONQUISTADO when `value ≥ target` **or** it is unlocked. This revises ADR-083 / ADR-085 only for unlocks: months, records and milestone progress are still derived.
Reason: Reaching a milestone is a historical event — a later history reset or Daily Standard change must not take it back, and "shown once" must hold across devices. One table for unlocks and receipts keeps one model, one guard and one `seen_at`.
Status: Accepted.

# ADR-087 — Baseline: milestones reached before Phase 9 are recorded as seen

Decision: The migration calls `private.baseline_milestones(user)` for every profile: every milestone already reached is inserted with `baseline = true` and `seen_at = now()`. The function is callable by no API role (DEV: `dev_fixture_baseline_milestones`).
Reason: Shipping celebrations must not replay months of old achievements as a burst.
Status: Accepted.

# ADR-088 — Celebrations are claimed by the client and validated by the database; no polling, ≈2 s on screen

Decision: The client derives claims from numbers already on screen (`claimsToMake`), sends them 1.5 s after the set changes, retries a refused claim once after 4 s, and shows unseen rows one at a time (Perfect Day → milestones → month) in a non-modal card that closes after ≈2 s (held while pointed at / focused), with motion only under `motion-safe`. Monthly: only the most recent FINAL month I won or drew, ended within 7 days. No trigger-side celebration, no channel, no timer that fetches.
Reason: The database cannot know when the user looks at the app; the client cannot be trusted with the facts. Claim-then-validate keeps both honest without background work.
Status: Accepted.

# ADR-089 — Non-negotiables live in owner-only side tables, snapshotted per occurrence, with no weight

Decision: `daily_task_non_negotiables` and `routine_non_negotiables` (Phase 5 pattern, composite FKs, owner-only). A routine's flag is copied onto each generated occurrence (trigger after insert on `daily_tasks`) and follows today's occurrence; a closed day's flag is frozen. No column on `daily_tasks` / `routine_items`; no effect on completion, Daily Standard, streak, duel, month, records or milestones; shown as "◇ NÃO NEGOCIÁVEL" and "NÃO NEGOCIÁVEIS x / y" in reviews.
Reason: The partner reads task rows; a flag there would leak. A weight would change every competitive number.
Status: Accepted.

# ADR-090 — Weekly priorities: 3 per week, this and next week, self-declared, saved at once

Decision: `public.weekly_priorities` (owner-only): positions 1..3 per Monday week, open / done (`done_at` by the database), current and next week editable, closed weeks frozen (`LI_HISTORY_LOCKED`), further ahead `LI_WEEK_TOO_FAR`. `/plan/week` under PLANEJAR (one row on the hub), no draft (each change saves at once), nothing on Today. Never proof, never competitive.
Reason: A plan for the week the user already reasons in, with the same history rule as everything else.
Status: Accepted.

# ADR-091 — Reviews 2.0: optional owner-only reflections + facts from `my_review_facts`

Decision: `public.reviews (owner_id, kind day|week, period_start, worked, hindered, change_next)`, ≤ 500 characters, empty = null, never for a future period. `public.my_review_facts(from, to)` (SECURITY INVOKER, ≤ 31 days, capped at today) derives the facts from `private.day_stats`, the Perfect Day definition, the standard in force on each day (the `private.standard_on` rule inlined, because `standard_on` is not executable by `authenticated`) and the non-negotiables. The existing Day / Weekly Reviews show them; `my_records()` now delegates to `private.records(user)` (same results; the function body changed). No AI, no generated text.
Reason: Reflection closes the loop; facts must be the same numbers as everywhere else, and an INVOKER function keeps the reviewed DEFINER set at 22.
Status: Accepted.

# ADR-092 — Web Push is opt-in per device, from Settings only

Decision: The browser permission prompt runs only from Configurações → "Ativar neste dispositivo". One `push_subscriptions` row per device / browser (endpoint unique, only known push services), upserted on re-registration; "Desativar neste dispositivo" deletes it and unsubscribes. No device is enabled silently; existing users start with no device. The state is written out (Ativas / Desativadas / bloqueadas / não suportado / instale na Tela de Início / indisponível).
Reason: An unrequested prompt is noise, and a push must be something the user asked for on that device.
Status: Accepted.

# ADR-093 — Sign-out and shared devices: the device's subscription goes with the session

Decision: The sign-out form carries this device's endpoint and `/auth/signout` deletes that row (RLS: own row only) before ending the session; the browser unsubscribes. On every signed-in open, a browser subscription that is not the signed-in user's (or was made with another server key) is unsubscribed. Taking over another user's endpoint is refused by RLS (`42501`) and the client subscribes afresh.
Reason: B must never receive A's private pushes on a shared browser, also when A's session ended without Sair.
Status: Accepted.

# ADR-094 — One scheduler: Supabase pg_cron → SQL enqueue → pg_net → Edge Function

Decision: `pg_cron` runs `private.push_tick()` every minute: it enqueues due deliveries in SQL and calls the Edge Function `push-dispatch` through `pg_net` only when something is pending. The function is authenticated by a secret generated inside the database (Vault) and reaches the database with the platform's `SUPABASE_DB_URL`. No Vercel Cron, no browser scheduler, no service-role key in Vercel.
Reason: The data and the clock are in Postgres; Vercel Hobby cron runs once a day; one auditable path with no secret typed by anyone.
Status: Accepted.

# ADR-095 — Exactly one delivery per logical event

Decision: `notification_deliveries` with `unique (user_id, dedup_key)` (`planner:<event>:<n>:<date>`, `nudge:<id>`, `review-day:<date>`, `review-week:<monday>`, `plan-week:<monday>`, `test:<second>`), claimed with `FOR UPDATE SKIP LOCKED`, released after 5 minutes if a run dies, retried with backoff on 429 / 5xx / network (failed after 5), 404 / 410 delete the device, expired rows are never sent, 30-day retention. No payload stored.
Reason: The scheduler is at-least-once; the user must see each reminder once.
Status: Accepted.

# ADR-096 — Quiet hours defer, expiry wins

Decision: The existing `user_settings` quiet hours (same rule as `inQuietHours`) hold a due reminder back; it is created when the window ends only if it is still before its expiry (event start, end of the day / week) and less than 24 h late. Planner reminders keep `reminder_days_before` (08:00 of the reminder day), and on the day of a timed event go at most 2 h before it. The test notification ignores quiet hours.
Reason: A late "Prova amanhã" after the exam began is worse than none.
Status: Accepted.

# ADR-097 — Payload privacy and copy

Decision: The text is built at send time in `supabase/functions/push-dispatch/message.ts` (pt-BR, deployed with the function — the one copy outside `src/i18n/pt-BR.ts`) from the fields `private.push_claim` returns: planner title / type / days / time, the partner's name and the commitment title for a nudge. Never a goal, vision, mirror, reflection, non-negotiable or private task. "Ocultar detalhes" sends generic text. The payload is `{k, t, b, r, g}`, encrypted end to end; logs carry counts only.
Reason: A lock screen is public; the function runs outside the Next.js bundle.
Status: Accepted.

# ADR-098 — A notification opens a whitelisted route

Decision: The payload carries a route key (`today`, `partner`, `planner`, `plan-week`, `progress`, `settings`), mapped by the service worker and the app (`routes.ts`, kept equal by a unit test); anything else opens `/today`. The click focuses an open LOCKED IN window and navigates it, or opens one; the explicit route beats Resume State.
Reason: A URL from a payload (or a compromised sender) must never steer the app.
Status: Accepted.

# ADR-099 — One service worker: push + offline page, no data cache

Decision: `public/sw.js` (scope `/`, `no-store`, `skipWaiting` + `clients.claim`) handles push, notification clicks and, for failed page navigations only, a static `/offline` page (copy from `pt-BR.ts`). It caches nothing else — no page, API, Supabase, auth response or token. VAPID: generated by the Edge Function into Vault; the public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; the subject is the site URL. Web Push crypto (RFC 8291 / 8292) is implemented on WebCrypto and checked against the RFC test vector, without an npm push library.
Reason: An offline-first cache would show stale private data and risk serving one user's pages to another; the app must fail clearly offline, not silently.
Status: Accepted.

# ADR-100 — One token set; arbitrary values are bugs

Decision: Final V2 design pass. Colour, type (13 rem sizes), letter spacing (4 roles), radius (6
steps), lines (3 roles) and easings live only in `src/app/globals.css` `@theme`; components use their
utilities and the `page-title` / `eyebrow` utilities. A codemod moved 1346 arbitrary values onto the
tokens. `quiet` merged into `dim`; `ghost` / `faint` / `off` are non-text only. Surfaces lifted to a
deep graphite (`bg #0c0c0e`). docs/DESIGN_SYSTEM.md is the reference; the Claude Design keeps the IA.
Reason: 44 font sizes and 22 radii made every screen look slightly different and impossible to keep
consistent.
Status: Accepted.

# ADR-101 — Green means proof

Decision: `accent` marks done work, progress, the one primary action and the brand — nothing else.
Done tasks settle to a quiet green (`accent-strong` + green check) after a short bright beat; only the
current tab has a filled pill; streak warmth is `streak` (amber) and focus time `focus` (cool).
Reason: When everything is green, nothing is proof.
Status: Accepted.

# ADR-102 — Rook, the mascot, is decorative and scarce

Decision: ROOK (docs/ROOK.md) is an original SVG component built from the owner-approved character
sheet, LOCKED green instead of the sheet's emerald. `aria-hidden` unless labelled; at most one per
screen; never on rows, cards, navigation or beside the running Focus timer; appears at onboarding,
important empty states, the morning on Mondays / day 1, push setup, reviews, Focus start / end and
celebrations. No raster, no animation library (CSS transitions on part transforms).
Reason: Personality where it adds meaning; scarcity keeps it valuable; no bundle cost (+3.3 KB gzip
for the whole pass).
Status: Accepted.

# ADR-103 — Celebrations staged by rarity, on the Phase 9 contract

Decision: `momentFor()` maps a celebration row to a card or a stage (Rook + the Ring / clock ring /
crest of light). Unchanged: once per row (database `seen_at`), one at a time, non-modal
`role=status`, held while read, motion-safe with a final frame under reduced motion. Changed: the
stage stays 3.2 s and closes with CONTINUAR. No unlock rule changed.
Reason: Rare = special (the peak-end rule) without breaking the factual, non-blocking contract.
Status: Accepted.

# ADR-104 — Reduced motion replaces movement, keeps feedback

Decision: Under `prefers-reduced-motion` keyframes jump to their end, transforms change instantly and
only colour / opacity / stroke transition. No in-app animation switch: the system setting is the single
source.
Reason: WCAG 2.3.3 and web.dev guidance — remove vestibular triggers, not the confirmation that an
action worked.
Status: Accepted.

# ADR-105 — Rook acts on proof: Proof Core states and one-shot actions

Decision: `Rook` gains `core` (off / idle / active / proof / milestone), `act` (ack / tap / lock,
replayed by `actKey`) and `idle` (Focus: an occasional blink), all as data attributes animated by
CSS keyframes on the named parts with individual `rotate` / `translate` / `scale`. Today shows one
small Rook beside the greeting that acknowledges every task proved; Focus keeps a still, locked-in
Rook during the session (amends ADR-102: he no longer leaves the timer, but nothing but a blink
moves); duo toasts carry a 32 px Rook. Native SVG + CSS — no Rive, Lottie or animation library.
Reason: The character should respond to real actions while staying calm and cheap.
Status: Accepted.

# ADR-106 — Celebration stories by rarity

Decision: Each celebration kind plays its own frames (`STORIES` in `Celebration.tsx`, local timers,
last frame at once with reduced motion): Perfect Day (the screen dims for a beat), 7 days
(anticipation → Core charge → wings → Ring → badge → settle; now a stage), 30 days (+ inner ring,
Core stays MILESTONE), 100 days (silhouette → Core ignition → reveal → strong Ring → badge → "100
DIAS DE PROVA."), focus (clock ring), Perfect-Day milestones, the month (rook-tower crown) and the
draw. Stages stay 4.2 s. The ordinary day's streak moment is a ring around the number on Today. The
Phase 9 contract (once, non-modal, held while read) and every rule are unchanged.
Reason: Rare = special without making the same animation bigger.
Status: Accepted.

# ADR-107 — V3 mobile pass: Expressive Discipline evolved

Decision: Of three directions prototyped on HOJE / DUPLA / FOCO at 390 px (A — Expressive Discipline
evolved, B — Tactile Discipline, C — Focused Premium; docs/DESIGN_DIRECTION_V3.md), A is applied
with one idea from B. Today points at **one next task** in place (`nextTaskId`, Top 3 first, then
list order; a visual PRÓXIMA label, not a duplicate row) and its bar has **one segment per task**
(≤ 24; a continuous bar above). The primary action is the only element with depth (`btn-primary`:
a darker green edge it sinks onto when pressed); every primary button uses it. FOCO's Pausar /
Encerrar are real 56 px buttons. Phones read the daily duel as two lines per category. An empty
head-to-head leads with its sentence and shrinks. A sparse trend chart is shorter and says why. LOCK
IN stays pinned on Today until the aside sits beside the tasks (`wide`). Tab labels drop to 10 px
under 360 px. No rule, query, migration, auth, RLS, API, streak, duel, focus or realtime logic
changed.
Reason: The audit found a consistent base, so a new identity would have cost recognition for no
gain; the gaps were "what do I do next", tactile feedback on the one action, and layouts that only
worked at 390. B's cards and C's hidden controls conflict with "dark, serious, minimal" and with
visible controls.
Status: Accepted (owner authorised the visual redesign, 2026-10-08).

# ADR-108 — Obsidian Energy: the owner's Claude Design handoff applied

Decision: The visual system is replaced by the owner's Claude Design project "LOCKED IN V3"
(Design System V3 + the interactive prototype, imported from the exported zip): warm charcoal
surfaces, lime proof (`#c5f277`), Archivo (width axis) + JetBrains Mono, Newsreader only on the FOCO
stage. Token names stay (`bg`, `card`, `accent`…), so components keep their classes; new tokens cover
the stage, the done checkbox, the partner's bar and the calendar heat. Applied: Proof Pills on Today,
the check on the right edge of task rows (the text opens the options), a floating tab bar, LOCK IN
naming the PRÓXIMA task and opening the sheet on it, the duel as an avatar scoreboard with share bars,
the ink FOCO stage, the V3 calendar heat and chart, the new mark and app icons, and the button / field
/ switch standards on every screen. Copy that tests and screen readers depend on (greeting, counts,
headings, button names) is unchanged.
Not applied (behaviour, not visuals): a confirmation before Encerrar, a profile menu as a sheet, the
reordered PLANEJAR hub and new copy in the prototype. No rule, query, migration, auth, RLS, API,
streak, duel, focus persistence or realtime logic changed; `categoryShare` and `dayPills` are pure
presentation helpers with unit tests.
Reason: Owner's explicit instruction to apply this design to every screen without breaking anything.
Status: Accepted (2026-10-08). Evidence: docs/DESIGN_OBSIDIAN_V3.md.
