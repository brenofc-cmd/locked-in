# LOCKED IN DEVELOPMENT STATUS

Current:
LOCKED IN V2 — Phase 10 (last) — Web Push + Advanced Reminders + Final Polish / Audit — IN PROGRESS (scope: docs/ROADMAP.md → V2 Phase 10). Phases 1–9 VERIFIED (DEV + PROD).

V1 baseline: `main` at `606546f` is what runs in production (https://locked-in-rust.vercel.app,
GitHub deployment "Production" for that SHA, 2026-09-28). The V1 record below is kept unchanged.

---

# LOCKED IN V2

## Known issues (open)

- Minor copy (Phase 9): on `/plan/week` the PRÓXIMA SEMANA tab reuses the "this week" strings
  (`empty`: "Nenhuma prioridade para esta semana.", `placeholder`: "Uma prioridade desta semana",
  `src/i18n/pt-BR.ts`). Saving there writes next week correctly; only the wording is off. Not
  blocking.

## Phase 9 — Celebrations + Reviews 2.0 + Non-Negotiables + Weekly Planning — VERIFIED (DEV + PROD, 2026-10-06)

Status: **V2 PHASE 9 = VERIFIED** · DEV = VERIFIED · PRODUCTION DEPLOY = VERIFIED · PRODUCTION
SMOKE = VERIFIED · V2 Phase 10 = NOT STARTED.

Scope: docs/ROADMAP.md → "V2 Phase 9", docs/CELEBRATIONS.md, docs/WEEKLY_PLANNING.md, ADR-086…091.
Commits on `main`: `9ba97d3` scope · `5a8a039` db · `92913d2` fix(db) date-shaped keys · `e41247d`
feat · `18f0720` tests · `d829aa3` docs · `179863a` PROD migration versions (the deployed commit).

Done:

- **Celebrations** (ADR-086…088): one owner-only `public.celebrations` (PK owner / kind / key).
  PERFECT DAY (today only, while perfect, once per date), milestones streak 7 / 30 / 100, focus 10 /
  50 / 100 h, Perfect Days 5 / 10 / 30 (first crossing), MONTHLY CHAMPION (a FINAL month only; a final
  draw → MÊS ENCERRADO · EMPATE; never live). The client claims `(kind, key)` from numbers already on
  screen (`claimsToMake()`, `src/lib/celebrations.ts`); the INVOKER guard validates them against the
  real numbers; only `seen_at` is client-updatable (stamped once); no delete. Card ≈2 s, non-modal,
  closable, never in Resume State; motion only under `motion-safe`.
- **Milestone unlocks**: durable (CONQUISTADO stays if the derived value later drops); the
  migration ran `private.baseline_milestones()` for every profile (`baseline = true`, seen) — no
  retroactive burst.
- **Non-Negotiables** (ADR-089): owner-only `daily_task_non_negotiables` / `routine_non_negotiables`
  (no column on the shared rows), a routine's flag follows today's occurrence and is snapshotted on
  each generated one, closed days frozen; discreet "◇ NÃO NEGOCIÁVEL" on Today; no weight anywhere.
- **Weekly Planning** (ADR-090): `weekly_priorities`, ≤ 3 per Monday week, this / next week, closed
  weeks frozen, self-declared; PLANEJAR → ESTA SEMANA row → `/plan/week`; not on Today.
- **Reviews 2.0** (ADR-091): `reviews` (three optional owner-only reflections per day / week) + facts
  from `my_review_facts(p_from, p_to)` (INVOKER, ≤ 31 days, the standard in force each day). Weekly
  Review → PLANEJAR PRÓXIMA SEMANA.
- Migrations `20261005150455_reflection_celebration_planning`, `20261005163123_celebration_key_dates`:
  five owner-only tables, two INVOKER functions, **no new SECURITY DEFINER** (set stays 22).

Gates (DEV, final, 2026-10-06 on `179863a`):

- lint ✓ · typecheck ✓ · format ✓ · unit **364/364** (+16 `reflection`) · build ✓
- E2E full suite in one clean run: **178 passed, 1 skipped (`LI_SHOTS`), 0 failed** (179, 19.8 min,
  `--workers=1`); `v2-phase9` **17/17** (Perfect Day once / every device / never again that day,
  milestone queue, durable unlock, baseline, reduced motion, monthly champion and final draw, task
  and routine NÃO NEGOCIÁVEL, weekly planning, Day / Weekly Review, past-day reflection read-only,
  privacy, no new channel, **70 s idle on PLANEJAR → SEMANA and PROGRESSO with a pending claim — no
  periodic request**). Focus regressions still green: `v2-phase8` 72 s of running focus across a
  minute boundary with zero requests, `v2-phase7` partner's running focus, `stage6` no per-second
  traffic.
- pgTAP: `v2_phase9_reflection` **79/79** (run on PROD this session, rolled back). The full DEV
  pgTAP suite was not re-run in this verification session (no Docker / psql here).
- `npm audit`: dev-only `braces` (via `eslint-config-next`, unchanged). **New since Phase 8:**
  production dependency `source-map-js` 1.0.0–1.2.1 high (GHSA-68fv-2mgg-jv7q, build-time via
  `postcss`); `npm audit fix` available — not applied here (docs-only verification), follow-up.

Production (2026-10-05 / 2026-10-06):

- Migrations applied (2026-10-05): `20261005183305` (`reflection_celebration_planning`),
  `20261005183307` (`celebration_key_dates`) — mapping in docs/DATABASE.md. GitHub deployment
  "Production" **success** for `179863a` (https://locked-in-rust.vercel.app).
- Validated on PROD: 45 migrations; DEFINER = the reviewed 22, all with `search_path`; **0 `dev_*`**;
  the five tables RLS on, anon 0 grants; `my_review_facts` / `my_records` INVOKER; nothing in
  `private` executable by anon / PUBLIC. Advisors: no new entry (the reviewed DEFINER functions and
  the pre-existing leaked-password item, docs/PRODUCTION_CHECKLIST.md).
- pgTAP `v2_phase9_reflection` **79/79** on PROD in one transaction, rolled back (afterwards: 4
  users, 0 test users, no pgtap, no trigger left disabled).
- **Baseline correct**: no real user had reached any milestone (max values 1 / 1 / 0 against 7 / 5 /
  10 h) → 0 baseline rows, 0 celebrations; Today and Progress opened with no celebration burst;
  MARCOS 0 de 9.
- **Smoke on PROD (real account, Chrome desktop ≈960 px, 2026-10-06)**:
  - NÃO NEGOCIÁVEL: `[teste V9] tarefa` added to today with the flag ("Só você vê. Não muda nenhum
    placar.") → Today shows "◇ NÃO NEGOCIÁVEL". In one rolled-back transaction as the owner,
    `duo_duels`, `duo_duel_months`, `duo_weeks`, `my_daily_progress`, `my_progress_summary`,
    `my_today` gave **identical results with and without the flag**; as the partner: the task
    visible (shared), **0** task flags, **0** routine flags.
  - Weekly Planning: `/plan/week` → 3 priorities `[teste V9] prioridade 1…3`; then "Três
    prioridades. O suficiente." and **no input for a 4th**; priority 1 marked done → persisted after
    reload; PLANEJAR row "3 prioridades · 1 / 3 feitas".
  - Day Review (Today → Revisar o dia): facts 0 / 5 feitas, 0m de foco, "Faltam 4 para atingir seu
    padrão", NÃO NEGOCIÁVEIS 0 / 1; the three reflections (O que funcionou? / O que me atrapalhou? /
    O que vou mudar amanhã?) saved (SALVO).
  - Weekly Review (Progresso → HISTÓRICO → SEMANA 40 → ›): SEMANA 41 EM ANDAMENTO, tarefas 0 / 9,
    foco 0m, Dias perfeitos 0, Dias com padrão 0 / 2, NÃO NEGOCIÁVEIS 0 / 1, PRIORIDADES 1 / 3 —
    **equal to `my_review_facts` / `weekly_priorities` read as the owner**; SEMANA 40 (2 / 26, 0 / 7)
    equal too. Reflections saved; PLANEJAR PRÓXIMA SEMANA → `/plan/week?w=next` (PRÓXIMA SEMANA).
  - History: PROGRESSO → HISTÓRICO calendar and weekly reviews open after reload.
  - Privacy (rolled back, as the partner): 0 reviews, 0 priorities, 0 celebrations, 0 flags.
  - No polling: 72 s idle on Today across a minute boundary (10:29:06 → 10:30:18 UTC) — **0
    requests** (network tracker, verified by a control fetch it did capture; Performance API: 0
    resources in the window).
  - Perfect Day / milestone / monthly celebration and reduced motion were **not forced on PROD**
    (that would mean completing the owner's real routine) — verified by the e2e on DEV and by the
    database guard on PROD (pgTAP above); decided with the owner.
- **Cleanup**: a leftover from the 2026-10-05 smoke (`[teste V9] tarefa`, 05/10, pending, flagged)
  inflated that closed day to 0 / 5 → removed as admin with the owner's approval (05/10 back to its
  real 0 / 4; still 0 %, so the 05/10 duel is unchanged). Today's smoke data removed afterwards
  (1 task + its flag, 3 priorities, 2 reviews). Final PROD state: 0 `[teste V9]` rows, 0 flags, 0
  priorities, 0 reviews, 0 celebrations; Today back to 0 / 4.

Remaining (real, not blocking): the PRÓXIMA SEMANA copy (Known issues); `source-map-js` advisory;
the full DEV pgTAP suite re-run; a celebration seen live on PROD will happen with real use (first
Perfect Day).

Not in Phase 9: Web Push / background push (Phase 10), XP, coins, levels, shop, global leaderboard,
AI coach, generated motivational messages, groups.

## Phase 8 — Monthly Champion + Personal Records + Milestones — VERIFIED (DEV + PROD, 2026-10-05)

Scope: docs/ROADMAP.md → "V2 Phase 8", docs/MONTHLY_COMPETITION.md, ADR-080…085. Branch
`v2-phase-8-monthly-champion-records` (from `main` at `477c35a`).

Done:

- **Monthly Champion on the Daily Duel** (ADR-080): `public.duo_duel_months(p_months)` (DEFINER, the
  22nd reviewed function) returns the Phase 7 per-day numbers for the current month + up to 5
  before it, from `duel_since`; the client decides each FINAL day with `decideDuel` and the month
  with `decideMonth` (`src/lib/monthly.ts`). Days won, draws apart, insufficient days for nobody, at
  least 3 official days (ADR-081), tiebreaks monthly execution (days both had tasks, exact) →
  effective focus seconds → EMPATE DO MÊS (ADR-082), the deciding rule always shown. A live month is
  MÊS · AO VIVO, never a champion; FINAL when its last day is a FINAL duel.
- **Personal records** (ADR-084): `public.my_records()` (INVOKER, own rows): best focus day, best
  closed focus week, best Perfect-Days month, totals; ties keep the first period; the longest streak
  is the existing one (ADR-038 unchanged).
- **Milestones** (ADR-085): streak 7 / 30 / 100 (longest streak), focus 10 / 50 / 100 h, Perfect Days
  5 / 10 / 30 — derived (`src/lib/records.ts`), progress when locked, CONQUISTADO when reached.
- **UI**: Progress DUELOS leads with the current month (details and MESES ANTERIORES collapsed), then
  ÚLTIMOS 7 DUELOS, RECORDES and MARCOS (next milestones, all on demand). DUPLA: one month row →
  `/progress#month`. Today, Focus, Plan unchanged; no new tab; no celebration.
- **Realtime**: months re-read with the duo numbers (existing events); records re-read when my focus
  session ends. No timer.
- No table (ADR-083), no index; migration `20261005122148_monthly_progression` (2 functions).

Found and fixed during the gates:

- axe (stage9) flagged the milestone progress bars without an accessible name → `aria-label`
  (separate commit `ea6aea5`, a real defect of this phase).
- stage5 raced B's navigation to Today before the toast check (a toast never shows on `/partner` by
  design) → wait for `/today` first, assertion unchanged (separate commit).
