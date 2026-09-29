# Realtime

Stages 5–6. How two people see each other's day and Focus live. **Postgres is the source of truth; Realtime is
only the delivery mechanism.** Anything missed over the socket comes back from the database.

```
Brendon taps ✓ Morning Run
  → UI: optimistic check (≈ 10 ms)            src/components/use-tasks.ts
  → Server Action: update daily_tasks          src/app/(app)/task-actions.ts
  → trigger private.sync_task_activity()       supabase/migrations/…_activity_events.sql
      → insert activity_events (the feed row)
      → realtime.send(payload, 'activity', 'duo:<duo_id>', private)
  → Lucas's open tab: broadcast received        src/components/duo-realtime.tsx
      → feed line + toast + partner card flash (≈ 150 ms end to end in tests)
      → refetch partner's day (counts + shared list)
```

## Topic and channel

- One **private** channel per duo: topic `duo:<duo_id>` (`config: { private: true }`).
- The same channel carries Presence and database Broadcasts. No other channels.
- Created by `DuoRealtimeProvider` (`src/components/duo-realtime.tsx`), mounted once by
  `(app)/layout.tsx`, only when the user has a duo.
- Lifecycle: removed on unmount, on sign-out (full navigation) and when the duo changes (the effect
  depends on the duo id). realtime-js reuses a channel with the same topic until its leave completes,
  so a new subscription waits for the previous removal (`pendingRemoval`) — no duplicate channels,
  including React Strict Mode's double effect in development.

## Authorization (Realtime RLS on `realtime.messages`)

Migration `…_realtime_duo_authorization.sql`. Realtime sets `realtime.topic()` to the channel topic
and evaluates these policies with the user's JWT:

| Policy                                            | Operation        | Rule                                                                                                  |
| ------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `duo members receive duo broadcasts and presence` | SELECT (receive) | `extension in ('broadcast','presence')` and `realtime.topic() = 'duo:' \|\| private.current_duo_id()` |
| `duo members publish presence`                    | INSERT (send)    | `extension = 'presence'` and the same topic rule                                                      |

- Members of the duo join; anyone else (other duo, no duo, fake UUID, anon) gets
  `Unauthorized: You do not have permissions to read from this Channel topic`.
- Clients may publish **presence only**. Broadcasts come from the database (`realtime.send` in a
  SECURITY DEFINER trigger); a client cannot forge "Brendon completed 100 tasks".
- Tested in pgTAP (`stage5_realtime.test.sql`) and with real sockets (`tests/e2e/stage5.spec.ts`).

**Token refresh.** supabase-js 2.117 calls `realtime.setAuth(token)` on `SIGNED_IN`,
`TOKEN_REFRESHED` and `INITIAL_SESSION`, so the socket keeps a valid JWT after the access token
rotates. The provider also calls `setAuth()` before subscribing.

**Membership changes.** Authorization is evaluated when a client joins (and again when it rejoins
after a reconnect or token refresh). A user who leaves the duo keeps an already-joined socket until
it reconnects: a short transitional window. After the duo ends there is nothing left to receive —
the duo, its feed rows and future broadcasts (sent to members of existing duos only) are gone — and
the next join is refused. The app also removes the channel as soon as the layout reloads without a
duo.

**Public channels.** LOCKED IN never uses them. **MANUAL STAGE 10 PRODUCTION GATE:** in the
Supabase Dashboard of the production project, _Project Settings → Realtime → disable "Allow public
access"_, so only private channels can be joined at all (docs/PRODUCTION_CHECKLIST.md §2). Not
changed in DEV: it is a dashboard setting that the tools used in Stage 9 (SQL / MCP) can neither read
nor change. It does not affect the security of duo data, which lives only in private channels
guarded by `realtime.messages` RLS (pgTAP stage 5 / 9, e2e stage 5 / 9).

**Ending a duo (Stage 9).** On `duo_ended` the provider untracks presence and unsubscribes at once
(instead of waiting for the session to reload), so no presence or broadcast of the ended duo reaches
that tab afterwards; the effect cleanup then removes the channel for good.

## Broadcast events (database → duo)

