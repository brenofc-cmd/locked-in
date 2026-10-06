# Monthly Champion, Personal Records, Milestones (V2 Phase 8)

Long-term progression from the data LOCKED IN already records — no XP, coins, levels, shop or
leaderboard. Phase 7 answers "who executed better today?"; Phase 8 answers "who was more consistent
over the month?" and "what is my best so far?". Scope: docs/ROADMAP.md → "V2 Phase 8". Decisions:
ADR-080…085.

## Monthly Champion

### Built on the Daily Duel

Nothing is stored. `public.duo_duel_months(p_months default 6)` returns **the same per-day numbers as
`duo_duels`** (docs/DUEL.md) for the current month of my local today and up to 5 months before it
(`p_months` is clamped to 1…12), never before `duos.duel_since`. The client decides each day with the
existing `decideDuel` and the month with `decideMonth` (`src/lib/monthly.ts`, pure, unit-tested). One
implementation of the duel rules — there is no second competition.

| Day (FINAL only)              | Counts as                         |
| ----------------------------- | --------------------------------- |
| I won the day                 | 1 daily win for me                |
| My partner won the day        | 1 daily win for my partner        |
| EMPATE                        | 1 draw (apart from wins)          |
| SEM RESULTADO SUFICIENTE      | nothing (not an official day)     |
| not FINAL (today, still open) | nothing yet — never counted early |

The monthly score is literally **days won** ("OUTUBRO · 8 — 5 · 3 empates"). No points.

### Minimum evidence

An **official day** is a FINAL win or draw. A month needs **at least 3**; fewer → **SEM RESULTADO
SUFICIENTE** (live: "… AINDA", final: "… NO MÊS"). The numbers are still shown, with "Mínimo de 3
duelos oficiais no mês (n até agora)". The same minimum applies to the live leader: nobody is "ahead"
after one day.

### Decision

1. More daily wins.
2. Equal → **monthly Execution**: `Σ completed / Σ planned` over the FINAL days of the month where
   **both** had tasks (the days where Execution was comparable), compared exactly
   (cross-multiplication, never the rounded %). A day where only one member planned tasks never adds
   to anyone's execution.
3. Equal (or no comparable day) → **monthly focus**: total effective focus seconds of the FINAL days
   (pauses never count; exact seconds).
4. Equal → **EMPATE DO MÊS**. No fourth tiebreak.

The rule that decided is always shown: "Desempate: execução mensal", "Desempate: foco mensal",
"Vitórias, execução e foco iguais", or "Desempate: não necessário" in the details.

### Live vs Final

| State | When                                                                       | Headline                                                                                  |
| ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| LIVE  | the month's last calendar day is not a FINAL duel yet (or any day is open) | MÊS · AO VIVO — VOCÊ / <NOME> ESTÁ NA FRENTE · EMPATADOS · SEM RESULTADO SUFICIENTE AINDA |
| FINAL | the last day is FINAL for both (closed, nothing running)                   | CAMPEÃO DE <MÊS> + name · EMPATE DO MÊS · SEM RESULTADO SUFICIENTE NO MÊS                 |

The closing is the Phase 7 closing (`history_locked_through` for both + no running session): a
member behind in time keeps the month live until their last day closes. A live month never says
anyone won. No celebration (Phase 9).

### History and duo lifecycle

- Progress shows the current month and the previous months of the **current duo** (up to 6 months in
  all, loaded in one call), never whole years.
- A month before the duo formed does not exist; a duo formed mid-month counts only its days (and needs
  its own 3 official days).
- Ending the duo leaves nothing to read; a new partner starts from the new duo's first day and never
  sees the old duo's months.

### Historical integrity

A FINAL month is the sum of FINAL days, and a FINAL day cannot move: closed days cannot be written
(`LI_HISTORY_LOCKED`), the Daily Standard of a closed day is its version (ADR-078), focus days are
fixed at start, `duel_since` is stamped (ADR-079). pgTAP snapshots a closed month, changes both
standards, moves a member to UTC+14 and back, adds a goal — the month is identical. e2e changes both
standards and checks the champion on screen.

## Personal Records (owner-only)

`public.my_records()` — SECURITY INVOKER, one row, only the caller's own rows:

| Record               | Definition                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| MAIOR SEQUÊNCIA      | the existing longest streak (`my_progress_summary` + today live; ADR-038 rules unchanged)  |
| MAIOR FOCO · DIA     | most settled effective focus on one `local_date` (a running session is not settled)        |
| MAIOR FOCO · SEMANA  | most effective focus in a **closed** Monday–Sunday week (the Analytics week)               |
| DIAS PERFEITOS · MÊS | most Perfect Days (`planned > 0 and completed = planned`) in a calendar month, closed days |

