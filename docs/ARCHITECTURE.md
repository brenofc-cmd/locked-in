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
│   ├── app/            # routes: (app)/today, partner, focus, progress, more, routine,
│   │                   #   challenges, duo, settings, onboarding; `/` redirects to /today
│   ├── components/     # app-state.tsx (mock state), shell/, screens/, today/, sheets/,
│   │                   #   overlays/, focus/, ui.tsx, icons.tsx
│   ├── hooks/          # client hooks, e.g. realtime subscriptions (Stage 5+)
│   ├── lib/
│   │   ├── mock-data.ts   # ALL Stage 2 mock data (user, partner, tasks, activity, focus, stats, challenges)
│   │   ├── today.ts       # pure Today derivations (stats, sections, schedule labels)
│   │   ├── partner.ts     # pure partner status view
│   │   ├── format.ts      # time formatting
│   │   └── supabase/   # Supabase clients: client.ts (browser), server.ts (server) — Stage 3
│   ├── types/          # shared TS types, generated DB types (Stage 3+)
│   └── styles/         # extra CSS if globals.css grows too large
├── supabase/
│   ├── migrations/     # SQL migrations (Stage 3+)
│   └── tests/          # SQL / RLS tests (Stage 3+)
├── tests/
│   ├── unit/           # Vitest
│   └── e2e/            # Playwright
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

Stage 2: route `page.tsx` files are Server Components that render one client screen. Client state is a
single context (`src/components/app-state.tsx`, ADR-008) mounted by `src/app/(app)/layout.tsx`, so state
survives navigation between tabs. Everything is mock data; nothing is persisted.

- Default to **Server Components**; add `"use client"` only for interactivity (checkboxes, timers,
  realtime subscriptions, sheets).
- `src/lib/supabase/client.ts` → `createBrowserClient` (client components only).
- `src/lib/supabase/server.ts` → `createServerClient` with `cookies()` (server only).
- A Next.js `proxy`/middleware refreshes the auth session cookie (Stage 3; check the current Next.js
  docs in `node_modules/next/dist/docs/` for the file convention before writing it).
- Nothing in `src/lib/supabase` exists yet. It is created in Stage 3 together with Auth, not faked earlier.

## Auth strategy (Stage 3)

Supabase Auth with cookie-based sessions via `@supabase/ssr`. Each user has a profile row; a **duo**
links exactly two profiles through an invite code (design: `LKD-XXXXX`). Every table exposed to the
client has RLS enabled with policies of the form "row belongs to me" or "row belongs to my duo partner".

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

- Template: `.env.example`. Local values: `.env.local` (git-ignored).
- Server secrets (secret/service-role key) are never needed by the client. If ever needed, they get a
  name **without** `NEXT_PUBLIC_` and are used only in server code.
- On Vercel, set the same variables in Project Settings → Environment Variables.

## Code organisation rules

- Colocate by feature only when a folder grows; otherwise keep the flat structure above.
- One component per file; name files after the component.
- Types: prefer inferred and generated types (Supabase `gen types`) over hand-written duplicates.
- No global state library. React state + server data + Supabase subscriptions are enough.
