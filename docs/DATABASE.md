# Database

Supabase Postgres 17. Schema lives in `supabase/migrations/` (the only source of truth); security
tests in `supabase/tests/`. Stage 3 scope: **profiles, duos, duo_members** and the functions /
triggers they need. Nothing else.

## Projects

| Environment | Supabase project                                | Notes                                                |
| ----------- | ----------------------------------------------- | ---------------------------------------------------- |
| DEV         | `locked-in` (`oavhuxaanztrughyrckb`, sa-east-1) | Used by `.env.local`, Playwright and manual testing. |
| PROD        | not created yet                                 | Stage 10. Never point tests or test users at it.     |

Migrations applied to DEV (`supabase_migrations.schema_migrations`):

| Version          | File                                  | What                                                                          |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `20260923185849` | `…_profiles.sql`                      | `profiles`, updated_at + validation triggers, signup trigger                  |
| `20260923185852` | `…_duos.sql`                          | `duos`, `duo_members`, the two hard rules as constraints                      |
| `20260923185918` | `…_duo_functions.sql`                 | invite codes, `create_duo`, `join_duo`, `leave_duo`, `private.current_duo_id` |
| `20260923185922` | `…_rls_and_grants.sql`                | RLS on, grants, policies                                                      |
| `20260923185945` | `…_profiles_single_select_policy.sql` | one permissive SELECT policy on profiles (advisor 0006)                       |

## Tables

### `public.profiles`

| Column         | Type        | Rule                                                          |
| -------------- | ----------- | ------------------------------------------------------------- |
| `id`           | uuid PK     | `references auth.users(id) on delete cascade`; = auth user id |
| `display_name` | text        | not null, trimmed by trigger, 1–40 chars                      |
| `avatar_url`   | text        | nullable, ≤ 500 chars                                         |
| `timezone`     | text        | not null, default `UTC`, must be a real IANA name (trigger)   |
| `created_at`   | timestamptz | not null default now()                                        |
| `updated_at`   | timestamptz | not null default now(); always set by trigger on update       |

Created by `private.handle_new_user()` (AFTER INSERT on `auth.users`), never by the browser. It reads
`display_name` and `timezone` from signup metadata (user-controlled, so sanitised: name falls back to
the email local part, then `Member`; invalid timezone falls back to `UTC`).

### `public.duos`

| Column        | Type        | Rule                                                                      |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `id`          | uuid PK     | `gen_random_uuid()`                                                       |
| `name`        | text        | nullable, ≤ 60 chars (unused in V1)                                       |
| `invite_code` | text        | not null, **unique**, format `^LKD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$` |
| `created_by`  | uuid        | not null → `profiles(id)` on delete cascade                               |
| `created_at`  | timestamptz | not null default now()                                                    |

### `public.duo_members`

| Column      | Type        | Rule                                               |
| ----------- | ----------- | -------------------------------------------------- |
| `duo_id`    | uuid        | → `duos(id)` on delete cascade                     |
| `user_id`   | uuid        | → `profiles(id)` on delete cascade                 |
| `seat`      | smallint    | `check (seat in (1, 2))`; 1 = creator, 2 = partner |
| `joined_at` | timestamptz | not null default now()                             |

Primary key `(duo_id, user_id)`.

## The two hard rules (enforced by the schema)

| Rule                          | Constraint                                                       |
| ----------------------------- | ---------------------------------------------------------------- |
| A user is in at most one duo  | `duo_members_one_duo_per_user unique (user_id)`                  |
| A duo has at most two members | `seat in (1, 2)` + `duo_members_two_seats unique (duo_id, seat)` |

These are plain unique / check constraints, so they hold under concurrency with no application
logic: of two concurrent inserts for the same seat, the second one to commit fails with a unique
violation. `join_duo` additionally locks the duo row (`select … for update`) so joiners queue and the
loser gets a clean `LI_DUO_FULL` instead of a raw constraint error. Verified with real concurrent
requests (B and C racing for the same code, 10 + 5 rounds: always exactly one winner).

## Indexes

| Index                                           | Serves                                           |
| ----------------------------------------------- | ------------------------------------------------ |
| `profiles_pkey (id)`                            | profile lookups, RLS `id = auth.uid()`           |
| `duos_pkey (id)`                                | RLS `id = current_duo_id()`                      |
| `duos_invite_code_key (invite_code)` unique     | `join_duo` lookup                                |
| `duos_created_by_idx (created_by)`              | FK cascade from profiles                         |
| `duo_members_pkey (duo_id, user_id)`            | RLS `duo_id = current_duo_id()`, partner lookups |
| `duo_members_one_duo_per_user (user_id)` unique | `current_duo_id()` (every RLS check)             |
| `duo_members_two_seats (duo_id, seat)` unique   | seat-2 check in `join_duo`                       |

## Functions

| Function                             | Security | Callable by                          | Purpose                                                         |
| ------------------------------------ | -------- | ------------------------------------ | --------------------------------------------------------------- |
| `public.create_duo()`                | DEFINER  | `authenticated`                      | duo + creator membership (seat 1) + invite code, atomically     |
| `public.join_duo(p_code text)`       | DEFINER  | `authenticated`                      | normalise code, lock duo, take seat 2                           |
| `public.leave_duo()`                 | DEFINER  | `authenticated`                      | V1: deletes the duo, memberships cascade (ends it for both)     |
| `public.normalize_invite_code(text)` | invoker  | nobody (internal)                    | `lkd 8x29ab` → `LKD-8X29AB`                                     |
| `private.generate_invite_code()`     | invoker  | nobody (internal)                    | CSPRNG (`gen_random_bytes`), rejection sampling, no modulo bias |
| `private.current_duo_id()`           | DEFINER  | `authenticated` (schema not exposed) | caller's duo id for RLS, avoids policy recursion                |
| `private.handle_new_user()`          | DEFINER  | trigger only                         | creates the profile                                             |
| `private.set_updated_at()`           | invoker  | trigger only                         | `updated_at = now()`                                            |
| `private.validate_profile()`         | invoker  | trigger only                         | trims name, rejects non-IANA timezone (`22023`)                 |

