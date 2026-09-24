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
│   │                   #   app-state.tsx (mock product state + composes the real parts), auth/,
│   │                   #   shell/, screens/, today/, sheets/, overlays/, focus/, ui.tsx, icons.tsx
│   ├── hooks/          # client hooks, e.g. realtime subscriptions (Stage 5+)
│   ├── lib/
│   │   ├── mock-data.ts   # ALL remaining mock data (partner presence / tasks / activity, focus, stats, streak, challenges)
│   │   ├── session.ts     # loadAppData(): session + today's tasks + routine, server only
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
parallel the profile / duo / member queries and `ensure_my_daily_tasks()` → today's `daily_tasks` +
active `routine_items`. It mounts:

- `SessionProvider` (`src/components/session.tsx`) — **real**: user id / email, profile (name,
  timezone, since), duo (invite code) and partner (name). Refreshed by Server Actions that revalidate
  the layout.
- `AppStateProvider` (`src/components/app-state.tsx`, ADR-008) with `initialTasks`. It composes:
  - `useTasks()` (`src/components/use-tasks.ts`, ADR-024) — **real**: today's tasks and the routine,
    optimistic updates + Server Actions (`task-actions.ts`) + rollback on error;
  - **mock** product state: partner presence / tasks / activity, reactions, focus sessions, standard,
    stats, streak, challenges. Identity comes from `useSession()` (ADR-017).

A reload always renders from the database; there is no client cache of tasks. No realtime yet: a
partner sees changes on their next load (Stage 5).

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

- **Postgres Changes** on task check-ins / feed events, filtered to the duo, so the partner's Today and
  activity feed update live.
- **Presence** on a per-duo channel for Online / Focusing / Offline (the only status the partner sees).
- **Broadcast** for ephemeral events such as reactions if they don't need persistence.
- The client shows connection state (connected / reconnecting / offline) as in the design and queues
  unsynced check-ins ("Will sync" marker).
- Realtime must be verified with **two real users** before being called done.

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
