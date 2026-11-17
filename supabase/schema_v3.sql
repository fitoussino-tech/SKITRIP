-- MIM28 Ski Trip - schema v3: real back office
-- Run ONCE in the Supabase SQL Editor, after schema.sql and schema_v2.sql.
-- It is safe to run again: every step checks before it changes anything.
--
-- What it does
--   1. Organiser accounts (Supabase Auth users listed in `admins`).
--   2. New tables: players (who has joined), settings, challenges, submission_photos.
--   3. The whole programme moves into `events`, so every line is editable.
--   4. Photos leave the `submissions` rows (they made every phone re-download every photo).
--   5. Access rules: players can read, join, send proofs, vote and edit a team's
--      name / colour / photo. Only organisers can approve, award points or edit content.
--   6. Functions the app calls (send a proof, approve, reject, undo, restart).
--
-- After running it: create the organiser users and list them in `admins`
-- (see docs/SUPABASE_SETUP.md, "Organiser accounts").

-- ====================================================================
-- 1. Organisers
-- ====================================================================
create table if not exists admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

-- ====================================================================
-- 2. New tables
-- ====================================================================

-- One row per player who has joined (room code + name). Written by player_seen().
create table if not exists players (
  team_id   text not null references teams(id) on delete cascade,
  name      text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (team_id, name)
);

-- Small key/value store the organisers edit from the back office.
--   today   : 'auto' (follow the calendar) or a day key ('mon'..'sat')
--   message : the salamander's message on the Today screen
--   epoch   : bumped by reset_game(); phones that see it change sign themselves out
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values
  ('today',   '"auto"'),
  ('message', '"Bonjour skiers! Fresh snow, fresh challenges. Don''t forget your proof!"'),
  ('epoch',   '1')
on conflict (key) do nothing;

-- Daily challenges, created and edited in the back office.
create table if not exists challenges (
  id          text primary key default 'c-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  day         text not null check (day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat')),
  kind        text not null check (kind in ('race', 'mission')),
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  points      int  not null default 0 check (points between 0 and 1000),
  closes      text not null default '',   -- '17:00'
  unit        text not null default '',   -- races only: 'km', 'km/h'
  prize       text not null default '',   -- free text shown under the description
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
-- Starter challenges (same ids as js/seed.js), only if the table is empty.
insert into challenges (id, day, kind, title, description, points, closes, unit, prize, position)
select * from (values
  ('c1', 'tue', 'race', 'Kilometre kings',
   'Your room''s average distance per person today. Upload a Strava screenshot.',
   100, '17:00', 'km', '100 / 70 / 50 for the top three, 20 for taking part', 10),
  ('c2', 'tue', 'race', 'Speed trap',
   'The fastest top speed recorded in your room today. Screenshot or it did not happen.',
   100, '17:00', 'km/h', '100 / 70 / 50 for the top three, 20 for taking part', 20),
  ('c3', 'tue', 'mission', 'First chair',
   'Photo of your room on a chairlift before 10:00.', 30, '10:00', '', '', 30),
  ('c4', 'tue', 'mission', 'Salamander spotted',
   'Draw the salamander in the snow. Artistic merit is not required.', 40, '18:00', '', '', 40)
) as v
where not exists (select 1 from challenges);

-- Proof photos live in their own table, outside Realtime, and are fetched one by one.
create table if not exists submission_photos (
  submission_id uuid primary key references submissions(id) on delete cascade,
  data          text not null check (data ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,')
);

-- ====================================================================
-- 3. Changes to existing tables
-- ====================================================================

-- submissions: review note + time, and photos move out.
alter table submissions add column if not exists note        text;
alter table submissions add column if not exists reviewed_at timestamptz;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'submissions' and column_name = 'thumb') then
    insert into submission_photos (submission_id, data)
      select id, thumb from submissions where thumb is not null
      on conflict (submission_id) do nothing;
    alter table submissions drop column thumb;
  end if;
end $$;

-- ledger: remember which proof a line of points came from (so an undo can remove it).
alter table ledger add column if not exists submission_id uuid references submissions(id) on delete cascade;

