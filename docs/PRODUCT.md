# Product

**LOCKED IN** — _No hype. Just proof._

## Vision

A mobile-first discipline and accountability app for **two people**. Each person runs their own daily
routine, checks tasks off as they do them, and sees their partner do the same in real time. The proof is
the record, not the motivation.

## Problem

Discipline fails quietly. Routines slip when nobody notices, and habit trackers are solitary, easy to
ignore and easy to lie to. General social apps add noise, feeds and performance. There is no simple,
serious tool where **one trusted person** sees whether you actually showed up today.

## Initial users

- Two friends (the founding duo: Brendon and a partner) who want to hold each other to a daily standard
  of study, work, training, sleep and health habits.
- Later, other duos with the same need. Small squads are explicitly **later** ("Duos are two people.
  Small squads come later.").

## Product principles

1. **Today first.** The app opens on today's checklist. Everything else is secondary.
2. **Open → Understand → Act.** The user understands their state and can do the main action in about
   **3 seconds**.
3. **Proof over hype.** Numbers, times and completed tasks. No streak confetti, no motivational copy.
4. **Two people, not a network.** Private to the duo. No public profiles, no followers.
5. **Honest scoring.** The day is judged on the percentage of scheduled tasks completed. A skipped
   task stays in the total and does not count as completed (ADR-022). Unchecking withdraws the feed
   event.
6. **Minimal privacy leakage.** The partner sees Em foco / Online / Offline (+ when they were last
   seen, V2 Phase 2), never more. Individual tasks
   can be hidden but still count.
7. **Dark, serious, minimal, premium.** No generic dashboard aesthetic, few cards, thumb-friendly controls.

## Core loop

```
PLAN → SHOW UP → CHECK OFF → SEE YOUR FRIEND SHOW UP → FOCUS → SEE PROGRESS → REPEAT
```

| Step                    | In the product                                              |
| ----------------------- | ----------------------------------------------------------- |
| Plan                    | Routine (recurring items) + one-off tasks, morning briefing |
| Show up                 | Open the app, Today screen                                  |
| Check off               | Tap / swipe a task                                          |
| See your friend show up | Partner card, live feed, toasts, presence                   |
| Focus                   | Lock In focus session with timer                            |
| See progress            | Progress screen, streak, weekly review, head-to-head        |
| Repeat                  | Review day at night, next morning briefing                  |

## Feature scope (whole product, delivered across stages)

Today checklist · recurring routines · one-off tasks · realtime partner · online/offline presence ·
Focus Mode with timer · progress · streaks · weekly comparison · head-to-head · reactions ·
private challenges · history · onboarding · settings · in-app notifications · installable app.

All of it is real since Stage 8. Deliberately **not** in V1: background push notifications,
offline mode, AI coach, chat / DMs, public profiles, followers, public feed or challenges,
community, XP / coins / achievements, projects or documents. LOCKED IN stays a simple
discipline system for two.

See [ROADMAP.md](ROADMAP.md) for when each lands.

## V2

V2 builds on the production V1 in ten phases ([ROADMAP.md](ROADMAP.md)). Phase 1 makes the app
**remember where you were**: reopening LOCKED IN (browser or installed app) returns to the last
screen, the same Progress period and History month, the same scroll, and any task you were typing
but had not saved (for 24 h). It is only interface memory on your device — your data always comes
from the database, signing out forgets it, and two people on one phone never see each other's place
([RESUME_STATE.md](RESUME_STATE.md)).

### V2 Phase 2 — school planner and partner last seen

- **Planner** (More → Planner): exams, assignments, homework, deadlines and school events with
  subject, optional time, importance, reminders and notes; PRÓXIMOS and CALENDÁRIO; optionally
  shared with the partner (read-only for them); the next events on Today; "Add to tasks"
  pre-fills Quick Add. Not a calendar app: no colours per subject, no recurring events.
- **Partner status 2.0**: EM FOCO (persistent focus) > ONLINE (presence) > OFFLINE with
  "Visto por último há 12 min" — the same everywhere.

### V2 Phase 3 — Metas & Visão

More → **Metas & Visão**: VISÃO (the life you want to build), METAS (90 dias, este mês, longo prazo,
optionally linked to a vision; concluded and archived kept) and ESPELHO (what you need to face). Direction,
not daily execution: no percentages, no streaks, no competition, and private to you — nothing is shared
with the partner.

### V2 Phase 4 — Lembre-se do porquê

Today now reminds you why: **LEMBRE-SE DO PORQUÊ** shows your vision, your current goal and one
mirror item — what you wrote, the one you chose (◆ on Metas & Visão) or a predictable default.
**TOP 3 DE HOJE**: pick up to three of today's tasks that matter most; done or skipped, they stay
there. The first open of the day brings a short **morning card** (inline, never blocking) with your
streak, standard, today's tasks, the Top 3 and the next school event. No quotes, no AI coach.

### V2 Phase 5 — Goal → Action → Proof

A goal is linked to real actions (a task, a routine, a focus session; milestones already belong to it)
and shows what was actually done for it — "what did you do that proves you are moving?". Evidence,
not points: actions, focus time and milestones, never a percentage or a manual "proof". Goals stay
private: the partner sees EM FOCO and shared task titles, never a goal. Details: docs/GOAL_PROOF.md.

### V2 Phase 6 — Duo Accountability 2.0

Commitment → action → proof → partner accountability. Each day I can promise my partner up to five
things; LOCKED IN proves them from what I actually do (a task, effective focus, my daily standard) or,
when nothing can be observed, I mark CUMPRI and it says AUTODECLARADO. When my day closes, what was not
done is NÃO CUMPRIDO — for good. My partner can DAR UM TOQUE (no text, limited), react to a kept
promise and see my check-in (LOCKED IN / PRECISO DE COBRANÇA / DIA DIFÍCIL). They see my public title
and the proof type and time — never the task, a goal or anything private. No duel, points or ranking
yet. Details: docs/ACCOUNTABILITY.md.

### V2 Phase 7 — Daily Duel

One honest duel a day, decided by Execution, Focus and Consistency — each number visible, a live duel
never says anyone won. Details: docs/DUEL.md.

### V2 Phase 8 — Monthly Champion, Records, Milestones

"Who was more consistent over the month?" — the days each of us won in the Daily Duel, draws apart,
with transparent tiebreaks (monthly execution, then focus) and at least 3 official duels; the current
month is only ever AO VIVO. "What is my best so far?" — my longest streak, most focus in a day and in a
week, most Perfect Days in a month, and fixed milestones (streak 7 / 30 / 100, focus 10 / 50 / 100 h,
Perfect Days 5 / 10 / 30). All derived, personal records stay mine; no XP, coins, levels or ranking.
Details: docs/MONTHLY_COMPETITION.md.
