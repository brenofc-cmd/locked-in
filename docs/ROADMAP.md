# Roadmap

## LOCKED IN V2

V1 (the ten stages below) is in production: `main` at `606546f`, https://locked-in-rust.vercel.app.
V2 is built in ten phases, each on its own branch, merged to `main` only when VERIFIED.

| #   | Phase                                                          | Status               | Scope                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Foundation + Restore State                                     | **VERIFIED**         | Versioned, user-scoped Resume State: last route at `/`, Progress range / month, scroll, drafts (RESUME_STATE.md)                                                                                       |
| 2   | School Planner + Shared Calendar                               | **VERIFIED**         | Planner (PRÓXIMOS / CALENDÁRIO, sharing, reminders, Today card, Add to tasks) + Partner Presence 2.0 / last seen (PLANNER.md)                                                                          |
| 3   | Goals, Vision & Accountability Mirror                          | **VERIFIED**         | /goals: VISÃO, METAS (90 dias / este mês / longo prazo, achieved, archive, milestones), ESPELHO — private (GOALS.md)                                                                                   |
| 4   | North Star + Morning Experience                                | **VERIFIED**         | LEMBRE-SE DO PORQUÊ (featured / fallback), TOP 3 DE HOJE (real tasks), morning card once per user / day (NORTH_STAR.md)                                                                                |
| 5   | Goals → Actions → Proof                                        | **VERIFIED**         | Tasks / routines (snapshot) / focus linked to private goals; proof derived (actions, focus, milestones); /goals/[id] (GOAL_PROOF.md)                                                                   |
| 6   | Duo Accountability 2.0                                         | VERIFIED             | Partner Hub 2.0, shared commitments → proof, nudges, daily check-in (see below)                                                                                                                        |
| 7   | Daily Duel + Transparent Gamification                          | VERIFIED             | Daily duel derived from real actions: Execution / Focus / Consistency, transparent winner, Live vs Final (see below)                                                                                   |
| 8   | Monthly Champion + Records + Milestones                        | VERIFIED             | Monthly champion from FINAL daily duels (wins, transparent tiebreaks), personal records, milestones — derived, Progress + one DUPLA row (see below)                                                    |
| 9   | Celebrations + Reviews 2.0 + Non-Negotiables + Weekly Planning | VERIFIED             | Once-only, reduced-motion-aware celebrations of real facts; durable milestone unlocks; private non-negotiables; 3 weekly priorities; reflections + objective facts in the existing reviews (see below) |
| 10  | Web Push + Advanced Reminders + Final Polish / Audit (last)    | PROD (2-dev pending) | Real Web Push with the app closed (opt-in, per device), server-side reminders, final security / performance / PWA / a11y audit, two-device acceptance, V2 final verification (see below)               |

Not in Phase 1 (by instruction): planner, goals / vision, North Star, Daily Duel, Monthly Champion,
new animations, Web Push, new gamification.

## V2 Phase 10 — Web Push + Advanced Reminders + Final Polish / Audit (official scope, 2026-10-06)

The last V2 phase. Goal: notifications that really arrive with the app closed, reliable reminders,
the known leftovers closed, the whole product audited, two people on two devices — and V2 declared
ready. No new feature families, no V3. Navigation unchanged (HOJE · DUPLA · FOCO · PLANEJAR ·
PROGRESSO), no new tab.

Rules (approved):

1. **Web Push, opt-in only.** Nothing is asked on load. Configurações → Notificações → "Ativar neste
   dispositivo" is the only path to the browser prompt; default / granted / denied / unsupported are
   stated in text. Denied never re-prompts. Old users are never enabled silently.
2. **One subscription per device / browser** (`push_subscriptions`, owner-only, endpoint unique,
   re-registration = safe upsert). A user may have several devices. Endpoints only on known push
   services (allowlist). Disable on this device = unsubscribe + delete the row.
3. **Shared device.** Sign-out deletes this device's subscription (server-side, in the sign-out
   request) and unsubscribes the browser; on sign-in, a browser subscription that is not the
   signed-in user's is unsubscribed. B never receives A's pushes on a shared browser.
