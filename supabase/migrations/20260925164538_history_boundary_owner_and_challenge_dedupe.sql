-- Stage 9 · boundary owned by the database, duplicate challenges refused
--
-- 1. profiles.history_locked_through: the API roles can never write it (no
--    column grant) and a timezone change moves it forward only. Trusted
--    database roles (migrations, support, DEV fixtures) may still set it
--    directly, e.g. to repair an account.
-- 2. The same challenge (title, type, period) cannot exist twice in a duo: a
--    double submit from two tabs or devices creates it once.

create or replace function private.keep_history_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is distinct from old.timezone then
    new.history_locked_through := greatest(
      old.history_locked_through,
      new.history_locked_through,
      (now() at time zone old.timezone)::date - 1
    );
  elsif current_user in ('authenticated', 'anon') then
    new.history_locked_through := old.history_locked_through;
  end if;
  return new;
end;
$$;

create unique index challenges_no_duplicate_idx
  on public.challenges (duo_id, lower(title), challenge_type, start_date, end_date);
