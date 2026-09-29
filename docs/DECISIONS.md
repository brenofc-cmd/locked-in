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