4. **One scheduler: Supabase `pg_cron` (every minute) → `private.push_tick()`** (SQL, idempotent:
   enqueues due deliveries; calls the sender only when something is pending) **→ `pg_net` → Edge
   Function `push-dispatch`** (Deno, WebCrypto, no npm push library). The Edge Function is
   authenticated by a dispatch secret generated inside the database (Vault); it reaches the
   database with the platform's own connection, so no service-role key exists in Vercel. No
   browser scheduler, no polling, no Vercel Cron.
5. **VAPID**: the private key is generated by the Edge Function and kept in Supabase Vault (never
   in the repo, the client, logs or docs); the public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Vercel /
   `.env.local`); subject = the site URL (no e-mail).
6. **What is pushed** (each with its own switch, default on once a device is enabled): Planner
   reminders (existing `reminder_days_before`: 08:00 local of the reminder day; on the day of a
   timed event at most 2 h before it; never after the event started), DAR UM TOQUE (delivery of the
   existing nudge — Phase 6 limits unchanged, no second nudge), Review do dia (21:00 if not written),
   Review semanal (Sunday 19:00 if not written), Planejamento semanal (Monday 08:00 if the week has
   no priority), and a rate-limited test notification. Not pushed: task completions, celebrations,
   commitments (kept in-app — no spam).
7. **Quiet hours** reuse `user_settings`: a due reminder inside quiet hours is created only when
   they end, if it is still before its expiry (never "amanhã" after the event started).
8. **Exactly-once per logical event**: `notification_deliveries` with `unique (user_id,
dedup_key)` (`planner:<event>:<n>:<date>`, `nudge:<id>`, `review-day:<date>`,
   `review-week:<monday>`, `plan-week:<monday>`, `test:<minute>`); at-least-once scheduler safe;
   transient failures retry with backoff, then `failed`; 404 / 410 delete the subscription. No
   payload stored — text is built at send time.
9. **Payload privacy**: title / short body / a route key only; never a goal, vision, mirror,
   reflection or partner data beyond the nudge itself; "Ocultar detalhes" sends generic text.
   **Click** opens a whitelisted route (`/planner`, `/partner`, `/today`, `/plan/week`,
   `/progress`, `/settings`), anything else → `/today`; an explicit route beats Resume State.
10. **PWA**: one service worker (`/sw.js`, scope `/`) for push + an offline fallback page only — no
    caching of pages, API, auth or Supabase responses; updates activate on the next load.
11. **Final audit**: RLS / grants / DEFINER / IDOR on every table, secrets, logs, realtime (single
    channel, reconnect, no polling — 70 s focus test), performance (no N+1, bounded history),
    responsive 375 → 1440, axe (no serious / critical), auth / session / shared device, Resume
    State, full pgTAP on DEV, full E2E, `npm audit` classified (source-map-js investigated, no
    `--force`), the PRÓXIMA SEMANA wording fixed.
12. **Acceptance**: PROD migrations, Vault / env / scheduler, a real push to a closed app, click →
    route, duplicate prevention, quiet hours, disable, shared device, full production smoke and a
    two-device run (Brendon + Matheus). Anything that cannot be proven is recorded as blocked, never
    as VERIFIED.

Not in Phase 10: V3, new gamification, e-mail / SMS, commitment push, celebration push, changes to
the duel / month / streak / proof / focus rules.

## V2 Phase 9 — Celebrations + Reviews 2.0 + Non-Negotiables + Weekly Planning (official scope, 2026-10-05)

Goal: close the behavioural loop PLANEJAR → EXECUTAR → PROVAR → REFLETIR → CELEBRAR → AJUSTAR →
REPETIR without turning LOCKED IN into a game or a motivational app. No hype, just proof.

Navigation unchanged (HOJE · DUPLA · FOCO · PLANEJAR · PROGRESSO); no new tab; DUPLA and FOCO gain
nothing; Today gains only a discreet "◇ NÃO NEGOCIÁVEL" label and a temporary celebration.

