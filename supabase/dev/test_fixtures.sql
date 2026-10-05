-- DEV ONLY — NEVER apply to production (docs/PRODUCTION_CHECKLIST.md checks
-- that none of these functions exist there).
--
-- Since Stage 9 no client can write a closed day (docs/SECURITY.md →
-- "Closed history"). Playwright still needs past data — a streak, a closed
-- week, a routine that started days ago — and a way to start each run from a
-- clean slate. These SECURITY DEFINER fixtures do that for the signed-in
-- DEV test accounts only (li-…@example.com, docs/DATABASE.md → "Test users").
-- They are not migrations: apply this file to DEV with the SQL editor (or the
-- Supabase MCP execute_sql) whenever the DEV database is recreated.
--
-- The permission tests themselves always use real user tokens and the public
-- API; these fixtures only prepare data.

create or replace function private.dev_is_test_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email like 'li-%@example.com'
  );
$$;

-- Delete every task of the caller (closed days included) and clear the
-- history boundary a timezone test may have pushed forward.
create or replace function public.dev_fixture_reset_history()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.daily_tasks where owner_id = auth.uid();
  update public.profiles set history_locked_through = null where id = auth.uid();
  -- V2 Phase 7: versions of the Daily Standard recorded on a day that is
  -- "in the future" again once the boundary is back (DEV time travel only).
  delete from public.daily_standard_history
  where user_id = auth.uid() and effective_from > private.local_today(auth.uid());
end;
$$;

-- One-off tasks on any date for the caller:
-- [{ "task_date": "2026-09-20", "title": "…", "status": "completed", "visible_to_partner": true }]
create or replace function public.dev_fixture_add_tasks(p_rows jsonb)
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
    insert into public.daily_tasks (owner_id, task_date, title, status, visible_to_partner)
    select auth.uid(), (r->>'task_date')::date, r->>'title',
           coalesce(r->>'status', 'pending'),
           coalesce((r->>'visible_to_partner')::boolean, true)
    from jsonb_array_elements(p_rows) as r
    returning id;
end;
$$;

-- A routine of the caller that "started days ago" and was last materialised
-- on p_materialized (the app was not opened since).
create or replace function public.dev_fixture_backdate_routine(p_id uuid, p_start date, p_materialized date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.daily_tasks
  where routine_item_id = p_id and owner_id = auth.uid() and task_date > p_materialized;
  update public.routine_items
  set start_date = p_start, materialized_through = p_materialized
  where id = p_id and owner_id = auth.uid();
end;
$$;

-- V2 Phase 6: the caller's local day closes now (the real Stage 9 boundary
-- moves to today), so an open commitment of today becomes MISSED exactly as
-- it will after midnight. dev_fixture_reset_history() reopens it.
create or replace function public.dev_fixture_close_today()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.profiles
  set history_locked_through = private.local_today(auth.uid())
  where id = auth.uid();
end;
$$;

-- V2 Phase 6: commitments are history (owners cannot delete them); a run
-- starts from none. Deletes the caller's commitments (sources, nudges and
-- feed lines with them) and check-ins.
create or replace function public.dev_fixture_reset_accountability()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.activity_events e
  where e.target_type = 'commitment'
    and e.target_id in (select c.id from public.commitments c where c.owner_id = auth.uid());
  delete from public.nudges where from_user = auth.uid() or to_user = auth.uid();
  delete from public.commitments where owner_id = auth.uid();
  delete from public.checkins where user_id = auth.uid();
end;
$$;

revoke all on function private.dev_is_test_user() from public, anon;
revoke all on function public.dev_fixture_reset_history() from public, anon;
revoke all on function public.dev_fixture_add_tasks(jsonb) from public, anon;
revoke all on function public.dev_fixture_backdate_routine(uuid, date, date) from public, anon;
grant execute on function private.dev_is_test_user() to authenticated;
grant execute on function public.dev_fixture_reset_history() to authenticated;
grant execute on function public.dev_fixture_add_tasks(jsonb) to authenticated;
grant execute on function public.dev_fixture_backdate_routine(uuid, date, date) to authenticated;
revoke all on function public.dev_fixture_close_today() from public, anon;
grant execute on function public.dev_fixture_close_today() to authenticated;
revoke all on function public.dev_fixture_reset_accountability() from public, anon;
grant execute on function public.dev_fixture_reset_accountability() to authenticated;

-- V2 Phase 7: the caller's CURRENT duo "became complete p_days ago", so the
-- daily duel has closed days to show (duels start on the day the duo
-- formed). Only for a duo whose two members are both test users. V2 Phase 8:
-- up to 120 days, so a whole previous month exists (monthly champion).
create or replace function public.dev_fixture_backdate_duo(p_days integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_duo uuid := private.current_duo_id();
begin
  if not private.dev_is_test_user() or v_duo is null or exists (
    select 1 from public.duo_members m join auth.users u on u.id = m.user_id
    where m.duo_id = v_duo and u.email not like 'li-%@example.com'
  ) then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.duo_members
  set joined_at = now() - make_interval(days => least(greatest(p_days, 0), 120))
  where duo_id = v_duo;
end;
$$;

revoke all on function public.dev_fixture_backdate_duo(integer) from public, anon;
grant execute on function public.dev_fixture_backdate_duo(integer) to authenticated;

-- V2 Phase 8: completed focus sessions of the caller on past days (records,
-- the monthly focus tiebreak). Sessions are fixed at start in the real flow,
-- so the lifecycle / feed triggers are bypassed for these rows only:
-- [{ "local_date": "2026-09-20", "seconds": 3600, "pause_seconds": 0 }]
create or replace function public.dev_fixture_add_focus(p_rows jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  alter table public.focus_sessions disable trigger user;
  insert into public.focus_sessions (user_id, title, planned_seconds, status, started_at, ended_at,
    accumulated_pause_seconds, actual_focus_seconds, local_date, visible_to_partner)
  select auth.uid(), 'Fixture', greatest((r->>'seconds')::integer, 60), 'completed', st,
         st + make_interval(secs => (r->>'seconds')::integer + coalesce((r->>'pause_seconds')::integer, 0)),
         coalesce((r->>'pause_seconds')::integer, 0), (r->>'seconds')::integer, (r->>'local_date')::date, false
  from jsonb_array_elements(p_rows) as r,
       lateral (select (((r->>'local_date')::date + time '09:00')
                        at time zone (select p.timezone from public.profiles p where p.id = auth.uid())) as st) x;
  alter table public.focus_sessions enable trigger user;
end;
$$;

-- V2 Phase 8: a records run starts from no focus history (completed sessions
-- cannot be deleted by their owner). Deletes the caller's focus sessions.
create or replace function public.dev_fixture_reset_focus()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.dev_is_test_user() then
    raise exception 'LI_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.focus_sessions where user_id = auth.uid();
end;
$$;

revoke all on function public.dev_fixture_add_focus(jsonb) from public, anon;
grant execute on function public.dev_fixture_add_focus(jsonb) to authenticated;
revoke all on function public.dev_fixture_reset_focus() from public, anon;
grant execute on function public.dev_fixture_reset_focus() to authenticated;
