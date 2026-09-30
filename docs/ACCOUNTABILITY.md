# Duo Accountability 2.0 (V2 Phase 6)

Core loop: **COMMITMENT → ACTION → PROOF → PARTNER ACCOUNTABILITY**. Scope and the approved rules:
docs/ROADMAP.md → "V2 Phase 6". Decisions: ADR-069…073.

## Model

| Object               | What it is                                                                | Who reads it                               |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `commitments`        | The public promise of one local day: title, kind, status, proof kind/time | Owner + the **current** duo it was made to |
| `commitment_sources` | The private task behind a `task` commitment                               | Owner only                                 |
| `nudges`             | DAR UM TOQUE on an open commitment — no text                              | Sender and recipient, current duo only     |
| `checkins`           | LOCKED_IN / NEED_ACCOUNTABILITY / HARD_DAY, append-only                   | Owner + current duo                        |

Every commitment carries the `duo_id` of the duo it was made to (set by the database). Ending the
duo sets it to null: the ex-partner loses access, a future partner never receives it, the owner
keeps it. Check-ins follow the same rule; nudges are deleted with the duo.

## Kinds and proof

| Kind       | Proven when (while the owner's day is open)                                                   | Resolution      |
| ---------- | --------------------------------------------------------------------------------------------- | --------------- |
| `task`     | its source task (one of today's tasks) is completed                                           | `verified`      |
| `focus`    | the day's completed **effective** focus (`actual_focus_seconds`, pauses never count) ≥ target | `verified`      |
| `standard` | the day meets the Daily Standard with the existing rule `completed·100 ≥ standard·planned`    | `verified`      |
| `simple`   | the owner taps CUMPRI                                                                         | `self_declared` |

- `proven_at` is the moment of the real proof: the task's `completed_at`, the `ended_at` of the
  session that reached the target, the `completed_at` of the k-th completion
  (`k = ceil(standard·planned / 100)`), or the CUMPRI time.
- The standard in force when the commitment is made is snapshotted (`standard_percent`), so a later
  settings change does not move an existing promise (ADR-071). Skipped tasks stay in `planned`,
  exactly like Progress.
- Self-declared is always shown as **AUTODECLARADO**; there is no separate score (ADR-072).

## Lifecycle

```
ACTIVE ──(proof)──► PROVEN ──(source undone, same day)──► ACTIVE
   │                                         (simple: DESFAZER)
   ├──(CANCELAR, day open)──► CANCELLED   (final)
   └──(owner's day closes)──► MISSED      (derived, final)
```

- **MISSED** is never stored: `duo_commitments()` returns `missed` for an ACTIVE commitment whose
  day is `<= private.history_locked_through(owner)` — the same closed-day semantics as the rest of
  the app (Stage 9, ADR-050). Nothing can flip it later.
- The status is **materialised** (triggers on `daily_tasks` and `focus_sessions` re-resolve the
  owner's open commitments) so that a closed day is frozen: after the close, the row never changes,
  even through trusted code (the lifecycle trigger returns the old values; an API attempt to change
  the status gets `LI_HISTORY_LOCKED`).
- Before the close, the proof follows the source (rule 2): a task completed and then legally undone
  the same day withdraws the proof and its feed line.
- CANCELLED only from ACTIVE on an open day; a cancelled commitment never reopens
  (`LI_COMMITMENT_CLOSED`). A verified kind never takes a status from a client
  (`LI_PROOF_REQUIRED`).
- Limits: title 1–80 characters (public), 5 non-cancelled commitments per owner and day
  (`LI_COMMITMENT_LIMIT`), focus target 5–720 min. Needs a complete duo (`LI_NO_PARTNER`).

## Privacy (ADR-070)

The partner may see: the public title, the status, the generic proof kind (tarefa / foco / padrão /
autodeclarado) and the proof time. Never: a task id, a goal id or title, the Vision, the Mirror, the
private Top 3, a private task's title, focus goal metadata.

- The source task lives in `commitment_sources` (owner-only RLS; no column on `commitments` names a
  task or a goal — asserted by pgTAP).
- Feed events (`commitment_proven`, `commitment_self_declared`) carry the public title only; the
  realtime payloads carry ids and the status only.
- In the interface, the partner's rows go through `partnerProjection()`
  (`src/lib/accountability.ts`, unit-tested).

## Nudges (DAR UM TOQUE)

- Only on the partner's ACTIVE commitment of an open day, never on my own
  (`LI_NUDGE_SELF`), never on PROVEN / MISSED / CANCELLED (`LI_NUDGE_CLOSED`).
- One per commitment every 2 hours per sender (`LI_NUDGE_COOLDOWN`); at most 3 per day to the same
  partner, counted on the **recipient's** local day (`LI_NUDGE_LIMIT`). An advisory lock per
  sender → recipient pair serialises double taps.
- Enforced by `private.guard_nudge()` (BEFORE INSERT). Clients only send `commitment_id`; sender,
  recipient, duo and the recipient day are stamped by the database.
- The recipient gets an in-app toast (and the browser notification when allowed) through the
  "partner activity" preference. No push, no text, no chat.

## Check-in

- Three states, for the current local day only; changeable during the day. Each change is a new
  row (history kept); the latest row of the day is current. At most 30 changes per day
  (`LI_CHECKIN_LIMIT`). No health inference, no advice.

## Realtime

On the existing private channel `duo:<duo_id>`, sent only by the database
(`private.sync_accountability`, the one new SECURITY DEFINER function):

| Event                           | Payload                                      | Client                                  |
| ------------------------------- | -------------------------------------------- | --------------------------------------- |
| `commitment_changed`            | `id`, `actor_id`, `status`                   | re-read (`accountabilityVersion`)       |
| `nudge_received`                | `id`, `actor_id`, `to_user`, `commitment_id` | re-read; toast when `to_user` is me     |
| `checkin_changed`               | `actor_id`, `state`                          | re-read                                 |
| `activity` / `activity_removed` | the feed line of a proven commitment         | existing feed handling (reactions work) |

A touch that changes nothing is not broadcast. Postgres stays the source of truth: every refetch
(reconnect, tab visible) also re-reads the hub.

## Interface (Partner Hub 2.0, `/partner`)

Status (ONLINE / EM FOCO / visto) + the partner's check-in → HOJE (completion, focus today,
standard) → COMPROMISSOS (theirs with DAR UM TOQUE / reactions; mine with + NOVO COMPROMISSO,
CUMPRI, DESFAZER, CANCELAR) → CHECK-IN DE HOJE → the partner's day + ATIVIDADE → this week /
head-to-head (unchanged) → HISTÓRICO · 14 DIAS (closed days only).

The partner's focus today is the sum of their `focus_completed` feed events (effective seconds) on
their local day — no new projection function.

## Not in this phase

Daily Duel, winner / champion, XP, coins, ranking, badges, Web Push, chat or free text, sharing
goals, the Mirror or the private Top 3.
