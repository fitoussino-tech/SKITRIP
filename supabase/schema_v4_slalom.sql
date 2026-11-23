-- ====================================================================
-- MIM28 Ski Trip — v4: Salamander Slalom leaderboard
-- Run after schema_v3.sql. Safe to run again.
--
-- The easter egg game (js/slalom.js) keeps each player's best run here, so the game can
-- show a leaderboard with names. Phones only read this table; they write through
-- submit_slalom(), which checks the name belongs to the room and only ever keeps the best run.
-- ====================================================================

create table if not exists slalom_scores (
  team_id    text not null references teams(id) on delete cascade,
  name       text not null,
  best       int  not null check (best between 0 and 100000),   -- metres
  runs       int  not null default 1,
  updated_at timestamptz not null default now(),                -- when the best run happened
  primary key (team_id, name)
);

alter table slalom_scores enable row level security;
drop policy if exists "everyone reads slalom scores" on slalom_scores;
create policy "everyone reads slalom scores" on slalom_scores for select using (true);
grant select on slalom_scores to anon, authenticated;
-- no insert / update / delete policy: only the functions below change it

-- A player finished a run. Returns their best run (in metres).
create or replace function submit_slalom(p_team text, p_name text, p_score int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not exists (select 1 from teams where id = p_team and members ? p_name) then raise exception 'Unknown player'; end if;
  if p_score is null or p_score < 0 or p_score > 100000 then raise exception 'That score looks wrong'; end if;
  insert into slalom_scores (team_id, name, best) values (p_team, p_name, p_score)
  on conflict (team_id, name) do update
    set best       = greatest(slalom_scores.best, excluded.best),
        runs       = slalom_scores.runs + 1,
        updated_at = case when excluded.best > slalom_scores.best then now() else slalom_scores.updated_at end
  returning best into v;
  return v;
end $$;

-- Organisers: empty the leaderboard (the back office's "Restart the game" also calls it).
create or replace function reset_slalom() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Organisers only'; end if;
  delete from slalom_scores where true;
end $$;

grant execute on function submit_slalom(text, text, int) to anon, authenticated;
grant execute on function reset_slalom()                 to authenticated;
revoke execute on function reset_slalom()                from public, anon;
