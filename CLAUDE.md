@AGENTS.md

# LOCKED IN

Mobile-first accountability application for two people. _No hype. Just proof._

Read before working: `docs/PROGRESS.md` (current stage and status), `docs/ROADMAP.md` (what belongs to
which stage), `docs/DESIGN_REFERENCE.md` (visual source of truth), `docs/ARCHITECTURE.md`,
`docs/DECISIONS.md`.

## Product priorities

1. Today
2. Partner
3. Focus
4. Progress
5. Simplicity

## Core principle

OPEN → UNDERSTAND → ACT

The user must understand their state and take the main action in about 3 seconds.

## Development rules

- Mobile-first.
- Preserve the approved design (`design-reference/export/Locked In v3.dc.html`; behaviour in v2).
- Never redesign without explicit instruction.
- Never edit anything in `design-reference/`.
- TypeScript strict.
- Avoid `any`.
- Prefer simple code.
- Avoid premature abstraction.
- Do not add features outside the current stage.
- Do not add dependencies without a real reason.
- Supabase is the only backend.
- PostgreSQL is the database.
- Vercel is production hosting.
- All future exposed database tables must use RLS.
- Never expose private Supabase keys.
- Never commit secrets.
- Never place server secrets in NEXT_PUBLIC_* variables.
- Realtime must eventually work between two users.
- Do not fake backend functionality once backend implementation begins.
- Test behavior before declaring work complete.
- Preserve mobile usability.
- Frequent controls should remain thumb-friendly.
- Avoid excessive cards and visual noise.
- Do not create a generic dashboard aesthetic.
- Keep LOCKED IN dark, serious, minimal and premium.
- This Next.js version (16) may differ from training data: check `node_modules/next/dist/docs/`
  before using an API you are unsure about.
- Record important technical decisions in `docs/DECISIONS.md`; update `docs/PROGRESS.md` at the end
  of each stage.

## Definition of done

CODE WRITTEN ≠ DONE.

A task is done only when its behavior has been verified.

## Standard verification commands

All verified working (Windows, Node 22; last run at the end of Stage 6):

```bash
npm install
npm run dev            # http://localhost:3000
npm run lint           # ESLint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest, tests/unit
npm run build          # production build
npm run test:e2e       # Playwright, builds and serves on :3100. Needs .env.local + .env.test.local.
                       #   setup (seed + sign-in) → 390 + 1440 full suite, 375 + 430 layout,
                       #   @focus tests after them (focus-390 / focus-1440: a running session
                       #   overlays every screen of its user), stage3 → stage4 → stage5 → stage6
                       #   (serial, shared DEV users; stage5 / stage6 = 2-3 browsers)
                       #   (first run: npx playwright install chromium)
npm run format:check   # Prettier (npm run format to fix)
npx supabase test db   # pgTAP (supabase/tests: stage3 … stage6), needs Docker; DEV fallback in docs/DATABASE.md
```

Run lint, typecheck, test and build before declaring any stage complete; run test:e2e when UI or
routing changed; run the pgTAP suite when a migration changed.

## Supabase (Stage 3+)

- Work only against the **DEV** project in `.env.local`. Never touch production data.
- Schema changes are new files in `supabase/migrations/`; never edit an applied migration. Then
  regenerate `src/types/database.ts` and update `docs/DATABASE.md`.
- Every new `public` table: RLS on, explicit grants (anon gets nothing), policies, pgTAP tests.
- SECURITY DEFINER functions: `set search_path = ''`, schema-qualified names, act for `auth.uid()`
  only, `revoke all … from public` then minimal `grant execute`.
- Errors shown to users go through `authErrorMessage()` / `duoErrorMessage()` / `taskErrorMessage()` /
  `focusErrorMessage()`; never render raw
  Supabase or Postgres messages.
- Test users and credentials: `docs/DATABASE.md` → "Test users". `.env*` and `tests/e2e/.auth/` are
  git-ignored and must stay that way.

## Real vs mock state (Stage 6)

- Real: auth session, profile, duo, partner identity → `useSession()`; routine items and today's
  tasks → `useTasks()`; partner presence (online / offline), partner's day (counts + shared
  tasks), activity feed and connection state → `useDuoRealtime()`
  (`src/components/duo-realtime.tsx`); focus sessions, timer, focus today, session list and the
  partner's focus → `useFocus()` (`src/components/use-focus.ts`) + `partner_current_focus()`. All
  reached through `useApp()`; initial data from `loadAppData()`.
- Mock: standard, streak, weekly competition, head-to-head, stats, challenges, reaction
  persistence, notifications → only `src/lib/mock-data.ts` and `src/components/app-state.tsx`.
- Focus: Postgres owns every timestamp. Never store, send, broadcast or track a timer value; derive
  the clock with `src/lib/focus.ts` from the row + server offset. One unfinished session per user
  (database index). Expired sessions are reconciled on demand (`my_active_focus()`), never by cron.
  Reflections are owner-only; the partner only gets the `partner_current_focus()` projection.
- "Today" is `public.my_today()` (profiles.timezone). Never compute the day from UTC; use
  `src/lib/local-date.ts` on the `YYYY-MM-DD` strings the database returns. Weekdays are ISO
  (1 = Monday … 7 = Sunday) everywhere.
- Task writes are optimistic: update state, call a Server Action in `src/app/(app)/task-actions.ts`,
  reconcile or roll back with a toast. Never show a spinner on the checkbox.
- Routine history is immutable: edit the template with `update_routine_item`, never rewrite past
  `daily_tasks`; "Delete" archives (`archive_routine_item`).
- Realtime: one private channel per duo, Postgres is the source of truth (docs/REALTIME.md). Never
  add polling, per-second presence updates, client-sent broadcasts or extra channels; new feed
  events come from database triggers.
- Dev shortcuts: `npm run dev`, open `/today?dev=1`, DEV button (briefing only; partner and
  connection are real).
- Breakpoints: `desk:` = 780px (sidebar), `wide:` = 1180px (two columns). Do not change them without
  checking `design-reference/`.