-- teams: keep names and photos to a sane size.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_name_len') then
    alter table teams add constraint teams_name_len check (name is null or char_length(name) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_avatar_len') then
    alter table teams add constraint teams_avatar_len check (avatar is null or char_length(avatar) <= 200000);
  end if;
end $$;

-- events: the whole programme now lives here, in an order the organisers control.
alter table events add column if not exists position int not null default 0;
do $$
begin
  if not exists (select 1 from settings where key = 'programme_seeded') then
    -- lines the organisers already added go after the base programme of their day
    update events set position = 1000 + sub.n
      from (select id, row_number() over (partition by day order by created_at) * 10 as n from events) sub
      where events.id = sub.id;
    insert into events (day, time, title, detail, position) values
      ('mon', 'Evening',   'Bus leaves Fontainebleau', 'Parking de la Faisanderie. One suitcase and one small bag.', 10),
      ('tue', '07:00',     'Arrival in Les Menuires', 'Welcome breakfast. Bags go in the luggage room.', 10),
      ('tue', 'Morning',   'Ski passes and gear', 'Collect your discount wristband.', 20),
      ('tue', 'Day',       'Free skiing', '', 30),
      ('tue', '16:00',     'Apres-ski', 'Free beer and a DJ set.', 40),
      ('tue', '17:00',     'Check-in', 'Apartments open.', 50),
      ('tue', 'Evening',   'Dinner in the apartments', 'Then a welcome drink.', 60),
      ('wed', '09:00',     'Free skiing', '', 10),
      ('wed', '12:00',     'BBQ on the slopes', '', 20),
      ('wed', '14:00',     'Apres-ski', '', 30),
      ('wed', 'Evening',   'Wine tasting', '', 40),
      ('wed', '00:00',     'Costume night', 'Bring your costume.', 50),
      ('thu', '09:00',     'Ski in costume', '', 10),
      ('thu', 'Afternoon', 'Group photo', 'Results of the best-costume vote.', 20),
      ('thu', '15:00',     'Apres-ski', '', 30),
      ('thu', '00:00',     'Club night', 'With organised games.', 40),
      ('fri', 'All day',   'Free day', '', 10),
      ('fri', '00:00',     'Neon party', 'Bring something neon.', 20),
      ('sat', '08:00',     'Check-out', 'Until 10:00. Leave the apartment clean.', 10),
      ('sat', 'Daytime',   'Bus back to Fontainebleau', 'Arriving in the evening.', 20);
    insert into settings (key, value) values ('programme_seeded', 'true');
  end if;
end $$;

-- ====================================================================
-- 4. Realtime: push changes of the new tables to every phone
--    (submission_photos is left out on purpose: photos are fetched on demand)
-- ====================================================================
do $$
declare t text;
begin
  foreach t in array array['players', 'settings', 'challenges'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ====================================================================
-- 5. Access rules (Row Level Security)
-- ====================================================================
alter table admins            enable row level security;
alter table players           enable row level security;
alter table settings          enable row level security;
alter table challenges        enable row level security;
alter table submission_photos enable row level security;

-- Remove the permissive v1/v2 rules that let anyone write points, approve proofs or edit the calendar.
drop policy if exists "insert ledger"      on ledger;
drop policy if exists "insert submissions" on submissions;
drop policy if exists "update submissions" on submissions;
drop policy if exists "insert events"      on events;
drop policy if exists "delete events"      on events;

-- (re)create the v3 rules
drop policy if exists "organiser reads own row"   on admins;
drop policy if exists "read players"              on players;
drop policy if exists "read settings"             on settings;
drop policy if exists "organisers write settings" on settings;
drop policy if exists "organisers edit settings"  on settings;
drop policy if exists "read challenges"           on challenges;
drop policy if exists "organisers add challenges"    on challenges;
drop policy if exists "organisers edit challenges"   on challenges;
drop policy if exists "organisers delete challenges" on challenges;
drop policy if exists "read photos"               on submission_photos;
drop policy if exists "organisers add points"     on ledger;
drop policy if exists "organisers remove points"  on ledger;
drop policy if exists "organisers add events"     on events;
drop policy if exists "organisers edit events"    on events;
drop policy if exists "organisers delete events"  on events;

create policy "organiser reads own row" on admins for select using (user_id = auth.uid());

-- Everyone may read the game.
create policy "read players"    on players           for select using (true);
create policy "read settings"   on settings          for select using (true);
create policy "read challenges" on challenges        for select using (true);
create policy "read photos"     on submission_photos for select using (true);

-- Only organisers write content and points.
create policy "organisers write settings" on settings for insert with check (is_admin());
create policy "organisers edit settings"  on settings for update using (is_admin()) with check (is_admin());
create policy "organisers add challenges"    on challenges for insert with check (is_admin());
create policy "organisers edit challenges"   on challenges for update using (is_admin()) with check (is_admin());
create policy "organisers delete challenges" on challenges for delete using (is_admin());
create policy "organisers add points"    on ledger for insert with check (is_admin());
create policy "organisers remove points" on ledger for delete using (is_admin());
create policy "organisers add events"    on events for insert with check (is_admin());
create policy "organisers edit events"   on events for update using (is_admin()) with check (is_admin());
create policy "organisers delete events" on events for delete using (is_admin());

-- Table privileges for the two API roles (anon = players, authenticated = signed-in organisers).
grant select on admins, players, settings, challenges, submission_photos to anon, authenticated;
grant insert, update, delete on challenges, events to authenticated;
grant insert, update on settings to authenticated;
grant insert, delete on ledger to authenticated;
-- Players may only change a team's name, colour and photo (not its code, room or members).
revoke update on teams from anon, authenticated;
grant  update (name, color, avatar) on teams to anon, authenticated;
-- Proofs and players are written through the functions below, never directly.
revoke insert, update, delete on submissions, submission_photos, players from anon, authenticated;
revoke update, delete on ledger from anon;
revoke insert on ledger from anon;

-- ====================================================================
-- 6. Functions called by the app
-- ====================================================================

-- A player opened the app: record that they joined (only names listed in the room).
create or replace function player_seen(p_team text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from teams where id = p_team and members ? p_name) then return; end if;
  insert into players (team_id, name) values (p_team, p_name)
  on conflict (team_id, name) do update set last_seen = now();
end $$;

-- A player sends a proof: one row + its photo, always "pending".
-- Sending again while a proof is pending or approved just returns that proof.
create or replace function submit_proof(p_team text, p_kind text, p_ref text, p_value text, p_by text, p_photo text)
returns submissions
language plpgsql security definer set search_path = public as $$
declare v submissions;
begin
  if p_kind not in ('challenge', 'bingo') then raise exception 'Unknown kind of proof'; end if;
  if not exists (select 1 from teams where id = p_team) then raise exception 'Unknown team'; end if;
  if p_photo is null
     or p_photo !~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'
     or p_photo ~ '[^A-Za-z0-9+/=:;,]' then
    raise exception 'A photo is required';
  end if;
  if char_length(p_photo) > 1500000 then raise exception 'That photo is too large'; end if;

  select * into v from submissions
   where team_id = p_team and kind = p_kind and ref_id = p_ref and status in ('pending', 'approved')
   order by created_at desc limit 1;
  if found then return v; end if;

  insert into submissions (team_id, kind, ref_id, value, status, by)
  values (p_team, p_kind, left(p_ref, 60), nullif(left(coalesce(p_value, ''), 20), ''), 'pending', left(coalesce(p_by, ''), 40))
  returning * into v;
  insert into submission_photos (submission_id, data) values (v.id, p_photo);
  return v;
end $$;

-- Organiser approves a pending proof and awards its points in one step.
-- p_awards: [{"label": "First chair", "points": 30}, ...]
-- Returns false when the proof was no longer pending (someone else got there first):
-- nothing is awarded twice.
create or replace function approve_submission(p_id uuid, p_awards jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_team text;
begin
  if not is_admin() then raise exception 'Organisers only'; end if;
  update submissions set status = 'approved', reviewed_at = now(), note = null
   where id = p_id and status = 'pending'
   returning team_id into v_team;
  if not found then return false; end if;
  insert into ledger (team_id, label, points, submission_id)
  select v_team, left(a ->> 'label', 80), (a ->> 'points')::int, p_id
    from jsonb_array_elements(coalesce(p_awards, '[]'::jsonb)) a
   where (a ->> 'points')::int <> 0;
  return true;
end $$;

-- Organiser rejects a pending proof, with an optional note shown to the team.
create or replace function reject_submission(p_id uuid, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Organisers only'; end if;
  update submissions set status = 'rejected', reviewed_at = now(), note = nullif(left(coalesce(p_note, ''), 200), '')
   where id = p_id and status = 'pending';
  return found;
end $$;

-- Organiser undoes a decision: the proof goes back to "pending" and its points are removed.
create or replace function reopen_submission(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Organisers only'; end if;
  update submissions set status = 'pending', reviewed_at = null, note = null
   where id = p_id and status <> 'pending';
  if not found then return false; end if;
  delete from ledger where submission_id = p_id;
  return true;
end $$;

-- Organiser restarts the game from zero: points, proofs, photos, votes, players,
-- team names and team photos. Challenges and the programme are kept.
-- Bumping `epoch` signs every phone out.
create or replace function reset_game() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Organisers only'; end if;
  delete from ledger      where true;
  delete from ballots     where true;
  delete from submissions where true;   -- photos go with them (on delete cascade)
  delete from players     where true;
  update teams set name = null, avatar = null where true;
  insert into settings (key, value) values ('epoch', '1')
  on conflict (key) do update
    set value = to_jsonb(coalesce((settings.value #>> '{}')::int, 0) + 1), updated_at = now();
end $$;

grant execute on function is_admin()                                         to anon, authenticated;
grant execute on function player_seen(text, text)                            to anon, authenticated;
grant execute on function submit_proof(text, text, text, text, text, text)   to anon, authenticated;
grant execute on function approve_submission(uuid, jsonb)                    to authenticated;
grant execute on function reject_submission(uuid, text)                      to authenticated;
grant execute on function reopen_submission(uuid)                            to authenticated;
grant execute on function reset_game()                                       to authenticated;
-- Organiser-only functions: not callable at all without signing in (they also check is_admin() inside).
revoke execute on function approve_submission(uuid, jsonb) from public, anon;
revoke execute on function reject_submission(uuid, text)   from public, anon;
revoke execute on function reopen_submission(uuid)         from public, anon;
revoke execute on function reset_game()                    from public, anon;

-- ====================================================================
-- Still open on purpose (players have no accounts, only a room code + name):
--   * anyone can rename a team or change its photo;
--   * votes are one per device, so a determined student can vote twice;
--   * anyone can send a proof for any team. It stays "pending" until an organiser
--     looks at it, so it cannot create points.
-- Points, approvals, challenges, the programme and settings are organisers only.
-- ====================================================================
