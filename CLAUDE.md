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
- All user-facing copy is Brazilian Portuguese and lives in `src/i18n/pt-BR.ts` (ADR-054); never
  hard-code UI text in a component. Keep internal identifiers (Day codes, statuses) in English.
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

All verified working (Windows, Node 22; last run at the end of Stage 9, 2026-09-28):

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
                       #   → stage7 → stage8 → stage9 → v2-390 → v2-1440 → v2p2-390 → v2p3-390 → v2p4-390 → v2p5-390 → issue001-390 (serial, shared DEV users; stage5-9 = 2-3
                       #   browsers; stage9 needs supabase/dev/test_fixtures.sql applied to DEV)
                       #   (first run: npx playwright install chromium)
npm run format:check   # Prettier (npm run format to fix)
npm audit              # dependency advisories (0 at the end of Stage 9)
npx supabase test db   # pgTAP (supabase/tests: stage3 … stage9 + v2_phase2 … v2_phase5), needs Docker. Without Docker:
                       #   node supabase/dev/pgtap_dev.mjs <file> > out.sql, then run out.sql on DEV
                       #   (docs/DATABASE.md → Tests)
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
  `focusErrorMessage()` (progress actions return fixed copy); never render raw
  Supabase or Postgres messages.
- Test users and credentials: `docs/DATABASE.md` → "Test users". `.env*` and `tests/e2e/.auth/` are
  git-ignored and must stay that way.

## Real vs mock state (Stage 8)

- Real: auth session, profile, duo, partner identity → `useSession()`; routine items and today's
  tasks → `useTasks()`; partner presence (online / offline), partner's day (counts + shared
  tasks), activity feed and connection state → `useDuoRealtime()`
  (`src/components/duo-realtime.tsx`); focus sessions, timer, focus today, session list and the
  partner's focus → `useFocus()` (`src/components/use-focus.ts`) + `partner_current_focus()`;
  daily standard, streak / longest streak, progress series, chart, calendar, day review, habits,
  insights, this week's competition, head-to-head, weekly review, briefing numbers and the
  partner's streak → `useProgress()` (`src/components/use-progress.ts`); reactions (persisted,
  live) → `useDuoRealtime().reactions` + `react()`; settings, onboarding state and notification
  preferences → `useSession().settings` (`user_settings`); challenges →
  `useChallenges()` (`src/components/use-challenges.ts`). All reached through `useApp()`; initial
  data from `loadAppData()`.
- Mock: **nothing**. `src/lib/mock-data.ts` is gone; product constants live in
  `src/lib/constants.ts`, `src/lib/reactions.ts`, `src/lib/routine-templates.ts`.
- Stage 8 rules: reactions attach to `activity_events` (one per user per event, never on my own,
  never a feed line); challenge progress, status and winner are derived, never stored
  (docs/CHALLENGES.md); notifications are in-app toasts + the browser Notification API while the
  app is open — no push, service worker or cron (docs/NOTIFICATIONS.md); permission only on an
  explicit click; ending a duo is one atomic delete that removes its feed / reactions / challenges;
  a partner reads shared tasks only from the day the duo formed. Never add an interface that edits
  past days.
- Stage 9 rules (docs/SECURITY.md, ADR-050…053): closed local days are immutable in the database
  (`LI_HISTORY_LOCKED`, `LI_FUTURE_TASK`, `LI_ROUTINE_STALE`); never add a grant, RPC or trusted
  path that writes a closed day, `materialized_through`, `history_locked_through`, a focus
  session's `local_date` / timestamps or a challenge's standard snapshot. The SECURITY DEFINER set is
  fixed and asserted by `stage9_integrity.test.sql`: a new DEFINER function means updating that
  test, docs/SECURITY.md and an ADR. `supabase/dev/*.sql` (fixtures, test users) is DEV-only and
  must never reach production. Keep the CSP / headers in `next.config.ts` and `safeNext()` for
  every redirect.
