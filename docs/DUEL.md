# Daily Duel (V2 Phase 7)

One honest daily duel between the two members of a duo, decided only by what LOCKED IN already
records. Scope and the approved rules: docs/ROADMAP.md → "V2 Phase 7". Decisions: ADR-074…077.

Core loop: **ACTION → DERIVED NUMBERS → CATEGORY → RESULT OF THE DAY**.

## Model

Nothing is stored. `public.duo_duels(p_days default 8)` derives, for each local day since the duo
became complete, both members' numbers from `daily_tasks` and `focus_sessions` (the Progress sources);
`src/lib/duel.ts` (pure, unit-tested) turns them into categories and a result.

| Column (`duo_duels`)                | Meaning                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `duel_date`                         | calendar date D — each side is that member's own local day D                   |
| `is_final`                          | D closed for both (`history_locked_through`) and no session of D still running |
| `me_/partner_planned`, `_completed` | tasks of D (skipped stays in planned, private tasks count)                     |
| `me_/partner_standard`              | the member's Daily Standard, as it is now                                      |
| `me_/partner_focus_seconds`         | settled effective focus of D (every session except one still running)          |
| `me_/partner_focus_running`         | a session of D is still running (the client adds its live clock)               |

Only dates, integers and booleans. Newest first; `p_days` is clamped to 1…31; no rows without a
complete current duo.

## Categories

| Category    | Value                                                       | Decided when                   | Comparison                                         |
| ----------- | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Execution   | `completed / planned` (Progress completion)                 | both planned > 0               | exact ratio (`compareRatio`), never the rounded %  |
| Focus       | effective focus minutes (`floor(seconds / 60)`)             | at least one side ≥ 1 min      | whole minutes (what the screen shows)              |
| Consistency | the Daily Standard: MET / NOT_MET / NEUTRAL (`standardMet`) | neither side NEUTRAL (no task) | MET beats NOT_MET; MET–MET and NOT_MET–NOT_MET tie |

Consistency is the official rule (2026-10-01): A MET vs B NOT_MET → A; A NOT_MET vs B MET → B; both
MET → tie; both NOT_MET → tie; either side NEUTRAL → not comparable. No new formula — each member
against their own standard, with the exact Progress rule `planned > 0 and completed·100 ≥
standard·planned`.

Each category is ME / PARTNER / TIE / INSUFFICIENT (shown NÃO COMPARÁVEL).

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

## Timezone

D is a calendar date; each side is its member's own local D (like the weekly competition). The list is
framed by the viewer's local today. A member who is a day ahead has a closed D while the other's D is
open — the duel stays LIVE until both close. A day the partner has not reached yet is an empty side,
never a future row.

## Historical integrity

A final duel's Execution and Focus never change: closed days cannot be written (`LI_HISTORY_LOCKED`),
routine catch-up only materialises, focus days are fixed at start, the boundary never moves back on a
timezone change; routines are materialised for both members before every read. pgTAP closes a day,
attacks it (complete, add, delete, the partner's lost day, a timezone move) and checks the final duel
is unchanged.

**Known limitation (ADR-076):** Consistency reuses the Daily Standard as it is, and the standard has
no history (ADR-038). If a member later changes their own standard, their past days are read with the
new one — exactly like the streak. Execution and Focus are unaffected.

## Privacy

- One partner-facing function, member-derived (no user-id parameter), integers / booleans / dates
  only (pgTAP asserts the result types).
- Private tasks and private sessions count in the numbers only; no title, note, category, time,
  goal, commitment, check-in or Top 3 reaches the duel.

## Duo lifecycle

- A duel exists only for an active, complete duo, from the day the duo became complete in **both**
  members' calendars (`private.duo_together_since`).
- No duo, or waiting for a partner: no rows, no card.
- Ending the duo leaves nothing to read (nothing is stored); a future partner starts from the new
  duo's first day and never sees the old duo's duels.

## Realtime (no polling)

- My side of today is live from the screen: the tasks just checked off, my focus clock, my standard
  (`liveDuels()` in `app-state.tsx`) — a check-off moves the duel without a request.
- The partner's side is re-read with the duo numbers (`refreshDuoProgress`) on the existing
  `partnerVersion` (feed / tasks broadcasts, reconnect, tab visible) and on the partner's focus
  transitions (the existing `focus` broadcast) — events, never a timer.
- A running session (mine or the partner's, from `partner_current_focus()`) ticks locally from the
  clock already on screen: settled seconds + its elapsed time.
- No new channel, no client broadcast, no database broadcast. Private completions reach the partner
  on the next re-read (the same limitation as the weekly competition).
- A day that becomes final while the app is open shows FINAL on the next re-read (or the next day's
  reload).

## Interface

| Where    | What                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| Today    | DUELO DE HOJE (compact): phase, headline + score, the 3 categories → `/partner#duel` |
| Partner  | the detailed duel: each category's value for both, its outcome, COMO É DECIDIDO      |
| Progress | ÚLTIMOS 7 DUELOS: D−1 … D−7 since the duo formed, each RESULTADO FINAL / AO VIVO     |

Copy in `src/i18n/pt-BR.ts` → `duel`. No animation beyond the existing ones.

## Not in this phase

XP, coins, monthly champion, records, milestones, badges, ranking, streak of wins, large animations,
Web Push, a stored score.

## Tests

- Unit: `tests/unit/duel.test.ts` (21) — exact ratio, whole minutes, the official consistency table,
  `standardMet` reuse, 2–1 / 1–0 / ties / insufficient, live wording never "won", final wording,
  running sessions, today live from the screen.
- pgTAP: `supabase/tests/v2_phase7_duel.test.sql` (40).
- E2E: `tests/e2e/v2-phase7.spec.ts` (project `v2p7-390`).