Rules (approved):

1. **Celebrations** — short (≈1–2 s), premium, rare, factual; a temporary overlay over the current
   screen (no route change, never in Resume State), closable, `prefers-reduced-motion` → final state
   without animation. Only: PERFECT DAY (the existing definition: planned > 0 and completed = planned,
   celebrated when today becomes perfect, at most once per date), STREAK 7 / 30 / 100, FOCUS 10 / 50 /
   100 h, PERFECT DAYS 5 / 10 / 30 (Phase 8 milestones, first crossing only), MONTHLY CHAMPION (a
   FINAL month only, once per month; a final draw gets the smaller "MÊS ENCERRADO · EMPATE"; never a
   live month). Nothing is sent to the partner (reactions stay the social layer).
2. **Durable unlock** — reaching a milestone is a historical event, not an analytics cache: one
   owner-only table `celebrations` (kind + key, unique per owner) holds the milestone unlocks
   (validated by the database against the real numbers, immutable, with the value at unlock), the
   Perfect Day / month receipts and `seen_at`, so each celebration shows once across devices. A
   milestone stays unlocked even if a later standard change lowers the derived value.
3. **Baseline** — milestones already reached when the feature ships are recorded as baseline
   (already seen): no retroactive burst of celebrations.
4. **Non-Negotiables** — a routine or a one-off task can be marked NÃO NEGOCIÁVEL. Private side
   tables (the Phase 5 pattern: shareable task rows never carry the flag); a routine's flag is
   snapshotted on each occurrence it generates and follows today's occurrence; a closed day's flag
   never changes. No weight anywhere: completion, Daily Standard, streak, duel, month untouched. The
   weekly review shows "NÃO NEGOCIÁVEIS 8 / 10".
5. **Weekly Planning** — PRIORIDADES DA SEMANA (distinct from TOP 3 DE HOJE): at most 3 results for a
   Monday–Sunday week (the existing week), one per position, open / done, set by the owner
   (self-declared, never proof, never in the duel or the month). Current and next week editable; a
   closed week is frozen. PLANEJAR gets one row (ESTA SEMANA · n prioridades / PLANEJE SUA SEMANA)
   → `/plan/week`. Not on Today.
6. **Reviews 2.0** — the existing Day Review and Weekly Review evolve (no parallel system): three
   optional reflections each (O QUE FUNCIONOU? / O QUE ME ATRAPALHOU? / O QUE VOU MUDAR …), owner-only,
   plus objective facts derived by the existing analytics (completion, focus, Daily Standard days with
   the standard of each day, Perfect Days, Non-Negotiables, weekly priorities done). Facts are stated,
   never interpreted (no AI). History stays in PROGRESSO → HISTÓRICO (weekly reviews; a past day shows
   its reflection). After a weekly review: PLANEJAR PRÓXIMA SEMANA. The existing once-a-week toast is
   the start-of-week moment (no new modal).
7. **Privacy / integrity** — every new row is owner-only (partner, outsider, anon: zero); no new
   channel; no SECURITY DEFINER function; no polling or timer that fetches.

Not in Phase 9: Web Push / background push (Phase 10), XP, coins, levels, shop, global leaderboard,
AI coach, generated motivational messages, groups.

## V2 Phase 8 — Monthly Champion + Personal Records + Milestones (official scope, 2026-10-05)

Goal: turn the real, historically stable data LOCKED IN already records into long-term progression.
Phase 7 answers "who executed better today?"; Phase 8 answers "who was more consistent over the
month?" and "what is my best performance so far?". Everything stays explainable. No hype, just proof.

Questions: who had the best month in the duo · my personal records · which consistency milestones I
reached · the next milestone.

Deliverables: monthly champion (current month live + recent months, details on demand) · personal
records · milestones (next first, the rest on demand) · one compact month row on DUPLA · realtime
without polling · privacy · historical integrity · timezone / year boundaries · duo lifecycle.

Rules (approved):

