# Architecture

Small app, two users, one backend. Keep it that way.

```
        Next.js (App Router) / React
                    │
               Supabase SDK
         ┌──────────┼──────────┐
       Auth      Postgres    Realtime (+ Presence)
                    │
                  Vercel
```

## Stack

| Layer                  | Choice                                                         |
| ---------------------- | -------------------------------------------------------------- |
| Framework              | Next.js (App Router), React                                    |
| Language               | TypeScript, `strict`                                           |
| Styling                | Tailwind CSS v4 (tokens in `src/app/globals.css` via `@theme`) |
| Backend                | Supabase only: Postgres, Auth, Realtime, Presence              |
| Hosting                | Vercel                                                         |
| Icons / dates / charts | Lucide React, date-fns, Recharts (added when first used)       |
| Tests                  | Vitest (unit, jsdom), Playwright (e2e, mobile viewport)        |
| Lint / format          | ESLint (next core-web-vitals + typescript) + Prettier          |

Exact versions: [DECISIONS.md](DECISIONS.md) (ADR-002) and `package.json`.

Not used, by decision: Prisma, Drizzle, Express, NestJS, Redis, Firebase, Redux, any second backend.

## Project structure

```
locked-in/
├── src/
│   ├── app/            # (app)/ private screens: today, partner, focus, progress, more, routine,
│   │                   #   challenges, duo, settings, onboarding; (app)/actions.ts (duo, profile),
│   │                   #   (app)/task-actions.ts (tasks, routine)
│   │                   # (auth)/ login, signup, forgot-password, reset-password; (auth)/actions.ts
│   │                   # auth/confirm (email links), auth/signout (POST); `/` redirects to /today
│   ├── proxy.ts        # Next 16 proxy: session refresh + route protection
│   ├── components/     # session.tsx (real identity), use-tasks.ts (real tasks / routine),
│   │                   #   duo-realtime.tsx (private duo channel: presence, feed, partner day),
│   │                   #   use-focus.ts, use-progress.ts (real progress / competition),
│   │                   #   app-state.tsx (composes the real parts + the last mocks), auth/,
│   │                   #   shell/, screens/, today/, sheets/, overlays/, focus/, ui.tsx, icons.tsx
│   ├── hooks/          # client hooks (empty so far)
│   ├── lib/
│   │   ├── mock-data.ts   # remaining mock data (challenges) + product constants
│   │   ├── progress.ts    # progress / streak / competition maths (pure, unit-tested; docs/ANALYTICS.md)
│   │   ├── progress-data.ts # loadProgress(): summary, series, habits, duo weeks (server)
│   │   ├── session.ts     # loadAppData(): session + today's tasks + routine + duo data, server only
│   │   ├── duo-data.ts    # loadDuoData(): feed + partner's day (server and browser clients)
│   │   ├── realtime-model.ts # presence aggregation, feed merge / dedupe, connection state (pure)
│   │   ├── local-date.ts  # local dates, ISO weekdays (1 = Mon … 7 = Sun), labels
│   │   ├── task-model.ts  # row <-> UI mapping, categories, validation, task error copy
│   │   ├── templates.ts   # routine templates (product constants)
│   │   ├── auth-routes.ts # public / guest-only paths, safe `next` redirects
│   │   ├── auth-errors.ts # Supabase Auth error codes -> friendly copy, password rules
│   │   ├── invite-code.ts # invite code normalisation, duo RPC error copy
│   │   ├── today.ts       # pure Today derivations (completion, sections, schedule labels)
│   │   ├── partner.ts     # pure partner status view
│   │   ├── format.ts      # time formatting
│   │   └── supabase/   # client.ts (browser), server.ts (server), proxy.ts (session refresh), env.ts
│   ├── types/          # shared TS types; database.ts generated from the schema
│   └── styles/         # extra CSS if globals.css grows too large
├── supabase/
│   ├── migrations/     # SQL migrations (source of truth, see docs/DATABASE.md)
│   ├── tests/          # pgTAP security tests
│   └── dev/            # DEV-only helpers (create / reset test users)
├── tests/
│   ├── unit/           # Vitest
│   ├── e2e/            # Playwright: auth.setup.ts (seed + sign-in), app.spec.ts, stage3/4.spec.ts
│   └── fixtures/       # test fixtures (the design's Today)
├── docs/               # product, architecture, design reference, roadmap, decisions, progress
├── design-reference/   # Claude Design export — read-only
└── public/             # static assets
```

