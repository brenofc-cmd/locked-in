# LOCKED IN

**NO HYPE. JUST PROOF.**

Mobile-first discipline and accountability app for two people: each runs a daily routine, checks tasks
off, and sees the partner do the same in real time.

Status: **V1 in production** (https://locked-in-rust.vercel.app). **V2 Phase 1 — Foundation + Restore
State** verified; **V2 Phase 2 — School Planner + Shared Calendar + Partner Presence 2.0** verified. **V2 Phase 3 — Goals, Vision & Accountability Mirror** verified. **V2 Phase 4 — North Star + Morning Experience** verified. **V2 Phase 5 — Goals → Actions → Proof** verified. **V2 Phase 6 — Duo Accountability 2.0** verified (production 2026-09-30). **V2 Phase 7 — Daily Duel + Transparent Gamification** verified (production 2026-10-01; visual smoke on PROD 2026-10-05). **UI Information Architecture Polish** verified (2026-10-05). **V2 Phase 8 — Monthly Champion + Personal Records + Milestones** verified (production 2026-10-05). **V2 Phase 9 — Celebrations + Reviews 2.0 + Non-Negotiables + Weekly Planning** verified (production 2026-10-06). **V2 Phase 10 — Web Push + Advanced Reminders + Final Polish / Audit** in production (2026-10-06); two-device acceptance pending. See [docs/PROGRESS.md](docs/PROGRESS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth,
Realtime, Presence, pg_cron + one Edge Function for Web Push) · Vercel · Vitest · Playwright.

## Getting started

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # Supabase DEV project URL + publishable key (+ VAPID public key for push)
npm run dev                  # http://localhost:3000
```

## Scripts

| Command                           | What it does                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server                                                                                                                        |
| `npm run build` / `npm start`     | Production build / serve                                                                                                          |
| `npm run lint`                    | ESLint                                                                                                                            |
| `npm run typecheck`               | Generate route types, then `tsc --noEmit`                                                                                         |
| `npm test`                        | Unit tests (Vitest)                                                                                                               |
| `npm run test:e2e`                | E2E tests (Playwright, mobile profile). Needs `.env.test.local` (docs/DATABASE.md). First time: `npx playwright install chromium` |
| `npm run format` / `format:check` | Prettier                                                                                                                          |

## Documentation

- [Product](docs/PRODUCT.md) — vision, principles, core loop
- [Architecture](docs/ARCHITECTURE.md) — stack, structure, Supabase, realtime, env
- [Database](docs/DATABASE.md) — schema, RLS, functions, migrations, tests, test users
- [Realtime](docs/REALTIME.md) — private duo channel, presence, broadcasts, recovery
- [Design reference](docs/DESIGN_REFERENCE.md) — the approved Claude Design and how to read it
- [Roadmap](docs/ROADMAP.md) — V1's 10 stages and the V2 phases
- [Goals](docs/GOALS.md) — V2: vision, goals, milestones and the accountability mirror (private)
- [North Star](docs/NORTH_STAR.md) — V2: LEMBRE-SE DO PORQUÊ, TOP 3 DE HOJE and the morning card
- [Goal proof](docs/GOAL_PROOF.md) — V2: goals linked to tasks, routines and focus; proof derived from real actions
- [Accountability](docs/ACCOUNTABILITY.md) — V2: shared commitments proven by real actions, nudges, daily check-in
- [Daily Duel](docs/DUEL.md) — V2: Execution / Focus / Consistency, transparent result, Live vs Final
- [Planner](docs/PLANNER.md) — V2: school events, sharing with the duo, reminders, Add to tasks
- [Resume State](docs/RESUME_STATE.md) — V2: what the device remembers between visits, and what it never stores
- [Analytics](docs/ANALYTICS.md) — progress, streak, standard and competition rules
- [Challenges](docs/CHALLENGES.md) — duo challenges, derived progress
- [Notifications](docs/NOTIFICATIONS.md) — in-app notices and browser notifications while open
- [Web Push](docs/WEB_PUSH.md) — V2: opt-in push with the app closed, scheduler, quiet hours, dedup, privacy
- [Celebrations](docs/CELEBRATIONS.md) / [Weekly planning](docs/WEEKLY_PLANNING.md) — V2 Phase 9
- [Monthly competition](docs/MONTHLY_COMPETITION.md) — V2: monthly champion, records, milestones
- [Security](docs/SECURITY.md) — auth, RLS / table matrix, DEFINER functions, closed history, advisors
- [Production checklist](docs/PRODUCTION_CHECKLIST.md) — Stage 10 steps and manual gates
- [Decisions](docs/DECISIONS.md) — ADRs
- [Progress](docs/PROGRESS.md) — current status
- [CLAUDE.md](CLAUDE.md) — rules for AI agents working on this repo

## Deploying to Vercel

No custom infrastructure is needed; the app is a standard Next.js project.

1. Push the repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo. Framework preset: Next.js (auto-detected).
   Build command `npm run build`, output handled by Vercel.
3. In **Settings → Environment Variables** (Production), add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public; docs/WEB_PUSH.md)
   and the server-only `SITE_URL` of the production project.
   Preview deployments must **not** use the production keys.
4. In Supabase **Auth → URL Configuration**, set the Site URL to the production origin and the
   redirect URL to exactly `https://<domain>/auth/confirm` (no wildcards, no localhost).
5. Every push to `main` deploys to production; pull requests get preview deployments.

The full, ordered list — including the two manual dashboard gates (Realtime "Allow public access"
OFF, leaked-password protection ON) — is [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

Secrets are never committed; `.env.local` is git-ignored.
