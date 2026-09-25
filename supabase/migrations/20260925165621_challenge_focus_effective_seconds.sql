-- Stage 9 · a closed focus challenge cannot change when a session is finalised
--
-- Challenge focus counted completed sessions only, so a session paused on a
-- closed day and completed later (reconcile_my_focus) added its time to a
-- challenge that had already ended. It now counts every session that started
-- in the period with its effective seconds — the same private.focus_seconds()
-- as the daily series: completed = stored, paused = up to the pause (frozen:
-- a closed day's session can no longer be resumed), active = elapsed, capped
-- at the plan. Finalising a session never changes the number.
--
-- Note on default privileges (history_integrity): PostgreSQL's global
-- default gives PUBLIC EXECUTE on every new function and a schema-level
-- default cannot remove it. Every migration therefore keeps revoking EXECUTE
-- from public / anon explicitly, and stage9_integrity.test.sql fails if any
-- function in public / private is executable by PUBLIC or anon. (The table
-- and sequence defaults for anon in public were removed effectively.)

create or replace function private.challenge_value(
  p_user uuid, p_type text, p_from date, p_to date, p_standard integer
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.local_today(p_user);
  v_to date := least(p_to, v_today);
begin
  if v_today is null or v_to < p_from then
    return 0;
  end if;
  if p_type = 'standard_days' then
    return (
      select count(*)::integer
      from (
        select dt.task_date,
               count(*)::integer as n_planned,
               (count(*) filter (where dt.status = 'completed'))::integer as n_completed
        from public.daily_tasks dt
        where dt.owner_id = p_user and dt.task_date between p_from and v_to
        group by dt.task_date
      ) d
      where private.standard_met(d.n_planned, d.n_completed, p_standard)
    );
  end if;
  return (
    select coalesce(sum(private.focus_seconds(s.status, s.started_at, s.paused_at,
                                              s.accumulated_pause_seconds, s.planned_seconds,
                                              s.actual_focus_seconds)), 0)::integer
    from public.focus_sessions s
    where s.user_id = p_user
      and s.local_date between p_from and v_to
  );
end;
$$;
