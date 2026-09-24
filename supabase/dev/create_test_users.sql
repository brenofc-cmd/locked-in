-- DEV ONLY. Never run against production.
--
-- Creates the confirmed test users used by Playwright (tests/e2e) and manual
-- testing. Confirmed directly so no email is sent to example.com addresses.
-- Replace __E2E_PASSWORD__ with E2E_PASSWORD from .env.test.local (git-ignored)
-- and run in the SQL editor of the DEV project. Idempotent: existing emails
-- are skipped. Profiles are created by the on_auth_user_created trigger.
with u(email, name) as (
  values
    ('li-e2e-brendon@example.com', 'Brendon'),
    ('li-e2e-lucas@example.com', 'Lucas'),
    ('li-e2e-a@example.com', 'Alice'),
    ('li-e2e-b@example.com', 'Bruno'),
    ('li-e2e-c@example.com', 'Carla'),
    -- Stage 4: one user per Playwright project so parallel projects never
    -- share mutable task data.
    ('li-e2e-desk@example.com', 'Brendon'),
    ('li-e2e-lucas2@example.com', 'Lucas'),
    ('li-e2e-layout@example.com', 'Brendon')
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    u.email, extensions.crypt('__E2E_PASSWORD__', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', u.name, 'timezone', 'America/Sao_Paulo'),
    now(), now(), '', '', '', ''
  from u
  where not exists (select 1 from auth.users x where x.email = u.email)
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), n.id, n.id::text,
  jsonb_build_object('sub', n.id::text, 'email', n.email, 'email_verified', true),
  'email', now(), now(), now()
from new_users n;