Empty folders hold a `.gitkeep` until they get real code.

## Frontend → Supabase flow

- The browser talks to Supabase directly with the **publishable key**; security is enforced by
  **Row Level Security** in Postgres, not by hiding endpoints.
- Server Components / Route Handlers / Server Actions use a server client built with `@supabase/ssr`
  that reads the auth session from cookies.
- No custom API layer unless a real need appears (e.g. an operation that needs a secret key; that
  would be a Route Handler or Supabase Edge Function, never client code).

## Client / server separation

Route `page.tsx` files are Server Components that render one client screen. `src/app/(app)/layout.tsx`
(Server Component, dynamic because it reads cookies) calls `loadAppData()`: `getClaims()`, then in
parallel the profile / duo / member queries, `ensure_my_daily_tasks()` → today's `daily_tasks` +
active `routine_items`, and `loadDuoData()` → the duo feed (20) + `partner_today()` + the partner's
shared tasks. It mounts:

- `SessionProvider` (`src/components/session.tsx`) — **real**: user id / email, profile (name,
  timezone, since), duo (invite code) and partner (name). Refreshed by Server Actions that revalidate
  the layout.
- `DuoRealtimeProvider` (`src/components/duo-realtime.tsx`, ADR-031) with the duo data — **real**:
  the private `duo:<id>` channel, partner presence, connection state, feed and partner's day
  ([REALTIME.md](REALTIME.md)).
- `AppStateProvider` (`src/components/app-state.tsx`, ADR-008) with `initialTasks`. It composes:
  - `useTasks()` (`src/components/use-tasks.ts`, ADR-024) — **real**: today's tasks and the routine,
    optimistic updates + Server Actions (`task-actions.ts`) + rollback on error;
  - `useDuoRealtime()` for the partner / feed / connection;
  - `useFocus()` — **real** focus sessions (Stage 6);
  - `useProgress()` (`src/components/use-progress.ts`, ADR-041) — **real** standard, streak,
    progress series, weekly competition and head-to-head (Stage 7);
  - **mock** product state: reactions and challenges (Stage 8). Identity comes from `useSession()`
    (ADR-017).

A reload always renders from the database; there is no client cache of tasks. Realtime only makes
the partner's changes arrive without a reload (ADR-030).

- Default to **Server Components**; add `"use client"` only for interactivity (checkboxes, timers,
  realtime subscriptions, sheets).
- `src/lib/supabase/client.ts` → `createBrowserClient` (client components only).
- `src/lib/supabase/server.ts` → `createServerClient` with `cookies()` (server only, one per request).
- `src/proxy.ts` → `src/lib/supabase/proxy.ts`: `getClaims()` on every request validates and refreshes
  the session cookie, then redirects signed-out users away from private paths and signed-in users away
  from `/login`, `/signup`, `/forgot-password`.

## Auth strategy (Stage 3, ADR-014)

Supabase Auth, email + password, cookie sessions via `@supabase/ssr`. Email confirmation is on.

| Flow           | Path                                                                                  | Notes                                                          |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sign up        | `/signup` → email → `/auth/confirm`                                                   | name, email, password × 2; timezone from `Intl` in the browser |
| Sign in        | `/login?next=…`                                                                       | `next` must be a same-site path (`safeNext`)                   |
| Forgot / reset | `/forgot-password` → email → `/auth/confirm?next=/reset-password` → `/reset-password` | response never reveals whether the email exists                |
| Sign out       | POST `/auth/signout`                                                                  | from Settings                                                  |