Ties keep the **first** date / period. A day without tasks is never perfect. No gamable records
(tasks created / completed). The partner never receives my records.

## Milestones (MARCOS)

Fixed thresholds derived from the same numbers — nothing is earned or stored:

| Kind         | Thresholds      | From                                                               |
| ------------ | --------------- | ------------------------------------------------------------------ |
| Streak       | 7 / 30 / 100    | the **longest** streak (losing the current run takes nothing back) |
| Focus        | 10 / 50 / 100 h | settled effective focus, all history, whole hours                  |
| Perfect Days | 5 / 10 / 30     | Perfect Days of closed days, all history                           |

Locked: progress ("72h / 100h", read "72 de 100 horas"); reached: **CONQUISTADO**. Progress shows the
next milestone of each kind (closest first) and the rest under "VER TODOS OS MARCOS". The streak
milestones follow the existing streak rules (a standard change recalculates it, ADR-038). No unlock
date, no XP, no duo milestones. **V2 Phase 9** (ADR-086): reaching a milestone is now also recorded as a
durable unlock (`public.celebrations`), so a milestone stays CONQUISTADO even if the derived value
later drops, and its first crossing is celebrated once (docs/CELEBRATIONS.md). Milestones reached
before Phase 9 are a seen baseline.

## Interface

| Where              | What                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Progress           | DUELOS: the current month (title, AO VIVO / MÊS ENCERRADO, headline, score, draws, tiebreak) → VER DETALHES (wins, monthly execution, monthly focus, draws, days without result, tiebreak, the rules) → MESES ANTERIORES (collapsed) → ÚLTIMOS 7 DUELOS; then RECORDES and MARCOS (compact rows) |
| DUPLA              | one row: MÊS · AO VIVO · "Você 8 — 5 Matheus" › → `/progress#month`                                                                                                                                                                                                                              |
| Today, Focus, Plan | unchanged                                                                                                                                                                                                                                                                                        |

Accessibility: the month's accessible name is a sentence ("OUTUBRO 2026, AO VIVO: Brendon lidera
Matheus por 8 vitórias a 5."); leadership never depends on colour; milestone bars are `progressbar`s
with `aria-valuetext` ("30 DIAS DE SEQUÊNCIA: 23 de 30 dias"); disclosures are buttons with
`aria-expanded`. Copy: `src/i18n/pt-BR.ts` → `monthly`, `records`.

## Realtime (no polling)

- The months are re-read with the duo numbers (`loadDuoProgress`) on the existing `partnerVersion`
  and partner focus transitions — the same events as the Daily Duel. Only FINAL days count, so nothing
  ticks: the month moves when a day becomes final (next re-read, reconnect, tab visible, reload).
- My records / milestone totals are re-read once when one of my focus sessions ends (the count of
  today's finished sessions changes — an event) and with every full Progress refresh.
- No timer fetches anything: e2e watches DUPLA and Progress for 72 s across a minute boundary while
  the partner focuses — zero requests.

## Privacy

- `duo_duel_months` is the Phase 7 projection over more days: member-derived (no user-id parameter),
  dates / integers / booleans only (pgTAP asserts the types); private tasks and sessions count in the
  numbers, never by title or id (e2e checks the JSON).
- `my_records` reads only the caller's rows (INVOKER + owner filter); dates and integers only.
- No task, goal, vision, mirror, Top 3, focus goal or commitment source reaches either function.

## Performance

Progress load adds two calls: `duo_duel_months` (≈ 186 rows at most, in the duo part, in parallel)
and `my_records` (one row, in parallel with the series). No query per day, month, record or
milestone. Queries use the existing `(owner_id, task_date)` and `focus_sessions (user_id, …)` indexes;
no new index was needed.

## Tests

- Unit: `tests/unit/monthly.test.ts` (19), `tests/unit/records.test.ts` (10).
- pgTAP: `supabase/tests/v2_phase8_monthly.test.sql` (51).
- E2E: `tests/e2e/v2-phase8.spec.ts` (project `v2p8-390`, 12 tests covering the 16 scenarios).

## DEV-only fixtures

`dev_fixture_add_focus(p_rows)` (completed sessions on past days), `dev_fixture_reset_focus()` and the
120-day `dev_fixture_backdate_duo` live in `supabase/dev/test_fixtures.sql` — never in production.

## V2 Phase 10

No change to the month, records or milestones; nothing of them is pushed (a monthly champion stays
an in-app celebration, docs/CELEBRATIONS.md; Web Push: docs/WEB_PUSH.md).
