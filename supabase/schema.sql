-- MIM28 Ski Trip - Supabase schema
-- Run this once in the Supabase SQL Editor (new query -> paste -> Run).
-- Security model is deliberately light: a known group of ~150 students, anon key only.
-- Points only move when a ledger row is written (interim: the submitting phone writes it
-- when AUTO_APPROVE is on; later the organisers' back office does it).

-- ---------- Tables ----------

create table if not exists teams (
  id      text primary key,            -- 't1'..'t15', matches seed.js
  code    text not null,               -- room code used to join ('R101', 'DEMO'...)
  room    text not null,               -- 'Room 1'
  members jsonb not null default '[]',
  name    text,                        -- chosen by players (null -> show room)
  color   text                         -- chosen by players
);

create table if not exists ledger (
  id         uuid primary key default gen_random_uuid(),
  team_id    text not null references teams(id),
  label      text not null,
  points     int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id         uuid primary key default gen_random_uuid(),
  team_id    text not null references teams(id),
  kind       text not null,            -- 'challenge' | 'bingo'
  ref_id     text not null,            -- challenge id or bingo square id
  value      text,                     -- typed value (e.g. a race number)
  thumb      text,                     -- data URL of the shrunk proof photo (interim)
  status     text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  by         text,                     -- player name
  created_at timestamptz not null default now()
);

create table if not exists ballots (
  id         uuid primary key default gen_random_uuid(),
  vote_id    text not null,            -- 'v1'...
  voter_id   text not null,            -- per-device id stored in the browser
  team_id    text not null references teams(id),  -- team voted for
  created_at timestamptz not null default now(),
  unique (vote_id, voter_id)           -- one vote per device per poll
);

-- ---------- Realtime ----------
-- Push live changes to every connected phone.
alter publication supabase_realtime add table teams, ledger, submissions, ballots;

-- ---------- Row Level Security (light) ----------
alter table teams       enable row level security;
alter table ledger      enable row level security;
alter table submissions enable row level security;
alter table ballots     enable row level security;

-- Everyone may read everything.
create policy "read teams"       on teams       for select using (true);
create policy "read ledger"      on ledger      for select using (true);
create policy "read submissions" on submissions for select using (true);
create policy "read ballots"     on ballots     for select using (true);

-- Teams: seeded by the app (insert) and renamed/recoloured by players (update).
create policy "insert teams" on teams for insert with check (true);
create policy "update teams" on teams for update using (true) with check (true);

-- Players add proofs, points and votes. No deletes/updates from the anon client.
create policy "insert submissions" on submissions for insert with check (true);
create policy "update submissions" on submissions for update using (true) with check (true);
create policy "insert ledger"      on ledger      for insert with check (true);
create policy "insert ballots"     on ballots     for insert with check (true);
