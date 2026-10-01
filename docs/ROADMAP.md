# Roadmap

## LOCKED IN V2

V1 (the ten stages below) is in production: `main` at `606546f`, https://locked-in-rust.vercel.app.
V2 is built in ten phases, each on its own branch, merged to `main` only when VERIFIED.

| #    | Phase                                 | Status       | Scope                                                                                                                                |
| ---- | ------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Foundation + Restore State            | **VERIFIED** | Versioned, user-scoped Resume State: last route at `/`, Progress range / month, scroll, drafts (RESUME_STATE.md)                     |
| 2    | School Planner + Shared Calendar      | **VERIFIED** | Planner (PRÓXIMOS / CALENDÁRIO, sharing, reminders, Today card, Add to tasks) + Partner Presence 2.0 / last seen (PLANNER.md)        |
| 3    | Goals, Vision & Accountability Mirror | **VERIFIED** | /goals: VISÃO, METAS (90 dias / este mês / longo prazo, achieved, archive, milestones), ESPELHO — private (GOALS.md)                 |
| 4    | North Star + Morning Experience       | **VERIFIED** | LEMBRE-SE DO PORQUÊ (featured / fallback), TOP 3 DE HOJE (real tasks), morning card once per user / day (NORTH_STAR.md)              |
| 5    | Goals → Actions → Proof               | **VERIFIED** | Tasks / routines (snapshot) / focus linked to private goals; proof derived (actions, focus, milestones); /goals/[id] (GOAL_PROOF.md) |
| 6    | Duo Accountability 2.0                | VERIFIED     | Partner Hub 2.0, shared commitments → proof, nudges, daily check-in (see below)                                                      |
| 7    | Daily Duel + Transparent Gamification | VERIFIED     | Daily duel derived from real actions: Execution / Focus / Consistency, transparent winner, Live vs Final (see below)                 |
| 8–10 | —                                     | PENDING      | Defined when each phase starts (Web Push: Phase 10)                                                                                  |

Not in Phase 1 (by instruction): planner, goals / vision, North Star, Daily Duel, Monthly Champion,
new animations, Web Push, new gamification.

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