Public paths: `/login`, `/signup`, `/forgot-password`, `/auth/*`. Everything else is private.
Each user has a profile row created by a database trigger; a **duo** links exactly two profiles
through an invite code (`LKD-XXXXXX`). Schema, RLS and functions: [DATABASE.md](DATABASE.md).

## Realtime strategy (Stage 5)

Implemented; details in [REALTIME.md](REALTIME.md).

- One **private** channel per duo, `duo:<duo_id>`, authorized by RLS on `realtime.messages`.
- **Broadcast from the database** (`realtime.send` in the `daily_tasks` trigger) for feed changes —
  not Postgres Changes, and never full rows.
- **Presence** on the same channel for Online / Offline only (key = user id, once per join).
- Connection state (connected / reconnecting / offline) in the Stage 2 pill. No offline write queue:
  a write that fails while offline is rolled back with a message.
- Verified with two and three real browser contexts (Playwright) and real sockets.

## Focus strategy (Stage 6)

Details in [DATABASE.md](DATABASE.md) (lifecycle, timer maths) and [REALTIME.md](REALTIME.md).

- `focus_sessions` in Postgres is the source of truth; every timestamp comes from the database.
  Invoker RPCs (`start / pause / resume / complete_focus_session`, `my_active_focus`) are called by
  Server Actions in `src/app/(app)/focus-actions.ts`.
- `useFocus()` (`src/components/use-focus.ts`) holds my session, derives the clock from timestamps +
  a server clock offset, queues transitions in order, and refetches on `focus` broadcasts and when
  the tab becomes visible. Start is not optimistic; pause / resume / end are, with rollback.
- Expired sessions are reconciled on demand (no cron). The partner's status is FOCUSING from the
  persistent session, otherwise presence decides ONLINE / OFFLINE (`partnerStatus()` in
  `src/lib/focus.ts`).
- One local 1 s tick only while a clock is on screen; nothing is written, broadcast or tracked per
  second.

## Progress strategy (Stage 7)

Details in [ANALYTICS.md](ANALYTICS.md).

- Every number is derived by SQL functions from `daily_tasks` and `focus_sessions` (no stats
  tables, ADR-037); `loadProgress()` runs with the layout load, `progress-actions.ts` re-reads.
- `src/lib/progress.ts` does the presentation maths (ranges, buckets, calendar, leader, head-to-head,
  habits) on the returned counts; today is added live from local state.
- The partner side is re-read after each realtime refetch (`partnerVersion`); no new realtime
  traffic. The app reloads when the local date changes.

## Mobile-first strategy

- Design baseline is 390×844; must work at 375 and 430. Layout switches to sidebar at ≥ 780px and to
  two columns at ≥ 1180px (see [DESIGN_REFERENCE.md](DESIGN_REFERENCE.md)).
- Tap targets ≥ 44px; primary actions at the bottom within thumb reach.
- Respect `env(safe-area-inset-*)` and `prefers-reduced-motion`.
- Playwright runs on a mobile device profile (Pixel 7) by default.

## Environment variables

| Name                                   | Where           | Notes                                                         |
| -------------------------------------- | --------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | client + server | project URL, public                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | publishable (anon-equivalent) key, public; safe only with RLS |

- Template: `.env.example`. Local values: `.env.local` (git-ignored). `.env.local` points at the
  **DEV** Supabase project.
- Tests: `.env.test.local` (git-ignored) holds `E2E_PASSWORD` and the test-user emails
  ([DATABASE.md](DATABASE.md) → "Test users"). Never commit it.
- Server secrets (secret/service-role key) are never needed by the client. If ever needed, they get a
  name **without** `NEXT_PUBLIC_` and are used only in server code.
- On Vercel, set the same variables in Project Settings → Environment Variables.

## Code organisation rules

- Colocate by feature only when a folder grows; otherwise keep the flat structure above.
- One component per file; name files after the component.
- Types: prefer inferred and generated types (Supabase `gen types`) over hand-written duplicates.
- No global state library. React state + server data + Supabase subscriptions are enough.
