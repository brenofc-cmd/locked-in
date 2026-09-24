-- DEV ONLY. Never run against production.
--
-- Full cleanup of the Playwright / manual test users' tasks: deletes every
-- daily task and routine item they own (the E2E reset can only archive
-- routine items, so archived rows accumulate across runs). Profiles, duos and
-- accounts are kept. Run in the SQL editor of the DEV project when needed.
delete from public.daily_tasks
where owner_id in (select id from auth.users where email like 'li-e2e-%@example.com');

delete from public.routine_items
where owner_id in (select id from auth.users where email like 'li-e2e-%@example.com');
