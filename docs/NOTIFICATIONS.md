# Notifications (Stage 8, V2 Phase 10)

Two layers. **In the app** (this file, Stage 8): toasts, and browser notifications while LOCKED IN is
open in a background tab. **Web Push** (V2 Phase 10, docs/WEB_PUSH.md): opt-in per device, delivered
by the server with the app closed — planner reminders, DAR UM TOQUE, reviews, weekly planning and a
test notification. Code:
`src/lib/notifications.ts` (pure decisions, unit-tested), `notify()` in
`src/components/app-state.tsx`.

## What exists

| Kind             | Trigger                                                          | Preference                |
| ---------------- | ---------------------------------------------------------------- | ------------------------- |
| Partner activity | The partner completes a task or a focus session (live broadcast) | `notify_partner_activity` |
| Reactions        | The partner reacts to one of my events                           | `notify_reactions`        |
| Task reminders   | A pending task with a reminder reaches its time today            | `notify_task_reminders`   |
| Weekly review    | The first open of a new week offers last week's result           | `notify_weekly_review`    |

Preferences live in `user_settings` (owner-only RLS, ADR-043) and are edited in Settings.

## Decision

```
preference off                        → nothing (no toast, no browser notification, no permission request)
preference on                         → in-app toast
  + permission granted
  + tab not visible (background)
  + not inside quiet hours            → also a browser Notification
```

- A visible app already shows the toast, so the browser notification is only for a background tab.
- **Quiet hours** (`quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`, profile timezone,
  `start > end` wraps midnight) suppress browser notifications only; the app keeps updating and the
  in-app toast still shows.
- **Permission** is requested only from the "Allow" button in Settings (an explicit gesture), never
  on load. Denied or unsupported → in-app only.

## Task reminders

While the app is open, one timer per pending reminder later today (rescheduled when tasks change;
past times are dropped). A closed app reminds nobody — stated in Settings.

## Web Push (V2 Phase 10)

Was "intentionally not supported in V1" (ADR-045); now opt-in per device (ADR-092…099):
Configurações → Notificações push → "Ativar neste dispositivo" (the only place the permission is
asked). Server-side scheduler (Supabase `pg_cron` + Edge Function), quiet hours respected, one
delivery per logical event, sign-out drops the device. Still not supported: e-mail, SMS, pushes for
task completions, celebrations or commitments. Details: docs/WEB_PUSH.md.

## Known behaviour

- A database broadcast sent in the first moments after the app joins the duo channel can be missed
  by that fresh subscription; the numbers are recovered on the next refetch (event, tab visible,
  reconnect), but no live notice is shown for it.
- The morning briefing is a presentation choice, not a notification: `show_morning_briefing`
  (setting) + the day it was last shown in this browser (`localStorage`).

## Planner reminders (V2 Phase 2)

Kind `planner_reminder`, governed by the same **Lembretes** preference as task reminders and by quiet
hours (browser notification only). Due from 08:00 local on the reminder day (0 / 1 / 3 / 7 days
before), once per event and due date per device; my own events only. Details: docs/PLANNER.md. With
Web Push on (V2 Phase 10) the server also sends it with the app closed, and this device then skips
the in-app browser notification for it (the toast stays) — never twice.
