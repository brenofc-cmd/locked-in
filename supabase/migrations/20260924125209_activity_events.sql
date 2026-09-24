-- Stage 5 · activity feed + database broadcasts
--
-- activity_events is the duo's feed of proof of work (not an audit log).
-- A task_completed event exists exactly while its task is completed AND
-- shared (visible_to_partner); the database keeps it in sync:
--   pending/skipped -> completed (shared)   : event created, broadcast "activity"
--   completed -> anything else, or deleted  : event removed, broadcast "activity_removed"
--   shared -> private while completed       : event removed (the feed never reveals it)
--   private -> shared while completed       : event created
-- Clients can only read the feed of their own duo. Nothing here is writable
-- from the API. Broadcasts go to the private topic duo:<duo_id> with a
-- minimal payload (no notes, no timezone, no email).

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duos (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null
    constraint activity_events_type check (event_type in ('task_completed')),
  target_type text
    constraint activity_events_target_type check (target_type in ('daily_task')),
  target_id uuid,
  title_snapshot text
    constraint activity_events_title_length check (char_length(title_snapshot) <= 80),
  created_at timestamptz not null default now(),
  -- One live event per target: re-completing a task refreshes it, never duplicates it.
  constraint activity_events_target_key unique (event_type, target_id)
);

comment on table public.activity_events is 'Duo activity feed. Maintained by triggers on daily_tasks; read-only for clients.';

create index activity_events_duo_created_idx on public.activity_events (duo_id, created_at desc);
create index activity_events_actor_idx on public.activity_events (actor_id);

alter table public.activity_events enable row level security;
revoke all on table public.activity_events from anon, authenticated;
grant select on table public.activity_events to authenticated;

create policy "activity_events: read own duo"
  on public.activity_events for select to authenticated
  using (duo_id = (select private.current_duo_id()));

-- SECURITY DEFINER: it writes activity_events (no client grant) and sends
-- realtime messages. It only reacts to the row being changed and derives
-- actor and duo from it, never from client input.
create function private.sync_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_duo uuid;
  v_was boolean := false;
  v_is boolean := false;
  v_event public.activity_events;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_was := old.status = 'completed' and old.visible_to_partner;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_is := new.status = 'completed' and new.visible_to_partner;
    v_owner := new.owner_id;
  else
    v_owner := old.owner_id;
  end if;

  select m.duo_id into v_duo from public.duo_members m where m.user_id = v_owner;

  if v_is and not v_was then
    if v_duo is not null then
      insert into public.activity_events (
        duo_id, actor_id, event_type, target_type, target_id, title_snapshot, created_at
      )
      values (
        v_duo, new.owner_id, 'task_completed', 'daily_task', new.id, new.title,
        coalesce(new.completed_at, now())
      )
      on conflict (event_type, target_id) do update
        set duo_id = excluded.duo_id,
            title_snapshot = excluded.title_snapshot,
            created_at = excluded.created_at
      returning * into v_event;

      perform realtime.send(
        jsonb_build_object(
          'id', v_event.id,
          'actor_id', v_event.actor_id,
          'event_type', v_event.event_type,
          'target_id', v_event.target_id,
          'title', v_event.title_snapshot,
          'created_at', v_event.created_at
        ),
        'activity',
        'duo:' || v_duo::text,
        true
      );
    end if;
  elsif v_was and not v_is then
    delete from public.activity_events e
    where e.event_type = 'task_completed' and e.target_id = old.id
    returning * into v_event;
    if found then
      perform realtime.send(
        jsonb_build_object('id', v_event.id, 'actor_id', v_event.actor_id),
        'activity_removed',
        'duo:' || v_event.duo_id::text,
        true
      );
    end if;
  elsif tg_op = 'UPDATE' and v_duo is not null
        and old.visible_to_partner and new.visible_to_partner then
    -- A shared task changed state without a feed change (skip / unskip):
    -- the partner refreshes today's numbers. No title in the payload.
    perform realtime.send(
      jsonb_build_object('actor_id', new.owner_id),
      'tasks_changed',
      'duo:' || v_duo::text,
      true
    );
  end if;
  return null;
end;
$$;

revoke all on function private.sync_task_activity() from public;

create trigger daily_tasks_activity_insert
  after insert on public.daily_tasks
  for each row when (new.status = 'completed')
  execute function private.sync_task_activity();

create trigger daily_tasks_activity_update
  after update of status, visible_to_partner on public.daily_tasks
  for each row
  when (old.status is distinct from new.status
        or old.visible_to_partner is distinct from new.visible_to_partner)
  execute function private.sync_task_activity();

create trigger daily_tasks_activity_delete
  after delete on public.daily_tasks
  for each row when (old.status = 'completed')
  execute function private.sync_task_activity();

-- Partner's numbers for their own local today: completed / all tasks,
-- private tasks included in the counts (they count toward the score) but
-- never listed. SECURITY DEFINER because private rows are not readable by
-- the partner; it returns two integers and a date, nothing else.
create function public.partner_today()
returns table (task_date date, done integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.day,
         count(t.id) filter (where t.status = 'completed')::integer,
         count(t.id)::integer
  from public.duo_members m
  join public.profiles p on p.id = m.user_id
  cross join lateral (select (now() at time zone p.timezone)::date as day) d
  left join public.daily_tasks t on t.owner_id = m.user_id and t.task_date = d.day
  where m.duo_id = private.current_duo_id()
    and m.user_id <> (select auth.uid())
  group by d.day;
$$;

revoke all on function public.partner_today() from public, anon, authenticated;
grant execute on function public.partner_today() to authenticated;