1. **Built on the Daily Duel.** Each FINAL daily duel of the month gives a win to A, a win to B, a
   draw, or no result (SEM RESULTADO SUFICIENTE). No parallel competition, no points: the monthly
   score is literally **days won**; draws are counted apart; insufficient days give nothing.
2. **Days of a month** = the duel dates of that calendar month (each side is its member's own local
   day, as in Phase 7), from `duos.duel_since`; only FINAL days count (the same Phase 7 closing:
   closed for both and nothing running). Today and any non-final day never count.
3. **Minimum evidence:** at least **3 official days** (a win or a draw) in the month; fewer →
   SEM RESULTADO SUFICIENTE NO MÊS (the numbers are still shown). The same minimum applies to the
   live leader — no one is "ahead" on one day.
4. **Decision:** more daily wins → **tiebreak 1** monthly Execution: `Σ completed / Σ planned` over
   the FINAL days of the month where **both** had tasks (Execution comparable), exact ratio
   (cross-multiplication) → **tiebreak 2** total effective focus seconds of the FINAL days of the
   month (pauses never count) → otherwise **EMPATE DO MÊS**. No fourth tiebreak. A tiebreak that
   cannot compare (no eligible day) does not decide. The reason is always shown.
5. **Live vs Final:** the current month is **MÊS · AO VIVO** (ESTÁ NA FRENTE / EMPATADOS / SEM
   RESULTADO SUFICIENTE AINDA) — never a champion. A month is FINAL only when its last calendar day
   is a FINAL duel (closed for both members, nothing running) — no new closing concept. Then
   **CAMPEÃO DE <MÊS>** / **EMPATE DO MÊS** / **SEM RESULTADO SUFICIENTE NO MÊS**.
6. **Derived, never stored:** no monthly result / records / milestones table. A FINAL day cannot
   move (closed history, Daily Standard versions, focus fixed at start, `duel_since`), so a FINAL
   month cannot change champion (standard, timezone, goal, routine or duo changes).
7. **History:** the current month + up to 5 previous months of the current duo (6), never whole
   years by default. A month before the duo formed does not exist; a duo formed mid-month counts
   only its days. Ending the duo leaves nothing to read; a new partner starts fresh.
8. **Personal records (owner-only):** longest streak (the existing `longest` — same rules, ADR-038
   unchanged) · most effective focus in a day (settled sessions, by the day a session started) ·
   most effective focus in a closed Monday–Sunday week · most Perfect Days in a calendar month
   (closed days, `planned > 0 and completed = planned`). Ties keep the **first** date / period. No
   gamable records (tasks created / completed counts).
9. **Milestones (MARCOS, personal, derived):** streak 7 / 30 / 100 days (from the longest streak),
   effective focus 10 / 50 / 100 h (settled total), Perfect Days 5 / 10 / 30 (closed days, total).
   Locked → progress ("23 de 30 dias"); reached → CONQUISTADO. No unlock date, no unlock table, no XP.
10. **UI:** Progress keeps VISÃO GERAL → METAS → DUELOS → HISTÓRICO; the month summary leads
    DUELOS (details and previous months on demand); RECORDES and MARCOS are compact rows (next
    milestones first, the rest collapsed). DUPLA gets one row (MÊS · AO VIVO · Você 8 — 5 Matheus ›
    → Progress). Today, Focus and Plan unchanged; no new tab, no big celebration (Phase 9).
11. **Realtime:** the month is re-read with the duo numbers (the existing `partnerVersion` / partner
    focus transitions) — events, never a timer; Focus stays without periodic requests.
12. **Privacy:** the month exposes only dates / integers / booleans of the duo (the Phase 7 duel
    numbers); never a task, goal, vision, mirror, Top 3, focus goal or commitment source. Records and
    milestones read only the caller's own rows (SECURITY INVOKER).

