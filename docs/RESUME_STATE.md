# Resume State (V2 Phase 1)

Reopening LOCKED IN puts the user back where they were: Progress → 30D → August stays Progress →
30D → August. ADR-055.

**Resume State is not a second database.** Tasks, routine, focus, duo, progress, reactions,
challenges and settings always come from Supabase (Postgres). Resume State only remembers
_interface context_ on one device.

## Where it lives

| Piece                                  | Role                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/resume-state.ts`              | The only code that touches its storage: load / save / update / clear, validation, versions   |
| `src/app/page.tsx` + `ResumeEntry.tsx` | `/` (generic entry, PWA `start_url`): restores the last safe route, else `/today`            |
| `src/components/resume/use-resume.ts`  | `useResumeShell()` (route + scroll, in `AppShell`), `useResumeValue()` (hydration-safe read) |
| `ProgressScreen.tsx`                   | range (7D / 30D / 90D / ANO) and an earlier calendar month                                   |
| `TaskSheets.tsx` (`TaskFormSheet`)     | drafts of a **new** task / routine item                                                      |
| `SettingsScreen.tsx` (Sair)            | explicit sign-out clears the user's Resume State                                             |
| `DevPanel.tsx`                         | `npm run dev` + `?dev=1`: shows the current value (never in production builds)               |

No provider, no global store, no new dependency. Nothing re-renders on scroll.

## Storage format

`localStorage["locked-in:v2:<auth user id>:resume"]` = one JSON value, at most 4 KB:

```json
{
  "v": 1,
  "lastRoute": { "path": "/progress", "at": 1790700000000 },
  "progress": { "range": "30", "month": "2026-08" },
  "scroll": { "/progress": { "y": 612, "at": 1790700000000 } },
  "drafts": {
    "task": { "name": "Revisar Física", "…": "…", "updatedAt": 1790700000000 }
  }
}
```

- **User scoped**: the key contains the Supabase auth user id (validated as a UUID; anything else
  → no read, no write). Two people on the same browser never share a key.
- **Versioned**: `locked-in:v2` namespace + `v: 1`. An unknown version is ignored (starts empty);
  a future v2 of the format migrates or drops v1 in `parseResume()`.
- **Validated**: every field is checked (`parseResume()`); unknown keys are discarded, an invalid
  field is dropped on its own, timestamps from the future are refused. Invalid JSON, a blocked
  storage or a quota error never throw: the app opens `/today`.
- **Tiny**: above 4 KB the scroll and drafts are dropped first.
- **Last write wins** between tabs; no `storage` event, one tab never moves another.

## Restore matrix

| Area      | Restored                                                                  | Deliberately NOT stored                                                    |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Global    | last safe private route (30 days)                                         | toasts, loading, realtime / connection / online state                      |
| Today     | scroll (24 h)                                                             | task completion (database)                                                 |
| Partner   | scroll (24 h)                                                             | presence, partner status, feed, partner tasks (realtime / database)        |
| Focus     | — (the route only)                                                        | timer, session, status, reflection: `focus_sessions` + `my_active_focus()` |
| Progress  | range 7D / 30D / 90D / ANO; scroll (24 h)                                 | any number, series, chart, insight                                         |
| History   | the calendar month, when it is an earlier month (it is on `/progress`)    | the days' data (always read from the database, `loadDays()`)               |
| More      | the sub-screen itself is a route (`/routine`, `/challenges`, `/settings`) | —                                                                          |
| Routine   | scroll (24 h); draft of a **new** routine item (24 h)                     | edits of an existing item (they could overwrite newer data)                |
| Quick Add | draft of a new task (24 h), shown when the sheet is opened again          | the sheet being open                                                       |
| Sheets    | never reopened                                                            | delete / end-duo / reset confirmations, day sheet, any destructive dialog  |
| Browser   | —                                                                         | notification permission prompts                                            |

There is no `/history` route in the product: History is the calendar on Progress. A selected
historical day opens a sheet, and sheets are never restored.

## When it acts

- **Route**: only at `/` — typing the bare origin, a bookmark of it, or launching the installed app
  (`manifest.start_url = "/"`). An explicit URL (`/focus`, `/today`, a shared link, a refresh) is
  always honoured. `/` replaces itself in history, so Back never returns to it.
- **Allowed routes**: `/today`, `/partner`, `/focus`, `/progress`, `/more`, `/routine`,
  `/challenges`, `/duo`, `/settings`, exactly (no query string, no hash). Never `/login`,
  `/signup`, `/forgot-password`, `/reset-password`, `/auth/*`, `/onboarding`, `/`, a 404 or any
  other path. Every allowed route is reachable by any signed-in user (screens handle "no duo").
- **Scroll**: restored once per page load, for the first screen shown, after its content is there
  (waits up to 2 s for the page to be tall enough, clamps to the real height, and gives up as soon as
  the user touches, wheels or types). Normal in-app navigation keeps the V1 behaviour (a new screen
  starts at the top); back / forward are the browser's. Saved at most every 400 ms and on
  `pagehide` / hidden.
- **Progress range / month**: read on every visit of `/progress` (a user choice, like a setting of
  the screen). The server renders the default and the stored value is applied right after hydration
  (`useSyncExternalStore`), so markup never mismatches.
- **Coming back from background**: nothing navigates; the existing V1 reconciliation (visibility
  refetches of tasks, focus, realtime) is unchanged.

## Auth has priority

- Signed out, `/` goes to `/login` (proxy) and nothing is restored.
- `/login?next=…`, `/auth/confirm` (email confirmation, recovery → `/reset-password`), `safeNext()`
  and onboarding are untouched: they never pass through `/`.
- Resume State never contains a password, token, session, email, code or key; Supabase keeps auth
  in its own cookies.

## Sign-out

"Sair" (Settings) removes the user's whole Resume State (route, scroll, drafts, Progress choices)
before posting to `/auth/signout`, so the next person on the device never opens on the previous
user's screen or sees their draft. If a session ends without an explicit sign-out, the per-user key
still keeps the next user out of it.

## Drafts

- Only for **creating**: Quick Add (`task`) and a new routine item (`routine`, from Routine or
  Today's "add to routine").
- Written on every change of the form (a few hundred bytes); an empty form removes it.
- Shown only when the user opens the sheet again; the sheet never opens by itself.
- Removed on submit; put back if the save fails (the task was rolled back with a toast).
- Expire **24 hours** after the last edit (`DRAFT_TTL_MS`).

## Tests

- Unit: `tests/unit/resume-state.test.ts` — serialization, validation, version, user scoping,
  invalid JSON / throwing storage, size cap, draft expiry, allowed / blocked routes, logout cleanup.
- E2E: `tests/e2e/v2-resume.spec.ts` (projects `v2-390`, `v2-1440`, after `stage9`) — the eight
  Phase 1 scenarios with real storage and "close / reopen" as a new browser context.

## Legacy keys

V1 keeps two small unscoped keys that are not Resume State: `li:briefing-shown` and
`li:weekly-shown` (the local date / week a notice was last shown). They hold no user data and are
unchanged in this phase.

## V2 Phase 2 additions

- `/planner` joined `RESTORABLE_ROUTES` and `SCROLL_ROUTES`.
- New optional fields `planner: { view, month }` (PRÓXIMOS / CALENDÁRIO and an explicitly chosen
  month) and `plannerDraft` (a **new** event, 24 h; edits are never drafted), validated in
  `parseResume()`. They are optional, so a Phase 1 value is still valid and `v` stays 1. Events are
  never stored.
- Planner reminders already shown live in a separate per-user key
  `locked-in:v2:<userId>:planner-reminded` (ids + due dates only), also removed by `clearResume()` on
  sign-out.
- "Add to tasks" opens Quick Add pre-filled; such a form is never saved as the Quick Add draft.
