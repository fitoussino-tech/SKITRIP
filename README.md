# MIM28 Ski Trip app

A phone-first web app for the INSEAD MIM28 ski trip (Les Menuires, 4-9 January 2027).
Rooms compete for points through daily challenges, a bingo card and votes.
The leaderboard is a mountain that each team's alpinist climbs, and a salamander hosts it all.

## Status

Player screens work end to end: join with a room code, pick your name, name your team,
submit proofs, bingo, vote, mountain, schedule.

Two back ends, chosen in `js/config.js`:
- **Demo** (default, empty config): everything lives in the browser, nothing is shared.
- **Supabase** (fill the config): data is shared live between all phones. Setup in
  `docs/SUPABASE_SETUP.md`.

Still to build: real photo uploads (Supabase Storage) and the organisers' back office
(validating proofs; until it exists, `AUTO_APPROVE` lets a submission award its own points).

## Try it

Open `index.html` in a browser and use the room code `DEMO`.
There is no build step: plain HTML, CSS and JavaScript.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell and tab bar |
| `css/style.css` | The whole look, including the mascot's movements |
| `js/seed.js` | Content: teams, challenges, bingo squares, schedule, votes |
| `js/config.js` | Supabase URL + anon key + flags (empty = demo) |
| `js/store.js` | Demo data layer (browser only); steps aside when Supabase is configured |
| `js/store.supabase.js` | Shared data layer: same `Store` API, backed by Supabase + Realtime |
| `js/mascot.js` | The salamander drawing and its poses |
| `js/mountain.js` | The leaderboard mountain |
| `js/app.js` | Screens and interactions (talks only to `Store`) |
| `supabase/schema.sql` | Tables, Realtime and access rules to run once in Supabase |
| `docs/SUPABASE_SETUP.md` | Step-by-step to create the project and connect it |
