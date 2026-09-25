-- Stage 8 · persistent reactions on duo activity
--
-- A reaction is attached to an existing activity_events row (it never
-- creates a feed line of its own). One active reaction per user per event:
-- choosing another replaces it. Only the approved set is stored. A user
-- reacts only to their partner's events in their own duo, never to their
-- own. Deleting the event (undo, duo ended) deletes its reactions.

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  activity_event_id uuid not null references public.activity_events (id) on delete cascade,
  from_user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reaction_type text not null
    constraint reactions_type check (reaction_type in ('fire', 'lightning', 'salute', 'respect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reactions_one_per_user unique (activity_event_id, from_user_id)
);

create index reactions_from_user_idx on public.reactions (from_user_id);

create trigger reactions_set_updated_at
  before update on public.reactions
  for each row execute function private.set_updated_at();

-- May the caller react to this event? In my duo and not my own. INVOKER:
-- RLS on activity_events already limits the rows to my duo.
create function private.can_react(p_event uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.activity_events e
    where e.id = p_event
      and e.duo_id = private.current_duo_id()
      and e.actor_id <> (select auth.uid())
  );
$$;

alter table public.reactions enable row level security;
revoke all on table public.reactions from anon, authenticated;
grant select, delete on table public.reactions to authenticated;
grant insert (activity_event_id, reaction_type) on table public.reactions to authenticated;
grant update (reaction_type) on table public.reactions to authenticated;

create policy "reactions: read own duo"
  on public.reactions for select to authenticated
  using (
    exists (
      select 1 from public.activity_events e
      where e.id = activity_event_id
        and e.duo_id = (select private.current_duo_id())
    )
  );

create policy "reactions: insert own on partner events"
  on public.reactions for insert to authenticated
  with check (from_user_id = (select auth.uid()) and private.can_react(activity_event_id));

create policy "reactions: update own"
  on public.reactions for update to authenticated
  using (from_user_id = (select auth.uid()))
  with check (from_user_id = (select auth.uid()) and private.can_react(activity_event_id));

create policy "reactions: delete own"
  on public.reactions for delete to authenticated
  using (from_user_id = (select auth.uid()));

-- Set (or replace) my reaction. Returns the stored type.
create function public.set_reaction(p_event_id uuid, p_type text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_type text;
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.can_react(p_event_id) then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.reactions (activity_event_id, reaction_type)
  values (p_event_id, p_type)
  on conflict (activity_event_id, from_user_id)
    do update set reaction_type = excluded.reaction_type
  returning reaction_type into v_type;
  return v_type;
end;
$$;

-- One broadcast per change on the duo channel. No title: clients already
-- have the event line; the payload says who reacted with what.
create function private.sync_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.reactions;
  v_type text;
  v_duo uuid;
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
    v_type := new.reaction_type;
  end if;
  if tg_op = 'UPDATE' and new.reaction_type is not distinct from old.reaction_type then
    return null;
  end if;
  select e.duo_id, e.actor_id into v_duo, v_actor
  from public.activity_events e
  where e.id = v_row.activity_event_id;
  if v_duo is null then
    return null; -- the event itself is being deleted (undo / duo ended)
  end if;
  perform realtime.send(
    jsonb_build_object(
      'activity_event_id', v_row.activity_event_id,
      'actor_id', v_actor,
      'from_user_id', v_row.from_user_id,
      'reaction_type', v_type
    ),
    'reaction',
    'duo:' || v_duo::text,
    true
  );
  return null;
end;
$$;

create trigger reactions_broadcast
  after insert or update or delete on public.reactions
  for each row execute function private.sync_reaction();

revoke all on function private.can_react(uuid) from public, anon, authenticated;
grant execute on function private.can_react(uuid) to authenticated;
revoke all on function private.sync_reaction() from public, anon, authenticated;
revoke all on function public.set_reaction(uuid, text) from public, anon, authenticated;
grant execute on function public.set_reaction(uuid, text) to authenticated;