Every function: `set search_path = ''`, all objects schema-qualified, `revoke all … from public`
then minimal `grant execute`. RPCs act only for `auth.uid()` (no user id parameter), take no dynamic
SQL, and raise stable error codes that the app maps to copy (`src/lib/invite-code.ts`):
`LI_NOT_AUTHENTICATED`, `LI_ALREADY_IN_DUO`, `LI_INVALID_CODE`, `LI_DUO_FULL`, `LI_NOT_IN_DUO`.

Supabase advisor 0029 flags the three public RPCs as "SECURITY DEFINER executable by authenticated".
That is intentional (they are the only write path into duos / memberships); see ADR-015.

## Invite codes

`LKD-` + 6 symbols from a 31-symbol alphabet without `0 O 1 I L` → 31⁶ ≈ 887 million codes. Random
(not incremental), unique, readable aloud, does not expose any UUID. Input is normalised (case,
spaces, dashes, optional `LKD` prefix) in the database and mirrored in the UI for early validation.

## Grants and RLS

Grants decide which operations a role may attempt; policies decide which rows.

| Role            | profiles                                                  | duos   | duo_members | RPCs                  |
| --------------- | --------------------------------------------------------- | ------ | ----------- | --------------------- |
| `anon`          | —                                                         | —      | —           | —                     |
| `authenticated` | SELECT; UPDATE (`display_name`, `avatar_url`, `timezone`) | SELECT | SELECT      | create / join / leave |

No INSERT / DELETE grants anywhere: profiles come from the trigger, duos and memberships from the
RPCs. RLS is enabled on all three tables.

| Policy                              | Table       | Rule                                                  |
| ----------------------------------- | ----------- | ----------------------------------------------------- |
| `profiles: read own or duo partner` | profiles    | SELECT: `id = auth.uid()` or id is a member of my duo |
| `profiles: update own`              | profiles    | UPDATE: `id = auth.uid()` (using + with check)        |
| `duos: read own duo`                | duos        | SELECT: `id = private.current_duo_id()`               |
| `duo_members: read own duo`         | duo_members | SELECT: `duo_id = private.current_duo_id()`           |

Tables created after 2026-10-30 in `public` need explicit grants (Supabase platform change). These
migrations already grant explicitly; keep doing so.

## Tests

`supabase/tests/stage3_auth_duo.test.sql` — pgTAP, 51 assertions: signup trigger, updated_at, anon
denied everywhere, A / B / C (own profile, partner visibility, outsider isolation, no cross-profile
updates, duo full, already in a duo, invalid code, direct-write denial, schema backstops, leave).
Runs in one transaction and rolls back.

How to run:

- **Local** (needs Docker): `npx supabase init` once (creates `supabase/config.toml`, not committed yet), then `npx supabase start` and `npx supabase test db`.
- **DEV project** (what Stage 3 used, because Docker Desktop's VM did not start on this machine):
  run the file's statements in one transaction against DEV, with each `select <assertion>(…)`
  captured into a temp table and a final `raise exception` that prints the TAP lines. The exception
  aborts the transaction, so users, duos and the pgtap extension are all rolled back. Result on
  2026-09-24: `51/51 ok, FAILED=0`; DEV verified empty afterwards.

End-to-end coverage of the same rules through the public API (publishable key, real sessions) is in
`tests/e2e/stage3.spec.ts` → "database rules hold through the public API".

## Test users (DEV only)

Created by `supabase/dev/create_test_users.sql` (confirmed, so no email is sent), all
`@example.com`, timezone `America/Sao_Paulo`:

| Email                        | Name    | Used by                                         |
| ---------------------------- | ------- | ----------------------------------------------- |
| `li-e2e-brendon@example.com` | Brendon | Playwright UI suite (signed in; duo with Lucas) |
| `li-e2e-lucas@example.com`   | Lucas   | partner of Brendon                              |
| `li-e2e-a@example.com`       | Alice   | Stage 3 flow: creates the duo                   |
| `li-e2e-b@example.com`       | Bruno   | Stage 3 flow: joins                             |
| `li-e2e-c@example.com`       | Carla   | Stage 3 flow: outsider / third member           |

The shared password is `E2E_PASSWORD` in `.env.test.local` (git-ignored; template below). Playwright
loads `.env.local` and `.env.test.local` itself.

```
E2E_PASSWORD=
E2E_BRENDON_EMAIL=li-e2e-brendon@example.com
E2E_LUCAS_EMAIL=li-e2e-lucas@example.com
E2E_A_EMAIL=li-e2e-a@example.com
E2E_B_EMAIL=li-e2e-b@example.com
E2E_C_EMAIL=li-e2e-c@example.com
```

## Regenerating types

After each migration regenerate `src/types/database.ts` with the Supabase type generator
(`npx supabase gen types typescript --project-id oavhuxaanztrughyrckb`, or the Supabase MCP
`generate_typescript_types`) and keep the header comment.
