-- MIM28 Ski Trip - schema v2 + photo storage (run ONCE, after schema.sql)
-- Idempotent: safe to run again. Adds: team photo, editable calendar, and a
-- Supabase Storage bucket for real photo uploads (feed + avatars).

-- ---------- Team profile photo ----------
alter table teams add column if not exists avatar text;

-- ---------- Editable calendar ----------
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  day        text not null,             -- 'mon'..'sat' (matches seed.js day keys)
  time       text not null default '',
  title      text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'events') then
    execute 'alter publication supabase_realtime add table events';
  end if;
end $$;

alter table events enable row level security;
drop policy if exists "read events"   on events;
drop policy if exists "insert events" on events;
drop policy if exists "delete events" on events;
create policy "read events"   on events for select using (true);
create policy "insert events" on events for insert with check (true);
create policy "delete events" on events for delete using (true);

-- ---------- Allow photos to be an inline data URL OR a Storage public URL ----------
alter table submissions drop constraint if exists submissions_thumb_check;
alter table submissions drop constraint if exists submissions_thumb_ok;
alter table submissions add constraint submissions_thumb_ok check (
  thumb is null
  or thumb ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'
  or thumb ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'
);

alter table teams drop constraint if exists teams_avatar_ok;
alter table teams add constraint teams_avatar_ok check (
  avatar is null
  or avatar ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'
  or avatar ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'
);

-- ---------- Photo storage: a public bucket + anon upload/read ----------
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', true)
  on conflict (id) do nothing;
drop policy if exists "proofs read"  on storage.objects;
drop policy if exists "proofs write" on storage.objects;
create policy "proofs read"  on storage.objects for select using (bucket_id = 'proofs');
create policy "proofs write" on storage.objects for insert with check (bucket_id = 'proofs');
