-- Stage 6 · server_now(): signed-in users only
--
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon and authenticated directly, so "revoke … from public" alone left anon
-- able to call it (caught by pgTAP). Same pattern as the other focus RPCs.

revoke all on function public.server_now() from public, anon, authenticated;
grant execute on function public.server_now() to authenticated;
