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