Sent by `private.sync_task_activity()` on `daily_tasks` changes and by
`private.sync_focus_activity()` on `focus_sessions` status changes (Stage 6). Payloads are minimal —
never notes, reflections, timezone, email or private titles.

| Event                | When                                                                                                      | Payload                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `activity`           | a shared task becomes completed (or a completed task becomes shared); a focus session starts or completes | `id, actor_id, event_type, target_id, title, duration_seconds, created_at`                                        |
| `focus`              | a focus session is started, paused, resumed or completed (one message per transition)                     | `id, user_id, title (null if private), status, started_at, planned_seconds, paused_at, accumulated_pause_seconds` |
| `activity_removed`   | a completed shared task is undone, skipped, made private or deleted                                       | `id, actor_id`                                                                                                    |
| `tasks_changed`      | a shared task changes state without a feed change (skip / unskip)                                         | `actor_id`                                                                                                        |
| `reaction`           | a reaction is set, replaced or removed (Stage 8)                                                          | `activity_event_id, actor_id, from_user_id, reaction_type (null = removed)`                                       |
| `challenges_changed` | a challenge is created or deleted (Stage 8)                                                               | `actor_id, challenge_id`                                                                                          |
| `duo_joined`         | the second member joins (Stage 8)                                                                         | `actor_id`                                                                                                        |
| `duo_ended`          | a member ends the duo, sent just before the atomic delete (Stage 8)                                       | `actor_id`                                                                                                        |
| `planner_changed`    | a shared planner event is created / updated / deleted, or stops being shared (V2 Phase 2)                 | `actor_id, event_id, operation` (never a title, subject, date or time)                                            |

Private tasks (`visible_to_partner = false`) emit nothing at all — no title, no timing. Edits,
reorders, archives, renames, settings and page views emit nothing ("magical, not noisy").

## Presence

Key = the user id, so every tab / device of a user is one entry. Payload `{ user_id, state:
"online" }`, tracked once per join — never per second, never focus data (Stage 6 removed the Stage
5 "focusing" presence).

- `presenceOnline()` (`src/lib/realtime-model.ts`): no entries → offline; any tab → online.
  Offline is never published; it is the absence of presence.
- Closing one of two tabs keeps the user online; closing the last makes them offline within a few
  seconds (≈ 3 s measured).
- V1 had no "last seen"; V2 Phase 2 adds it as a fallback (below), without touching presence.

## Focus (Stage 6)

Focus is **persistent** (`focus_sessions`, DATABASE.md), not presence. Partner status:

```
partner has an active or paused, unexpired session  → FOCUSING   (even with the app closed)
else presence online                                → ONLINE
else                                                → OFFLINE
```

- **Initial state**: the server renders my session (`my_active_focus()`, which first reconciles an
  expired one) and the partner's (`partner_current_focus()`, limited projection).
- **Transitions**: each start / pause / resume / complete sends one `focus` broadcast (and start /
  complete one `activity` feed event). The partner's card switches without reload; my other tabs /
  devices receive the same message and refetch my session from Postgres.
- **Clock**: every viewer computes `remaining = planned - ((paused_at ?? now) - started_at -
pauses)` locally, once a second, only while a clock is on screen. `now` is the device clock
  corrected by an offset to the **database** clock (measured with `server_now()` on every page
  load and refined by every row the database writes; a device or app-server clock can be seconds
  off). **No timer value ever crosses the network**: during a running session there are
  no requests, no broadcasts and no presence updates (E2E test measures 12 s of silence; only the
  socket heartbeat).
- **Ordering**: broadcasts are treated as "something changed". The owner's tab refetches the truth;
  a refetch that raced a local transition is discarded, and transitions are queued in order (a quick
  END after RESUME is never lost). The partner's refetch (after feed events / reconnect) never
  overwrites a newer `focus` broadcast.
- **Expiry**: the running tab ends the session at 00:00; with the app closed, the next load
  reconciles it in the database. The partner stops seeing FOCUSING when the planned end passes
  (computed locally), and the session's `focus_completed` event appears when it is reconciled.
- **Privacy**: a private session (or one on a private task) shows the partner only "Focusing" and
  the feed "started Focus" / "completed N min Focus". Reflections never leave the owner.
