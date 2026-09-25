-- Stage 8 · per-user settings (owner only)
--
-- Onboarding state, presentation and notification preferences live in their
-- own table, readable and writable by the owner only: profiles are readable
-- by the duo partner, and nobody else needs to know someone's quiet hours.
-- One row per profile, created by trigger; never inserted or deleted by
-- clients. Existing profiles are backfilled as already onboarded.

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- null = onboarding not finished. Set to the database time when finished.
  onboarding_completed_at timestamptz,
  show_morning_briefing boolean not null default true,
  -- Default "Visible to partner" for new routine items and one-off tasks.
  share_new_tasks boolean not null default true,
  notify_partner_activity boolean not null default true,
  notify_reactions boolean not null default true,
  notify_task_reminders boolean not null default true,
  notify_weekly_review boolean not null default true,
  -- Quiet hours in profiles.timezone: no browser notifications inside the
  -- window (in-app state keeps updating). start > end wraps midnight.
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_quiet_window check (quiet_hours_start <> quiet_hours_end)
);

-- The database owns the completion time: any non-null value becomes now()
-- when it changes; null (restart) is allowed.
create function private.normalize_user_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarding_completed_at is not null
     and (tg_op = 'INSERT' or old.onboarding_completed_at is null) then
    new.onboarding_completed_at := now();
  elsif tg_op = 'UPDATE' and new.onboarding_completed_at is not null then
    new.onboarding_completed_at := old.onboarding_completed_at;
  end if;
  return new;
end;
$$;

create trigger user_settings_normalize
  before insert or update on public.user_settings
  for each row execute function private.normalize_user_settings();

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function private.set_updated_at();

-- Every profile gets its settings row (signup trigger chain).
create function private.handle_new_profile_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return null;
end;
$$;

create trigger profiles_create_settings
  after insert on public.profiles
  for each row execute function private.handle_new_profile_settings();

-- Existing accounts already went through the product: onboarded.
insert into public.user_settings (user_id, onboarding_completed_at)
select p.id, now() from public.profiles p
on conflict (user_id) do nothing;

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from anon, authenticated;
grant select on table public.user_settings to authenticated;
grant update (
  onboarding_completed_at, show_morning_briefing, share_new_tasks,
  notify_partner_activity, notify_reactions, notify_task_reminders,
  notify_weekly_review, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
) on table public.user_settings to authenticated;

create policy "user_settings: read own"
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings: update own"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on function private.normalize_user_settings() from public, anon, authenticated;
revoke all on function private.handle_new_profile_settings() from public, anon, authenticated;
