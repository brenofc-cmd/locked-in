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

revoke all on function private.dev_is_test_user() from public, anon;
revoke all on function public.dev_fixture_reset_history() from public, anon;
revoke all on function public.dev_fixture_add_tasks(jsonb) from public, anon;
revoke all on function public.dev_fixture_backdate_routine(uuid, date, date) from public, anon;
grant execute on function private.dev_is_test_user() to authenticated;
grant execute on function public.dev_fixture_reset_history() to authenticated;
grant execute on function public.dev_fixture_add_tasks(jsonb) to authenticated;
grant execute on function public.dev_fixture_backdate_routine(uuid, date, date) to authenticated;
