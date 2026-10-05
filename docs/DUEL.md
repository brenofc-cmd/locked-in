# Daily Duel (V2 Phase 7)

One honest daily duel between the two members of a duo, decided only by what LOCKED IN already
records. Scope and the approved rules: docs/ROADMAP.md → "V2 Phase 7". Decisions: ADR-074…079.

Core loop: **ACTION → DERIVED NUMBERS → CATEGORY → RESULT OF THE DAY**.

## Model

No duel, score or winner is stored. `public.duo_duels(p_days default 8)` derives, for each local day
since the duo became complete, both members' numbers from `daily_tasks` and `focus_sessions` (the
Progress sources) and the Daily Standard in force that day; `src/lib/duel.ts` (pure, unit-tested)
turns them into categories and a result.

| Column (`duo_duels`)                | Meaning                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `duel_date`                         | calendar date D — each side is that member's own local day D                   |
| `is_final`                          | D closed for both (`history_locked_through`) and no session of D still running |
| `me_/partner_planned`, `_completed` | tasks of D (skipped stays in planned, private tasks count)                     |
| `me_/partner_standard`              | the member's Daily Standard **in force on D** (`private.standard_on`)          |
| `me_/partner_focus_seconds`         | settled effective focus of D (every session except one still running)          |
| `me_/partner_focus_running`         | a session of D is still running (the client adds its live clock)               |

Only dates, integers and booleans. Newest first; `p_days` is clamped to 1…31; no rows without a
complete current duo.

## Categories

| Category    | Value                                                       | Decided when                   | Comparison                                         |
| ----------- | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Execution   | `completed / planned` (Progress completion)                 | both planned > 0               | exact ratio (`compareRatio`), never the rounded %  |
| Focus       | effective focus **seconds** of the day (pauses never count) | at least one side > 0 s        | exact seconds; more real focus wins                |
| Consistency | the Daily Standard of that day: MET / NOT_MET / NEUTRAL     | neither side NEUTRAL (no task) | MET beats NOT_MET; MET–MET and NOT_MET–NOT_MET tie |

- **Focus 0 × 0** (both 0 effective seconds) is **NEUTRAL / NÃO COMPARÁVEL**, never a tie: the absence
  of focus must not count as a decided category that helps reach a result (official rule,
  2026-10-01, ADR-075). The detailed view shows focus to the second ("25 min 12 s").
- **Consistency** is the official rule (2026-10-01): A MET vs B NOT_MET → A; A NOT_MET vs B MET → B;
  both MET → tie; both NOT_MET → tie; either side NEUTRAL → not comparable. No new formula — each
  member against their own standard of that day, with the exact Progress rule `planned > 0 and
completed·100 ≥ standard·planned` (`standardMet` / `private.standard_met`).

Each category is ME / PARTNER / TIE / INSUFFICIENT (shown "—", read "não comparável").

## Result of the day

- The side that won **more categories** wins (2–1, 1–0, 2–0…).
- Same number of categories won, with at least one category decided → **EMPATE**.
- No category decided → **SEM RESULTADO SUFICIENTE**.
- No weights, no points, no tiebreaker.

## Live vs Final

| State | When                                                      | Shows                                                                      |
| ----- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| LIVE  | D still open for either member, or a session of D running | AO VIVO · **ESTÁ NA FRENTE** / **EMPATE** / **SEM RESULTADO SUFICIENTE**   |
| FINAL | D closed for both and nothing of D running                | RESULTADO FINAL · **VENCEU O DIA** / **EMPATE** / SEM RESULTADO SUFICIENTE |

A live duel never says anyone won. Today is always live in the interface.

## Daily Standard history (ADR-076, ADR-078)

`public.daily_standard_history (user_id, effective_from, standard_percent)` records the versions of
each member's Daily Standard — a setting, not a score:

- **Baseline** `effective_from = -infinity`: the standard known when the history was created (the
  Phase 7 migration) or at signup.
- **Every change** of `profiles.daily_standard_percent` upserts the version of the owner's **local
  today** (`private.record_daily_standard`, a DEFINER trigger — clients have no write grant). A change
  while the day is open affects that open day only; several changes the same day keep the last one.