- pgTAP: the "no milestone table" check matched the Phase 3 `goal_milestones` → excluded by name.
- e2e helper mistakes while writing the spec (hidden previous months matched the current month's
  test ids; Alice also reads Bruno's shared tasks) → scoped selectors / owner filter.

Gates (DEV, final):

- lint ✓ · typecheck ✓ · format ✓ · unit **348/348** (+19 `monthly`, +10 `records`) · build ✓
- `npm audit`: production dependencies 0; dev-only 5 high (`braces` via `eslint-config-next`,
  unchanged since the IA polish).
- pgTAP full suite **919/919** on DEV (stage3 51 · stage4 72 · stage5 40 · stage6 63 · stage7 78 ·
  stage8 84 · stage9 69 (DEFINER set 22) · v2_phase2 63 · v2_phase3 61 · v2_phase4 57 · v2_phase5 66 ·
  v2_phase6 99 · v2_phase7 65 · **v2_phase8 51**), every file rolled back.
- E2E full suite in one clean run: **161 passed, 1 skipped (`LI_SHOTS`), 0 failed** (162, 16.0 min,
  `--workers=1`); `v2-phase8` 12/12 incl. **72 s of running partner focus across a minute boundary
  with zero requests** from DUPLA and Progress.
- Visual review (local build, 375 / 390 / 430 / 768 / 1180 / 1440, Alice with a closed September and a
  live October): no horizontal scroll, no page error; Progress stays rows and disclosures; DUPLA one
  row; Today / Focus / Plan unchanged.
- Advisors (DEV): new 0029 entry only `duo_duel_months` (accepted pattern, ADR-040) and the DEV-only
  fixtures `dev_fixture_add_focus` / `dev_fixture_reset_focus`.
- DEV-only fixtures (supabase/dev/test_fixtures.sql): `dev_fixture_add_focus`,
  `dev_fixture_reset_focus`, `dev_fixture_backdate_duo` up to 120 days. No migration mentions `dev_`.

Not done (out of scope): celebrations, confetti, non-negotiables, weekly planning, new reviews, Web
Push, XP, coins, levels, shop, global leaderboard, groups, AI coach, duo milestones.

Production (2026-10-05):

- Before: PROD at 42 migrations, 21 DEFINER, **0 `dev_*`**, no Phase 8 function.
- Migration applied with the Supabase MCP, same SQL as the repository file: `20261005134423`
  (`monthly_progression`, mapping in docs/DATABASE.md).
- Validated on PROD: 43 migrations; DEFINER set = the reviewed 22, all `search_path=''`;
  `duo_duel_months` DEFINER, `my_records` INVOKER, both `authenticated` only (anon / PUBLIC nothing);
  nothing in `public` / `private` executable by anon or PUBLIC; **0 `dev_*`**; no month / record /
  milestone table; md5 of both function bodies identical to DEV (the DEV `my_records` body was
  re-created from the repository file: an in-body comment had been dropped when applying to DEV).
- pgTAP `v2_phase8_monthly` **51/51** on PROD, rolled back (0 test users, no pgtap, no trigger left
  disabled).
- `main` fast-forwarded to `471e3ad`, pushed; GitHub deployment "Production" **success**
  (https://locked-in-rust.vercel.app).
- **Smoke on PROD (real duo, read only, nothing written)**: Progress → OUTUBRO 2026 · AO VIVO ·
  EMPATADOS · 0 — 0 · 4 empates (the four FINAL draws of 1–4 Oct), details (VITÓRIAS 0 / 0,
  EXECUÇÃO MENSAL 0% · 0/14 vs 0% · 0/4, FOCO MENSAL 0m / 0m, DESEMPATE "Vitórias, execução e foco
  iguais", the rules) — never a champion; MESES ANTERIORES → SETEMBRO 2026 · MÊS ENCERRADO ·
  CAMPEÃO DE SETEMBRO: MATHEUS · 0 — 2 · 1 empate (28/09 and 29/09 Matheus, 30/09 draw — the
  Phase 7 API smoke); ÚLTIMOS 7 DUELOS unchanged; RECORDES (no focus / Perfect Day yet: 0 dias, —)
  and MARCOS 0 de 9 with 0 / 7, 0h / 10h, 0 / 5. DUPLA: one row "MÊS · AO VIVO · Você 0 — 0
  Matheus ›" → `/progress#month`, no summary on DUPLA. 71 s on DUPLA across a minute boundary: zero
  requests (no session was running; the running-focus case is the e2e).
- No smoke data was created, so nothing had to be removed.
- **Pending (human)**: the two-device check (a FINAL day changing the month live) — not blocking.

## UI Information Architecture Polish — VERIFIED (DEV + PROD, 2026-10-05)

Scope: docs/NAVIGATION.md (no feature added or removed; nothing in the database, analytics, duel,
goal proof, focus, commitments, streak, Daily Standard, Planner or realtime changed). Branch
`v2-ui-information-architecture-polish` (from `main` at `25b2c76`). **No SQL, no migration** —
`supabase/` is identical to `main`; nothing to deploy to the database, PROD Supabase not touched.

Done:

- Five tabs **HOJE · DUPLA · FOCO · PLANEJAR · PROGRESSO** (MAIS removed; `/more` → `/plan`, also
  from a saved Resume State). PLANEJAR hub (`/plan`): PRÓXIMO, METAS, ROTINA, DESAFIOS. Desktop
  sidebar: the four planning screens under Planejar.
- Profile menu (avatar): Conta, Configurações, Dupla, Instalar app (only when the browser offers
  it), Sair (`clearResume()` kept). Disclosure button; Escape / outside click close and return focus.
- HOJE: tasks first; TOP 3 compact; context as one line each (duel → `/partner#duel`, next event,
  North Star as a disclosure); the partner card is desktop-only (phone: header chip), the invite card
  shows on every width without a partner; the live feed is wide-screen only.
- DUPLA: person + status → DUELO DE HOJE (detailed, COMO É DECIDIDO) → commitments → check-in /
  nudge rows → partner's tasks + ATIVIDADE → week / head-to-head → commitment history (collapsed).
- PROGRESSO: VISÃO GERAL → METAS → DUELOS → HISTÓRICO (chart, calendar, reviews, insights).
- FOCO unchanged.

Commits: `1239df0` docs(ux) · `6d3972d` nav · `12b87c9` today · `5724635` duo · `ed8a250` progress ·
`ba1da93` today invite card · `4a24f5b` test(ux) e2e for the new IA · `b6e2452` fix(test) reset
query · `235007c` test(security) sign-in wait · docs.

Found and fixed during the gates (tests only — no product behaviour changed for a test):

- **Tests on the old UX** (B): tab names, Settings via the profile menu, the header chip label, the
  partner's running clock / feed now checked on DUPLA (stage5, stage6 — stage6 keeps B on Today for
  the toasts, which never show on `/partner`, and opens DUPLA in a second tab), the month heading is
  an `h3` under HISTÓRICO (v2-resume), `getByTestId("profile-button")` matched the hidden sidebar
  copy too (stage7 → role + hydration retry).
- **ia.spec bugs**: `/partner#duel` right after `/partner` is a same-document hash change (no
  response) → reached from `/today`; `launch(..., undefined)` took the signed-in default → `null`.
- **Fixture (C), pre-existing**: `resetTasks()` read all routine items and filtered in the client;
  PostgREST caps a response at 1000 rows and archived rows accumulate, so active routines survived
  the reset once a test user passed 1000 items → filtered in the query (separate commit).
- **Fixture (C)**: `dev_fixture_reset_history` hit the statement timeout with ~5 300 accumulated
  routine items; `supabase/dev/reset_test_users.sql` was run on **DEV** (`oavhuxaanztrughyrckb`,
  test users only), accepted by the owner. Rule from now on: no destructive cleanup, DEV included,
  without explicit confirmation unless it is an official, documented part of the suite.
- **Flaky (D)**: stage9's external-`next` sign-in waited the default 5 s while DEV Auth was still
  answering ("Entrando…") → the same 20 s as `signInUI()`, assertion unchanged (separate commit).
  One more sign-in never reached Supabase (no `/token` request in the Auth logs) on a local
  `next start` reused across 8 runs; a fresh server (Playwright `webServer`) passed everything.

Gates (DEV, final):

- lint ✓ · typecheck ✓ · format ✓ · unit **319/319** · build ✓
- `npm audit`: **5 high, dev-only** (`braces` via `micromatch` / `fast-glob` /
  `@next/eslint-plugin-next` / `eslint-config-next`, new advisory GHSA-vfj7-8cjw-p6xm); production
  dependencies (`--omit=dev`) **0**. The suggested fix is a breaking downgrade of
  `eslint-config-next` → not applied; follow up when `eslint-config-next` ships a fixed range.
- IA suite (`ia-390`) **7/7**.
- E2E full suite in one clean run: **149 passed, 1 skipped, 0 failed** (150, 13.2 min,
  `--workers=1`, fresh server). The skip is the opt-in `LI_SHOTS` capture.
- Visual review (local build, 375 / 390 / 430 / 768 / 1180 / 1440; Alice with a duo and duels, the
  layout user with the design day): no horizontal scroll, no page error at any width. HOJE: tasks
  from the first viewport, TOP 3 one line when empty, duel / next / North Star one line each, the
  morning card once a day; DUPLA: status, duel with COMO É DECIDIDO, commitments, check-in, feed below,
  history collapsed; FOCO minimal; PLANEJAR four rows; PROGRESSO overview first, then the sections
  that have data (METAS / DUELOS hide without goals / a duo; a user without tasks keeps the
  pre-existing "no data yet" state); profile menu Conta / Configurações / Dupla / Sair (Instalar app
  only when the browser offers it — not in headless Chromium). No code change came out of it.

Production (2026-10-05):

- No database change: PROD Supabase (`xhjczzhmbulaiebpsktl`) not touched.
- `main` fast-forwarded `25b2c76` → `0c10c24`, pushed; GitHub deployment "Production" **success**
  for `0c10c24` (https://locked-in-rust.vercel.app); `/plan` is served (signed out → `/login?next=%2Fplan`).
- **Visual smoke on PROD (real account, desktop 958 px, Chrome)** — read only, nothing written:
  sidebar Hoje · Dupla · Foco · Planejar (Planner, Metas & Visão, Rotina, Desafios) · Progresso;
  HOJE (tasks, morning card of the day, partner card on desktop, DUELO · AO VIVO · Você 0 — 0
  Matheus, North Star one line); DUPLA (status, detailed duel, COMO É DECIDIDO opens, commitments,
  check-in, feed); FOCO minimal; PLANEJAR four rows (Rotina "4 itens ativos"); Planner, Metas &
  Visão, Rotina, Desafios, Configurações open; Resume State: `/plan` then `/` → `/plan`; profile
  menu shows Conta / Configurações / Dupla / Sair (Instalar app only when offered). The Chrome
  extension's synthetic clicks / keys did not reach the page (same as the Phase 7 attempt), so the
  menu was opened through the DOM; a real mouse (Playwright, local build, 958 and 1440 px) toggles
  it open / closed. The phone layout was verified locally (same commit), not on PROD.
- **Phase 7 production visual smoke — VERIFIED**: Today compact duel (AO VIVO, never "won");
  DUPLA detailed duel (EMPATE 0–0 live, Execução 0/4 · 0% vs 0/1 · 0%, Foco 0 min × 0 min "—"
  not comparable, Consistência não bateu × não bateu EMPATE) + COMO É DECIDIDO; PROGRESSO
  ÚLTIMOS 7 DUELOS, all RESULTADO FINAL: 28/09 MATHEUS VENCEU O DIA 0–2, 29/09 0–1, 30/09 → 04/10
  EMPATE 0–0 — 28/09, 29/09 and 30/09 equal the Phase 7 API smoke.

## Phase 7 — Daily Duel + Transparent Gamification — VERIFIED (DEV 2026-10-01, PROD visual 2026-10-05)

Scope: docs/ROADMAP.md → "V2 Phase 7" (official consistency rule, live / final wording, Daily
Standard history and Focus 0 × 0 neutral approved 2026-10-01), docs/DUEL.md, ADR-074…079. Branch
`v2-phase-7-daily-duel` (from `main` at `336d73b`). Production: see "Production (2026-10-01)" below.

Done:

- **Derived duel** (`public.duo_duels(p_days)`, DEFINER; `private.duel_side` INVOKER, callable by no
  API role): per local day since the duo's first duel day, both members' planned / completed, the
  Daily Standard of that day, settled effective focus + running flag, and `is_final`. Dates /
  integers / booleans only. No duel / score / winner table.
- **Categories** (`src/lib/duel.ts`, pure): Execution (exact completion ratio, both need tasks),
  Focus (effective **seconds**, exact; **0 × 0 NEUTRAL / NÃO COMPARÁVEL**, never a tie),
  Consistency (official rule: each side's Daily Standard of that day via `standardMet` — MET beats
  NOT_MET, equal states tie, NEUTRAL not comparable). More categories won wins; equal = EMPATE;
  nothing decided = SEM RESULTADO SUFICIENTE.
- **Daily Standard history** (ADR-076 / ADR-078): `daily_standard_history` (baseline `-infinity` +
  one version per local day of change), written only by the DEFINER trigger
  `private.record_daily_standard` (owner SELECT only; no client write). `private.standard_on`: open
  day = current value, closed day = its version. A FINAL duel never changes when either member later
  changes their standard, also after a timezone move. Streak analysed and left on the current
  standard (ADR-038). Pre-Phase-7 days read the baseline (documented limitation).
- **First duel day fixed** (ADR-079): `duos.duel_since`, stamped when the duo becomes complete; a
  timezone move no longer hides a FINAL duel (found by pgTAP during this phase).
- **Live vs Final**: final only when the day is closed for both (`history_locked_through`) and no
  session of that day runs. Live never says anyone won (ESTÁ NA FRENTE / EMPATE / SEM RESULTADO
  SUFICIENTE); RESULTADO FINAL + VENCEU O DIA / EMPATE only on a final duel.
- **Timezone**: each side is its member's own local day; the list is framed by the viewer's today;
  a day the partner has not reached is an empty side.
- **Screens**: Today DUELO DE HOJE (compact, → `/partner#duel`); Partner detailed duel (each
  category's value for both — focus to the second —, its outcome, COMO É DECIDIDO); Progress ÚLTIMOS
  7 DUELOS. A not-comparable category shows "—" (read as "não comparável").
- **Realtime without polling**: my today live from the screen; the duel re-reads with the duo
  numbers on `partnerVersion` and on the partner's focus transitions; running sessions tick from
  the clock already on screen (e2e: 0 requests while the partner's seconds advanced).
- **Duo lifecycle**: no duo / waiting = no duel; ending the duo removes every duel; a new partner
  starts from the new duo's first day.
- Separate commit `a23d2d3`: `loadDays()` validated dates with `/^d{4}-d{2}-d{2}$/` (no
  backslashes), so a calendar month before the loaded series never loaded — fixed, with a regression
  test (a past month outside the series is read; malformed dates never reach the database).
- Not done (out of scope): XP, coins, monthly champion, records, milestones, badges, ranking, large
  animations, Web Push, stored score. Phase 8 not started.

Found and fixed during the gates:

- **Timezone could hide a FINAL duel**: the first duel day was computed from each member's current
  timezone; pgTAP (move east after the day closed) caught it → `duos.duel_since` (ADR-079).
- E2E premises that assumed no focus on the shared users' days: the spec derives every expected
  headline / score from `duo_duels` with the same rules (`decideDuel`).
- E2E "no request" window started after a fixed 2 s; under full-suite load the second event of a
  focus start (the feed line) arrived later and its normal re-read fell inside the window → the window
  now starts after 3 s without any request (event-driven, never a timer).
- One full-suite run lost the realtime channel ("Reconectando…") during stage9's end-duo test; the
  test passed alone (9/9) and in the next full runs — network, not the duel.
- Progress shows its "no data yet" state for a user without any task (pre-existing); the lifecycle
  test gives Alice a task before opening Progress.
- "padrão não batido" / "NÃO COMPARÁVEL" wrapped / truncated at 390 px → "bateu / não bateu" and "—".

Gates (DEV, final):

- lint ✓ · typecheck ✓ · format ✓ · `npm audit` 0 vulnerabilities · unit **317/317** (284 + 6
  `progress-history` + 27 `duel`) · build ✓
- pgTAP full suite **868/868** on DEV (stage3 51 · stage4 72 · stage5 40 · stage6 63 · stage7 78 ·
  stage8 84 · stage9 69 (DEFINER set now 21) · v2_phase2 63 · v2_phase3 61 · v2_phase4 57 ·
  v2_phase5 66 · v2_phase6 99 · **v2_phase7 65**); DEV left with no test user, no pgtap.
- E2E full suite in one clean run: **142 passed, 1 skipped, 0 failed** (143, 13.4 min,
  `--workers=1`). The skip is the opt-in Phase 5 screenshot capture (`LI_SHOTS`); `v2-phase7`: 7/7
  (incl. 4b: standard X → Y leaves every FINAL duel identical, today uses Y).
- Advisors (DEV): new 0029 entries only `duo_duels` (accepted, ADR-074) and the DEV-only
  `dev_fixture_backdate_duo`; performance findings unchanged.
- DEV-only fixtures (`supabase/dev/test_fixtures.sql`): `dev_fixture_backdate_duo` added,
  `dev_fixture_reset_history` drops future-dated standard versions after a reset. No migration
  mentions `dev_` (checked).

Production (2026-10-01):

- Before: PROD at 39 migrations, 19 DEFINER, **0 `dev_*`**, no Phase 7 object.
- Migrations applied with the Supabase MCP, same SQL as the repository files: `20261001135854`
  (`daily_duel`), `20261001135917` (`daily_standard_history`), `20261001135936` (`duel_since`)
  (mapping in docs/DATABASE.md).
- Validated on PROD: 42 migrations; `daily_standard_history` RLS on, `authenticated` SELECT only
  with the owner policy, anon nothing; no client write on `duos.duel_since`; DEFINER set = the
  reviewed 21, all `search_path=''`; nothing executable by anon / PUBLIC; **0 `dev_*` functions**;
  `duel_side` / `standard_on` / both trigger functions not callable; 2 triggers enabled; 4 baselines
  for 4 profiles; the duo's `duel_since` stamped; no duel table; md5 of the 5 function bodies
  identical to DEV.
- pgTAP `v2_phase7_duel` **65/65** on PROD (rolled back: 0 test users, no pgtap left).
- `main` fast-forwarded to `2b5ce41`, pushed; GitHub deployment "Production" **success** for
  `2b5ce41` (https://locked-in-rust.vercel.app).
- Smoke on PROD through the API, as the real duo members, in one rolled-back transaction: 4 duels
  since `duel_since` 2026-09-28, the 3 past days FINAL and today live; the real numbers give
  28/09 partner 0–2 (Execution and Consistency, Focus 0 × 0 neutral), 29/09 partner 0–1, 30/09
  EMPATE (Focus 0 × 0 not counted); changing the owner's standard 80 → 70 left the 3 FINAL duels
  identical and today used 70; the partner read 0 versions of the owner's standard; the output is
  dates / integers / booleans only. Rollback verified (standards 80, 4 baselines, no version, no task).
- Visual smoke on PROD: done 2026-10-05 (see UI Information Architecture Polish → Production). The
  live two-person check stays manual.

## Phase 6 — Duo Accountability 2.0 — VERIFIED (2026-09-30)

Scope: docs/ROADMAP.md → "V2 Phase 6" (10 approved rules), docs/ACCOUNTABILITY.md, ADR-069…073.
Branch `v2-phase-6-duo-accountability` (from `main` at `247d30f`).

Done:

- **Shared commitments** (`commitments`): four kinds — task (a task of today, kept private in the
  owner-only `commitment_sources`), focus (effective completed focus of the day ≥ target, pauses never
  count), standard (the existing rule with the standard snapshotted at creation), simple (CUMPRI →
  AUTODECLARADO). Up to 5 per day, public title 1–80. The database sets owner, duo, day and status.
- **Commitment → proof**: triggers on `daily_tasks` / `focus_sessions` re-resolve the owner's open
  commitments; the proof follows the source while the day is open (a task undone the same day
  withdraws it) and is frozen once the owner's day closes; ACTIVE on a closed day = **MISSED**
  (derived by `duo_commitments()`). CANCELLED only while open.
- **Feed + reactions**: a proven commitment is a feed line (`commitment_proven` /
  `commitment_self_declared`, public title only) that the partner can react to with the existing
  reactions.
- **Nudges (DAR UM TOQUE)**: no text; 1 per commitment every 2 h, 3 per recipient-local day, never
  on my own or a closed commitment — enforced by a trigger; the recipient gets a toast on any screen.
- **Check-in**: LOCKED IN / PRECISO DE COBRANÇA / DIA DIFÍCIL for today, changeable, history kept.
- **Realtime**: `commitment_changed`, `nudge_received`, `checkin_changed` on `duo:<duo_id>` from one
  new DEFINER trigger function (`private.sync_accountability`, reviewed set now 19); the hub re-reads
  through RLS (`accountabilityVersion`), no polling.
- **Partner Hub 2.0** (`/partner`): status + the partner's check-in; HOJE with completion, focus today
  and standard; COMPROMISSOS (theirs with DAR UM TOQUE / reactions, mine with + NOVO COMPROMISSO,
  CUMPRI, DESFAZER, CANCELAR); CHECK-IN DE HOJE; the partner's day + ATIVIDADE; this week /
  head-to-head (unchanged); HISTÓRICO · 14 DIAS.
- **Old duo isolation**: ending a duo detaches its commitments / check-ins and deletes its nudges; the
  ex-partner and a future partner read nothing.
- Not done (out of scope): Daily Duel, winner, XP, ranking, badges, push, chat, goal / Mirror / Top 3
  sharing.

Found and fixed during the gates:

- **Regression caught by the full E2E**: the accountability hook reloaded on every focus minute
  (`focusSeconds` includes the running session), so a running focus sent a Server Action per minute
  (stage6 "a running focus sends nothing"). Fixed in `a62f6f5` (no clock-driven reload; focus
  proofs arrive through `commitment_changed`); checked with a 70 s focus crossing a minute boundary
  (0 requests) before the full run.
- A pre-existing race in `v2-phase4` test 2 (the FEATURED label is optimistic; the test left
  `/goals` before the write) — the test now waits for the write (`ed9cf81`).
- 5 unindexed foreign keys of the new tables (advisor INFO) → `accountability_fk_indexes`.

Gates (DEV, final):

- lint ✓ · typecheck ✓ · format ✓ · `npm audit` 0 vulnerabilities · unit **284/284** · build ✓
- pgTAP full suite **803/803** on DEV (stage3 51 · stage4 72 · stage5 40 · stage6 63 · stage7 78 ·
  stage8 84 · stage9 69 (DEFINER set now 19) · v2_phase2 63 · v2_phase3 61 · v2_phase4 57 ·
  v2_phase5 66 · **v2_phase6 99**)
- E2E full suite in one clean run: **135 passed, 1 skipped, 0 failed** (136/136 executed, 11.8 min),
  run with `--workers=1` (CLI override only; the machine ran out of memory with the default
  workers — no config change). The skip is the opt-in Phase 5 screenshot capture (`LI_SHOTS`,
  optional since `b802730`); Phase 6 has no skip. `v2-phase6`: 5/5.

Production (2026-09-30):

- Migrations applied with the Supabase MCP as `20260930164112` (`duo_accountability`) and
  `20260930164122` (`accountability_fk_indexes`), same SQL as the repository files (mapping in
  docs/DATABASE.md). PROD was at 37 migrations / 18 DEFINER / no `dev_*` before.
- Validated on PROD: RLS on the 4 tables with 8 policies, 27 constraints (+ the two widened
  `activity_events` checks), 16 indexes, grants `authenticated` only (SELECT + the column grants),
  anon nothing, 9 triggers enabled, DEFINER set = the reviewed 19 (`sync_accountability` added, all
  `search_path=''`, not callable), new functions INVOKER, anon executes nothing, no view, no `dev_*`.
  pgTAP `v2_phase6_accountability` **99/99** on PROD (rolled back: 0 test users, no pgtap left).
  Advisors: no new finding (only "unused index" on the new, empty tables).
- `main` fast-forwarded to `a62f6f5`, pushed; GitHub deployment "Production" **success** for
  `a62f6f5` (https://locked-in-rust.vercel.app).
- Smoke on PROD with `[teste V6]` data on the owner's account (browser): Partner Hub 2.0 renders
  (status, partner check-in, HOJE with focus / standard / summary, COMPROMISSOS, CHECK-IN, feed,
  week, HISTÓRICO); a task commitment on a private task created through the sheet (title public,
  task chosen privately); a simple one → CUMPRI → CUMPRIDO · AUTODECLARADO + feed line; check-in
  PRECISO DE COBRANÇA; CANCELAR of an open one; completing the private task on Today → CUMPRIDO ·
  COM PROVA "Tarefa concluída · 13:49" (`proven_at` = the completion). No broadcast or feed event
  carried the private task's title or id.
- Partner side on PROD, as the real partner (`auth.uid`), in one rolled-back transaction: sees the
  3 commitments with public fields only (no task / goal column; 0 sources; the private task
  invisible); sees the check-in; DAR UM TOQUE ok → again < 2 h `LI_NUDGE_COOLDOWN` → after 2 h ok
  → 4th of the day `LI_NUDGE_LIMIT`; recipient day stamped; nudge on AUTODECLARADO / MISSED
  `LI_NUDGE_CLOSED`; owner self-nudge `LI_NUDGE_SELF`; reaction on the self-declared event ok (owner
  sees it); partner cannot cancel; a verified kind cannot be declared (`LI_PROOF_REQUIRED`). The
  owner's day closed (Stage 9 boundary): open commitments MISSED, proven stays PROVEN, cancel / undo
  `LI_HISTORY_LOCKED`. The duo ended: ex-partner reads 0; a new partner (the spare account) joins and
  reads 0 of the old history; the owner keeps it. Rollback verified (real duo, boundary, 0 nudges /
  reactions).
- Cleanup: the 3 commitments (source, feed lines by cascade / explicit delete), the check-in and the
  test task deleted — PROD left with 0 commitments / sources / nudges / check-ins / commitment feed
  events / test tasks; the real duo untouched.
- **Pending (human)**: the live two-person check (Brendon and Matheus on their own devices: a
  commitment, DAR UM TOQUE toast, check-in and PROVEN arriving live). Realtime between two browsers
  is covered by the e2e on DEV; nobody was on the partner's side in production.

## Phase 5 — Goals → Actions → Proof — VERIFIED (2026-09-30)

Scope: docs/GOAL_PROOF.md, ADR-064…068. Branch `v2-phase-5-goals-actions-proof` (from `main` at
`ffbd7b0`).

Done:

- **Task → goal**: META in Quick Add / edit (Mais opções; only active goals; the collapsed row shows
  `META · <goal>`), a discreet `META · <goal>` line on Today (also in `aria-describedby`); owner-only
  link table `daily_task_goals`; closed days fixed; drafts keep the goal only while it is active.
- **Routine → goal**: META in the routine sheet and **VINCULAR AÇÃO** on the goal page
  (`routine_item_goals`); every generated occurrence gets the goal at that moment (snapshot trigger,
  catch-up included); a later change never rewrites past occurrences (missed days materialised with
  the old goal first); today's occurrence follows the template like every template edit.
- **Focus → goal**: TRABALHANDO EM on /focus and in the running session (changeable while running /
  paused, fixed once completed — ADR-067); INICIAR FOCO on a goal opens `/focus?goal=<id>`; a task
  that feeds a goal pre-selects it; `start_focus_session(…, p_goal_id default null)` (the old call
  still works).
- **Milestones**: `completed_at` / `completed_on` stamped by the database (existing completed ones took
  `updated_at`).
- **Proof** (derived, never stored): `my_goal_proof_summaries` (all goals, one call) and
  `my_goal_proofs` (page of 20, newest first). Completed task = 1 action, completed focus = effective
  seconds, completed milestone = 1; skipped / missed / active / paused never; routine never double
  counted; archived / achieved goals keep their proof and take no new action.
- **Screens**: /goals rows get a PROVAS link with this week's proof; `/goals/[id]` (owner-only, 404
  otherwise) with PROVAS — ESTA SEMANA, CRIAR TAREFA, INICIAR FOCO, ÚLTIMAS PROVAS (HOJE / ONTEM /
  date, CARREGAR MAIS), AÇÕES VINCULADAS; Progress → PROGRESSO DAS METAS (top 3 for the range, VER
  METAS); North Star `Esta semana: …` and the morning card `N AÇÕES NESTA SEMANA` only when there is
  proof. Focus reads as time (`1h35`, `45 min`, `<1 min`), never as points; no percentage.
- **Privacy**: link tables owner-only (a `goal_id` on `daily_tasks` / `routine_items` would reach the
  partner, who reads those rows); `partner_current_focus()` unchanged (no goal); no broadcast or feed
  payload carries a goal.
- Migrations `20260930115728_goal_actions_proof`, `20260930120624_goal_link_owner_check`,
  `20260930120815_goal_link_task_not_found` (no new DEFINER, no view, no stats table).

Found and fixed during the phase:

- The first "active goal" check relied on RLS inside a trigger; a plpgsql plan cached while trusted
  code (`materialize_tasks`) ran could evaluate it without RLS, so another user's goal read as
  active and only the composite FK (`23503`) refused the link. Safe, but not deterministic: the helper
  now compares the owner itself (`goal_is_active(goal, owner)`), and a foreign task answers
  `LI_NOT_FOUND` instead of `LI_HISTORY_LOCKED`.
- axe on the goal page flaked while the entry animation was running (partial opacity); the scan now
  waits for the animations like the Phase 4 spec.

Verified (2026-09-30, DEV):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass; `npm audit` —
  0 vulnerabilities
- `npm test` — 16 files, **264 passed** (goal-proof 18 new: grouping, ordering, focus format, week /
  range boundaries, top goals, active-only pickers, draft goal validation, no duplicate on "load more")
- pgTAP on DEV (all 37 migrations): stage 3 51, stage 4 72, stage 5 40, stage 6 63, stage 7 78,
  stage 8 84, stage 9 69, v2 phase 2 63, v2 phase 3 61, v2 phase 4 57, v2 phase 5 66 — **704/704**,
  FAILED=0
- `npm run test:e2e` — **130 passed** (0 failed, 0 flaky; 1 skipped = the opt-in visual capture);
  `v2p5-390` 12 / 12 (the 13 requested scenarios + axe + no horizontal overflow at 375, 390, 430,
  768, 1180, 1440)
- Screens checked at 390 and 1440 (goal page, /goals, Today, Focus, Progress)
- **PROD migrations (2026-09-30, after VERIFIED)**: `goal_actions_proof`, `goal_link_owner_check`,
  `goal_link_task_not_found` applied with the Supabase MCP as `20260930124914` / `…124938` /
  `…124940` (same SQL as the repository files; mapping in docs/DATABASE.md). PROD had 0 goals, 0
  milestones and no running focus. Validated on PROD: RLS on both link tables with one owner-only
  policy each, the 6 FKs / constraints, the 4 indexes, 6 triggers enabled, no anon grant,
  `completed_at` / `completed_on` not writable, the 10 functions INVOKER with `search_path = ''`
  (trigger functions not callable, proof reads for `authenticated` only), the old 4-argument
  `start_focus_session` gone, DEFINER count unchanged (18), no view, no `dev_*`,
  `partner_current_focus` without any goal column; pgTAP `v2_phase5_goal_proof` **66/66** on PROD
  (rolled back: 0 test users, no pgtap extension left); advisors: no new finding.
- **Production (2026-09-30)**: `main` fast-forwarded to `14a659a`, Vercel Production deployment
  success. Smoke on the owner account with disposable `[teste V5]` data: goal created on /goals (row
  shows PROVAS ›); CRIAR TAREFA opened Quick Add with META pre-selected; a private task completed on
  Today showed `META · <goal>` and became proof (✓ 1 ação, "Tarefa concluída · 09:54"); INICIAR FOCO
  pre-selected TRABALHANDO EM, the running and completed screens showed the goal, the completed
  session appeared as focus proof (`<1 min` — under a minute of effective time, so not summed in the
  week); a milestone completed in the goal sheet appeared as ◆ proof; Progress → PROGRESSO DAS METAS
  and the North Star (`Esta semana: 1 ação · 1 marco`) showed the goal. Privacy on PROD, read as the
  real partner (rolled back): `partner_current_focus` returned EM FOCO with a null title and no goal
  field; 0 goals, 0 links, 0 focus rows, 0 test tasks, 0 proofs; the feed event had no title and no
  broadcast carried the goal id or title. Cleanup: the goal (links and milestone by cascade), both
  tasks, the focus session and its 2 feed events deleted — PROD left with 0 goals / links / test rows.
  The live two-person check (partner watching) was not done: nobody was on the partner's side.

## ISSUE-001 — first Today load after idle failed with a feed 401 — RESOLVED (2026-09-30)

Branch `fix/issue-001-expired-session-feed-401` (from `main` at Phase 3), ADR-063.

- Symptom (2026-09-29, production): after about an hour idle, the first server render of `/today`
  showed "This page couldn't load"; Supabase logged one `401` on `GET /rest/v1/activity_events`.
- Root cause (from the PROD logs, not the suspected refresh race): the access token was **not**
  expired (browser refresh at 12:51:10, valid until 13:51:10; failure at 13:06:01) and no refresh
  ran on the server. Seven parallel queries of that render carried the **same** JWT; six got 200,
  the feed got `401 PGRST303` with a 79-byte body = "JWT issued at future". A second case
  (17:11:34, browser, `partner_current_focus`, same pattern) confirmed it. Both were the first REST
  traffic after PostgREST sat idle while a new token was issued: its cached clock was behind the
  token's `iat`. `loadDuoData` turned the one error into a thrown render error.
- Checked and ruled out: stale cookies in `loadAppData()` (the proxy forwards the refreshed session
  to the render; the render never refreshes again), parallel queries with different tokens (one
  bearer per request), refresh token reuse.
- Fix: `src/lib/supabase/fetch.ts` (one immediate repeat for that exact PostgREST rejection, on
  every client; nothing else repeated, never twice); `isSessionRejected()` + the layout send a
  session the database refuses to `/login?reason=session` instead of the error page; the proxy
  never bounces that URL (no loop); copy `t.auth.sessionEnded`.
- Tests: `tests/unit/session-refresh.test.ts` (22: the real @supabase/ssr stack against a fake Auth /
  JWKS / PostgREST with ES256 tokens — valid session, expired access + valid refresh, invalid
  refresh, forged and unreadable sessions, parallel bootstrap on one token, the production event
  replayed, persistent rejection = 2 tries, no feed duplication, A / B isolation, the layout
  backstop); `tests/e2e/issue-001.spec.ts` (7, project `issue001-390`, DEV: idle simulated by
  rewriting the session cookie's `expires_at`, never by shortening the JWT expiry). Without the
  fix the replay tests fail (3) and the login loop test fails (1).
- Verified (2026-09-30, DEV): `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run format:check` — pass; `npm audit` — 0 vulnerabilities; `npm test` — 14 files, **220
  passed**; `npm run test:e2e` — **107 passed** (0 failed, 0 flaky), `issue001-390` 7 / 7.
- **Production (2026-09-30)**: `main` fast-forwarded to `eb6d249` (the fix alone, Phase 4 not
  included), Vercel Production deployment success; signed out `/today` → 307 to sign-in;
  `/login?reason=session` shows `sessionEnded`, `/login` does not. Smoke with the owner account in
  the real browser: the first `/today` after the night idle loaded (server refresh 10:53:34 UTC, 200);
  then the session cookie's `expires_at` was moved into the past (case A) → `/today` loaded, refresh
  token rotated, same user, no error page (server refresh 10:53:59, 200). PROD edge logs since the
  deploy: 0 × 401 / 403 / 500.

## Phase 4 — North Star + Morning Experience — VERIFIED (2026-09-29)

Scope: docs/NORTH_STAR.md, ADR-060 / ADR-061 / ADR-062. Branch `v2-phase-4-north-star-morning`.

Done:

- **LEMBRE-SE DO PORQUÊ** on Today (side column; after the tasks on a phone): 1 vision, 1 active
  goal ("META ATUAL"), 1 mirror item — featured, else the documented fallback; partial data shows
  only what exists; empty → DEFINA SUA DIREÇÃO → /goals; GERENCIAR → /goals; compact + "Ver tudo"
- /goals: ◇ / ◆ "Destacar no Hoje" on every active vision, goal and mirror item, EM DESTAQUE label;
  one per kind (database); archive / achieve / deactivate drops it
- **TOP 3 DE HOJE**: up to three of today's real tasks (`priority_rank`), DEFINIR / EDITAR sheet
  (pick in order, ↑ / ↓, ×, SALVAR), task options "Marcar como prioridade" / "Remover" and "JÁ HÁ 3
  PRIORIDADES — substituir qual?"; completed / skipped stay; nothing automatic
- **Morning card** (replaces the Stage 8 full-screen briefing): inline, first open of the local day
  per user, real facts (streak, PADRÃO, tasks, yesterday), the North Star, Top 3 progress / DEFINIR
  TOP 3, the next planner event, the partner's Presence 2.0 status; COMEÇAR O DIA / × (keyboard),
  "Mostrar toda manhã"; greeting by daypart in the user's timezone (header too)
- Device marks per user (`locked-in:v2:<userId>:daily`), V1 `li:briefing-shown` / `li:weekly-shown`
  removed; the weekly-result notice uses the same mark; the DEV panel can clear the briefing mark
- Migration `20260929162654_north_star_priorities` (backward compatible; no DEFINER)

Verified (2026-09-29, DEV):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm audit` — 0 vulnerabilities
- `npm test` — 14 files, **224 passed** (north-star 26 new: selection, fallbacks, exclusions, daypart
  boundaries, UTC+14 / UTC-11 / DST / 23:59 → 00:00, next event, Top 3 helpers, user-scoped marks,
  legacy keys, blocked storage)
- pgTAP on DEV (all 34 migrations): stage 3 51, stage 4 72, stage 5 40, stage 6 63, stage 7 78,
  stage 8 84, stage 9 69, v2 phase 2 63, v2 phase 3 61, v2 phase 4 57 — **638/638**, FAILED=0
- `npm run test:e2e` — see the final run below; Phase 4 spec 11 / 11 (axe included) at 390 and at
  375, 430, 768, 1180, 1440: 55 / 55
- Screens checked at 390 and 1440 (morning card open / closed, Top 3 sheet, /goals)
- Fixed during the run: V1 greeting tests expected "BOM DIA" at any hour (now any daypart); the
  Stage 8 briefing test follows the inline card; Phase 3 row selectors exclude the new ◇ buttons;
  Phase 2 "· VISTO …" on the desktop partner card had too little contrast (`text-faint` →
  `text-dim`, axe wcag2aa)
- Scope decisions: the North Star lives after the tasks on a phone (task list first); while the
  morning card is open it repeats the North Star lines (the card is the "start of the day", the side
  card the permanent reference)
- **ISSUE-001 merged in (2026-09-30)**: `main` (fix `eb6d249` + smoke `6068fb1`) merged into this
  branch as `20b28e4`; conflicts were text only (CLAUDE.md, DECISIONS.md, playwright.config.ts —
  `issue001-390` now runs after `v2p4-390`). Re-verified: lint, typecheck, build, format:check —
  pass; audit 0; `npm test` 15 files, **246 passed**; `npm run test:e2e` **118 passed** (0 failed,
  0 flaky; `v2p4-390` 11 / 11, `issue001-390` 7 / 7).
- **PROD migration (2026-09-30, after VERIFIED)**: `north_star_priorities` applied with the Supabase
  MCP (same SQL as `20260929162654_north_star_priorities.sql`). Validated on PROD: the four columns
  (`is_featured` not null default false ×3, `priority_rank` smallint null), the four checks, the four
  partial unique indexes, three `keep_one_featured` triggers (enabled), RLS on the four tables,
  column UPDATE grants to `authenticated` only (nothing for anon), `set_my_priorities` INVOKER with
  `search_path = ''` executable by `authenticated` only, `keep_one_featured` not callable, DEFINER
  count unchanged (18), no `dev_*`; pgTAP `v2_phase4_north_star` **57/57** on PROD (rolled back: 0
  test users, 0 test duo, no pgtap extension left); advisors: no new finding.
- **Production (2026-09-30)**: `main` fast-forwarded to `20b28e4`, Vercel Production deployment
  success. Smoke with the owner account (read-only, real data): `/today` shows the inline morning
  card (time · weekday, streak / PADRÃO / tasks / yesterday line, DEFINIR TOP 3, partner status,
  COMEÇAR O DIA, "Mostrar toda manhã"), TOP 3 DE HOJE above the four real tasks and the empty North
  Star (DEFINA SUA DIREÇÃO → Metas & Visão, since PROD has no goals); `/goals` loads. PROD REST
  since the deploy: 35 requests, all 200. Writes (Top 3, featuring) were not exercised on the real
  account; they are covered by the PROD pgTAP run above.

## Phase 3 — Goals, Vision & Accountability Mirror — VERIFIED (2026-09-29)

Scope: docs/GOALS.md, ADR-058 / ADR-059. Branch `v2-phase-3-goals-vision`.

Done:

- More → **Metas & Visão** (`/goals`, sidebar); sections VISÃO / METAS / ESPELHO (remembered)
- Vision: create / edit / archive (ARQUIVADAS) / delete (confirmed); cards with description
- Goals: 90 DIAS / ESTE MÊS / LONGO PRAZO, optional vision link, optional target date (ATÉ … /
  EM X DIAS / PRAZO PASSOU), MARCAR COMO CONCLUÍDA (CONCLUÍDAS, `achieved_at` from the database),
  archive, reactivate, delete; simple milestones shown as a count — no percentage anywhere
- Mirror: "O que você precisa encarar." — add / edit / deactivate (DESATIVADOS) / delete
- Keyboard ↑ / ↓ reorder (no drag library); empty states; limits 120 / 1000 / 300
- Private: owner-only RLS, no sharing, no realtime, no DEFINER; composite FKs block IDOR
- Resume State: `/goals`, section, scroll, 24 h drafts of a new vision / goal / mirror item
- Migrations: `20260929132309_goals_vision_mirror`, `20260929152035_goal_milestones_owner_idx`
  (advisor 0001 found after the first one)

Verified (2026-09-29, DEV, clean `.next`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm audit` — 0 vulnerabilities
- `npm test` — 13 files, **198 passed** (goals 18 new)
- pgTAP on DEV (all 33 migrations): stage 3 51, stage 4 72, stage 5 40, stage 6 63, stage 7 78,
  stage 8 84, stage 9 69, v2 phase 2 63, v2 phase 3 61 — **581/581**, FAILED=0
- Supabase advisors (DEV): security unchanged; performance: only "unused index" for the new index
  (DEV traffic)
- `npm run test:e2e` — **99 passed** (67 V1 + 16 Phase 1 + 10 Phase 2 + 6 Phase 3), then the
  Phase 3 spec with its axe test (7 / 7); Phase 3 spec also at 375, 430, 768, 1180, 1440: 30 / 30
- **PROD migrations (after VERIFIED)**: `20260929160137_goals_vision_mirror`,
  `20260929160140_goal_milestones_owner_idx` (repository / DEV: `…132309`, `…152035`). Validated on
  PROD: RLS on the four tables, owner-only `ALL` policies, no `owner_id` / `achieved_at` grant, the
  new indexes, composite FKs, DEFINER count unchanged (18), no `dev_*`, nothing for anon, trigger
  functions not callable; pgTAP `v2_phase3_goals` **61/61** on PROD (rolled back, no leftover);
  advisors: no new finding
- **Production (2026-09-29)**: `main` fast-forwarded to `fb9291f`, Vercel Production deployment
  success; `/goals` signed out → 307 to sign-in. Smoke in the real app (owner account, `[teste V3]`
  data): vision created (draft kept after closing the sheet, restored on reopen), 90-day goal linked
  to it → MARCAR COMO CONCLUÍDA (CONCLUÍDAS, `achieved_at` set), monthly goal created → edited →
  archived (ARQUIVADAS), mirror item created; `/` restored `/goals` with ESPELHO open. Security smoke
  on PROD (read-only, simulated sessions): the real partner and a random outsider read **0** rows
  from all four tables. Cleanup as the owner through RLS: deleting the vision unlinked its goal
  (`set null`), then goals and the mirror item removed — PROD goals tables left with 0 rows
- Fixed during the run (tests only): V1 `openToday` got the 15 s restore allowance already used by
  the V2 specs (`/` → `/today` under a loaded run); V1 focus test read the paused clock before the
  pause write was confirmed (intermittent 24:59 vs 24:58) → waits for the write now

## Phase 2 — School Planner + Shared Calendar + Partner Presence 2.0 — VERIFIED (2026-09-29)

Scope: docs/PLANNER.md, docs/REALTIME.md → Last seen, ADR-056 / ADR-057. Branch
`v2-phase-2-school-planner` (renamed from the local `v2-partner-last-seen`, whose only content was
the uncommitted last-seen draft migration; that draft was replaced by a dedicated table).

Done:

- **Partner Presence 2.0**: one status for every screen (`usePartnerView()` → `partnerView()`):
  EM FOCO (persistent focus) > ONLINE (presence) > OFFLINE + "Visto por último …" (viewer's
  timezone: agora / há X min / hoje às / ontem às / em DD/MM às). `user_presence` table,
  `touch_last_seen()` heartbeat (open, visible, ~5 min while visible, never hidden / on close),
  partner reads with the duo data, no polling, no new channel
- **Planner**: `planner_events` (owner CRUD, sharing derived from the current duo, private
  invisible, duo end → private again), `/planner` (PRÓXIMOS / CALENDÁRIO), event sheet (5 types,
  subject, date, optional time, important, share, reminder 0 / 1 / 3 / 7, notes, delete with
  confirmation), partner events read-only, `planner_changed` realtime (ids only), Today PRÓXIMOS
  card, countdowns, reminders in-app (+ browser while open; Lembretes preference, quiet hours),
  Add to tasks (pre-filled Quick Add), More → Planner and sidebar
- **Resume State**: `/planner`, view, month, scroll, 24 h new-event draft; reminder dedupe per
  user, cleared on sign-out
- Migrations: `20260929114849_user_presence_last_seen`, `20260929114909_planner_events`; one new
  DEFINER (`private.sync_planner_event`, trigger) added to the reviewed set

Verified (2026-09-29, DEV, clean `.next`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm audit` — 0 vulnerabilities
- `npm test` — 12 files, **180 passed** (last-seen 13 + planner 22 new)
- pgTAP on DEV (all 31 migrations): stage 3 51, stage 4 72, stage 5 40, stage 6 63, stage 7 78,
  stage 8 84, stage 9 69 (DEFINER set updated), v2 phase 2 63 — **520/520**, FAILED=0; DEV left
  clean (every run rolls back)
- Supabase advisors (DEV, after the migrations): no new finding
- `npm run test:e2e` — **93 passed**, 0 failed, 0 retries (67 V1 + 16 Phase 1 + 10 Phase 2)
- Phase 2 spec also at 375, 430, 768, 1180 and 1440 (temporary config): all green (DEV Auth was
  briefly unavailable once — 502 / 20 s on `/auth/v1/health` — and the affected widths were re-run)
- **PROD migrations (2026-09-29, after VERIFIED)**: applied with the Supabase MCP as versions
  `20260929130221_user_presence_last_seen` and `20260929130241_planner_events` (same SQL as the repo
  files, which carry the DEV versions `…114849` / `…114909`). Validated on PROD: RLS on both tables,
  grants / column grants, the two indexes, DEFINER set = reviewed set + `sync_planner_event`, no
  `dev_*` function, nothing for anon, trigger functions not callable, INVOKER heartbeat; pgTAP
  `v2_phase2_presence_planner` **63/63** on PROD (rolled back; no leftover user, row or extension);
  advisors unchanged (the accepted 0029 items + leaked-password protection, a manual gate)
- **Production (2026-09-29)**: `main` fast-forwarded to `db8751e`, Vercel Production deployment
  `success`. Smoke on https://locked-in-rust.vercel.app with the real signed-in account (Chrome,
  1440): Planner and sidebar / More entry load; a shared exam created (listed under HOJE, bound to the
  duo, one `planner_changed` with ids only, no title in any payload) and its in-app reminder toast
  shown; a private homework created (no duo, no broadcast); the real partner's RLS view (simulated
  read-only session) returns only the shared event; the shared event edited (`update` broadcast);
  calendar day `29 de setembro, 2 eventos`; Today PRÓXIMOS card; ADICIONAR ÀS TAREFAS opened
  Quick Add pre-filled and the task was created only on confirm; then the task and both events were
  deleted through the UI (`delete` broadcast for the shared one only) — PROD left with 0 test
  events / tasks / feed lines. **Not verified in production** (needs both people on their own
  devices; covered by the e2e with real browsers and sockets): live ONLINE → last seen → ONLINE → EM
  FOCO between two users, the partner seeing planner changes live, and the heartbeat (the automation
  window was not visible, so — correctly — no heartbeat was sent; `user_presence` is empty until
  each of you opens the new version). The first load after an hour idle returned a server error once
  (a single 401 on the V1 feed read with an expired session token), fine on reload — see warnings
- Fixed during the run (tests only): stage6 read A's sessions with a 400-id `in()` list that
  exceeded the URL limit as DEV history grew → now by owner; the `/` restore assertions get 15 s
  under a full-suite load; the V2 `beforeAll` resets get 120 s

## Phase 1 — Foundation + Restore State — VERIFIED (2026-09-29)

Scope: docs/RESUME_STATE.md, ADR-055. No database migration, no new dependency.

Done:

- `src/lib/resume-state.ts`: one versioned JSON per user (`locked-in:v2:<userId>:resume`),
  validated field by field, SSR-safe, never throws, ≤ 4 KB, logout cleanup
- `/` restores the last safe private route (else `/today`); `manifest.start_url` is `/`; explicit
  URLs, `/auth/*`, reset, `?next` and onboarding are untouched
- Progress range and an earlier History (calendar) month restored; scroll of Today / Partner /
  Progress / Routine restored once per page load after content, saved at most every 400 ms
- Drafts of a new task / routine item (24 h), never auto-opening a sheet; removed on submit
- Explicit sign-out clears the user's Resume State; users on one device are isolated by key
- Focus unchanged: restored from `focus_sessions` only
- Tests: unit `resume-state.test.ts` (21), e2e `v2-resume.spec.ts` (8 × 390 / 1440)

Verified (2026-09-29, clean `.next`, branch `v2-phase-1-foundation-resume`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm audit` — 0 vulnerabilities
- `npm test` — 10 files, **145 passed** (124 V1 + 21 `resume-state`)
- `npm run test:e2e` — **83 passed**, 0 failed, 0 retries (the 67 V1 tests + `v2-390` 8 + `v2-1440`
  8). One V1 assertion changed on purpose: stage8 "installable" now expects `start_url: "/"`
- The V2 spec also at 375, 430, 768 and 1180 (temporary config): 32 / 32 passed
- Production-like: all e2e run against `next build` + `next start` with real Chromium, real
  DEV Supabase sign-in and real `localStorage`; "close / reopen" = new browser context with the
  saved cookies + storage
- Security: the e2e asserts no token / JWT / password / email in any `localStorage` value, no
  focus session / title in Resume State, sign-out removes the key, a second user gets no route,
  scroll, draft or Progress choice of the first; explicit URL, `/auth/confirm`, `/reset-password`
  and `?next` win
- No migration; PROD database untouched

Production (2026-09-29): `main` fast-forwarded to `b2c3401`, Vercel Production deployment for that
SHA `success`; `manifest.webmanifest` serves `start_url: "/"`. Smoke on
https://locked-in-rust.vercel.app with the real signed-in account (Chrome, 1440): `/` → Today (nothing
stored yet); Progress → 30D → previous month; tab closed, new tab at `/` → Progress, 30D, August;
explicit `/today` stays Today; Quick Add draft typed, tab closed with the sheet open, reopened: sheet
closed, draft back on opening; emptied (nothing submitted, no data written); Focus screen from the
database (no running session); Partner screen and feed load; no console errors; storage holds only
the Resume State key (no auth / token key). Left at 7D / current month / Today. Not done in
production (covered by e2e): sign-out / sign-in (needs the user's password) and a live two-person
realtime event (the partner was offline).

Parked (not part of V2 Phase 1): uncommitted V1 work found on `main` at the start (change password
in Settings + show / hide password toggle) was committed unreviewed to the local branch
`wip-v1-change-password`, so `main` matched production.

---

# LOCKED IN V1

Stage status at the end of V1 (history below, unchanged):

Current Stage:
10 — Production Deployment — IN PROGRESS (PROD database, Auth, SMTP and Vercel configured; paused for the pt-BR localization; auth test and two-device acceptance pending)

Previous: 9 — Final QA, Security, Integrity, Performance and Production Readiness Audit — VERIFIED / COMPLETE (2026-09-28)

---

# Stage 10 — pt-BR localization (2026-09-28)

- The whole interface is in Brazilian Portuguese (ADR-054): one typed catalog `src/i18n/pt-BR.ts`
  (`t`, `plural`, `LOCALE`), no new dependency. `<html lang="pt-BR">`, manifest, page titles,
  dates (`QUI, 24 SET`, `21 – 27 SET`), aria labels, validation / error copy and toasts.
- Kept in English: the name LOCKED IN and the LOCK IN button. Tagline: "Sem hype. Só prova.".
- Internal identifiers unchanged (Day codes, categories, statuses, error codes, database values).
- New `app/not-found.tsx` (the default 404 was English).
- Unit and E2E tests assert the Portuguese copy.

---

# Stage 9 record

Stage 9 — Final QA, Security, Integrity, Performance and Production Readiness Audit — VERIFIED / COMPLETE (2026-09-28)

Completed (Stage 9):

- **Closed history frozen in the database** (ADR-050): migrations `…163557_history_integrity`,
  `…163955_history_guard_rls_order`, `…164538_history_boundary_owner_and_challenge_dedupe`; guards on
  `daily_tasks` / `routine_items` for the API roles, monotonic `profiles.history_locked_through`,
  catch-up still materialises missed days (DEFINER `private.materialize_tasks`)
- **Focus days and challenge results frozen** (ADR-051): `focus_sessions.local_date` fixed at start,
  a closed day's paused session completes instead of resuming, challenge standards snapshotted,
  focus challenges on effective seconds (`…165621`), duplicate challenges refused
- **HTTP / auth hardening** (ADR-053): CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, no `X-Powered-By`; `safeNext()` hardened; auth email links from `SITE_URL`
- **Realtime:** the ended duo's channel is left immediately on `duo_ended`
- **Accessibility:** WCAG AA text contrast; keyboard-safe end-duo confirmation
- **Tests:** pgTAP `stage9_integrity` (69), e2e `stage9` (9: IDOR / anon, closed history through
  API + UI + timezone, concurrency, realtime isolation after END DUO, one channel / no polling /
  reconnect, HTTP headers and redirects, XSS / SQL text, axe, keyboard), unit date torture
  (`dates.test.ts`: midnight, DST, week / year / leap boundaries); DEV-only fixtures (ADR-052)
- **Audit docs:** docs/SECURITY.md (new: auth, table matrix, DEFINER model, closed history,
  advisors, accepted risks), docs/PRODUCTION_CHECKLIST.md (new: Stage 10 steps and manual gates),
  DATABASE, ANALYTICS, CHALLENGES, REALTIME, README, CLAUDE.md, ROADMAP, ADR-050…053

SECURITY DEFINER audit (2026-09-28, catalog + source on DEV):

- 17 production DEFINER functions (8 public RPCs, 3 private helpers, 6 triggers) + 3 DEV-only
  `dev_fixture_*` (+ `private.dev_is_test_user`). Every one: `search_path = ''`, schema-qualified,
  owner `postgres`, no EXECUTE for PUBLIC / anon; triggers executable by nobody
- Identity only from `auth.uid()` → membership; no public RPC takes a user id. The only DEFINER with
  one, `private.materialize_tasks(p_user)`, returns `null` unless `p_user` is the caller or the
  caller's current partner (pgTAP: outsider gets `null`). Composite FKs block cross-owner ids
  (`daily_tasks → routine_items`, `focus_sessions → daily_tasks`). No IDOR found
- Broadcast triggers send only to `duo:<the actor's duo>`, never a private title, note or reflection

RLS / table matrix: docs/SECURITY.md → "Table matrix". All 10 tables RLS on; `anon` has no table,
column or function privilege; owner / partner / outsider rules match the policies and column grants
read from the catalog.

Advisors (DEV, 2026-09-28) — classification in docs/SECURITY.md:

- Security: 0029 × 8 public DEFINER RPCs → ACCEPTED WITH JUSTIFICATION; 0029 × 3 `dev_fixture_*` →
  NOT APPLICABLE (DEV-only, checklist verifies absence in PROD); `auth_leaked_password_protection`
  → STAGE 10 / MANUAL CONFIGURATION REQUIRED
- Performance: 0001 × 2 composite FKs → ACCEPTED (leading column indexed); 0005 × 2 unused indexes →
  ACCEPTED (DEV traffic; FK cascade support)
- FIXED in this run: none needed (no code-fixable finding remained)

Verified (2026-09-28, clean `.next`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm audit` — 0 vulnerabilities
- `npm test` — 9 files, 124 tests passed
- Date / time torture: `dates`, `progress`, `focus`, `product` unit files (79 tests) passed twice under
  each of `TZ` = UTC, America/Sao_Paulo, America/New_York, Europe/London, Pacific/Kiritimati
  (UTC+14), Pacific/Pago_Pago (UTC−11), Australia/Lord_Howe (30-min DST) — 14 / 14 green
- `npm run test:e2e` — **67 passed**, 0 failed, 0 retries (setup 1, 390 9, 1440 9, focus 2, 375 2,
  430 2, stage3 5, stage4 4, stage5 4, stage6 7, stage7 3, stage8 10, stage9 9)
- Flakiness: setup + stage3 (duo race) + stage4 (concurrent catch-up) + stage5 (realtime) + stage9
  (adversarial, concurrency, realtime, closed history) re-run three more times: run 2 — 43 / 43 green; run 3 — 1 failure in stage6 (test bound, fixed, see below); run 4 (after the fix) — 1 failure in stage8 "reactions persist, update live" (live delivery, see Known Issues), the rest green. Then in isolation, serially: the fixed stage6 test 6 / 6 (+ 8 / 8 instrumented), the whole stage8 file 15 × (150 / 150, the reactions test 15 / 15). Final full suite after the fix: **67 passed**, 0 retries
- pgTAP on DEV (all 29 migrations applied, list identical to `supabase/migrations/`): stage 3 51/51,
  stage 4 72/72, stage 5 40/40, stage 6 63/63, stage 7 78/78, stage 8 84/84, stage 9 69/69
  (**457/457**, FAILED=0); DEV free of fixtures and of the pgtap extension afterwards
- Integrity re-confirmed (pgTAP stage 9 + e2e stage 9): closed history immutable (complete / undo /
  skip / delete / rename / visibility / backdate refused; closed week and streak unchanged after
  every attempt); a timezone move west does not reopen a day and the boundary only moves forward;
  focus history cannot be forged (timestamps, day, duration, backdated insert, reopening); closed
  challenges stable after both standards change; an old duo leaks nothing to a new partner;
  Realtime isolated (other duo, no duo, fake topic, anon, ended duo)
- Secret audit: only `.env.example` tracked; `.env*`, `tests/e2e/.auth/`, `test-results/`,
  `playwright-report/` ignored; full git history scanned (JWTs, `sb_secret_`, service role, private
  keys, passwords) — nothing; no service-role use in `src` / `tests` / `scripts`; only
  `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` reach the browser; the DEV seed uses a
  `__E2E_PASSWORD__` placeholder; no `dangerouslySetInnerHTML` / `innerHTML` / `eval` in `src`
- Clean clone of `04db328`: `git clone`, `npm ci`, lint, typecheck, unit (124), build, format:check, `npm audit` (0) — pass; only `.env.example` tracked
- Performance: production build (Turbopack) compiles in ~6 s, 21 routes (7 static); client JS 22
  chunks, 1008 KB raw / 290 KB gzip in total, largest chunk 79 KB gzip; no polling (the only
  interval is a local 1 s clock tick while a focus clock is on screen; the e2e asserts no request
  and no socket frame except heartbeats during a running focus); progress is derived in SQL with
  indexed `(owner_id, task_date)` / `(user_id, local_date)` lookups
- Responsive: 375 / 390 / 430 / 1440 automated (layout + full suites, no overflow); Stage 9 changed
  only colours and the end-duo confirmation, both covered at 390 / 1440 and by axe / keyboard tests
- Accessibility: axe — no serious / critical violation on the main screens and login; keyboard —
  sheets and the end-duo confirmation open, trap nothing, close with Escape

Fixed during the final Stage 9 run (2026-09-28):

- **Flaky e2e assertion (test, not product):** `stage6` "a running focus sends nothing per second"
  failed once in a critical rerun (B received 2 presence frames in the 12 s window, bound was ≤ 1).
  In that same failing run the sender assertions passed: A sent no HTTP request and no WebSocket
  frame except heartbeats. Logging the frames (8 serial repeats) showed they are always join-only
  `presence_diff` (`"leaves":{}`, `state: "online"`) — late delivery of A's channel joins, one per
  page load, and A loads the page twice right before the window. The assertion now allows up to two
  join-only diffs and still refuses any update or stream; 6 / 6 serial repeats green, then the full
  suite and the critical chain again (below)
- Docs out of date with the Stage 9 migrations: DATABASE (`materialize_tasks` is DEFINER, routine
  grants, new columns / index / functions, Closed history section, Stage 9 tests), ANALYTICS
  (closed history no longer open), CHALLENGES (standard snapshot, effective focus seconds),
  REALTIME / README (manual gates, Preview must not use PROD keys, exact redirect URL)

Manual Stage 10 production gates (not blockers of code, database, security or integrity):

- **MANUAL STAGE 10 PRODUCTION GATE** — Realtime "Allow public access" OFF (dashboard only)
- **MANUAL STAGE 10 PRODUCTION GATE** — Leaked password protection ON (dashboard only, plan-dependent)

Neither was changed: the tools available here (SQL / Supabase MCP) cannot read or set them. Exact
steps: docs/PRODUCTION_CHECKLIST.md §2.

Known Issues / accepted (docs/SECURITY.md → Accepted risks):

- CSP allows inline scripts / styles (Next.js bootstrap; nonce policy after V1)
- Invite codes are guessable only in theory (887 M space, open duos only, no per-RPC rate limit)
- Notifications only while the app is open (ADR-045)
- Far-apart timezones frame a week by the viewer's Monday; a running focus session on a challenge's
  last day keeps adding (≤ 12 h) until it ends; the streak recalculates with the owner's own
  standard (ADR-038, personal only)
- A broadcast in the first moments after joining can be missed live; the next refetch recovers it
- **Open (non-blocking) — rare live-delivery miss:** once in 19 runs of stage8 "reactions persist,
  update live" today (in the long chained rerun on shared DEV users, never in 15 isolated repeats),
  A's page missed both the `activity` and the `reaction` broadcasts although presence worked. The
  data was persisted correctly (the same test's reload / persistence checks and every other run
  pass), isolation is unaffected, and the next refetch (reconnect, tab visible, partner event,
  reload) shows it. Root cause not proven (no frames captured from a failing run); consistent with
  the join warm-up above. Watch in Stage 10 real-device acceptance; no code changed for it
- "destination stream closed early" server log from aborted RSC streams on navigation; no user
  impact
- `npx supabase test db` still cannot run locally (Docker); pgTAP runs on DEV via the script

---

# Stage 8 record

Stage 8 — Complete Product — VERIFIED / COMPLETE (2026-09-25)

Completed (Stage 8):

- Six migrations (`…122722` … `…125824`): `user_settings`, `reactions`, `challenges` (RLS on
  all three, column grants), `set_reaction`, `duo_challenges` (DEFINER, ADR-044),
  `add_routine_items`, `duo_ended` / `duo_joined` / `reaction` / `challenges_changed`
  broadcasts, partner reads shared tasks only from the day the duo formed
- Reactions: persisted on `activity_events`, fire / lightning / salute / respect, one per user and
  replaceable, removable, never on my own event, duo only, live on both sides, no feed line; toast
  "Lucas reacted to your Morning Run."
- Challenges: standard days / focus time only, progress / status / leader / winner / draw derived
  (docs/CHALLENGES.md), delete only before start, no edits
- Onboarding: real, resumable (`onboarding_completed_at`), templates or own items, duo optional
  ("Do this later"), never shown again
- Routine templates: frontend constants, editable before adding, double click safe
  (`add_routine_items` serialised per user, skips existing titles)
- Settings: name, timezone, Daily Standard with explanation, briefing, share new tasks, four
  notification preferences, quiet hours, browser permission (button only), duo, install, sign out
- Notifications: in-app toasts + browser Notification API only while open (docs/NOTIFICATIONS.md);
  no push / service worker / VAPID / cron
- Duo management: "End this duo?" confirmation, atomic end for both (feed, reactions, challenges
  removed), live on both sides, personal data kept, a new partner sees nothing of the old duo
- Briefing (optional, once a day, real numbers), day review, weekly review (CURRENT LEADER vs
  WINNER, head to head), history (calendar month navigation, past days with focus, weekly reviews)
- PWA: manifest, icons (192 / 512 / maskable, apple-touch), web-app metadata; no service worker
- Mocks removed: `src/lib/mock-data.ts` deleted; nothing is mock any more
- Docs: NOTIFICATIONS.md and CHALLENGES.md (new), DATABASE, REALTIME, ANALYTICS, ARCHITECTURE,
  PRODUCT, ADR-043…049, CLAUDE.md, README, ROADMAP (Stage 9 checklist)

Verified (2026-09-25, clean `.next`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm test` — 8 files, 112 tests passed (23 new in `product.test.ts`)
- `npm run test:e2e` — 58 passed: previous suites + stage8 10 (onboarding solo and with a duo,
  reactions live / persisted / isolated, challenges derived from real tasks and focus, settings
  persist, notification preferences and quiet hours, briefing once a day, reviews and history
  match recorded numbers, ending the duo live on both sides + new partner sees nothing, manifest)
- Database: pgTAP on DEV after the Stage 8 migrations — stage 3 51/51, stage 4 71/71, stage 5
  40/40, stage 6 63/63, stage 7 78/78, stage 8 84/84 (387/387); DEV free of fixtures afterwards
- Clean clone: `git clone`, `npm ci`, lint, typecheck, unit (112), build — pass
- Acceptance: the 20-step acceptance flow on two fresh throwaway accounts in one Playwright run
  (temporary spec, removed afterwards), no console errors; accounts deleted afterwards
- Responsive smoke on the production build (settings, challenges, duo, progress + previous month,
  more, challenge sheet, weekly review, onboarding) at 375, 390, 430, 768, 1180, 1440 — no
  horizontal overflow, no console errors
- Advisors: new only the accepted DEFINER `duo_challenges` (ADR-044); leaked password protection
  still off (Stage 9)
- Security review: RLS on every new table, anon gets nothing, no self reaction, no cross-duo
  access, settings owner only, private tasks never listed, no service role in client code, no
  secrets committed

Fixed during Stage 8:

- A partner could read shared tasks from before the duo existed → migration `…125824`
- A partner joining right after the invite could miss `duo_joined` → the refetch detects a
  partner who arrived or left
- The morning briefing appeared right after finishing onboarding → marked shown on finish

Known Issues / warnings:

- **Closed weeks are still mutable through the API**: owners can insert / edit / skip past-dated
  tasks (Stage 4 grants), which can change a closed week's result, a past streak or a finished
  challenge. No UI allows it and none was added. Stage 9: FREEZE / PROTECT CLOSED COMPETITION
  HISTORY
- Production pendings (Stage 9 / 10): Realtime "Allow public access" off, leaked password
  protection on, review of every SECURITY DEFINER function, final advisors / security scan
- Notifications only while the app is open (by design, ADR-045)
- A broadcast in the first moments after joining the channel can be missed live; numbers recover
  on the next refetch
- Headless Chromium draws 🫡 as a box (no emoji font); real browsers are fine
- Occasional "destination stream closed early" server log from aborted RSC streams on navigation;
  no user impact seen
- `npx supabase test db` still cannot run locally (Docker); pgTAP runs on DEV via the script

---

# Stage 7 record

Stage 7 — Real progress, streak, weekly competition and analytics — VERIFIED / COMPLETE (2026-09-25)

Completed (Stage 7):

- `profiles.daily_standard_percent` (1–100, default 80); Settings saves it (optimistic, rollback)
- Progress derived in SQL from `daily_tasks` + `focus_sessions`, no stats tables (4 migrations
  `…180106`, `…180145`, `…180531`, `…112050`): `my_progress_summary`, `my_daily_progress`,
  `my_habits` (INVOKER), `duo_weeks`, `partner_progress_summary` (DEFINER, integers only); shared
  `private.materialize_tasks` (also materialises the partner before comparing)
- Rules: skipped in the denominator, neutral days (0 planned) never 0 % / 100 %, standard met by
  exact ratio, today never breaks the streak early, Perfect Day = 100 %, streak recalculated when
  the standard changes, focus by the day a session started
- Competition: raw completion % (never the standard, never focus), exact-ratio leader with `<1%`,
  current week never a result, head-to-head over completed weeks where both had tasks, draws,
  only full weeks together (pre-duo weeks have no partner side)
- UI real: Today streak, streak sheet (longest), Progress (ranges 7D / 30D / 90D / YEAR, chart per
  day / week / month, focus, perfect days, calendar with past-day review, weekly reviews, habits
  and descriptive insights with a 3-occurrence minimum, longest streak), Partner (this week, leader,
  focus and streak comparison, head-to-head strip and history), weekly review, morning briefing
  (yesterday %, streak), review day; reload on local day change
- Live without polling: own numbers from local state; partner numbers re-read after every realtime
  refetch (`partnerVersion`); the provider now also refetches on the first channel join
- Removed mocks: stats, streak, week, weeks, head-to-head, mock DaySheet corrections, `seeded()`
- Docs: ANALYTICS.md (new), DATABASE, REALTIME, ARCHITECTURE, ADR-037…042, CLAUDE.md, README
- Tooling: `supabase/dev/pgtap_dev.mjs` (pgTAP on DEV without Docker); `trackWrites()` tracks
  Server Actions only and survives reloads

Verified (2026-09-25, clean `.next`):

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — pass
- `npm test` — 7 files, 89 tests passed (34 new in `progress.test.ts`)
- `npm run test:e2e` — 48 passed, three consecutive green full runs after the last fix: setup, UI
  suite at 390 / 1440 (real progress / competition numbers), @focus, 375 / 430 layout, stage3 5,
  stage4 4, stage5 4, stage6 7, stage7 3 (history / streak / standard / skipped / calendar / day
  review; two browsers live competition without reload, private counted but never shown, current
  week not a result, pre-duo week no contest, weekly review; public API isolation)
- Database: pgTAP on DEV after the Stage 7 migrations — stage 3 51/51, stage 4 71/71, stage 5
  40/40, stage 6 63/63, stage 7 78/78 (303/303); DEV free of fixtures afterwards
- Migrations: all four applied on DEV; function bodies checked byte-identical (md5) with the files;
  `src/types/database.ts` matches the generated schema
- Responsive smoke with a real session (/today, /progress incl. insights, /partner, /settings) at
  375, 390, 430, 768, 1180, 1440 — no horizontal overflow, no console errors
- Advisors: new only the accepted DEFINER `duo_weeks` / `partner_progress_summary` (ADR-040); INFO
  items unchanged
- Security review: no stats tables, partner functions take no user id and return integers only,
  private tasks never listed or broadcast, pre-duo history not exposed, anon refused, no service
  role in client code, no secrets committed

Fixed during Stage 7:

- Weekly review / briefing / review day still read removed mocks (typecheck failed) → real data
- Head-to-head counted weeks before the duo existed → `duo_weeks` hides the partner side there
- Events between the server render and the first channel join were lost → refetch on first join
- E2E helper counted Supabase reads and requests cut off by reloads as pending writes → fixed

Known Issues:

- A private completion reaches the partner's competition numbers only on their next re-read
  (next shared event, reconnect, tab visible, reload) — by design, private tasks emit nothing
- A standard change is not pushed to the partner (seen on their next re-read)
- Weeks are framed by the viewer's Monday; far-apart time zones can differ by a day at the edges
- Owners can still insert / edit past-dated tasks through the API (Stage 4 grants), so closed weeks
  are not frozen — lock down in Stage 9 (integrity / RLS audit)
- One transient "Could not load Focus." server error (Node → Supabase request that never reached
  the API) seen once, right after an invalid parallel test run on shared users; not reproduced in
  10 serial repeats or 6 full suites
- `npx supabase test db` still cannot run locally (Docker); pgTAP runs on DEV via the script
- Still mock: challenges, reaction persistence, notifications (Stage 8) — done in Stage 8
- Realtime "Allow public access" and leaked-password protection still to change before production

---

# Stage 6 record

Stage 6 — Persistent Focus Sessions and live Focus synchronization — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 6):

- `focus_sessions` (migrations `…162212` … `…172713`): statuses active / paused / completed (ending early = completed), every timestamp from `now()` in a lifecycle trigger, pauses excluded from the duration, one unfinished session per user (partial unique index), linked task must be mine (composite FK), private task ⇒ private session, reflection ≤ 1000 owner-only, owner-only RLS + column grants, no DELETE
- Invoker RPCs `start / pause / resume / complete_focus_session`, `save_focus_reflection`, `my_active_focus` + `reconcile_my_focus` (expired sessions completed on demand with `actual = planned` and the real planned end; no cron; paused never expires); `server_now()` (database clock); DEFINER `partner_current_focus()` limited projection
- Feed events `focus_started` / `focus_completed` (with real duration; no pause / resume; private without title) and one `focus` broadcast per transition on the duo channel, from a DEFINER trigger; never a reflection, never per second
- Presence reduced to online only; partner status = FOCUSING from the persistent session (even with the app closed), else presence ONLINE / OFFLINE
- Focus screen real: picker of today's open tasks + presets, 25 / 50 / 90 / custom, LOCK IN (not optimistic), pause / resume / end (optimistic with rollback, queued in order), completion with real duration and optional reflection, session list and Focus today from the database; the timer survives refresh, closing the app, sleep and a second tab; clock derived from timestamps + database clock offset, local 1 s tick only while a clock is on screen
- Removed: `mockFocus`, mock focus totals / sessions, focus in presence
- Docs: DATABASE (table, lifecycle, maths, reconciliation, privacy), REALTIME (focus events, presence change, ordering, clock), ARCHITECTURE, ADR-033…036, CLAUDE.md, README, ROADMAP

Verified (2026-09-24):

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` — pass
- `npm test` — 6 files, 55 tests passed (timer maths incl. pauses, expiry, paused never expiring, partner status, focus today across midnight, clock offset, feed mapping, error copy)
- `npm run test:e2e` — 45 passed, four consecutive green full runs after the last fix: setup, UI suite at 390 / 1440 (+ @focus after it), 375 / 430 layout, stage3 5, stage4 4, stage5 4, stage6 7 — refresh while running and while paused (pause excluded, reflection saved), expired while closed → reconciled, two-browser live start / pause / resume / app closed (still FOCUSING) / end → ONLINE and private title hidden, second tab restores and syncs, double LOCK IN and concurrent starts → one session, outsider no access, network test (12 s running: no HTTP requests, no broadcast / focus frames, no presence tracking; only heartbeats)
- Database: pgTAP on DEV (aborted-transaction method) — stage 3 51/51, stage 4 71/71, stage 5 40/40, stage 6 63/63 (225/225)
- Responsive smoke with a real session (setup, running, paused, complete, partner) at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow, no console errors; clock right after start 25:00 and 24:57 after a reload 3.4 s later
- Advisors: nothing new beyond the accepted DEFINER `partner_current_focus` (ADR-034) and the INFO about the composite FK index
- Security review: no timer written / broadcast / tracked per second, no client broadcast, partner never reads `focus_sessions`, reflections never leave the owner, no service role in client code, no secrets committed

Fixed during verification:

- END right after RESUME was dropped (busy flag) → transitions are queued in order
- Late `focus` broadcasts / refetches could resurrect an ended session or overwrite a newer partner state → refetch treated as truth, stale results discarded
- DONE before the END response reopened the completion screen → the response only updates the screen it belongs to; the note waits for the completion
- Initial clock used the app server's clock (≈ 10 s off from Postgres here) → `server_now()` measured on every load
- `server_now()` was callable by anon (Supabase default privileges) → caught by pgTAP, fixed in a new migration

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop VM does not start); pgTAP ran on DEV
- With the app closed, an expired session is completed in the database the next time its owner opens the app; until then the partner already sees ONLINE / OFFLINE (computed locally) but the `focus_completed` feed line appears only after reconciliation
- Outside a duo there is no channel: a second tab of the same user syncs when it becomes visible (or on reload)
- Backgrounded mobile tabs may throttle timers; the clock is recomputed from timestamps as soon as the tab is visible again
- Still mock: standard, streak, weekly competition, head-to-head, stats, challenges, reaction persistence, notifications
- Realtime "Allow public access" still to be disabled before production (Stage 10); leaked-password protection off in DEV

---

# Stage 5 record

Stage 5 — Realtime partner, presence and live activity — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)
- 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)
- 4 — Real Today, recurring routines, one-off tasks and task check-ins — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 5):

- One private Realtime channel per duo (`duo:<duo_id>`) for Presence + database Broadcasts; architecture in `docs/REALTIME.md`
- Realtime Authorization (RLS on `realtime.messages`): duo members receive broadcast / presence and publish presence only; other duo, no duo, fake topic and anon refused at join
- `activity_events` feed maintained by a trigger on `daily_tasks` (exists exactly while a task is completed and shared; undo / skip / private / delete remove it; title snapshot); broadcasts `activity`, `activity_removed`, `tasks_changed` with minimal payloads; clients cannot write the feed
- `partner_today()`: the partner's local date and done / total (private tasks counted, never listed)
- `DuoRealtimeProvider`: presence (key = user id, multi-tab safe), connection state (connected / reconnecting / offline pill), feed (20, newest first, de-duplicated by event id, optimistic own line replaced by the real event), partner's day; refetch from Postgres after events, reconnect, online and tab visible; serialized channel teardown; JWT kept current by supabase-js on token refresh
- Partner real: name, ONLINE / FOCUSING / OFFLINE (no last seen), countdown from shared start + planned minutes (no per-second updates), today's % and counts, shared task list with "+ N private", live feed and toasts, card / avatar flash
- Removed: mock feed, mock partner tasks, dev simulation of partner / connection, fake feed lines from reactions and focus; head-to-head uses real initials
- Docs: REALTIME.md (new), DATABASE.md, ADR-027…032, ARCHITECTURE, CLAUDE.md, README

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 5 files, 44 tests passed
- `npm run build` — pass
- `npm run format:check` — pass
- `npm run test:e2e` — 38 passed: setup, 24 UI tests on real data (partners with a real day and feed), 5 Stage 3, 4 Stage 4, 4 Stage 5 (two / three real browser contexts, no reload on the watching side)
- Database: pgTAP on DEV — stage 3 51/51, stage 4 71/71, stage 5 40/40 (162/162; aborted-transaction method, broadcasts inside never delivered)
- Realtime integration with real sockets: A and B `SUBSCRIBED`; C, fake topic and anon refused (`Unauthorized`); B received `activity` ≈ 150–180 ms after A's update; private completion sent nothing; payload without notes / timezone / email
- Manual two-browser acceptance (production build, Brendon = A, Lucas = B, isolated contexts at 390px): 1 both see each other ONLINE; 2 A taps Morning Run → B's toast "Brendon completed Morning Run" in 124–147 ms without reload, feed line on /partner; 3 B starts focus → A sees LUCAS FOCUSING (≈ 1–3 s); 4 B ends → ONLINE (≈ 3 s); 5 B closes → OFFLINE (≈ 3 s); 6 B reopens → ONLINE; 7 A completes a private task → B sees nothing (0 matches, 0 toasts); 8 B closed, A completes Gym, B reopens → "Brendon completed Gym" from the persisted feed; no console errors
- Multi-tab: B with two tabs, one closed → still ONLINE after 5 s; last closed → OFFLINE (E2E)
- Responsive smoke: /today and /partner at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow
- Clean clone (`npm ci`): lint, typecheck, unit, build pass without secrets
- Security review: one channel, no client broadcast, no polling, presence only on state change, no service role in client code, no secrets committed, new SECURITY DEFINER functions reviewed (`search_path = ''`, minimal EXECUTE)

Pending:

- Nothing for Stage 5

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop VM does not start); pgTAP ran on DEV
- Realtime settings "Allow public access" not changed in DEV (not verifiable from the tools used); disable it in the Dashboard before production (REALTIME.md)
- A user who leaves a duo keeps an already-joined socket until it reconnects (join-time authorization); after the duo ends there is nothing left to receive and the next join is refused
- Partner counts can lag after a private completion (it sends nothing, by design) until the next shared event, reconnect or load
- Presence depends on the browser keeping the socket alive; backgrounded mobile tabs may show OFFLINE
- First channel join of a day can log a transient `MissingPartition` error that the client retries
- Still mock: focus sessions / totals / history, standard, streak, weekly competition, head-to-head, stats, challenges, reaction persistence, notifications
- Supabase advisors: definer RPCs incl. `partner_today` (ADR-015 / ADR-028), leaked-password protection off in DEV, INFO about the composite FK index and an unused `activity_events_actor_idx` (FK cascade)

Next Stage (at the end of Stage 5):
6 — Persistent Focus Sessions and live Focus synchronization

---

# Stage 5 start

Stage 5 — started 2026-09-24

---

# Stage 4 record

Stage 4 — Real Today, recurring routines, one-off tasks and task check-ins — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)
- 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)

Completed (Stage 4):

- Schema (DEV, 3 migrations): `routine_items` (recurring template) and `daily_tasks` (materialised snapshot per local date, or one-off); status on the task (pending / completed / skipped, database-owned timestamps, missed derived); details in `docs/DATABASE.md`
- Guarantees in the database: one occurrence per routine per date, same-owner composite FK, no hard delete of routines with history, no impossible status rows, ISO weekdays 1..7 sorted / de-duplicated, title / notes / category / date checks
- `my_today()` from `profiles.timezone` is the single definition of the day; `ensure_my_daily_tasks()` materialises on demand with catch-up of unopened days, idempotent under concurrency (no cron)
- Routine functions (all SECURITY INVOKER): create (starts today), update "Today and future days" (history untouched, today's occurrence added / refreshed / removed by the documented rule), archive (= Delete), reorder
- RLS: owner full control; duo partner reads only `visible_to_partner` rows and writes nothing; outsider and anon nothing; column grants keep ids, dates and timestamps server-owned
- Today real: tasks from the database grouped by section in manual order, real local date and DAY N, NO ROUTINE YET empty state, Rest today from the real routine, completion = completed / all tasks (skipped stays in the total, ADR-022)
- Task actions real and optimistic (tap → check ≈ 7 ms, no spinner): complete, undo (snackbar), skip with reason, unskip, Quick Add one-off, Edit → Today only / Today and future days, Delete (one-off deleted, routine item archived); failures roll back with a toast
- Routine screen real: add, edit (today and future), archive, drag / keyboard reorder persisted, templates create real routine items; onboarding's chosen items too
- Review today / morning briefing / streak sheet use today's real tasks; Progress "today" bar is real
- Sign-out now ends only the current browser session (ADR-025)
- Mock feed keeps only partner events; the user's own events come from real completions
- Docs: DATABASE.md (tables, materialisation, timezone, status, RLS, snapshots), ADR-019…026, ARCHITECTURE, CLAUDE.md, PRODUCT (principle 5)

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 4 files, 32 tests passed
- `npm run build` — pass
- `npm run format:check` — pass
- `npm run test:e2e` — 34 passed: setup (seeds 3 users with the design's Today as real data), 24 Stage 2 tests on real data (390, 1440, 375, 430), 5 Stage 3, 4 Stage 4
- Database: pgTAP on the DEV database — `stage3_auth_duo` 51/51, `stage4_tasks` 71/71 (aborted-transaction method; DEV verified free of fixtures afterwards)
- Concurrency: 5 simultaneous `ensure_my_daily_tasks()` calls → no duplicates; catch-up of 3 unopened days; snapshot rename (past keeps the old title)
- Clean clone (`git clone` + `npm ci`): lint, typecheck, unit and build pass without any secrets
- Manual acceptance (production build, fresh browser context at 390px, user Alice): created Wake Up (every day, 06:00), Gym (MON / WED / FRI) and Read (every day); on Thursday Gym correctly rests ("Rest today: Gym"); Quick Add "Finish Physics Assignment"; completed Wake Up (tap → check 7 ms); skipped Read (Rest); reload → identical (1 / 3, 33%); sign out → /today redirects to /login; sign in → identical; no console errors
- Responsive smoke: /today, /routine, /partner, /progress, /settings at 375, 390, 430, 768, 1180, 1440 — no horizontal overflow; screenshots checked against the design at 390 and 1440
- Security review: RLS on all five tables, anon has no grants, owner_id spoofing and cross-owner links rejected, partner read-only and private tasks hidden, outsider blocked (pgTAP + API), no SECURITY DEFINER added, every new function with `search_path = ''` and EXECUTE only for `authenticated`, no service role in client code, no secrets committed

Pending:

- Nothing for Stage 4

Known Issues:

- `npx supabase test db` still cannot run locally (Docker Desktop's VM does not start); pgTAP was run on DEV instead (docs/DATABASE.md → Tests)
- No realtime: the partner sees changes on their next load (Stage 5)
- Streak (13 days), yesterday %, Progress history / calendar, weekly and head-to-head numbers, partner completion / tasks / presence, focus sessions and challenges are still mock (Stages 5–8)
- Past-day corrections in the Progress calendar are still local mock (Stage 7 reads `daily_tasks` history)
- The standard (70–100%) is still local state, not persisted
- Reminders are stored but no notification is sent yet
- The live feed is local: the user's own completions appear there but are not persisted (Stage 5)
- Day rollover while the app stays open needs a reload to show the new day
- E2E resets archive routine items, so archived rows accumulate for test users; `supabase/dev/reset_test_users.sql` cleans them
- Supabase advisors: accepted definer-RPC notice (ADR-015), leaked-password protection off in DEV Auth (enable before production), INFO about the composite FK index (docs/DATABASE.md → Indexes)

Next Stage (at the end of Stage 4):
5 — Realtime Partner, Presence and live activity

---

# Stage 3 record

Stage 3 — Supabase Auth, database foundation and Duo — VERIFIED / COMPLETE (2026-09-24)

Previous Stages:

- 1 — Foundation — VERIFIED / COMPLETE (2026-09-23)
- 2 — UI Implementation — VERIFIED / COMPLETE (2026-09-23)

Completed (Stage 3):

- Database (DEV project `locked-in`): `profiles`, `duos`, `duo_members`; 5 migrations applied; details in `docs/DATABASE.md`
- Hard rules in the schema: one duo per user (`unique (user_id)`), two members per duo (`seat in (1,2)` + `unique (duo_id, seat)`); concurrency-safe
- Profile created by an `auth.users` trigger (SECURITY DEFINER, `search_path = ''`); timezone validated against IANA names; `updated_at` set by trigger
- RPCs `create_duo` (atomic duo + seat 1 + invite code), `join_duo` (normalise, lock, seat 2), `leave_duo` (ends the duo for both, ADR-016); stable `LI_*` error codes
- Invite codes `LKD-XXXXXX`: CSPRNG, 31-symbol alphabet without 0/O/1/I/L, unique, normalised input
- RLS on all three tables; anon has no grants; authenticated: SELECT + UPDATE of 3 profile columns; no direct INSERT / DELETE anywhere
- Auth UI (design v2 "Sign in" frame): sign up (name, email, password × 2, browser timezone), email confirmation (`/auth/confirm`, token_hash or PKCE code), sign in with friendly errors, forgot / reset password, sign out (POST)
- Route protection: `src/proxy.ts` (session refresh + redirects) and `(app)/layout.tsx` backstop; no private content rendered for signed-out requests
- Real identity in the app: greeting, sidebar, Settings (email · timezone · since), Duo screen (NO DUO / WAITING / COMPLETE with create, join, copy, share, cancel), partner name everywhere Lucas was hard-coded, Today / Partner empty states
- Mock product state kept (tasks, feed, focus, stats, presence, reactions, challenges) and separated from real session state (ADR-017)
- Tests: pgTAP suite extended to 51 assertions; Playwright setup signs in for real; new `stage3.spec.ts`; unit tests for auth / invite / route helpers
- Docs: DATABASE.md (new), ARCHITECTURE, DECISIONS (ADR-014…018), CLAUDE.md, ROADMAP, README

Verified (2026-09-24, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 3 files, 17 tests passed
- `npm run build` — pass (auth pages static, app routes dynamic, proxy active)
- `npm run format:check` — pass
- `npm run test:e2e` — 30 passed: setup (real sign-in), 24 Stage 2 tests signed in as Brendon with Lucas as partner, 5 Stage 3 tests
- Database: pgTAP `supabase/tests/stage3_auth_duo.test.sql` on the DEV database — 51/51 ok (run inside an aborted transaction because Docker was unavailable; DEV verified clean afterwards)
- Concurrency: B and C joining the same code at the same time through the public API — 10 + 5 rounds, always exactly one winner, loser gets `LI_DUO_FULL`, duo never exceeds 2
- Real email (Supabase default SMTP): sign-up confirmation link → `/auth/confirm` → signed in on `/today`; forgot password → recovery link → `/reset-password` → new password works, old one rejected
- Manual pass in three isolated browser contexts (A 390px, B 1440px, C 390px): A creates → B joins with the code → A (refresh) and B see each other's real names → C refused ("already full") → refresh keeps state → A signs out, private route redirects, A signs in again, duo intact; no console errors
- Supabase security advisors: only the intentional definer-RPC notice (ADR-015) and leaked-password protection (dashboard setting, see Known Issues)

Pending:

- Nothing for Stage 3

Known Issues:

- No realtime yet: the duo creator sees the partner after a refresh (Stage 5)
- Partner presence, %, streak, focus and all tasks / stats are still mock (Stages 4–7)
- `npx supabase test db` could not run locally (Docker Desktop VM failed to start); the same pgTAP file was executed against DEV instead
- Supabase default SMTP: only team-member addresses receive email and the hourly limit is low; configure custom SMTP before real users (Stage 10)
- Email templates are Supabase defaults (PKCE `?code=` links): open the link in the browser that requested it. The recommended `{{ .TokenHash }}` template is already supported by `/auth/confirm`
- Leaked password protection (HaveIBeenPwned) is off in DEV Auth settings; enable before production
- DEV contains the five `@example.com` test users and one real account created during the email check

Next Stage (at the end of Stage 3):
4 — Real Today, recurring routines, one-off tasks and task check-ins

---

# Stage 2 record

Completed (Stage 2):

- v3 design converted to Next.js + React + TypeScript + Tailwind with mock data (no backend)
- Shared shell: mobile top bar + bottom tabs (< 780px), 228px sidebar (≥ 780px), two-column Today/Focus (≥ 1180px)
- Routes: `/` → `/today`; `/today`, `/partner`, `/focus`, `/progress`, `/more`; `/routine`, `/challenges`, `/duo`, `/settings`, `/onboarding`
- Today: header, hero %, count, streak, progress bar with standard marker, sections, task rows (tap / keyboard / swipe right to complete, swipe left or long-press for options), perfect-day banner, partner card, live feed, review today, mobile Quick Add + LOCK IN bar
- Undo snackbar; unchecking withdraws the feed event
- Quick Add / edit sheet (today or repeat, days, time, reminder, section, visible to Lucas, notes); "apply change to" prompt for routine items
- Task options: skip with reason (leaves the total), unskip, edit, delete
- Partner: status, today %, this week (87% vs 81%), focus / streak comparison, head to head (5 — 3), past weeks, Lucas' tasks, activity, reactions
- Focus: activity + duration picker (25 / 50 / 90 / custom), LOCK IN, running overlay (ring timer, pause / resume, end), complete screen with note, session recorded in list and feed
- Progress: ranges 7D / 30D / 90D / YEAR, completion rate, streak, focus, perfect days, bar chart (today is live), September calendar with day detail + corrections, weekly reviews overlay, insights + 30-day consistency
- More, Routine (add, edit, drag + keyboard reorder, templates), Challenges (list + new challenge), Duo (share / copy code / join placeholder), Settings (standard 70–100% drives Today, notification switches), Onboarding (5 steps → Today, name updates greeting)
- Review day, weekly review and morning briefing overlays
- Toasts, snackbar, connection pill, unsynced marker, empty states (no partner)
- Dev-only simulation panel (`/today?dev=1` in `npm run dev`): Lucas online / focusing / offline, completes a task, reacts; remove partner; connection states; briefing
- Centralised mocks in `src/lib/mock-data.ts`; state in `src/components/app-state.tsx`
- Accessibility: semantic buttons / links / nav landmarks, checkbox / radio / switch roles, aria-labels on icon buttons, focus-visible ring, Escape closes sheets, state never by colour alone (strike-through, labels), `prefers-reduced-motion`
- Docs: DECISIONS ADR-007…013, DESIGN_REFERENCE implementation notes, ARCHITECTURE and CLAUDE.md updated

Pending:

- Nothing for Stage 2

Verified (2026-09-23, clean `.next`):

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — 2 files, 9 tests passed
- `npm run build` — pass, all routes static
- `npm run format:check` — pass
- `npm run test:e2e` — 24 passed (mobile-390 and desktop-1440 full suite; mobile-375 and mobile-430 layout)
- Visual inspection with screenshots at 375, 390, 430, 768, 1180, 1440 on every screen: no horizontal overflow, no console errors; compared against the v2 prototype and the Breakpoints canvas rendered from `design-reference/`
- Scripted manual pass (dev server): swipe both directions, skip / unskip, edit with scope prompt, streak / day / template / challenge sheets, Escape to close, dev simulation (focusing, reaction, completion toast with quick react, offline + unsynced marker, reconnect, empty partner), weekly review navigation, insights, keyboard and drag reorder, onboarding → Today with new name, standard change reflected on Today, copy code

Known Issues:

- Mock only: nothing persists across reloads; "Today only" and "Today and future days" apply the same edit; Visible to Lucas / reminder / notes have no effect; Join and Leave duo show a Stage 3 toast
- Morning briefing is not shown automatically (needs persistence; ADR-013)
- The 🫡 emoji renders as an empty box in headless Chromium without an emoji font; fine on real devices
- A focus session ended within the first minute is recorded as 1 minute
- Differences from the reference are listed in `docs/DESIGN_REFERENCE.md` → "Stage 2 implementation notes"
