# Final Design Research — LOCKED IN V2

The research and audit behind the final V2 design pass (branch `v2-final-design-experience`, 2026-10-07).
Not V3 and not a feature phase: the product, its rules and its data stay as they are; this pass is
about craft. Every change made in the pass answers a problem recorded here.

Companion documents: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (the system that came out of this),
[MOTION.md](MOTION.md), [ROOK.md](ROOK.md).

---

## 1. Principles studied

### Usability (Nielsen Norman Group)

- **Progressive disclosure** — show the basics first, defer secondary options to a second level; it
  makes an interface easier to learn and less error-prone. The cost is one extra step, so the first
  level has to carry what most people need most of the time.
- **Recognition rather than recall** (heuristic 6) — make objects, actions and options visible; the
  user should not have to remember where something was.
- **The 10 heuristics** used as the audit lens: visibility of system status, match with the real
  world, user control, consistency and standards, error prevention, recognition over recall,
  flexibility, aesthetic and minimalist design, help recognising errors, help and documentation.
- **Animation duration** — 100 ms reads as instant; 1 s is the limit of an uninterrupted flow of
  thought. UI feedback lives between 100 and 500 ms and needs a reason to pass 300 ms. Good
  supporting motion is fast, subtle and purposeful.
- **Dark mode** — light text on dark is slower for long reading; when dark is the brand, avoid pure
  white text (glare) and keep secondary text clearly above contrast minimums.
- **Peak-end rule** — people judge an experience by its most intense moment and its end. Build one
  real high point, fix the worst moment, never end on an error.

### Platform guidance (Apple Human Interface Guidelines)

- **Motion**: add it purposefully; never motion for its own sake. Feedback animation should be brief
  and precise — light and unobtrusive conveys information better than prominent motion. Always
  honour Reduce Motion.
- **Feedback**: every action gets an immediate, proportional response.
- **Navigation / layout**: a tab bar for top-level destinations only, stable positions, safe areas
  respected, primary controls reachable.
- **Dark interfaces**: use elevation by lighter surfaces, not by shadow; keep vibrant accent use
  rare so it keeps meaning.

### Accessibility (WCAG 2.2, web.dev)

