-- MIM28 Ski Trip - schema additions (run ONCE, after schema.sql)
-- Adds: team profile photo, and an editable calendar managed from the admin back office.

-- Team profile photo (data URL, same anti-injection check as proof photos)
alter table teams add column if not exists avatar text
  check (avatar is null or avatar ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,');

-- Calendar events: added in the back office, shown to every player on top of the base programme
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  day        text not null,             -- 'mon'..'sat' (matches seed.js day keys)
  time       text not null default '',  -- '16:00', 'Evening', ...
  title      text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table events;

alter table events enable row level security;
create policy "read events"   on events for select using (true);
create policy "insert events" on events for insert with check (true);
create policy "delete events" on events for delete using (true);
