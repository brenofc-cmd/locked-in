# Roadmap

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
| 9   | QA + Security          | PENDING                 | RLS audit, e2e coverage of core loop, accessibility, performance, edge cases                            |
| 10  | Production             | PENDING                 | Vercel production deploy, env setup, domain, monitoring                                                 |

## Stage 9 checklist (carried from Stages 7–8)

Must be done in Stage 9 — they are not optional and were intentionally left out of Stage 8:

- [ ] **FREEZE / PROTECT CLOSED COMPETITION HISTORY** — owners can still insert / edit / skip
      past-dated `daily_tasks` (and their focus data) through the API (Stage 4 grants), which can
      change a closed week's result, a past streak or a finished challenge. Audit first, then lock
      the past in the database (no UI edits closed days today; keep it that way).
- [ ] Disable Realtime "Allow public access" (private channels only) in the Supabase dashboard.
- [ ] Enable leaked password protection (Supabase Auth).
- [ ] Review every SECURITY DEFINER function (`search_path = ''`, `auth.uid()` only, minimal
      grants, projection only): including `duo_weeks`, `partner_progress_summary`,
      `partner_current_focus`, `duo_challenges` and the broadcast triggers.
- [ ] Final Supabase advisors (security + performance) and a security scan; zero unexplained items.
- [ ] RLS audit of all ten tables, e2e coverage of the core loop, accessibility, performance, edge
      cases (docs/PROGRESS.md → Known Issues).
