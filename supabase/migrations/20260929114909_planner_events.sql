-- V2 Phase 2 · school planner (ADR-057, docs/PLANNER.md).
--
-- Exams, assignments, homework, deadlines and school events. Owned by one
-- user; optionally shared with the CURRENT duo partner (read-only for them).
-- Dates are the owner's local school dates (date / time without zone), never
-- converted to UTC.
--
-- Sharing is stored as the duo it was shared with: the database sets duo_id
-- from the owner's current, complete duo whenever shared_with_partner is on
-- (the client can never write duo_id or owner_id). When that duo ends, the
-- duos row is deleted, duo_id becomes null and the event turns private again,
-- so an old partner loses it and a new partner never inherits it.
-- An event is not a task: nothing here touches daily_tasks.

create table public.planner_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  duo_id uuid references public.duos (id) on delete set null,
  title text not null
    constraint planner_events_title_length check (char_length(title) between 1 and 80),
  event_type text not null
    constraint planner_events_type
    check (event_type in ('exam', 'assignment', 'homework', 'deadline', 'school_event')),
  subject text
    constraint planner_events_subject_length
    check (subject is null or char_length(subject) between 1 and 40),
  event_date date not null
    constraint planner_events_date_range
    check (event_date between date '2000-01-01' and date '2100-12-31'),
  event_time time,
  description text
    constraint planner_events_description_length
    check (description is null or char_length(description) <= 1000),
  priority text not null default 'normal'
    constraint planner_events_priority check (priority in ('normal', 'important')),
  shared_with_partner boolean not null default false,
  -- null = no reminder; 0 = on the day; 1 / 3 / 7 days before.
  reminder_days_before smallint
    constraint planner_events_reminder
    check (reminder_days_before is null or reminder_days_before in (0, 1, 3, 7)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_events_shared_has_duo check (shared_with_partner = (duo_id is not null))
);

comment on table public.planner_events is
  'School planner events (V2 Phase 2). Owner CRUD; the current duo partner reads shared ones (ADR-057).';

-- My range reads, and the partner's shared ones by duo. No other index.
create index planner_events_owner_date_idx on public.planner_events (owner_id, event_date);
create index planner_events_duo_date_idx on public.planner_events (duo_id, event_date)
  where duo_id is not null;

-- Normalise text; derive duo_id from the sharing flag (API roles); after a
-- duo ends (ON DELETE SET NULL, run by the table owner) turn the event private.
create function private.normalize_planner_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.subject := nullif(btrim(new.subject), '');
  new.description := nullif(btrim(new.description), '');
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      new.owner_id := old.owner_id;
    end if;
    if new.shared_with_partner then
      if not coalesce(private.duo_is_complete(), false) then
        raise exception 'LI_PLANNER_NO_PARTNER' using errcode = 'P0001';
      end if;
      new.duo_id := private.current_duo_id();
    else
      new.duo_id := null;
    end if;
  elsif new.duo_id is null then
    new.shared_with_partner := false;
  end if;
  return new;
end;
$$;

create trigger planner_events_normalize
  before insert or update on public.planner_events
  for each row execute function private.normalize_planner_event();

create trigger planner_events_set_updated_at
  before update on public.planner_events
  for each row execute function private.set_updated_at();

alter table public.planner_events enable row level security;
revoke all on table public.planner_events from anon, authenticated;
grant select, delete on table public.planner_events to authenticated;
grant insert (title, event_type, subject, event_date, event_time, description, priority,
              shared_with_partner, reminder_days_before)
  on table public.planner_events to authenticated;
grant update (title, event_type, subject, event_date, event_time, description, priority,
              shared_with_partner, reminder_days_before)
  on table public.planner_events to authenticated;

create policy "planner_events: read own or shared by current partner"
  on public.planner_events for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (shared_with_partner and duo_id = (select private.current_duo_id()))
  );

create policy "planner_events: owner creates"
  on public.planner_events for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "planner_events: owner updates"
  on public.planner_events for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "planner_events: owner deletes"
  on public.planner_events for delete to authenticated
  using (owner_id = (select auth.uid()));

-- A shared event changed: tell the duo (ids and the operation only, never a
-- title or date); the partner refetches through RLS. Also tells the old duo
-- when an event stops being shared, so it disappears there. DEFINER because
-- realtime.send is not granted to users (same as the other sync_* triggers).
create function private.sync_planner_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old uuid;
  v_new uuid;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_old := old.duo_id;
  elsif tg_op = 'INSERT' then
    v_id := new.id;
    v_new := new.duo_id;
  else
    v_id := new.id;
    v_old := old.duo_id;
    v_new := new.duo_id;
  end if;
  v_payload := jsonb_build_object(
    'actor_id', (select auth.uid()),
    'event_id', v_id,
    'operation', lower(tg_op)
  );
  if v_old is not null and v_old is distinct from v_new
     and exists (select 1 from public.duos d where d.id = v_old) then
    perform realtime.send(v_payload, 'planner_changed', 'duo:' || v_old::text, true);
  end if;
  if v_new is not null then
    perform realtime.send(v_payload, 'planner_changed', 'duo:' || v_new::text, true);
  end if;
  return null;
end;
$$;

create trigger planner_events_broadcast
  after insert or update or delete on public.planner_events
  for each row execute function private.sync_planner_event();

revoke all on function private.normalize_planner_event() from public, anon, authenticated;
revoke all on function private.sync_planner_event() from public, anon, authenticated;
