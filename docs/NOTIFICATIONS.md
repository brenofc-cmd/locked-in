# Notifications (Stage 8)

LOCKED IN V1 notifies **only while the app is open** — in a tab (foreground or background) or as the
installed app. There is no push: nothing is sent when the app is closed. Code:
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

## Intentionally not supported in V1

- Web Push / service worker / VAPID keys / a push provider.
- Edge Functions, queues or cron to send anything.
- Email or SMS notifications.
- Notifications for a closed app, and reminders at exact times when the app is not open.

These need real infrastructure (and its security review); they are a candidate for after Stage 10,
not a checkbox for V1 (ADR-045).

## Known behaviour

- A database broadcast sent in the first moments after the app joins the duo channel can be missed
  by that fresh subscription; the numbers are recovered on the next refetch (event, tab visible,
  reconnect), but no live notice is shown for it.
- The morning briefing is a presentation choice, not a notification: `show_morning_briefing`
  (setting) + the day it was last shown in this browser (`localStorage`).

## Planner reminders (V2 Phase 2)

Kind `planner_reminder`, governed by the same **Lembretes** preference as task reminders and by quiet
hours (browser notification only). Due from 08:00 local on the reminder day (0 / 1 / 3 / 7 days
before), once per event and due date per device; my own events only. Details: docs/PLANNER.md. Still
no Web Push (V2 Phase 10).