Architecture decision (2026-10-05): the database returns, for whole months, **the same per-day
numbers as `duo_duels`** (`duo_duel_months`, DEFINER, built on `private.duel_side` and
`private.standard_on`); the client decides each day with the existing `decideDuel` and the month
with a pure `decideMonth` (`src/lib/monthly.ts`). One implementation of the duel rules — porting
them to SQL would create a second competition to keep in sync. pgTAP covers the data (which days,
FINAL, numbers, boundaries, immutability, privacy); unit tests cover the decisions; e2e checks the
screen against both.

Not in Phase 8: large victory animations, confetti, full-screen celebrations, non-negotiables,
weekly planning, new reviews, Web Push / push notifications, XP, coins, levels, shop, global
leaderboard, groups, AI coach, duo milestones ("won 3 months").

## V2 Phase 7 — Daily Duel + Transparent Gamification (official scope, 2026-10-01)

Goal: one honest daily duel between the two members of a duo, decided only by what LOCKED IN already
records, with every number and every rule visible. No hype: the duel shows who did more today and
why — nothing is earned, stored or inflated.

Core loop: **ACTION → DERIVED NUMBERS → CATEGORY → RESULT OF THE DAY**.

Deliverables: daily duel (3 categories) · transparent winner · tie · insufficient state · Live vs
Final · Today compact card · Partner detailed view (numbers + the rules) · last 7 duels in Progress ·
realtime without polling · privacy · historical integrity · timezone rules · duo lifecycle.

Rules:

1. **Derived, never stored.** The duel of a day is computed from `daily_tasks` and `focus_sessions`
   (the same sources as Progress). No duel / score / stats table, no stored winner (ADR-037).
2. **Execution** = the day's completion ratio `completed / planned` — exactly the Progress
   definition: skipped stays in the denominator, private tasks count (integers only). Decided only
   when **both** planned > 0; compared by the exact ratio (cross-multiplication, never the rounded
   %). The Daily Standard plays no part in Execution.
3. **Focus** = the day's effective focus — exactly the Progress "focus of a day"
   (`private.focus_seconds`, sessions belong to the local day they started, pauses never count).
   Compared in **exact seconds**; more real focus wins. **0 × 0 is NEUTRAL / NÃO COMPARÁVEL**, never
   a tie (official rule, 2026-10-01): the absence of focus never counts as a decided category.
4. **Consistency** (official rule, 2026-10-01) = each member's **existing Daily Standard** for the
   day — no new formula: MET / NOT_MET / NEUTRAL exactly as Progress (`standardMet()` /
   `private.standard_met`: `planned > 0 and completed·100 ≥ standard·planned`; NEUTRAL =
   `planned = 0`), each with their own Daily Standard **of that day**. A MET vs B NOT_MET → A
   wins; A NOT_MET vs B MET → B wins; both MET → TIE; both NOT_MET → TIE; either side NEUTRAL (or
   both) → NOT COMPARABLE. The standard is versioned per local day (ADR-076 / ADR-078): a FINAL duel
   keeps the standard of its day.
5. **Category result**: ME / PARTNER / TIE / INSUFFICIENT (not comparable). Nothing else.
6. **Result of the day**: the side that won **more categories** wins (e.g. 2–1, 1–0). Equal category
   wins with at least one decided category = **TIE** (EMPATE). No decided category (all
   insufficient) = **INSUFFICIENT** (SEM RESULTADO SUFICIENTE). No weights, no points, no
   tiebreaker beyond this.
7. **Live vs Final.** A duel is **FINAL** only when the day is closed for **both** members
   (`private.history_locked_through`, Stage 9) and no focus session of that day is still running.
   Until then it is **LIVE** and never says anyone won: **ESTÁ NA FRENTE** / **EMPATE** / **SEM
   RESULTADO SUFICIENTE**. Only a final duel shows **RESULTADO FINAL** with **VENCEU O DIA** /
   **EMPATE** (or SEM RESULTADO SUFICIENTE). Execution and Focus of a final duel never change (their
   sources are frozen — rule 9).
8. **Timezone.** A duel is a calendar date D. Each member's side is **their own local day D**
   (`task_date` / `local_date` in their own `profiles.timezone`), like the weekly competition. The
   list is framed by the viewer's local today; future dates never exist.
