-- Stage 6 · focus functions
--
-- Owner operations are SECURITY INVOKER: RLS, column grants and the
-- lifecycle trigger apply exactly as for direct API calls; identity is
-- auth.uid(), never a parameter. Errors: LI_NOT_AUTHENTICATED,
-- LI_FOCUS_RUNNING (already one unfinished session), LI_NOT_FOUND,
-- LI_FOCUS_FINISHED (transition from completed).

-- Close the caller's session if its planned time ran out (e.g. while the app
-- was closed). Idempotent; the trigger computes ended_at / actual seconds.
create function public.reconcile_my_focus()
returns void
language sql
volatile
set search_path = ''
as $$
  update public.focus_sessions s
  set status = 'completed'
  where s.user_id = (select auth.uid())
    and s.status = 'active'
    and now() >= s.started_at
                 + make_interval(secs => s.accumulated_pause_seconds + s.planned_seconds);
$$;

-- The caller's unfinished session (after reconciliation), if any.
create function public.my_active_focus()
returns setof public.focus_sessions
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform public.reconcile_my_focus();
  return query
    select s.* from public.focus_sessions s
    where s.user_id = auth.uid() and s.status in ('active', 'paused');
end;
$$;

create function public.start_focus_session(
  p_title text,
  p_planned_seconds integer,
  p_daily_task_id uuid default null,
  p_visible boolean default true
)
returns setof public.focus_sessions
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform public.reconcile_my_focus();
  begin
    return query
      insert into public.focus_sessions (user_id, title, planned_seconds, daily_task_id, visible_to_partner)
      values (auth.uid(), p_title, p_planned_seconds, p_daily_task_id, coalesce(p_visible, true))
      returning *;
  exception when unique_violation then
    -- focus_sessions_one_unfinished: another tab / device / double tap won.
    raise exception 'LI_FOCUS_RUNNING' using errcode = 'P0001';
  end;
end;
$$;

-- Shared by pause / resume / complete: move the caller's session to a status.
create function private.set_my_focus_status(p_id uuid, p_status text, p_reflection text)
returns setof public.focus_sessions
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- An expired active session is completed first; pausing it then just
  -- returns the completed row.
  perform public.reconcile_my_focus();
  return query
    update public.focus_sessions s
    set status = case
          -- idempotent: pausing a paused / resuming an active session is a no-op
          when s.status = 'completed' and p_status <> 'completed' then s.status
          else p_status
        end,
        reflection = coalesce(p_reflection, s.reflection)
    where s.id = p_id and s.user_id = auth.uid()
    returning s.*;
  if not found then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create function public.pause_focus_session(p_id uuid)
returns setof public.focus_sessions
language sql volatile set search_path = ''
as $$ select * from private.set_my_focus_status(p_id, 'paused', null) $$;

create function public.resume_focus_session(p_id uuid)
returns setof public.focus_sessions
language sql volatile set search_path = ''
as $$ select * from private.set_my_focus_status(p_id, 'active', null) $$;

create function public.complete_focus_session(p_id uuid, p_reflection text default null)
returns setof public.focus_sessions
language sql volatile set search_path = ''
as $$ select * from private.set_my_focus_status(p_id, 'completed', p_reflection) $$;

-- Reflection after completion (the "What did you accomplish?" step).
create function public.save_focus_reflection(p_id uuid, p_reflection text)
returns setof public.focus_sessions
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  return query
    update public.focus_sessions s
    set reflection = p_reflection
    where s.id = p_id and s.user_id = auth.uid() and s.status = 'completed'
    returning s.*;
  if not found then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- The duo partner's current focus, as a limited projection. SECURITY DEFINER
-- because the partner has no SELECT on focus_sessions (RLS is row-level and
-- the row holds the private reflection). Returns only timer fields and the
-- title when the session is shared; never reflection, task link or duo.
-- Sessions whose planned time already ran out are not "focusing".
create function public.partner_current_focus()
returns table (
  id uuid,
  user_id uuid,
  title text,
  status text,
  started_at timestamptz,
  planned_seconds integer,
  paused_at timestamptz,
  accumulated_pause_seconds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id,
         case when s.visible_to_partner then s.title end,
         s.status, s.started_at, s.planned_seconds, s.paused_at, s.accumulated_pause_seconds
  from public.duo_members m
  join public.focus_sessions s on s.user_id = m.user_id
  where m.duo_id = private.current_duo_id()
    and m.user_id <> (select auth.uid())
    and s.status in ('active', 'paused')
    and (s.status = 'paused'
         or now() < s.started_at + make_interval(secs => s.accumulated_pause_seconds + s.planned_seconds));
$$;

revoke all on function public.reconcile_my_focus() from public, anon, authenticated;
revoke all on function public.my_active_focus() from public, anon, authenticated;
revoke all on function public.start_focus_session(text, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function private.set_my_focus_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pause_focus_session(uuid) from public, anon, authenticated;
revoke all on function public.resume_focus_session(uuid) from public, anon, authenticated;
revoke all on function public.complete_focus_session(uuid, text) from public, anon, authenticated;
revoke all on function public.save_focus_reflection(uuid, text) from public, anon, authenticated;
revoke all on function public.partner_current_focus() from public, anon, authenticated;

grant execute on function public.reconcile_my_focus() to authenticated;
grant execute on function public.my_active_focus() to authenticated;
grant execute on function public.start_focus_session(text, integer, uuid, boolean) to authenticated;
grant execute on function private.set_my_focus_status(uuid, text, text) to authenticated;
grant execute on function public.pause_focus_session(uuid) to authenticated;
grant execute on function public.resume_focus_session(uuid) to authenticated;
grant execute on function public.complete_focus_session(uuid, text) to authenticated;
grant execute on function public.save_focus_reflection(uuid, text) to authenticated;
grant execute on function public.partner_current_focus() to authenticated;
