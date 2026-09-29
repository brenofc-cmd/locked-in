-- V2 Phase 2 · partner "last seen" (ADR-056, docs/REALTIME.md → Last seen).
--
-- One row per user: the last time the app was open and visible. ONLINE still
-- comes only from Realtime Presence and FOCANDO from focus_sessions; this is
-- the fallback shown while the partner is offline.
--
-- A separate table (not a profiles column, as first drafted) so a heartbeat
-- never runs the profile triggers (timezone validation, history boundary,
-- updated_at) and the access rule is one small policy set that is easy to
-- audit:
--   owner          : insert / update its own row, only ever "now"
--   current partner: read
--   old partner, outsider, anon: nothing
-- The timestamp is always the database clock (trigger), so nobody can claim
-- a time in the past or the future, and user_id can never be changed.

create table public.user_presence (
  user_id uuid primary key default auth.uid()
    references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

comment on table public.user_presence is
  'Last time each user had the app open (heartbeat, database clock). Read by the current duo partner only (ADR-056).';

create function private.stamp_last_seen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_seen_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create trigger user_presence_stamp
  before insert or update on public.user_presence
  for each row execute function private.stamp_last_seen();

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
grant select on table public.user_presence to authenticated;
grant insert (user_id) on table public.user_presence to authenticated;
grant update (last_seen_at) on table public.user_presence to authenticated;

create policy "user_presence: read own or current partner"
  on public.user_presence for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (
      select m.user_id from public.duo_members m
      where m.duo_id = (select private.current_duo_id())
    )
  );

create policy "user_presence: insert own"
  on public.user_presence for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_presence: update own"
  on public.user_presence for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The heartbeat: "I am here now". INVOKER (RLS applies) and without an
-- argument, so it can only ever touch the caller's own row.
create function public.touch_last_seen()
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  insert into public.user_presence (user_id) values ((select auth.uid()))
  on conflict (user_id) do update set last_seen_at = now()
  returning last_seen_at;
$$;

revoke all on function private.stamp_last_seen() from public, anon, authenticated;
revoke all on function public.touch_last_seen() from public, anon, authenticated;
grant execute on function public.touch_last_seen() to authenticated;
