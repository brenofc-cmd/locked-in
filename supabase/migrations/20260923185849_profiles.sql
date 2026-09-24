-- Stage 3 · profiles
-- One profile per auth user, created by a trigger on auth.users.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text
    constraint profiles_avatar_url_length check (char_length(avatar_url) <= 500),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public identity of a LOCKED IN user. id = auth.users.id.';

-- updated_at is always set by the database, never trusted from the client.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Timezone must be a real IANA name; display name is trimmed.
create function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
  ) then
    raise exception 'invalid timezone: %', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate
  before insert or update on public.profiles
  for each row execute function private.validate_profile();

-- Profile creation. SECURITY DEFINER because it runs inside the auth.users
-- insert (as supabase_auth_admin) and must write public.profiles past RLS.
-- Signup metadata is user-controlled, so it is only used for display_name
-- and timezone, both sanitised here and constrained by the table.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_tz text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40);
  if v_name = '' then
    v_name := left(split_part(coalesce(new.email, ''), '@', 1), 40);
  end if;
  if v_name = '' then
    v_name := 'Member';
  end if;

  v_tz := coalesce(new.raw_user_meta_data ->> 'timezone', '');
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_tz
  ) then
    v_tz := 'UTC';
  end if;

  insert into public.profiles (id, display_name, timezone)
  values (new.id, v_name, v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on function private.set_updated_at() from public;
revoke all on function private.validate_profile() from public;
revoke all on function private.handle_new_user() from public;
