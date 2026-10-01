# Analytics (Stage 7)

Progress, streak, the Daily Standard, the weekly competition, head-to-head and the habit analytics.
Everything here is **derived** from two tables — `daily_tasks` (task performance) and
`focus_sessions` (focus performance). There are no statistics tables: two users' history is small,
and a derived number can never disagree with its source (ADR-037).

Code: SQL in `supabase/migrations/…_progress_functions.sql`, `…_summary_longest_closed.sql`,
`…_duo_weeks_together.sql`; TypeScript maths in `src/lib/progress.ts` (pure, unit-tested); loading in
`src/lib/progress-data.ts` and `src/app/(app)/progress-actions.ts`; live state in
`src/components/use-progress.ts`.

## Definitions

| Term           | Definition                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Day            | A local `task_date` in `profiles.timezone` (never UTC). Weekdays are ISO, 1 = Monday.                                 |
| Planned        | Every task on the day: `pending` + `completed` + `skipped`. **Skipped stays in the denominator.**                     |
| Completed      | Tasks with `status = 'completed'`.                                                                                    |
| Completion %   | `completed / planned`. Shown as `Math.round(100 · c / p)` (half up, like Postgres `round`).                           |
| Neutral day    | `planned = 0`. Completion is `null` ("—", "no tasks"), **never 0 % or 100 %**. It neither counts nor breaks a streak. |
| Daily Standard | `profiles.daily_standard_percent`, 1–100, **default 80**. Personal. Settings offers 70 / 80 / 90 / 100.               |
| Standard met   | `planned > 0 and completed · 100 ≥ standard · planned` — the **exact** ratio, never the rounded %.                    |
| Perfect Day    | `planned > 0 and completed = planned` (100 %).                                                                        |
| Missed day     | A closed day with tasks that did not meet the standard.                                                               |
| Week           | Monday–Sunday of the local `task_date` calendar.                                                                      |
| Focus of a day | Sessions belong to the **local day they started** (a 23:50 session counts for that day).                              |

Future dates are never part of any number: every function stops at the user's local today.

## Streak

Consecutive **standard-met** days, counted in the database over the whole history
(`private.streaks`):

- Closed days (before today) are final. A missed day resets the run to 0.
- Days with no tasks do not exist in the loop: they neither count nor break.
- Days before the first task do not exist.
- **Today never breaks the streak early.** `streak_before_today` is the run over closed days; today
  adds 1 once it meets the standard: `current = streak_before_today + (today met ? 1 : 0)`.
- Longest streak = `max(longest over closed days, current)`. The app computes it live from
  `longest_closed`, so undoing today's last task cannot leave an inflated record.
- Changing the standard recalculates the streak over **all** history (V1 keeps no standard history;
  ADR-038).

The app shows the streak live: `liveStreak()` adds today from the tasks on screen, so a check-off
moves the number immediately without a refetch.

## Daily Standard

- Stored per user; `check (1..100)`, not null, default 80; `authenticated` may update only that
  column (and RLS limits it to the own row).
- Affects: streak, calendar states (met / missed), Today's "N more to meet your standard", the
  chart's colours.
- Does **not** affect the competition. Lowering it cannot help anyone beat their partner.

## Progress screen

| Number             | Source                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| Completion rate    | `totals(days, rangeFrom(range, today), today)` over `my_daily_progress`           |
| Ranges             | 7D, 30D, 90D ending today; YEAR = 1 January → today                               |
| Streak / longest   | `my_progress_summary` + today live                                                |
| Focus              | Sum of `focus_seconds` over the range (running sessions count their elapsed time) |
| Perfect days       | Days in the range with `planned > 0 and completed = planned`                      |
| Chart              | 7D / 30D: one bar per day · 90D: per ISO week · YEAR: per month (bucket c / p)    |
| Calendar           | Current month; states perfect / met / missed / neutral / today / future           |
| Day review         | `daily_tasks` of that past date (read-only; "past days are the record")           |
| Consistency · 30 d | `my_habits` over the last 30 **closed** days                                      |
| Insights           | Descriptive counts and rates only (never causes)                                  |