- **1.4.3 / 1.4.11** — 4.5 : 1 for text, 3 : 1 for UI components and meaningful graphics.
- **2.5.8 Target Size (Minimum, AA)** — 24 × 24 CSS px or enough spacing; we aim for 44 × 44 on
  primary actions (Apple's and our own mobile rule).
- **2.4.7 / 2.4.11 / 2.4.13** — a visible focus indicator that is never fully hidden by our own
  content (sticky bars, sheets); the AAA appearance target (2 px, 3 : 1) is our default anyway.
- **2.3.3 Animation from Interactions** — motion triggered by an interaction can be turned off
  unless it is essential. `prefers-reduced-motion` is the switch; the guidance is to _replace_
  large movement (zoom, slide, parallax, spin) with fades, colour and instant end states, not to
  kill all feedback.
- Animation must never be the only carrier of information (state in text / ARIA too).

### Product references (principle, not look)

| Reference                     | Principle behind it                                                                                                                                                                                                                                            | What LOCKED IN absorbs                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Duolingo — Core Tabs redesign | Tabs had drifted apart: headers of different sizes, typography without hierarchy, uneven spacing. Fix: a minimal set of type styles, tiered headers by purpose, purposeful whitespace instead of forced containers, illustration only where it says something. | One header grammar for every screen; fewer type styles; remove boxes that do not group anything.   |
| Duolingo — streak milestones  | Ordinary days and milestone days look different; on milestones the character itself changes. Timing was iterated until it felt right. The fire metaphor did not translate across cultures.                                                                     | Rarity scales intensity; our own metaphor (the Ring), not a flame.                                 |
| Duolingo — Friend Streak      | A shared commitment that asks nothing extra of either person; being next to someone is enough. Shared streaks raised daily completion.                                                                                                                         | The duo is presence, not chat: DUPLA shows "how are we" first.                                     |
| Duolingo — character system   | Characters built from 1–2 basic shapes per part; one consistent shape language.                                                                                                                                                                                | Rook is built from a handful of geometric parts; a stricter, angular shape language (not rounded). |
| Linear (2024 / 2026 refresh)  | "A calmer interface": consistent headers and view controls everywhere, dimmed navigation so content leads, fewer icons; dense information without feeling crowded.                                                                                             | Dim chrome, bright content; consistency of headers; density through hierarchy, not through boxes.  |
| Apple Fitness — rings         | One simple daily goal visualised as a closing ring; closing it is the reward; awards for rare bests.                                                                                                                                                           | Continuity as a ring (the Ring behind Rook) — but tied to our streak, and quiet on ordinary days.  |
| Things 3                      | Craft in the check: a precise, satisfying completion with haptic response; whitespace and restraint.                                                                                                                                                           | Task completion as the core microinteraction; restraint everywhere else.                           |
| Strava — kudos                | One-tap acknowledgement: lower friction than a comment, frequent, positive.                                                                                                                                                                                    | Reactions stay one tap; nudge feels like a tap on the shoulder, not an alarm.                      |
| Todoist — karma               | Gamification that can be paused; streaks that respect days off.                                                                                                                                                                                                | Failure is shown as fact, never punished.                                                          |
| Headspace / Calm              | A complete, warm visual language with a character used sparingly; calm as the default state.                                                                                                                                                                   | Calm by default; the character appears at moments, not everywhere.                                 |
| Arc                           | Delight placed at first contact and at moments of creation; the rest stays out of the way.                                                                                                                                                                     | Onboarding and milestones get the personality.                                                     |
| Notion                        | Content first, chrome almost invisible.                                                                                                                                                                                                                        | Plain rows over cards where nothing needs grouping.                                                |

---

## 2. Problems found in LOCKED IN (audit, 2026-10-07)

Method: the visual matrix (`tests/e2e/visual.spec.ts`, LI_SHOTS) on DEV with the approved design's
day seeded (12 tasks, 8 done, a duo with Bruno's day and activity, two Planner events) at 320, 375,
390, 430, 768, 958, 1180, 1440 and 1920 px, each screen as first viewport and full page (175
captures, kept outside the repo); plus a code audit of tokens and magic values.

Severity: **P0** confusion / accessibility · **P1** major hierarchy · **P2** inconsistency · **P3**
polish.

### System-wide (code audit)

| #   | Problem                                                                                                                                                                                  | Sev |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| S1  | **~44 font sizes** in 75 components (`text-[9.5px]` … `text-[112px]`, 10 sizes between 10 and 15 px). Typography "almost the same" everywhere: no hierarchy a user can learn.            | P2  |
| S2  | **22 radii** (`rounded-[1px]` … `rounded-t-[28px]`, 9/10/11/13/14 px all present).                                                                                                       | P2  |
| S3  | **15 border opacities** (`border-white/5` … `/30`) for what are three roles (hairline, outline, emphasis).                                                                               | P2  |
| S4  | **7 grey text tokens** (`muted`, `dim`, `quiet`, `ghost`, `faint`, `off` + `text`). `ghost` 3.0 : 1, `faint` 2.6 : 1 and `off` 1.75 : 1 fail AA when used for text (33 usages to audit). | P0  |
| S5  | Arbitrary spacing off the 4 px grid (`gap-[3px]`, `px-[13px]`, `gap-[9px]`, `gap-[26px]`, page gutter 18 px …).                                                                          | P2  |
| S6  | 10 letter-spacings for the same mono eyebrow role (`.08em` … `.24em`).                                                                                                                   | P2  |
| S7  | The global reduced-motion rule kills every transition to 0.01 ms — also colour / opacity feedback that is safe and useful.                                                               | P3  |
| S8  | Green (`accent`) carries everything: checks, CTA, live dots, nav, "VOCÊ" in the duel, links, labels — so it stops meaning "proof".                                                       | P1  |
| S9  | No semantic colour for streak / celebration or focus; "missed" and "danger" are two near-identical reds.                                                                                 | P2  |

### Screens

| Screen        | Purpose / primary action             | Problems                                                                                                                                                                                                                                                                                                                  | Motion / Rook opportunity                                  | A11y                                                       |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| HOJE          | What do I do now? → complete a task  | **P1** eight solid green check squares dominate the first viewport — the _done_ work is louder than the _open_ work. **P1** "TOP 3 DE HOJE" renders as a header with nothing under it when no Top 3 is set. **P2** completion time ("08:40") on every done row adds noise. **P3** streak line is a mono caps string.      | Task completion (check draw, row settles, progress pulse). | Done state relies on strike + colour; keep text state.     |
| Morning       | Opening of the day                   | **P3** reads as a stats card (four numbers in caps), not as an opening.                                                                                                                                                                                                                                                   | Rook (READY), only occasionally.                           | —                                                          |
| DUPLA         | How are we doing? → check-in / nudge | **P1** under the partner header, three lines of 11 px mono caps meta (check-in, focus, standard, commitments). **P1** the daily duel score ("1-0") is the smallest text in its own block; the leader is only a caps sentence. **P2** "Reagir" pill outline on every row. **P2** three check-in buttons with equal weight. | Duel score settle; nudge (two taps); two small Rook marks. | 320 px: "Visto por último há…" truncates; duel cells wrap. |
| FOCO          | How do I start? → LOCK IN            | **P0** at 375–430 px the LOCK IN button sits under the bottom bar on first view: the one action of the screen needs a scroll. **P2** task picker and durations have equal weight to the CTA.                                                                                                                              | READY → LOCKED IN transition; completion nod.              | —                                                          |
| PLANEJAR      | What comes next?                     | **P3** row eyebrows use mixed tints; otherwise compact and clear (keep).                                                                                                                                                                                                                                                  | —                                                          | —                                                          |
| Semana        | Prepare the ground → 3 priorities    | **P2** reads as an admin form (field + grey SALVAR); the empty state is a sentence of fact.                                                                                                                                                                                                                               | Rook (empty week).                                         | —                                                          |
| Planner       | Calendar of school events            | **P3** fine; type labels in caps above titles (keep), today marker subtle.                                                                                                                                                                                                                                                | —                                                          | —                                                          |
| Metas & Visão | Direction                            | **P2** empty state is a grey question; goals visually equal to tasks.                                                                                                                                                                                                                                                     | Rook (empty vision).                                       | —                                                          |
| PROGRESSO     | Am I evolving?                       | **P1** order: month duel, last duels, records and milestones come before the chart / calendar; records look like a SQL table (caps labels + "—"). **P2** today's bar is red mid-day (below standard, day not closed).                                                                                                     | Milestones states; records as personal bests.              | Chart has list semantics (keep).                           |
| Review do dia | Reflect                              | **P1** facts (%, partner, done / not done lists) fill the first viewport; the questions start below the fold — analytics before reflection.                                                                                                                                                                               | Rook (REVIEWING).                                          | —                                                          |
| Ajustes       | Settings                             | **P3** long paragraphs; consistent otherwise.                                                                                                                                                                                                                                                                             | Push setup (Rook).                                         | —                                                          |
| Navigation    | Five tabs                            | **P2** FOCO carries a permanent green-tinted pill even when not active — two "active" looking tabs at once. **P3** labels in caps mono at 10.5 px.                                                                                                                                                                        | Pressed state.                                             | Tap targets OK (≥ 44 px).                                  |
| Celebrations  | Perfect Day, milestones              | **P2** one generic card for every kind; rarity does not change intensity.                                                                                                                                                                                                                                                 | The Ring; Rook poses.                                      | Reduced motion already honoured (keep).                    |

---

## 3. Three directions

| Direction                    | Idea                                                                                                               | Fits LOCKED IN?                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Ultra minimal**         | Remove colour and motion almost entirely; type and rules only.                                                     | Calm, but proof stops feeling like anything; Rook would have nowhere to live. Loses "alive".                                             |
| **B. Warm premium**          | Warmer greys, softer radii, more cards and gentle gradients everywhere.                                            | Comfortable, but drifts towards a wellness app and adds boxes (the declutter just removed them). Loses "disciplined".                    |
| **C. Expressive discipline** | Calm, quiet base for the everyday; expression reserved for proof — completion, Perfect Day, milestones, the month. | Matches the brand (_Sem hype. Só prova._): the interface earns the right to be loud only when the user has proved something. **Chosen.** |

Validated against the real product: the everyday screens (Today, Focus, Plan) already lean minimal and
work; the gaps are the missing peaks (celebrations are one generic card) and the noise in the
middle (greens, caps, box borders). Direction C fixes both without redesigning the IA.

---

## 4. What to absorb / what not to copy

**Absorb**: one header grammar; a small type scale; whitespace before boxes; rarity → intensity;
character used sparingly; brief, precise feedback; reduced motion as replacement, not removal;
recognition over recall (labels on actions, state in words).

**Do not copy**: Duolingo's owl, its proportions, round eyes, green body, bounce, flame or phoenix;
Apple's three-colour rings; Strava orange; Headspace pastels; gamified currencies, XP, levels,
confetti, sound.

---

## 5. Final design principles of LOCKED IN

1. **Clarity before decoration** — each screen understood in seconds.
2. **Action before information** — what can be done comes first.
3. **Progressive disclosure** — summary first, detail on request.
4. **Proof before promise** — the interface celebrates execution, never intention.
5. **Motion with purpose** — motion explains state, confirms, connects, celebrates; never delays.
6. **Rare = special** — the rarer the achievement, the more memorable the moment.
7. **Every day is calm** — normal use is quiet.
8. **Achievements may be intense** — milestones can break the calm, briefly.
9. **Personality without childishness**.
10. **Premium without corporate** — not a SaaS dashboard, not a mobile game.

Green means proof: it marks completed work, progress, the primary action and the brand mark —
nothing else.

---

## Sources

- NN/g — Progressive Disclosure: https://www.nngroup.com/videos/progressive-disclosure/
- NN/g — Recognition vs. Recall (heuristic 6): https://www.nngroup.com/videos/recognition-vs-recall/
- NN/g animation timing (via Val Head, "How fast should your UI animations be?"): https://valhead.com/?p=2978
- Peak-End Rule: https://lawsofux.com/peak-end-rule/ · https://www.uxtigers.com/post/peak-end-rule
- Apple HIG — Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- W3C — What's new in WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- W3C — Understanding 2.3.3 Animation from Interactions: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
- Reduced motion guidance: https://blog.openreplay.com/prefers-reduced-motion-accessible-animation/
- Duolingo — Core tabs redesign: https://blog.duolingo.com/core-tabs-redesign/
- Duolingo — Streak milestone design & animation: https://blog.duolingo.com/streak-milestone-design-animation
- Duolingo — Friend Streak: https://blog.duolingo.com/friend-streak/ · https://blog.duolingo.com/product-lessons-friend-streak/
- Duolingo — Characters: https://design.duolingo.com/illustration/characters
- Linear — Behind the latest design refresh: https://linear.app/blog/behind-the-latest-design-refresh · https://linear.app/blog/how-we-redesigned-the-linear-ui
- Apple — Close Your Rings: https://www.apple.com/watch/close-your-rings/
- Things 3 review (MacStories): https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- Strava design: https://blakecrosley.com/guides/design/strava
- Todoist Karma: https://get.todoist.help/hc/articles/360000410829
- Headspace design: https://blakecrosley.com/guides/design/headspace
- Arc / The Browser Company interview: https://www.inverse.com/input/design/the-browser-company-arc-design-interview