- `private.standard_on(user, day)`: an **open** day (≥ the owner's local today) uses the current value
  (live); a **closed** day uses the newest version with `effective_from ≤ day`.

Why a FINAL duel cannot move: versions are only ever dated on the owner's local today, which is always
after the Stage 9 boundary (`history_locked_through` never moves back, also on a timezone change). A
later change — mine, my partner's, after a timezone move — never touches a closed day's version
(pgTAP + e2e).

Who sees what: the owner reads their own versions (RLS); the partner, outsiders and anon read none.
The duel exposes only the integer standard of each day to the duo.

**Pre-Phase-7 limitation:** before the history existed there was a single value. Every day before the
Phase 7 deployment reads the baseline (the standard known at deployment). From then on every change is
versioned.

**Streak (analysed, unchanged):** the streak keeps recalculating with the current standard (ADR-038).
It is a personal number, not a duel; moving it to the history would change existing streaks silently,
which this phase does not do.

## Timezone

D is a calendar date; each side is its member's own local D (like the weekly competition). The list is
framed by the viewer's local today. A member who is a day ahead has a closed D while the other's D is
open — the duel stays LIVE until both close. A day the partner has not reached yet is an empty side,
never a future row.

The first duel day is **stamped on the duo** when it becomes complete (`duos.duel_since`, the later of
both members' local dates at that moment, ADR-079). A later timezone change never shifts it, so a
FINAL duel never disappears from the list and no pre-duo day appears.

## Historical integrity

A final duel never changes: closed days cannot be written (`LI_HISTORY_LOCKED`), routine catch-up only
materialises, focus days are fixed at start, the boundary never moves back on a timezone change, the
standard of a closed day is its version, the first duel day is fixed. Routines are materialised for
both members before every read. pgTAP closes a day, attacks it (complete, add, delete, the partner's
lost day, two timezone moves, standard changes by both members) and checks every FINAL duel is
identical.

## Privacy

- One partner-facing function, member-derived (no user-id parameter), integers / booleans / dates
  only (pgTAP asserts the result types).
- Private tasks and private sessions count in the numbers only; no title, note, category, time,
  goal, commitment, check-in, Top 3 or standard history reaches the duel.

## Duo lifecycle

- A duel exists only for an active, complete duo, from `duos.duel_since`.
- No duo, or waiting for a partner: no rows, no card.
- Ending the duo leaves nothing to read (nothing is stored); a future partner starts from the new
  duo's first day and never sees the old duo's duels.

## Realtime (no polling)

- My side of today is live from the screen: the tasks just checked off, my focus clock, my current
  standard (`liveDuels()` in `app-state.tsx`) — a check-off moves the duel without a request.
- The partner's side is re-read with the duo numbers (`refreshDuoProgress`) on the existing
  `partnerVersion` (feed / tasks broadcasts, reconnect, tab visible) and on the partner's focus
  transitions (the existing `focus` broadcast) — events, never a timer.
- A running session (mine or the partner's, from `partner_current_focus()`) ticks locally from the
  clock already on screen: settled seconds + its elapsed time.
- No new channel, no client broadcast, no database broadcast. Private completions and a partner's
  standard change reach me on the next re-read (the same limitation as the weekly competition).
- A day that becomes final while the app is open shows FINAL on the next re-read (or the next day's
  reload).

## Interface

| Where    | What                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| Today    | DUELO DE HOJE (compact): phase, headline + score, the 3 categories → `/partner#duel` |
| Partner  | the detailed duel: each category's value for both, its outcome, COMO É DECIDIDO      |
| Progress | ÚLTIMOS 7 DUELOS: D−1 … D−7 since the duo formed, each RESULTADO FINAL / AO VIVO     |

Copy in `src/i18n/pt-BR.ts` → `duel`. No animation beyond the existing ones.

## DEV-only fixture

`dev_fixture_backdate_duo(days)` lives in `supabase/dev/test_fixtures.sql` (never a migration). It
must never reach production (docs/PRODUCTION_CHECKLIST.md: 0 `dev_*` functions in PROD).

## Not in this phase

XP, coins, badges, ranking, streak of wins, large animations, Web Push, a stored score. The monthly
champion, records and milestones came in Phase 8 on top of these duels (docs/MONTHLY_COMPETITION.md):
the FINAL days of a month are decided by this same `decideDuel`.

## Tests

- Unit: `tests/unit/duel.test.ts` (27) — exact ratio, exact focus seconds, focus 0 × 0 neutral (never
  a decided category), the official consistency table, `standardMet` reuse, 2–1 / 1–0 / ties /
  insufficient, live wording never "won", final wording, running sessions, today live from the
  screen; the standard of each day (closed day keeps its version, same-day change, month / year
  boundaries, today = the database's local date).
- pgTAP: `supabase/tests/v2_phase7_duel.test.sql` (65).
- E2E: `tests/e2e/v2-phase7.spec.ts` (project `v2p7-390`, 7 tests).
