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
6. **Minimal privacy leakage.** The partner sees Online / Focusing / Offline, never more. Individual tasks
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
private challenges · history.

See [ROADMAP.md](ROADMAP.md) for when each lands.
