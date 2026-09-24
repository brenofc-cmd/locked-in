# LOCKED IN

**NO HYPE. JUST PROOF.**

Mobile-first discipline and accountability app for two people: each runs a daily routine, checks tasks
off, and sees the partner do the same in real time.

Status: **Stage 4 — real Today, routine and tasks verified; Stage 5 next**. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth,
Realtime, Presence) · Vercel · Vitest · Playwright.

## Getting started

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # Supabase DEV project URL + publishable key
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
- [Design reference](docs/DESIGN_REFERENCE.md) — the approved Claude Design and how to read it
- [Roadmap](docs/ROADMAP.md) — the 10 stages
- [Decisions](docs/DECISIONS.md) — ADRs
- [Progress](docs/PROGRESS.md) — current status
- [CLAUDE.md](CLAUDE.md) — rules for AI agents working on this repo

## Deploying to Vercel (later, Stage 10)

No custom infrastructure is needed; the app is a standard Next.js project.

1. Push the repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo. Framework preset: Next.js (auto-detected).
   Build command `npm run build`, output handled by Vercel.
3. In **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production and Preview.
4. In Supabase **Auth → URL Configuration**, add the Vercel production and preview URLs as redirect URLs.
5. Every push to `main` deploys to production; pull requests get preview deployments.

Secrets are never committed; `.env.local` is git-ignored.
