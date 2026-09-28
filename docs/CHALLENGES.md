# Challenges (Stage 8)

Optional, private to the duo, and separate from the weekly head-to-head. Two types only — no generic
gamification. Code: `supabase/migrations/…_challenges.sql`, `src/lib/challenges.ts` (pure,
unit-tested), `src/components/use-challenges.ts`, `ChallengesScreen`, `ChallengeSheet`.

## Stored vs derived

Stored (`public.challenges`): duo, author, title, type, target, start date, end date, and (Stage 9)
both members' Daily Standard at creation (`creator_standard`, `partner_standard`, set by the
database, never writable). No progress is stored.

Derived by `duo_challenges()` for both members, never stored:

| Type            | Progress                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `standard_days` | Days in the period meeting **that member's** Daily Standard **as snapshotted at creation** (exact ratio, skipped in the total, neutral days never count; today counts once met) |
| `focus_seconds` | Effective focus seconds (`private.focus_seconds`) of every session whose `local_date` (fixed at start) is in the period; a running session counts its elapsed time              |

Each member is counted up to their own local today. Private tasks and sessions count in the
aggregate; nothing about them is listed. `duo_challenges()` is SECURITY DEFINER for that reason
(ADR-044) and returns integers, dates and the challenge's own title / type.

Derived on the client (`src/lib/challenges.ts`), from my local today:

- **Status:** `upcoming` (before start) · `active` · `completed` (after end).
- **Leader** (active): higher value, or level.
- **Winner** (completed): higher value wins; equal values are a **draw**. Challenge results never
  count in the weekly head-to-head.

## Rules

- Both members create (a complete duo is required); start today or later; end ≥ start; at most one
  year; target > 0; a standard-days goal cannot exceed the days in the period; title 1–40 characters
  (trimmed). Enforced by constraints and RLS, mirrored in `validateDraft()`.
- **Delete** only before the challenge starts (either member). After that it is part of the record.
  No edits.
- Challenges belong to the duo: ending the duo deletes them; a new partner never sees them.
- **Stable results (Stage 9, ADR-051):** closed days are immutable (ADR-050), standards are the
  creation snapshot and focus is counted from frozen session days, so a finished challenge's result
  never changes afterwards. An identical challenge (same duo, title ignoring case, type and period)
  is refused by a unique index, so a double submit creates one.

## Live updates

No progress broadcast. The screen re-reads `duo_challenges()` when a challenge is created or
deleted (`challenges_changed` broadcast on the duo channel), after every partner refetch (their
tasks / focus changed) and when my own completions or focus change.

## UI

`/challenges`: empty state `NO ACTIVE CHALLENGE — Create one together.`; one card per challenge with
goal, period, status, leader / winner and both members' bars; completed challenges below. The sheet
asks only TITLE, TYPE, GOAL, START, END.