The series is loaded once (`seriesFrom(today)` = the earliest of 1 January, today − 89 and the first
of the month) and every range is computed on the client. Today's entry is replaced by the live counts
(`withToday`).

### Habits and insights

- Habits are **recurring** tasks only (one-offs are not habits), over **closed** days (today is still
  open); skipped counts as not completed.
- A habit needs **3 scheduled occurrences** before it can be "best" or "most missed"
  (`MIN_HABIT_SAMPLE`) — no "best habit" from 1 / 1.
- Title: the routine's current name, or its last snapshot once archived.
- Strongest weekday needs 3 samples of each weekday and at least 3 eligible weekdays.
- Insight lines say what happened ("Gym: 11 of 12 in the last 30 days (92%)"), never why.

## Weekly competition

- **Score = raw completion % of the week** (`completed / planned`, Monday → today). The standard plays
  no part; **focus is shown next to it but is never part of the score**.
- Leader: exact ratio comparison (`compareRatio`, cross-multiplication). A lead smaller than 1 point
  shows `<1%`; equal ratios are `TIED`. No score while either side has nothing planned.
- My side is live (today's tasks on screen); the partner's side comes from `duo_weeks` and is re-read
  after each realtime refetch.
- Each member's days are their own local `task_date`s; the weeks are framed by the caller's Monday, and
  each member is counted only up to their own today.

## Head-to-head

- Only **completed** weeks count. **The current week never produces a result**, whatever the lead.
- A week is a result only if **both** had tasks (`planned > 0`); otherwise it is `ineligible`
  ("no contest").
- Only **full weeks together** count: a completed week that started before the duo became complete
  (the second member's `joined_at`, in the caller's calendar) has no partner side at all (ADR-039).
- Equal exact ratios are a **draw** (shown, counted apart from wins).
- History: 8 completed weeks are loaded (`HISTORY_WEEKS`); the strip shows them oldest → newest.

## Challenges (Stage 8)

Standard-days and focus-time challenges reuse these definitions (exact standard, neutral days,
completed focus by start day); rules and derivation in [CHALLENGES.md](CHALLENGES.md). They never
change the weekly head-to-head.

## Weekly review, briefing, review day

- Weekly review (Stage 8): the current week (live, **CURRENT LEADER**, never a winner) and every
  completed week with data (**WINNER** by / draw / no contest), tasks completed `c / p`, focus, perfect
  days, best habit and most missed routine for that week (`my_habits`, same 3-sample rule) and the
  head-to-head record. `reviewWeeks()` builds the list.
- History (Stage 8): the calendar navigates back to the account's first month (earlier months read
  on demand with `my_daily_progress`); a past day shows its task snapshots, completion and focus,
  read-only.
- Morning briefing: today's task count, yesterday's % (or "—" for a neutral day), the live streak.
- Review day: today's %, the live streak once the standard is met, the partner's today.

## Goal proof (V2 Phase 5)

Derived like everything here (docs/GOAL_PROOF.md): completed linked tasks (1 action each, by
`task_date`), completed linked focus (effective seconds, by `local_date`), completed milestones (by
`completed_on`). Skipped / missed / active / paused are not proof; a routine counts only through its
completed occurrences. Progress shows at most 3 goals with proof in the chosen range
(`my_goal_proof_summaries`, one call). No stats table, no score, no percentage.

## Daily duel (V2 Phase 7)

Derived from the same sources (docs/DUEL.md): Execution = completion ratio (exact, both need tasks),
Focus = effective focus of the day in whole minutes, Consistency = each member's Daily Standard
(`standardMet`: MET / NOT_MET / NEUTRAL). More categories won wins the day. `duo_duels()` is re-read
with the duo numbers (`loadDuoProgress`). It never changes the weekly competition or head-to-head.

## Database functions

| Function                          | Security | Returns                                                                                               |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `my_progress_summary()`           | INVOKER  | today, standard, streak_before_today, current, longest_closed, longest, today counts, first task date |
| `my_daily_progress(p_from, p_to)` | INVOKER  | one row per day: planned, completed, focus_seconds, focus_sessions (≤ 400 days, capped at today)      |
| `my_habits(p_from, p_to)`         | INVOKER  | routine id, title, planned, completed (closed days)                                                   |
| `duo_weeks(p_weeks = 8)`          | DEFINER  | current week + up to 26 completed weeks: counts, focus, perfect days for me and the partner           |
| `partner_progress_summary()`      | DEFINER  | the partner's streak_before_today, current_streak, standard                                           |

