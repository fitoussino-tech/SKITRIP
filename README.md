# MIM28 Ski Trip app

A phone-first web app for the INSEAD MIM28 ski trip (Les Menuires, 4-9 January 2027).
Rooms compete for points through daily challenges, a bingo card and votes.
The leaderboard is a mountain that each team's alpinist climbs, and a salamander hosts it all.

## Status

Player screens work end to end on **demo data** (nothing is shared between phones yet):
join with a room code, pick your name, name your team, submit proofs, bingo, vote, mountain, schedule.

Still to build: the Supabase back end, real photo uploads, and the organisers' back office.

## Try it

Open `index.html` in a browser and use the room code `DEMO`.
There is no build step: plain HTML, CSS and JavaScript.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell and tab bar |
| `css/style.css` | The whole look, including the mascot's movements |
| `js/seed.js` | Demo content: teams, challenges, bingo squares, schedule |
| `js/store.js` | Data layer. The only file that changes when Supabase is plugged in |
| `js/mascot.js` | The salamander drawing and its poses |
| `js/mountain.js` | The leaderboard mountain |
| `js/app.js` | Screens and interactions |
