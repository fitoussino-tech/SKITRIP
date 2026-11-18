# MIM28 Ski Trip app

A phone-first web app for the INSEAD MIM28 ski trip (Les Menuires, 4-9 January 2027).
Rooms compete for points through daily challenges, a bingo card and votes.
The leaderboard is a mountain that each team's alpinist climbs, and a salamander hosts it all.

## Two pages

- `index.html` - the player app: join with a room code, name your team, send proofs,
  bingo, vote, feed of approved photos, mountain, programme.
- `admin.html` - the organisers' back office (linked as "Organisers" on the welcome screen):
  - **Overview** - who has joined, how many proofs are waiting and for which rooms.
  - **Proofs** - review photos room by room, approve, reject with a note, undo.
  - **Teams** - every room: who is in, points, proof counts, clear a name or photo.
  - **Points** - race podiums, vote results, give or take points by hand, remove a line.
  - **Challenges** - create, edit and delete the challenges of each day.
  - **Programme** - add, edit, reorder and delete every line of the schedule.
  - **Settings** - which day is "today", the salamander's message, restart from zero.

## Two back ends

Chosen by `js/config.js`:

- **Demo** (empty config): everything lives in the browser. The back office needs no sign-in
  and shares the data with the player app in the same browser, so one person can play both sides.
  "Restart the demo" is at the bottom of the Team tab.
- **Supabase** (config filled): shared live between all phones. Organisers sign in with a
  Supabase account listed in the `admins` table. Setup: `docs/SUPABASE_SETUP.md`.

## Who can do what (Supabase)

Players have no account, only a room code and a name. They can read the game, join, send
proofs (always "pending"), vote, and change a team's name, colour and photo.
Only organisers can approve or reject, award points, and edit challenges, the programme and
settings: the database refuses everyone else, whatever the page does.
Details and the remaining soft spots are at the bottom of `supabase/schema_v3.sql`.

## Try it

Open `index.html` in a browser. With an empty config, use the room code `DEMO`.
There is no build step: plain HTML, CSS and JavaScript.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `admin.html` | The two pages |
| `css/style.css`, `css/admin.css` | The look (player app, back office) |
| `js/seed.js` | Rooms, bingo squares, the vote, trip dates; starter challenges and programme for the demo |
| `js/config.js` | Supabase URL + publishable key (empty = demo) |
| `js/store.js` | The data layer and every rule of the game; includes the demo back end |
| `js/store.supabase.js` | The Supabase back end: loads, writes and listens for live changes |
| `js/app.js` | Player screens |
| `js/admin.js` | Back office screens |
| `js/mascot.js` | The salamander |
| `js/mountain.js` | The Mountain tab: the panorama climb. The whole player app is coloured by the time of day: morning 06–11, bluebird day 11–16, golden hour 16–19, neon night 19–06 (add `?time=morning`, `day`, `golden` or `night` to the address to preview one; palettes at the end of `css/style.css`) |
| `supabase/schema.sql`, `schema_v2.sql`, `schema_v3.sql` | Database scripts, to run once each, in order |
| `docs/SUPABASE_SETUP.md` | Step-by-step Supabase setup, including organiser accounts |

## Not built yet

- Rooms, room codes and member names are still defined in `js/seed.js` (demo names).
- Bingo squares and votes are defined in `js/seed.js`, not editable in the back office.
- Photos are stored in a database table. Moving them to Supabase Storage is a later step.
