# LOCKED IN DEVELOPMENT STATUS

Current:
LOCKED IN V2 — Phase 1 — Foundation + Restore State — VERIFIED (2026-09-29); next: Phase 2 — School Planner + Shared Calendar (not started)

V1 baseline: `main` at `606546f` is what runs in production (https://locked-in-rust.vercel.app,
GitHub deployment "Production" for that SHA, 2026-09-28). The V1 record below is kept unchanged.

---

# LOCKED IN V2

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
