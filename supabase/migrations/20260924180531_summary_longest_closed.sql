-- Stage 7 · my_progress_summary also returns the longest streak over closed
-- days, so the app can show the longest streak live (today's tasks change
-- without a refetch; undoing a task must not leave an inflated record).

drop function public.my_progress_summary();

create function public.my_progress_summary()
returns table (
  today date,
  standard integer,
  streak_before_today integer,
  current_streak integer,
  longest_closed integer,
  longest_streak integer,
  today_planned integer,
  today_completed integer,
  first_task_date date
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'LI_NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  perform private.materialize_tasks(v_uid);
  return query
  select s.today,
         s.standard,
         s.streak_before_today,
         s.streak_before_today
           + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer,
         s.longest_closed,
         greatest(s.longest_closed,
                  s.streak_before_today
                    + (private.standard_met(s.today_planned, s.today_completed, s.standard))::integer),
         s.today_planned,
         s.today_completed,
         s.first_task_date
  from private.streaks(v_uid) s;
end;
$$;

revoke all on function public.my_progress_summary() from public, anon, authenticated;
grant execute on function public.my_progress_summary() to authenticated;
