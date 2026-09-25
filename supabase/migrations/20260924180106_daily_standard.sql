-- Stage 7 · the personal Daily Standard
--
-- Share of a day's planned tasks (1–100 %) needed for the day to count as
-- STANDARD MET, which is what the streak counts. It never affects the weekly
-- competition (always raw completion %), so lowering it cannot help anyone
-- beat their partner. Changing it recalculates the streak over all history
-- (no standard history in V1).

alter table public.profiles
  add column daily_standard_percent smallint not null default 80
    constraint profiles_daily_standard_range check (daily_standard_percent between 1 and 100);

grant update (daily_standard_percent) on table public.profiles to authenticated;