9. **Historical integrity.** A final duel is immutable because its inputs are: closed days cannot
   be written (`LI_HISTORY_LOCKED`), routines cannot manufacture or suppress past occurrences, focus
   days are fixed at start, the boundary never moves back on a timezone change. Routines are
   materialised for both members before every read (as `duo_weeks`). pgTAP proves a final duel does
   not move under every write path. The Daily Standard of a closed day is its recorded version and the
   first duel day is stamped on the duo (ADR-078 / ADR-079): neither a later standard change nor a
   timezone move reinterprets a FINAL duel.
10. **Privacy.** One partner-facing function, member-derived (no user-id parameter), returns
    **integers / booleans / dates only** — planned, completed, the Daily Standard, focus seconds
    and a running flag. No title, note, category, time, goal, commitment, check-in or Top 3. Private tasks and
    sessions count in the numbers only.
11. **Duo lifecycle.** A duel exists only for an active, complete duo and only for days on or after
    the day the duo became complete (in each member's own calendar). Ending the duo removes every
    duel for both (nothing is stored); a future partner never sees a duel of the old duo; forming
    again starts from the new date. No duo / waiting for a partner = no duel card.
12. **Realtime without polling.** My side is live from local state (tasks on screen, my focus
    clock); the partner's side is re-read through the existing `partnerVersion` (feed / tasks /
    focus broadcasts, reconnect, tab visible) and the partner's running session is ticked locally
    from `partner_current_focus()`. No new channel, no client broadcast, no timer that fetches.
    Private completions reach the partner on the next re-read (same limitation as the competition).
