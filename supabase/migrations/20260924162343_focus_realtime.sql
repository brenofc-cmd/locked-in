-- Stage 6 · focus in the duo feed and on the duo channel
--
-- Feed (proof of work, no noise): focus_started and focus_completed only;
-- pause / resume never enter the feed. A private session (its task is
-- private, or chosen private) shows as a generic "started Focus" /
-- "completed N min Focus" with no title.
-- Channel duo:<duo_id> gets one "focus" broadcast per state transition
-- (start, pause, resume, complete) with the timer fields; clients compute
-- the countdown. Never a reflection, never a per-second message.

alter table public.activity_events
  add column duration_seconds integer
    constraint activity_events_duration_nonneg check (duration_seconds >= 0);

alter table public.activity_events drop constraint activity_events_type;
alter table public.activity_events add constraint activity_events_type
  check (event_type in ('task_completed', 'focus_started', 'focus_completed'));
alter table public.activity_events drop constraint activity_events_target_type;
alter table public.activity_events add constraint activity_events_target_type
  check (target_type in ('daily_task', 'focus_session'));

-- SECURITY DEFINER: writes activity_events and sends realtime messages
-- (clients can do neither). Derives everything from the session row.
create function private.sync_focus_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := case when new.visible_to_partner then new.title end;
  v_event public.activity_events;
begin
  -- Outside a duo (or after leaving it) there is nobody to tell.
  if new.duo_id is null or not exists (
    select 1 from public.duo_members m where m.duo_id = new.duo_id and m.user_id = new.user_id
  ) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_events (
      duo_id, actor_id, event_type, target_type, target_id, title_snapshot, created_at
    )
    values (new.duo_id, new.user_id, 'focus_started', 'focus_session', new.id, v_title, new.started_at)
    on conflict (event_type, target_id) do nothing
    returning * into v_event;
  elsif new.status = 'completed' then
    insert into public.activity_events (
      duo_id, actor_id, event_type, target_type, target_id, title_snapshot, duration_seconds, created_at
    )
    values (new.duo_id, new.user_id, 'focus_completed', 'focus_session', new.id, v_title,
            new.actual_focus_seconds, new.ended_at)
    on conflict (event_type, target_id) do nothing
    returning * into v_event;
  end if;

  if v_event.id is not null then
    perform realtime.send(
      jsonb_build_object(
        'id', v_event.id,
        'actor_id', v_event.actor_id,
        'event_type', v_event.event_type,
        'target_id', v_event.target_id,
        'title', v_event.title_snapshot,
        'duration_seconds', v_event.duration_seconds,
        'created_at', v_event.created_at
      ),
      'activity',
      'duo:' || new.duo_id::text,
      true
    );
  end if;

  -- The session's new state, for the partner and for the owner's other tabs.
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'title', v_title,
      'status', new.status,
      'started_at', new.started_at,
      'planned_seconds', new.planned_seconds,
      'paused_at', new.paused_at,
      'accumulated_pause_seconds', new.accumulated_pause_seconds
    ),
    'focus',
    'duo:' || new.duo_id::text,
    true
  );
  return null;
end;
$$;

revoke all on function private.sync_focus_activity() from public;

create trigger focus_sessions_activity_insert
  after insert on public.focus_sessions
  for each row execute function private.sync_focus_activity();

create trigger focus_sessions_activity_update
  after update of status on public.focus_sessions
  for each row when (old.status is distinct from new.status)
  execute function private.sync_focus_activity();
