-- Stage 6 · the database clock for Focus timers
--
-- Focus timestamps are written by Postgres (now()); a device or app-server
-- clock can be seconds off. The app reads this on every page load to know
-- "database time" before any focus transition (the partner's countdown
-- depends on it too). Returns nothing but the current time.

create function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.server_now() from public;
grant execute on function public.server_now() to authenticated;