- Outside a duo there is no channel: other tabs of the same user sync when they become visible.

## Connection state

`connectionFrom(channelStatus, navigator.onLine)`: `SUBSCRIBED` → connected, `CHANNEL_ERROR` /
`TIMED_OUT` / `CLOSED` → reconnecting (supabase-js rejoins with backoff), browser offline → offline.
The Stage 2 pill shows "Reconnecting…" or "Offline" — no technical messages. The first join of a day
can hit a transient `MissingPartition` error while Realtime creates the day's message partition; the
client retries by itself.

## Recovery (source of truth)

The feed and the partner's day are loaded by the server on every page load (`loadDuoData`) and
refetched by the provider after: every partner event, **every** `SUBSCRIBED` (the first join too —
Stage 7 closed the gap between the server render and the join), the browser coming back online,
and the tab becoming visible again. So a completion that happened while a user was offline (or a
lost message) appears as soon as they are back. Events are keyed by
`activity_events.id`; a refetch or a redelivery never duplicates a line, and my own optimistic line
is replaced by the real event for the same task.

## Feed

`activity_events` (see DATABASE.md): newest 20 of the duo, `created_at desc`, shown in the viewer's
timezone. One live event per task; undo removes it, so the feed never shows "completed" for
something that was undone. Both members' shared completions appear. No pagination in V1.

## Progress and competition (Stage 7)

No new event, channel or payload. Each successful partner refetch bumps `partnerVersion`; the
progress hook then re-reads `duo_weeks` + `partner_progress_summary` once (this week's %, leader,
head-to-head, partner's streak). My own numbers are live from local state. A private completion
emits nothing, so it reaches the partner's numbers on their next re-read (next shared event,
reconnect, tab visible, reload). Details: [ANALYTICS.md](ANALYTICS.md) → Live updates.

## Complete product (Stage 8)

Still one channel per duo; the four new events above reuse it.

- **Reactions:** loaded with the feed (embedded `reactions` rows, RLS: my duo) and patched live by
  `reaction`; my own change is optimistic with rollback. A reaction by my partner to one of my events
  raises a notice (docs/NOTIFICATIONS.md).
- **Challenges:** no progress broadcast; the open screen re-reads `duo_challenges()` after
  `challenges_changed`, after every partner refetch and when my own progress changes.
- **Duo joined / ended:** the app re-renders the session (`router.refresh()`); the provider leaves
  or joins the channel from the new `duo`. A broadcast missed before this tab joined is recovered: a
  refetch that finds the partner arrived or gone triggers the same re-render.
- **Join warm-up:** a database broadcast sent in the first moments after a join can be missed by that
  new subscription. State is always recovered by the next refetch; only the live notice is lost.

No mocks remain after Stage 8.

## Last seen (V2 Phase 2, ADR-056)

The partner's status everywhere comes from one function (`partnerView()` via `usePartnerView()`):

1. a valid persistent focus session (`partner_current_focus()`) → **EM FOCO**;
2. Realtime Presence on `duo:<duo_id>` → **ONLINE**;
3. neither → **OFFLINE**, plus "Visto por último …" when known.

A recent last seen never makes the partner ONLINE.

- **Heartbeat** (`useHeartbeat`, `public.touch_last_seen()`): my own row in `user_presence`, stamped
  with the database clock — on open, on every return to `visible`, every ~5 min while visible
  (never more than once a minute), nothing while hidden, nothing on close (`beforeunload` is not
  relied on; accuracy is a few minutes).
- **Reading**: the partner's `last_seen_at` comes with the duo data (layout load and every duo
  refetch, e.g. back to visible), RLS: current partner only. The client also notes the moment it
  saw the partner's presence drop (ignored when its own connection was the one that dropped); the
  later of the two is shown. No polling, no new channel, no broadcast for last seen.
- **Format** (`lastSeen()` / `lastSeenText()`, viewer's profile timezone like every time in the
  app): agora (< 1 min) · há X min (1–59) · hoje às HH:mm · ontem às HH:mm · em DD/MM às HH:mm.
  Only the components showing it redraw once a minute.