- Progress (docs/ANALYTICS.md): every number is derived in SQL from `daily_tasks` and
  `focus_sessions` — never add a stats / cache table or store a computed number. Skipped stays in
  the denominator; a day with 0 planned is neutral (null, never 0 % or 100 %); standard met uses
  the exact ratio (`completed·100 ≥ standard·planned`); today never breaks the streak early;
  Perfect Day = 100 %. The competition is raw completion % (never the standard, never focus); only
  completed weeks together are head-to-head results. Partner functions return integers only;
  private tasks count in aggregates but are never listed or broadcast. Presentation maths lives in
  `src/lib/progress.ts` (pure, unit-tested); my own numbers are live from local state, the
  partner's are re-read after realtime refetches (`partnerVersion`) — no polling.
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
- V2 Resume State (docs/RESUME_STATE.md, ADR-055): interface context only, one versioned value per
  user (`locked-in:v2:<userId>:resume`), read / written only through `src/lib/resume-state.ts` —
  never call `localStorage` for it from a component, never use an unscoped key. Never store product
  data (tasks, focus / timer, partner, feed, numbers), tokens, passwords, emails or anything from
  auth. Restore routes only at `/` and only from `RESTORABLE_ROUTES`; explicit URLs, `/auth/*`,
  reset, `?next` and onboarding always win. Never reopen a sheet or dialog. A new field needs
  validation in `parseResume()`, a unit test and, for a new shape, a version bump. Sign-out must
  keep calling `clearResume()`.
- V2 Phase 2 (docs/PLANNER.md, REALTIME.md → Last seen, ADR-056 / ADR-057): the partner's status
  comes only from `usePartnerView()` / `partnerView()` — EM FOCO (persistent focus) > ONLINE
  (presence) > OFFLINE + last seen; never infer ONLINE from `last_seen_at`. The heartbeat writes
  only my own row through `touch_last_seen()`, ~5 min while visible, never while hidden; never poll
  the partner or add a channel for it. Planner events: owner CRUD; never send `owner_id` / `duo_id`
  (the database derives sharing from the current duo; ending a duo makes shared events private);
  partner read-only; `planner_changed` carries ids only. An event and a task stay independent.
  Dates are local `YYYY-MM-DD` strings (`src/lib/planner.ts`), never UTC.
- V2 Phase 3 (docs/GOALS.md, ADR-058 / ADR-059): vision, goals, milestones and the mirror are
  owner-only — never add a partner policy, a sharing column, a broadcast or realtime for them without
  an explicit product decision. Never send `owner_id`; keep the composite FKs (a goal only points at
  the owner's vision, a milestone only lives in the owner's goal). Goal status is only active /
  achieved / archived; never show or store a manual percentage (milestones are a count).
- V2 Phase 4 (docs/NORTH_STAR.md, ADR-060…062): the North Star shows only what the user wrote —
  never add random, motivational or AI-generated text. One featured item per kind is a database
  rule (partial unique indexes + `keep_one_featured`); keep the fallback in `pickNorthStar()`. The Top
  3 is `daily_tasks.priority_rank` (1..3, unique per owner / day) written through
  `set_my_priorities` — never a second task list, never automatic. The morning card is inline, once
  per user and day via `setMark` — never a modal, a route or Resume State; device marks are always
  user-scoped (no `li:*` keys).
- V2 Phase 5 (docs/GOAL_PROOF.md, ADR-064…068): goal links live in the owner-only
  `daily_task_goals` / `routine_item_goals` (never add `goal_id` to `daily_tasks` / `routine_items` —
  the partner reads those rows) and `focus_sessions.goal_id`. Proof is derived by
  `my_goal_proof_summaries` / `my_goal_proofs` — never add a proof / stats table, a manual proof, a
  score or a percentage; a routine is proof only through its completed occurrences. Only ACTIVE goals
  take new links; closed days and completed focus are fixed. Never send a goal id / title to the
  partner (projections, broadcasts, feed). Pickers use `linkableGoals()` / `linkableGoalId()`.
- Session (ISSUE-001, ADR-063): every Supabase client passes `global: { fetch: supabaseFetch }`
  (`src/lib/supabase/fetch.ts`). Never add a general retry, a sleep or a reload around auth, and
  never repeat any 401 other than PGRST303 "JWT issued at future"; a session the database refuses
  goes to `SESSION_REJECTED_LOGIN`, never to the error page.
- Dev shortcuts: `npm run dev`, open `/today?dev=1`, DEV button ("Resumo do dia de novo" clears
  today's briefing mark; partner and connection are real).
- Breakpoints: `desk:` = 780px (sidebar), `wide:` = 1180px (two columns). Do not change them without
  checking `design-reference/`.
