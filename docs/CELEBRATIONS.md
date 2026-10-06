# Celebrations (V2 Phase 9)

Short, rare and factual. A celebration states what happened — "DIA PERFEITO", "7 DIAS DE SEQUÊNCIA",
"CAMPEÃO DE SETEMBRO" — and goes away. No XP, coins, confetti, sound, streak-saver or motivational
text. Scope: docs/ROADMAP.md → "V2 Phase 9". Decisions: ADR-086…088.

## What is celebrated

| Kind        | Key (database)              | When                                                                                                             |
| ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PERFECT DAY | the local date (YYYY-MM-DD) | today becomes perfect (planned > 0, every task completed) — at most once per date                                |
| Milestone   | `streak_7` … `perfect_30`   | the first crossing of a Phase 8 milestone (streak 7 / 30 / 100, focus 10 / 50 / 100 h, Perfect Days 5 / 10 / 30) |
| Monthly     | the month (YYYY-MM-01)      | a FINAL month I won (CAMPEÃO DE <MÊS>) or drew (MÊS ENCERRADO · EMPATE), ended in the last 7 days                |

Never: a live month, a lost or insufficient month, a partner's achievement, anything sent to the
partner (reactions stay the social layer). Never a Web Push either (V2 Phase 10, ADR-097): a
celebration is an in-app moment only.

## One table: `public.celebrations`

Owner-only (RLS, column grants; anon nothing). Primary key `(owner_id, kind, key)`, so each
celebration exists once.

- **Milestone rows are unlocks** — a historical event, not a cache. The insert is validated by the
  database (`private.guard_celebration`, INVOKER) against the real numbers (`private.milestone_value`:
  longest streak with today live, settled focus seconds, closed Perfect Days); the value at unlock is
  kept in `source_value`. A milestone stays unlocked (CONQUISTADO) even if the derived value later
  drops (history reset, a Daily Standard change): Progress reads `reached = value ≥ target OR unlocked`.
- **Perfect Day / month rows are receipts** — "this was celebrated". The guard accepts a Perfect Day
  only for the caller's local today while it is perfect, and a month only once it has ended. A
  date-shaped key that is not a real date gets the same error (`LI_NOT_PERFECT` / `LI_MONTH_OPEN`).
- **Immutable** — a client can insert `(kind, key)` only and update `seen_at` only; the database
  stamps `owner_id`, `achieved_at`, `source_value` and `seen_at` (once: `coalesce(old, now())`).
  No delete. Errors: `LI_MILESTONE_NOT_REACHED`, `LI_NOT_FOUND`, `LI_NOT_PERFECT`, `LI_MONTH_OPEN`,
  `LI_HISTORY_LOCKED`.
- **Baseline** — the migration ran `private.baseline_milestones()` for every profile: milestones
  already reached when Phase 9 shipped were recorded with `baseline = true` and `seen_at` set, so they
  show CONQUISTADO and never replay. No API role can call it (DEV fixture:
  `dev_fixture_baseline_milestones`).

## Flow (no polling, no channel)

`useReflection()` (`src/components/use-reflection.ts`) derives the claims from numbers already on
screen with `claimsToMake()` (`src/lib/celebrations.ts`, pure, unit-tested): today perfect, every
reached milestone, `monthToCelebrate()`; minus rows that exist. When that set changes it waits 1.5 s
and sends them (`claimCelebrations`), then keeps the rows the database returns. A refused claim (the
task write it depends on may still be in flight) is tried once more after 4 s, then waits for the
numbers to change. Nothing runs on a timer otherwise (e2e: 70 s without a request).

`pendingCelebrations()` = rows not seen and not baseline, Perfect Day → milestones → month. The host
(`src/components/overlays/Celebration.tsx`, in the shell) shows the first one.

## On screen

- A small card at the top, over the current screen: no route, no modal (`role="status"`, nothing
  behind it is blocked), never in Resume State, never during onboarding.
- **≈2 s**, then it closes by itself; pointing at it or focusing it holds it (WCAG 2.2.1); OK closes
  it. Closing marks it seen (here at once, and in the database for every device).
- Motion: a 0.35 s fade only with `motion-safe`; with `prefers-reduced-motion` it simply appears
  (and the global reduced-motion rule stays).
- Copy (`t.celebrations`): DIA PERFEITO · "As 4 tarefas de hoje estão feitas." / the milestone title
  · MARCO CONQUISTADO / CAMPEÃO DE <MÊS> or MÊS ENCERRADO · EMPATE · "<MÊS> · 8 — 5".

## Tests

pgTAP `supabase/tests/v2_phase9_reflection.test.sql` (validation, immutability, baseline, privacy);
unit `tests/unit/reflection.test.ts`; e2e `tests/e2e/v2-phase9.spec.ts` 1–7, 17.