13. **Interface.** Today: one compact card (DUELO DE HOJE: the 3 categories and the live state).
    Partner: the detailed duel (each category's numbers for both, the result line and a "como é
    decidido" block with these rules). Progress: the last 7 duels (D−1 … D−7, since the duo formed),
    each RESULTADO FINAL / AO VIVO / SEM RESULTADO SUFICIENTE. Copy in `src/i18n/pt-BR.ts`; no big animations.

Not in Phase 7: XP, coins, monthly champion, records, milestones, badges, ranking, streak of wins,
large animations, Web Push, a stored score. Phase 8 is not started.

## V2 Phase 6 — Duo Accountability 2.0 (official scope, 2026-09-30)

Goal: turn the Partner area into a real accountability system between two people, connecting
shared commitments to the real proof LOCKED IN already records.

Core loop: **COMMITMENT → ACTION → PROOF → PARTNER ACCOUNTABILITY**.

Deliverables: Partner Hub 2.0 · shared commitments · commitment → proof · nudges (DAR UM TOQUE) ·
daily check-in · partner daily summary · existing reactions as acknowledgement · realtime for
commitments / nudges / check-in on the existing `duo:<duo_id>` channel · privacy controls · short
commitment history.

Rules (approved):

1. ACTIVE → MISSED at the close of the owner's local day, with the existing closed-day semantics
   (`history_locked_through`). After that the result is immutable.
2. Before the day closes, proof from still-mutable sources follows the real source (a task completed
   and legally undone the same day is no longer proof).
3. CANCELLED only while the commitment is open.
4. The public commitment and its private proof source are separate. The partner may see the public
   title, the status, the generic proof kind and the proof time — never a task id, goal id / title,
   Vision, Mirror, private Top 3, a private task's title or focus goal metadata.
5. Commitments without verifiable proof may use CUMPRI and are marked AUTODECLARADO
   (`verified` vs `self_declared`); no separate score.
6. Nudge: 1 per commitment every 2 h; at most 3 per day to the same partner (recipient's local day);
   never to oneself; never on PROVEN / MISSED / CANCELLED; enforced in the database.
7. Check-in: LOCKED_IN / NEED_ACCOUNTABILITY / HARD_DAY (UI: LOCKED IN · PRECISO DE COBRANÇA · DIA
   DIFÍCIL); valid for the current local date, changeable during the day, history kept in the
   database. No health inference, no automatic advice.
8. Focus commitments count effective completed focus time only (pauses never count).
9. Daily Standard commitments use exactly the existing standard rule (no second formula).
10. Every commitment carries the current `duo_id`; when the duo ends the ex-partner loses access and a
    future partner never receives the old duo's history.

Not in Phase 6: Daily Duel, winner of the day, monthly champion, XP, coins, ranking, badges, Web
Push, chat, free-text messages, automatic sharing of goals, Mirror exposure, private Top 3 exposure.

## V1

Ten stages. Each stage ends only when its behaviour is verified and `docs/PROGRESS.md` is updated.

| #   | Stage                  | Status                  | Scope                                                                                                   |
| --- | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Foundation             | **VERIFIED / COMPLETE** | Design analysis, Next.js + TS strict + Tailwind, Supabase SDK installed, Vitest + Playwright, docs, git |
| 2   | UI real                | **VERIFIED / COMPLETE** | Convert the approved Claude Design (v3) into mobile-first Next.js components with mock data             |
| 3   | Supabase + Auth + Duo  | **VERIFIED / COMPLETE** | Schema + RLS, Supabase Auth, profiles, duo invite/join codes                                            |
| 4   | Today + Routine        | **VERIFIED / COMPLETE** | Real tasks, recurring routines, check-offs, skip/move, sections                                         |
| 5   | Realtime + Partner     | **VERIFIED / COMPLETE** | Partner view live, activity feed, Presence (online/focusing/offline), connection state                  |
| 6   | Focus                  | **VERIFIED / COMPLETE** | Focus Mode, timer, sessions, notes, partner sees focusing                                               |
| 7   | Progress + Competition | **VERIFIED / COMPLETE** | Streaks, standard, progress stats and charts, weekly comparison, head-to-head                           |
| 8   | Produto completo       | **VERIFIED / COMPLETE** | Reactions, challenges, briefing, review day, weekly review, onboarding, settings, history               |
| 9   | QA + Security          | **VERIFIED / COMPLETE** | RLS audit, e2e coverage of core loop, accessibility, performance, edge cases                            |
| 10  | Production             | PENDING                 | Vercel production deploy, env setup, domain, monitoring                                                 |

## Stage 9 checklist (carried from Stages 7–8)

Must be done in Stage 9 — they are not optional and were intentionally left out of Stage 8:

- [x] **FREEZE / PROTECT CLOSED COMPETITION HISTORY** — locked in the database (ADR-050 / ADR-051,
      migrations `…163557` … `…165621`, pgTAP `stage9_integrity`, e2e `stage9`).
- [x] Realtime "Allow public access" OFF → moved to Stage 10 as a **MANUAL STAGE 10 PRODUCTION
      GATE** (dashboard-only; not readable / changeable from SQL or MCP; no code depends on it).
      Exact step: docs/PRODUCTION_CHECKLIST.md §2.
- [x] Leaked password protection ON → moved to Stage 10 as a **MANUAL STAGE 10 PRODUCTION GATE**
      (dashboard-only, plan-dependent). Exact step: docs/PRODUCTION_CHECKLIST.md §2.
- [x] Review every SECURITY DEFINER function — docs/SECURITY.md, docs/DATABASE.md → Functions
      (Stage 9 audit); the set is asserted by `stage9_integrity.test.sql`.
- [x] Final Supabase advisors (security + performance) and a security scan; every item classified
      in docs/SECURITY.md → "Supabase advisors".
- [x] RLS audit of all ten tables (docs/SECURITY.md → table matrix), e2e coverage of the core loop,
      accessibility (axe, keyboard), performance, edge cases (midnight / DST / week / year / leap,
      timezone moves, concurrency).

## Stage 10 checklist

docs/PRODUCTION_CHECKLIST.md, in order. It starts with the two **MANUAL STAGE 10 PRODUCTION GATES**
carried from Stage 9 (Realtime "Allow public access" OFF, leaked password protection ON) and must
never apply `supabase/dev/*.sql` to production.