Helpers in `private` (not exposed by the API): `local_today`, `materialize_tasks`, `focus_seconds`,
`day_stats`, `standard_met`, `streaks`. The INVOKER helpers run as the caller, so RLS still applies
(an outsider calling `private.day_stats(someone)` gets zeros — pgTAP checks it).

`my_progress_summary()` and `duo_weeks()` materialise routines up to today first
(`private.materialize_tasks`, shared with `ensure_my_daily_tasks()`); `duo_weeks()` does it for the
partner too, so a partner who has not opened the app today is still compared on their scheduled day.

## Privacy

- The partner-facing functions (`duo_weeks`, `partner_progress_summary`) derive the partner from
  `auth.uid()` → duo membership (no user-id parameter) and return **integers only** — no title,
  note, category, time or reflection can leave them (pgTAP asserts no `text` column).
- **Private tasks count in the aggregates** (planned / completed / perfect days), so the competition
  is fair, but their details are never listed and they send **no broadcast** — no title, no timing.
  The partner sees them in the numbers the next time their side is re-read.
- Private focus sessions count in the partner's focus total (seconds only).
- The partner's history from before the duo is not returned.
- Outsiders and users without a duo get only their own numbers; anon gets nothing.

## Live updates (no polling)

- **Own numbers**: computed on the client from today's tasks and focus on top of the loaded series —
  a check-off moves the streak, week %, chart and calendar at once, no request.
- **Partner numbers**: every realtime refetch of the partner (activity / activity_removed /
  tasks_changed broadcasts, reconnect, back online, tab visible, **first join**) bumps
  `partnerVersion`; `useProgress` then re-reads `duo_weeks` + `partner_progress_summary` once.
  No new broadcast, no extra channel.
- **Standard change**: optimistic, then a full `refreshProgress()` (the streak is recalculated).
- **Day change**: the app reloads when the local date changes (timer to the next local midnight,
  database-corrected clock, and on tab visible), so every screen starts the new day from Postgres.

## Performance

- Two round trips on load (summary first — it materialises today — then series, habits and the duo
  part in parallel), all behind the existing `(app)` layout load.
- Every query is by owner and date range on `daily_tasks (owner_id, task_date)` and
  `focus_sessions (user_id, started_at)`; history is bounded (series ≤ 400 days, ≤ 26 weeks).
- The streak loop reads a user's closed days once; fine for years of two users' history. If it ever
  grows, add a cache then (ADR-037), not before.

## Known limitations

- A private completion reaches the partner's competition numbers only on their next re-read (the next
  shared event, reconnect, tab visible or reload) — by design, private tasks emit nothing.
- A standard change is not pushed to the partner; they see the partner's new streak on their next
  re-read.
- Weeks are framed by the viewer's Monday; with members in far-apart time zones the two views of the
  same week can differ by a day at the edges.
- **Closed history is frozen (Stage 9, ADR-050 / ADR-051):** tasks of a closed local day cannot be
  inserted, changed or deleted through the API, routine templates cannot manufacture or suppress
  past occurrences, focus days are fixed at start, and the boundary never moves back on a timezone
  change (docs/DATABASE.md → Closed history). A closed week's result, a past streak inside a fixed
  standard and a finished challenge therefore cannot be rewritten. The streak still recalculates
  when the owner changes their own Daily Standard (ADR-038): it is personal, never a competition.

## Tests

- Unit: `tests/unit/progress.test.ts` (34) — rounding, exact standard, skipped, day states, live streak,
  ranges, chart buckets, calendar, ISO weeks at year edges, leader / `<1%`, completed weeks only,
  draws, ineligible, focus never decides, habits sample, insights, day boundary by time zone.
- pgTAP: `supabase/tests/stage7_progress.test.sql` (78).
- E2E: `tests/e2e/stage7.spec.ts` (3) and the real numbers in `tests/e2e/app.spec.ts`.
