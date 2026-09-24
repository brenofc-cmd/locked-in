-- Stage 5 · Realtime Authorization for private duo channels
--
-- One private channel per duo, topic "duo:<duo_id>". Realtime evaluates these
-- policies on realtime.messages when a client joins a private channel
-- (realtime.topic() = the channel topic, auth.uid() = the JWT user):
--   SELECT -> may receive broadcasts / presence on the topic
--   INSERT -> may send on the topic
-- Only members of that duo pass (private.current_duo_id() reads duo_members).
-- Clients may publish presence but not broadcast: task broadcasts are sent
-- by the database (realtime.send in private.sync_task_activity). anon has no
-- policy, so every private channel is closed to it.

create policy "duo members receive duo broadcasts and presence"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) = 'duo:' || (select private.current_duo_id())::text
  );

create policy "duo members publish presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) = 'duo:' || (select private.current_duo_id())::text
  );
