# Roadmap

## LOCKED IN V2

V1 (the ten stages below) is in production: `main` at `606546f`, https://locked-in-rust.vercel.app.
V2 is built in ten phases, each on its own branch, merged to `main` only when VERIFIED.

| #    | Phase                                 | Status       | Scope                                                                                                                         |
| ---- | ------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | Foundation + Restore State            | **VERIFIED** | Versioned, user-scoped Resume State: last route at `/`, Progress range / month, scroll, drafts (RESUME_STATE.md)              |
| 2    | School Planner + Shared Calendar      | **VERIFIED** | Planner (PRÓXIMOS / CALENDÁRIO, sharing, reminders, Today card, Add to tasks) + Partner Presence 2.0 / last seen (PLANNER.md) |
| 3    | Goals, Vision & Accountability Mirror | **VERIFIED** | /goals: VISÃO, METAS (90 dias / este mês / longo prazo, achieved, archive, milestones), ESPELHO — private (GOALS.md)          |
| 4    | North Star + Morning Experience       | **VERIFIED** | LEMBRE-SE DO PORQUÊ (featured / fallback), TOP 3 DE HOJE (real tasks), morning card once per user / day (NORTH_STAR.md)       |
| 5    | Goals → Actions → Proof               | NEXT         | Not started                                                                                                                   |
| 6–10 | —                                     | PENDING      | Defined when each phase starts (Web Push: Phase 10)                                                                           |

Not in Phase 1 (by instruction): planner, goals / vision, North Star, Daily Duel, Monthly Champion,
new animations, Web Push, new gamification.

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
