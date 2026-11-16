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
  color   text check (color is null or color ~ '^#[0-9A-Fa-f]{3,8}$')  -- hex only (anti-injection)
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
  thumb      text check (thumb is null or thumb ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'),  -- data URL only (anti-injection)
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

-- ---------- Known, accepted trade-offs (light security model) ----------
-- Chosen on purpose for a known group of ~150 students. These are NOT closed yet:
--   * anon can INSERT ledger rows  -> with AUTO_APPROVE the phone awards its own points,
--     so points are trust-based (a motivated student could self-award via the API).
--   * anon can UPDATE teams/submissions -> anyone can rename any team or flip a
--     submission's status.
--   * ballots are keyed by a client-chosen voter_id -> vote-stuffing is possible.
-- These close in the back-office phase: move point-awarding into a SECURITY DEFINER
-- function (or Edge Function) that recomputes points server-side, flip AUTO_APPROVE to
-- false, and (optionally) switch to Supabase anonymous auth so writes are tied to
-- auth.uid() and restricted to the caller's own team.
-- Already mitigated here: stored-XSS via `thumb`/`color` (CHECK constraints above +
-- client-side sanitisation in js/store.supabase.js).
