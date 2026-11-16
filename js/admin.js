// The organisers' back office (admin.html).
// Screens: Overview, Proofs, Teams, Points, Challenges, Programme, Settings.
// It only talks to `Store` (js/store.js). On the real site you sign in with a Supabase
// account listed in the `admins` table, and the database refuses everything else.
(function () {
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var root = $('#admin'), lightbox = $('#lightbox');
  var TABS = [['overview', 'Overview'], ['proofs', 'Proofs'], ['teams', 'Teams'], ['points', 'Points'],
    ['challenges', 'Challenges'], ['programme', 'Programme'], ['settings', 'Settings']];

  // what the screens remember between two renders
  var ui = {
    proofs: { status: 'pending', teamId: '', ref: '' },
    day: null,            // day shown in Challenges / Programme / Points (null = today)
    rejecting: null,      // proof id whose rejection note is open
    confirm: null,        // key of the two-step button waiting for a second click
    editCh: null,         // challenge being edited ('new' = adding)
    editEv: null,         // programme line being edited
    prefill: null,        // { input id: value } applied once after the next render
    busy: false,
    loginError: '',
    flash: ''             // one-line confirmation shown at the top
  };

  function tab() {
    var t = location.hash.replace('#', '');
    return TABS.some(function (x) { return x[0] === t; }) ? t : 'overview';
  }
  function day() { return ui.day || Store.today(); }
  function dayLabel(key) { var d = SEED.days.filter(function (x) { return x[0] === key; })[0]; return d ? d[1] : key; }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 60 * 24) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function teamChip(t) {
    var face = t.avatar ? '<span class="face" style="background-image:url(' + t.avatar + ')"></span>'
      : '<span class="face" style="background:' + t.color + '">' + esc((Store.displayName(t)[0] || '?').toUpperCase()) + '</span>';
    return '<span class="tchip">' + face + '<b>' + esc(Store.displayName(t)) + '</b></span>';
  }
  function dayPills() {
    var cur = day(), today = Store.today();
    return '<div class="days">' + SEED.days.map(function (d) {
      return '<button class="day' + (d[0] === cur ? ' on' : '') + '" data-act="day" data-day="' + d[0] + '">' + esc(d[1]) + (d[0] === today ? ' ·' : '') + '</button>';
    }).join('') + '</div><p class="fine">The dot marks the day players see as “today”.</p>';
  }
  // a destructive button that asks once more before doing anything
  function sure(key, label, yes, act, attrs) {
    if (ui.confirm === key) {
      return '<span class="sure"><button class="btn small no" data-act="' + act + '" ' + (attrs || '') + '>' + esc(yes) + '</button>' +
        '<button class="btn small quiet" data-act="cancel">Cancel</button></span>';
    }
    return '<button class="btn small quiet" data-act="ask" data-key="' + esc(key) + '">' + esc(label) + '</button>';
  }
  function teamOptions(selected, all) {
    return (all ? '<option value="">' + esc(all) + '</option>' : '') + Store.teams().map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' + esc(Store.displayName(t)) + (t.name ? ' (' + esc(t.room) + ')' : '') + '</option>';
    }).join('');
  }

  // ---------- sign in ----------
  function viewLogin(session) {
    if (session.status === 'checking') return '<section class="gate"><h1>Back office</h1><p class="lead">Checking your session…</p></section>';
    if (session.status === 'denied') {
      return '<section class="gate"><h1>Not an organiser</h1><p class="lead"><b>' + esc(session.email) + '</b> is signed in but is not on the organisers list.</p>' +
        '<p class="fine">Ask whoever manages the Supabase project to add this account to the <code>admins</code> table (docs/SUPABASE_SETUP.md).</p>' +
        '<button class="btn" data-act="logout">Sign out</button><p class="hint"><a class="link" href="index.html">Back to the app</a></p></section>';
    }
    return '<section class="gate"><h1>Back office</h1><p class="lead">Organisers only. Sign in with your organiser account.</p>' +
      '<form data-form="login"><input id="lg-email" class="field" type="email" autocomplete="username" placeholder="Email" aria-label="Email">' +
      '<input id="lg-pass" class="field" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password">' +
      '<p class="error">' + esc(ui.loginError) + '</p><button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'Signing in…' : 'Sign in') + '</button></form>' +
      '<p class="hint"><a class="link" href="index.html">Back to the app</a></p></section>';
  }

  // ---------- overview ----------
  function waitingByTeam() {
    var map = {}, list = [];
    Store.proofs({ status: 'pending' }).forEach(function (p) {
      if (!map[p.team.id]) { map[p.team.id] = { team: p.team, n: 0, oldest: p.at }; list.push(map[p.team.id]); }
      map[p.team.id].n++;
    });
    return list.sort(function (a, b) { return String(a.oldest).localeCompare(String(b.oldest)); });
  }
  function viewOverview() {
    var teams = Store.teams(), players = Store.players();
    var total = teams.reduce(function (n, t) { return n + t.members.length; }, 0);
    var active = teams.filter(function (t) { return Store.players(t.id).length; }).length;
    var pending = Store.proofs({ status: 'pending' }).length, approved = Store.proofs({ status: 'approved' }).length;
    var awarded = teams.reduce(function (n, t) { return n + Store.points(t.id); }, 0);
    var tiles = [
      [players.length + ' / ' + total, 'players have joined', '#teams'],
      [active + ' / ' + teams.length, 'rooms with someone in', '#teams'],
      [pending, pending === 1 ? 'proof to review' : 'proofs to review', '#proofs', pending ? 'hot' : ''],
      [approved, 'proofs approved', '#proofs'],
      [awarded, 'points on the mountain', '#points']
    ].map(function (t) {
      return '<a class="tile ' + (t[3] || '') + '" href="' + t[2] + '"><b>' + t[0] + '</b><span>' + t[1] + '</span></a>';
    }).join('');

    var waiting = waitingByTeam().map(function (w) {
      return '<li>' + teamChip(w.team) + '<span class="grow fine">' + plural(w.n, 'proof') + ' waiting · oldest ' + ago(w.oldest) + '</span>' +
        '<button class="btn small" data-act="review-team" data-id="' + w.team.id + '">Review</button></li>';
    }).join('');
    var races = Store.challenges(Store.today()).filter(function (c) {
      return c.kind === 'race' && Store.raceResults(c.id).length && !Store.podiumAwarded(c);
    }).map(function (c) {
      return '<li><span class="grow"><b>' + esc(c.title) + '</b> <span class="fine">· ' + plural(Store.raceResults(c.id).length, 'approved result') + ', podium not awarded yet</span></span>' +
        '<a class="btn small" href="#points">Podium</a></li>';
    }).join('');
    var empty = teams.filter(function (t) { return !Store.players(t.id).length; });

    var who = teams.map(function (t) {
      return '<li><span class="who-team">' + teamChip(t) + '<span class="fine">' + Store.players(t.id).length + '/' + t.members.length + '</span></span><span class="members">' +
        t.members.map(function (n) { return '<span class="m' + (Store.hasJoined(t.id, n) ? ' in' : '') + '">' + esc(n) + '</span>'; }).join('') + '</span></li>';
    }).join('');

    return '<h1>Overview</h1><div class="tiles">' + tiles + '</div>' +
      '<section class="box"><h2>Needs you</h2>' +
      (waiting || races ? '<ul class="rows">' + waiting + races + '</ul>' : '<p class="fine">Nothing is waiting. 🎉</p>') + '</section>' +
      '<section class="box"><h2>Who is in <span>highlighted = has opened the app and picked their name</span></h2><ul class="who">' + who + '</ul>' +
      (empty.length ? '<p class="fine">No one yet from: ' + empty.map(function (t) { return esc(t.room); }).join(', ') + '.</p>' : '') + '</section>';
  }

  // ---------- proofs ----------
  function proofCard(p) {
    var actions;
    if (p.status === 'pending') {
      actions = ui.rejecting === p.id
        ? '<div class="reject"><input id="rj-note" class="field" maxlength="120" placeholder="Why? (optional, the team sees it)">' +
          '<button class="btn small no" data-act="reject" data-id="' + esc(p.id) + '">Reject</button><button class="btn small quiet" data-act="cancel">Cancel</button></div>'
        : '<div class="acts"><button class="btn small ok" data-act="approve" data-id="' + esc(p.id) + '">Approve · +' + p.worth + '</button>' +
          '<button class="btn small quiet" data-act="reject-open" data-id="' + esc(p.id) + '">Reject</button></div>';
    } else {
      actions = '<div class="acts"><span class="chip ' + (p.status === 'approved' ? 'ok' : 'no') + '">' + (p.status === 'approved' ? 'Approved' : 'Rejected') + '</span>' +
        '<button class="btn small quiet" data-act="reopen" data-id="' + esc(p.id) + '">Undo</button></div>' +
        (p.note ? '<p class="fine">Note: ' + esc(p.note) + '</p>' : '');
    }
    return '<article class="proof"><button class="shot" data-act="zoom" data-id="' + esc(p.id) + '" data-photo="' + esc(p.id) + '" aria-label="See the photo full size"></button>' +
      '<div class="proof-main">' + teamChip(p.team) +
      '<p class="what">' + (p.kind === 'bingo' ? '<span class="kind">Bingo</span> ' : '') + esc(p.text) +
      (p.value ? ' <b class="num">' + esc(p.value) + ' ' + esc(p.unit) + '</b>' : '') + '</p>' +
      '<p class="fine">sent by ' + esc(p.by || '?') + ' · ' + ago(p.at) + '</p>' + actions + '</div></article>';
  }
  function viewProofs() {
    var f = ui.proofs, list = Store.proofs(f);
    var count = function (s) { return Store.proofs({ status: s, teamId: f.teamId, ref: f.ref }).length; };
    var seg = [['pending', 'To review'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(function (s) {
      return '<button class="seg' + (f.status === s[0] ? ' on' : '') + '" data-act="status" data-status="' + s[0] + '">' + s[1] + ' <i>' + count(s[0]) + '</i></button>';
    }).join('');
    var refs = '<option value="">All challenges and bingo</option>' + Store.challenges().map(function (c) {
      return '<option value="challenge:' + esc(c.id) + '"' + (f.ref === 'challenge:' + c.id ? ' selected' : '') + '>' + esc(dayLabel(c.day)) + ' · ' + esc(c.title) + '</option>';
    }).join('') + '<option value="bingo"' + (f.ref === 'bingo' ? ' selected' : '') + '>Bingo squares</option>';
    var body;
    if (!list.length) {
      body = '<p class="empty">' + (f.status === 'pending' ? 'Nothing to review' + (f.teamId || f.ref ? ' with these filters' : '') + '. 🎉' : 'Nothing here yet.') + '</p>';
    } else if (f.status === 'pending' && !f.teamId) {
      // which rooms have photos waiting: one block per room, the longest-waiting first
      var groups = {}, order = [];
      list.forEach(function (p) { if (!groups[p.team.id]) { groups[p.team.id] = []; order.push(p.team.id); } groups[p.team.id].push(p); });
      body = order.map(function (id) {
        return '<div class="group"><h3>' + teamChip(Store.team(id)) + '<span class="fine">' + plural(groups[id].length, 'proof') + ' waiting</span></h3>' +
          groups[id].map(proofCard).join('') + '</div>';
      }).join('');
    } else {
      body = list.map(proofCard).join('');
    }
    return '<h1>Proofs</h1><div class="filters"><div class="segs">' + seg + '</div>' +
      '<select id="f-team" class="field" data-change="f-team" aria-label="Team">' + teamOptions(f.teamId, 'All teams') + '</select>' +
      '<select id="f-ref" class="field" data-change="f-ref" aria-label="Challenge">' + refs + '</select></div>' + body;
  }

  // ---------- teams ----------
  function viewTeams() {
    var rank = {};
    Store.ranking().forEach(function (e, i) { rank[e.team.id] = i + 1; });
    var total = 0, inn = 0;
    var cards = Store.teams().map(function (t) {
      var n = { pending: Store.proofs({ status: 'pending', teamId: t.id }).length, approved: Store.proofs({ status: 'approved', teamId: t.id }).length,
        rejected: Store.proofs({ status: 'rejected', teamId: t.id }).length };
      total += t.members.length;
      var members = t.members.map(function (m) {
        var p = Store.players(t.id).filter(function (x) { return x.name === m; })[0];
        if (p) inn++;
        return '<span class="m' + (p ? ' in' : '') + '" title="' + (p ? 'Joined ' + ago(p.joinedAt) + ', last seen ' + ago(p.lastSeen) : 'Has not joined yet') + '">' + esc(m) + '</span>';
      }).join('');
      return '<article class="team' + (n.pending ? ' hot' : '') + '"><header>' + teamChip(t) +
        '<span class="pts">' + Store.points(t.id) + ' pts · #' + rank[t.id] + '</span></header>' +
        '<p class="fine">' + esc(t.room) + ' · code <code>' + esc(t.code) + '</code>' + (t.name ? '' : ' · no team name yet') + '</p>' +
        '<div class="members">' + members + '</div>' +
        '<p class="counts"><span class="chip pending">' + n.pending + ' waiting</span> <span class="chip ok">' + n.approved + ' approved</span> <span class="chip no">' + n.rejected + ' rejected</span></p>' +
        '<div class="acts"><button class="btn small" data-act="review-team" data-id="' + t.id + '">Proofs</button>' +
        '<button class="btn small quiet" data-act="award-team" data-id="' + t.id + '">Give points</button>' +
        (t.name || t.avatar ? sure('clear-' + t.id, 'Clear name & photo', 'Yes, clear', 'clear-team', 'data-id="' + t.id + '"') : '') + '</div></article>';
    }).join('');
    return '<h1>Teams</h1><p class="lead-left">' + inn + ' of ' + total + ' players have joined. Highlighted names are in; hover or long-press a name for when.</p><div class="grid">' + cards + '</div>';
  }

  // ---------- points ----------
  function viewPoints() {
    var d = day();
    var races = Store.challenges(d).filter(function (c) { return c.kind === 'race'; }).map(function (c) {
      var res = Store.raceResults(c.id), pts = Store.podiumPoints(c), done = Store.podiumAwarded(c);
      var rows = res.map(function (r, i) {
        return '<li><span class="rank">' + (i + 1) + '</span>' + teamChip(r.team) + '<span class="grow"></span><b class="num">' + r.value + ' ' + esc(c.unit) + '</b>' +
          '<span class="fine w60">' + (i < 3 ? '+' + pts[i] : '') + '</span></li>';
      }).join('');
      return '<div class="race"><h3>' + esc(c.title) + ' <span class="fine">best approved number per room</span></h3>' +
        (rows ? '<ul class="rows">' + rows + '</ul>' : '<p class="fine">No approved result yet. Approve the proofs first.</p>') +
        (done ? '<p><span class="chip ok">Podium awarded</span></p>'
          : (res.length ? '<button class="btn small" data-act="podium" data-id="' + esc(c.id) + '">Award the podium · ' + pts.slice(0, Math.min(3, res.length)).join(' / ') + '</button>' : '')) + '</div>';
    }).join('') || '<p class="fine">No race on ' + esc(dayLabel(d)) + '.</p>';

    var votes = SEED.votes.map(function (v) {
      var t = Store.tally(v.id);
      return '<div class="race"><h3>' + esc(v.title) + ' <span class="fine">' + plural(t.reduce(function (n, x) { return n + x.votes; }, 0), 'vote') + '</span></h3>' +
        (t.length ? '<ul class="rows">' + t.map(function (x, i) {
          return '<li><span class="rank">' + (i + 1) + '</span>' + teamChip(x.team) + '<span class="grow"></span><b class="num">' + x.votes + '</b></li>';
        }).join('') + '</ul>' : '<p class="fine">No votes yet.</p>') + '</div>';
    }).join('');

    var lines = Store.allLedger().slice(0, 40).map(function (l) {
      var t = Store.team(l.teamId);
      return '<li>' + (t ? teamChip(t) : '') + '<span class="grow">' + esc(l.label) + ' <span class="fine">· ' + ago(l.at) + '</span></span><b class="num">' + (l.points < 0 ? '−' + (-l.points) : '+' + l.points) + '</b>' +
        sure('line-' + l.id, 'Remove', 'Remove', 'remove-line', 'data-id="' + esc(l.id) + '"') + '</li>';
    }).join('');

    var board = Store.ranking().map(function (e, i) {
      return '<li><span class="rank">' + (i + 1) + '</span>' + teamChip(e.team) + '<span class="grow"></span><b class="num">' + e.points + '</b></li>';
    }).join('');

    return '<h1>Points</h1>' +
      '<section class="box"><h2>Give or take points <span>for a podium done by hand, a prize, a penalty…</span></h2>' +
      '<form data-form="award" class="inline"><select id="aw-team" class="field" aria-label="Team">' + teamOptions('', 'Choose a team') + '</select>' +
      '<input id="aw-label" class="field grow" maxlength="80" placeholder="Reason, e.g. Best rookie">' +
      '<input id="aw-points" class="field w90" type="number" step="1" placeholder="Points">' +
      '<button class="btn small" type="submit">Add</button></form><p class="error" id="aw-error"></p></section>' +
      '<section class="box"><h2>Race podiums</h2>' + dayPills() + races + '</section>' +
      '<section class="box"><h2>Votes</h2>' + votes + '</section>' +
      '<div class="two"><section class="box"><h2>Leaderboard</h2><ul class="rows">' + board + '</ul></section>' +
      '<section class="box"><h2>Latest lines of points <span>bingo line bonuses are worked out automatically and are not listed</span></h2>' +
      (lines ? '<ul class="rows">' + lines + '</ul>' : '<p class="fine">No points awarded yet.</p>') + '</section></div>';
  }

  // ---------- challenges ----------
  function challengeForm(c) {
    var isNew = !c;
    return '<form data-form="challenge" class="form"><h3>' + (isNew ? 'New challenge for ' + esc(dayLabel(day())) : 'Edit challenge') + '</h3>' +
      '<div class="pair"><label>Type<select id="ch-kind" class="field"><option value="mission">Mission (photo, fixed points)</option><option value="race">Race (number + photo, podium)</option></select></label>' +
      '<label>Points<input id="ch-points" class="field" type="number" min="0" max="1000" step="5" placeholder="30"></label></div>' +
      '<label>Title<input id="ch-title" class="field" maxlength="80" placeholder="First chair"></label>' +
      '<label>What to do<textarea id="ch-desc" class="field" rows="2" maxlength="300" placeholder="Photo of your room on a chairlift before 10:00."></textarea></label>' +
      '<div class="pair"><label>Closes at<input id="ch-closes" class="field" maxlength="12" placeholder="17:00"></label>' +
      '<label>Unit (races)<input id="ch-unit" class="field" maxlength="10" placeholder="km"></label></div>' +
      '<label>Prize line (optional)<input id="ch-prize" class="field" maxlength="120" placeholder="100 / 70 / 50 for the top three, 20 for taking part"></label>' +
      '<p class="fine">Mission: approving a proof gives the points. Race: approving gives ' + SEED.racePart + ' for taking part, and the podium (100% / 70% / 50% of the points) is awarded in Points.</p>' +
      '<p class="error" id="ch-error"></p><div class="acts"><button class="btn small" type="submit">' + (isNew ? 'Add challenge' : 'Save') + '</button>' +
      '<button class="btn small quiet" type="button" data-act="cancel">Cancel</button></div></form>';
  }
  function viewChallenges() {
    var d = day();
    var list = Store.challenges(d).map(function (c) {
      if (ui.editCh === c.id) return challengeForm(c);
      var n = Store.proofs({ ref: 'challenge:' + c.id }).length;
      return '<article class="item"><div class="grow"><p><span class="kind ' + c.kind + '">' + (c.kind === 'race' ? 'Race' : 'Mission') + '</span> <b>' + esc(c.title) + '</b> · ' + c.points + ' pts' +
        (c.closes ? ' · closes ' + esc(c.closes) : '') + '</p><p class="fine">' + esc(c.desc) + (c.prize ? ' — ' + esc(c.prize) : '') + '</p>' +
        '<p class="fine">' + plural(n, 'proof') + ' received</p></div>' +
        '<div class="acts"><button class="btn small quiet" data-act="edit-ch" data-id="' + esc(c.id) + '">Edit</button>' +
        sure('ch-' + c.id, 'Delete', 'Yes, delete', 'delete-ch', 'data-id="' + esc(c.id) + '"') + '</div></article>';
    }).join('') || '<p class="empty">No challenge on ' + esc(dayLabel(d)) + ' yet.</p>';
    return '<h1>Challenges</h1>' + dayPills() + list +
      (ui.editCh === 'new' ? challengeForm(null) : '<button class="btn small add" data-act="new-ch">+ Add a challenge for ' + esc(dayLabel(d)) + '</button>');
  }

  // ---------- programme ----------
  function eventForm(e) {
    return '<form data-form="event" class="form"><h3>' + (e ? 'Edit line' : 'New line for ' + esc(dayLabel(day()))) + '</h3>' +
      '<div class="pair"><label>When<input id="ev-time" class="field" maxlength="12" placeholder="18:00 or Evening"></label>' +
      '<label>What<input id="ev-title" class="field" maxlength="80" placeholder="Raclette night"></label></div>' +
      '<label>Details (optional)<input id="ev-detail" class="field" maxlength="160" placeholder="Bring your appetite."></label>' +
      '<p class="error" id="ev-error"></p><div class="acts"><button class="btn small" type="submit">' + (e ? 'Save' : 'Add to the programme') + '</button>' +
      '<button class="btn small quiet" type="button" data-act="cancel">Cancel</button></div></form>';
  }
  function viewProgramme() {
    var d = day(), evs = Store.events(d);
    var list = evs.map(function (e, i) {
      if (ui.editEv === e.id) return eventForm(e);
      return '<article class="item"><time>' + esc(e.time) + '</time><div class="grow"><p><b>' + esc(e.title) + '</b></p>' + (e.detail ? '<p class="fine">' + esc(e.detail) + '</p>' : '') + '</div>' +
        '<div class="acts"><button class="btn small quiet icon" data-act="move-ev" data-id="' + esc(e.id) + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn small quiet icon" data-act="move-ev" data-id="' + esc(e.id) + '" data-dir="1" aria-label="Move down"' + (i === evs.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn small quiet" data-act="edit-ev" data-id="' + esc(e.id) + '">Edit</button>' +
        sure('ev-' + e.id, 'Delete', 'Yes, delete', 'delete-ev', 'data-id="' + esc(e.id) + '"') + '</div></article>';
    }).join('') || '<p class="empty">Nothing planned on ' + esc(dayLabel(d)) + ' yet.</p>';
    return '<h1>Programme</h1><p class="lead-left">Every change shows on all phones straight away.</p>' + dayPills() + list +
      (ui.editEv === 'new' ? eventForm(null) : '<button class="btn small add" data-act="new-ev">+ Add a line for ' + esc(dayLabel(d)) + '</button>');
  }

  // ---------- settings ----------
  function viewSettings() {
    var s = Store.settings(), session = Store.admin.session();
    var days = '<option value="auto"' + (s.today === 'auto' || !s.today ? ' selected' : '') + '>Automatic (follows the calendar: now ' + esc(dayLabel(Store.today())) + ')</option>' +
      SEED.days.map(function (d) { return '<option value="' + d[0] + '"' + (s.today === d[0] ? ' selected' : '') + '>' + esc(d[1]) + ' January</option>'; }).join('');
    return '<h1>Settings</h1>' +
      '<section class="box"><h2>Which day is “today” <span>decides which challenges players see</span></h2>' +
      '<select id="set-today" class="field" data-change="set-today" aria-label="Today">' + days + '</select>' +
      '<p class="fine">Before and after the trip, Automatic shows ' + esc(dayLabel(SEED.today)) + '. Pick a day to rehearse it.</p></section>' +
      '<section class="box"><h2>The salamander’s message <span>shown at the top of Today, after “Hi name!”</span></h2>' +
      '<form data-form="message"><textarea id="set-message" class="field" rows="3" maxlength="240">' + esc(Store.message()) + '</textarea>' +
      '<div class="acts"><button class="btn small" type="submit">Save message</button></div></form></section>' +
      '<section class="box"><h2>Organisers</h2>' + (Store.demo
        ? '<p class="fine">Demo mode: there is no sign-in and nothing leaves this browser.</p>'
        : '<p>Signed in as <b>' + esc(session.email) + '</b>.</p><p class="fine">To add an organiser: create the user in Supabase (Authentication → Users), then add it to the <code>admins</code> table. The two commands are in docs/SUPABASE_SETUP.md.</p>') + '</section>' +
      '<section class="box danger"><h2>Restart from zero</h2>' +
      '<p>Deletes every point, proof, photo, vote and joined player, and clears team names and photos' + (Store.demo ? '' : ' <b>for everyone</b>') + '. Every phone is sent back to the room-code screen. Challenges and the programme are kept.</p>' +
      sure('restart', 'Restart from zero…', 'Yes, wipe everything', 'restart') + '</section>';
  }

  // ---------- frame ----------
  function frame(inner) {
    var session = Store.admin.session(), cur = tab(), pending = Store.proofs({ status: 'pending' }).length;
    var nav = TABS.map(function (t) {
      return '<a href="#' + t[0] + '" class="' + (cur === t[0] ? 'on' : '') + '">' + t[1] + (t[0] === 'proofs' && pending ? ' <i>' + pending + '</i>' : '') + '</a>';
    }).join('');
    return '<header class="top"><div class="brand">' + Mascot.svg('idle') + '<b>Back office</b></div>' +
      '<div class="top-right">' + (Store.demo ? '<span class="chip pending">Demo data</span>' : '<span class="fine">' + esc(session.email) + '</span>') +
      '<a class="btn small quiet" href="index.html">Open the app</a>' +
      (Store.demo ? '' : '<button class="btn small quiet" data-act="logout">Sign out</button>') + '</div></header>' +
      '<nav class="tabs" aria-label="Back office">' + nav + '</nav>' +
      '<main class="main">' + (ui.flash ? '<p class="flash">' + esc(ui.flash) + '</p>' : '') + inner + '</main>';
  }

  function render() {
    var session = Store.admin.session();
    // keep whatever is being typed
    var keep = {}, focusId = document.activeElement && document.activeElement.id;
    Array.prototype.forEach.call(root.querySelectorAll('input[id], textarea[id], select[id]'), function (i) { if (i.type !== 'password' || i.value) keep[i.id] = i.value; });
    var html;
    if (session.status !== 'in') html = viewLogin(session);
    else if (!Store.ready()) html = frame('<p class="empty">Loading…</p>');
    else html = frame({ overview: viewOverview, proofs: viewProofs, teams: viewTeams, points: viewPoints,
      challenges: viewChallenges, programme: viewProgramme, settings: viewSettings }[tab()]());
    document.body.classList.toggle('gated', session.status !== 'in');
    root.innerHTML = html;
    var fill = ui.prefill || {};
    ui.prefill = null;
    var skip = { 'f-team': 1, 'f-ref': 1, 'set-today': 1 };            // these always show the stored value
    for (var id in keep) { var el = document.getElementById(id); if (el && !(id in fill) && !skip[id]) el.value = keep[id]; }
    for (var f in fill) { var el2 = document.getElementById(f); if (el2) el2.value = fill[f]; }
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
    Store.hydratePhotos(root);
  }
  function flash(msg) {
    ui.flash = msg; render();
    clearTimeout(flash.t); flash.t = setTimeout(function () { ui.flash = ''; render(); }, 3500);
  }
  function clearInputs(ids) { ui.prefill = ui.prefill || {}; ids.forEach(function (i) { ui.prefill[i] = ''; }); }

  // ---------- actions ----------
  var actions = {
    'ask': function (el) { ui.confirm = el.getAttribute('data-key'); render(); },
    'cancel': function () { ui.confirm = null; ui.rejecting = null; ui.editCh = null; ui.editEv = null; render(); },
    'logout': function () { Store.admin.logout(); },
    'day': function (el) { ui.day = el.getAttribute('data-day'); ui.editCh = null; ui.editEv = null; render(); },
    'status': function (el) { ui.proofs.status = el.getAttribute('data-status'); ui.rejecting = null; render(); },
    'review-team': function (el) { ui.proofs = { status: 'pending', teamId: el.getAttribute('data-id'), ref: '' }; location.hash = 'proofs'; render(); },
    'award-team': function (el) { ui.prefill = { 'aw-team': el.getAttribute('data-id') }; location.hash = 'points'; render(); var f = $('#aw-label'); if (f) f.focus(); },
    'zoom': function (el) {
      Store.loadPhoto(el.getAttribute('data-id')).then(function (url) {
        if (!url) return;
        lightbox.innerHTML = '<img alt="Proof photo, full size" src="' + url + '"><button class="close" aria-label="Close">×</button>';
        lightbox.hidden = false;
      });
    },
    'approve': function (el) {
      el.disabled = true;
      Store.approveSubmission(el.getAttribute('data-id')).then(function (ok) {
        if (ok === false) flash('Someone else already dealt with that proof.');
      });
    },
    'reject-open': function (el) { ui.rejecting = el.getAttribute('data-id'); clearInputs(['rj-note']); render(); var n = $('#rj-note'); if (n) n.focus(); },
    'reject': function (el) {
      var note = ($('#rj-note') || {}).value || '';
      ui.rejecting = null;
      Store.rejectSubmission(el.getAttribute('data-id'), note.trim());
    },
    'reopen': function (el) { Store.reopenSubmission(el.getAttribute('data-id')).then(function (ok) { if (ok) flash('Back in “To review”. Its points were removed.'); }); },
    'clear-team': function (el) { ui.confirm = null; Store.resetTeam(el.getAttribute('data-id')).then(function () { flash('Team name and photo cleared.'); }); },
    'podium': function (el) { el.disabled = true; Store.awardPodium(el.getAttribute('data-id')).then(function () { flash('Podium awarded.'); }); },
    'remove-line': function (el) { ui.confirm = null; Store.removeLedger(el.getAttribute('data-id')); },
    'new-ch': function () { ui.editCh = 'new'; clearInputs(['ch-title', 'ch-desc', 'ch-points', 'ch-closes', 'ch-unit', 'ch-prize']); ui.prefill['ch-kind'] = 'mission'; render(); $('#ch-title').focus(); },
    'edit-ch': function (el) {
      var c = Store.challenge(el.getAttribute('data-id')); if (!c) return;
      ui.editCh = c.id;
      ui.prefill = { 'ch-kind': c.kind, 'ch-title': c.title, 'ch-desc': c.desc, 'ch-points': c.points, 'ch-closes': c.closes, 'ch-unit': c.unit, 'ch-prize': c.prize };
      render();
    },
    'delete-ch': function (el) { ui.confirm = null; Store.deleteChallenge(el.getAttribute('data-id')); },
    'new-ev': function () { ui.editEv = 'new'; clearInputs(['ev-time', 'ev-title', 'ev-detail']); render(); $('#ev-time').focus(); },
    'edit-ev': function (el) {
      var id = el.getAttribute('data-id'), e = Store.events(day()).filter(function (x) { return x.id === id; })[0]; if (!e) return;
      ui.editEv = id; ui.prefill = { 'ev-time': e.time, 'ev-title': e.title, 'ev-detail': e.detail };
      render();
    },
    'delete-ev': function (el) { ui.confirm = null; Store.deleteEvent(el.getAttribute('data-id')); },
    'move-ev': function (el) { Store.moveEvent(el.getAttribute('data-id'), +el.getAttribute('data-dir')); },
    'restart': function () { ui.confirm = null; Store.restart().then(function (ok) { if (ok) flash('Restarted from zero. Every phone is back on the room-code screen.'); }); }
  };

  document.addEventListener('click', function (e) {
    if (!lightbox.hidden && e.target.closest('#lightbox')) { lightbox.hidden = true; lightbox.innerHTML = ''; return; }
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lightbox.hidden) { lightbox.hidden = true; lightbox.innerHTML = ''; } });
  document.addEventListener('change', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-change');
    if (k === 'f-team') { ui.proofs.teamId = e.target.value; render(); }
    if (k === 'f-ref') { ui.proofs.ref = e.target.value; render(); }
    if (k === 'set-today') Store.setSetting('today', e.target.value).then(function (ok) { if (ok) flash('Saved. Players now see ' + dayLabel(Store.today()) + '.'); });
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var kind = e.target.getAttribute('data-form'), val = function (id) { return ($('#' + id).value || '').trim(); };
    if (kind === 'login') {
      ui.busy = true; ui.loginError = ''; render();
      Store.admin.login(val('lg-email'), $('#lg-pass').value).then(function () { ui.busy = false; render(); }, function (err) {
        ui.busy = false; ui.loginError = (err && err.message) || 'Could not sign in.'; render();
      });
    } else if (kind === 'award') {
      var team = val('aw-team'), label = val('aw-label'), pts = parseInt(val('aw-points'), 10);
      if (!team || !label || !pts) { $('#aw-error').textContent = 'Choose a team, give a reason, and enter the points (use a minus sign to take points away).'; return; }
      clearInputs(['aw-team', 'aw-label', 'aw-points']);
      Store.award(team, label, pts).then(function (ok) { if (ok) flash((pts > 0 ? '+' : '') + pts + ' for ' + Store.displayName(Store.team(team)) + '.'); });
    } else if (kind === 'challenge') {
      var c = { kind: val('ch-kind'), title: val('ch-title'), desc: val('ch-desc'), points: parseInt(val('ch-points'), 10), closes: val('ch-closes'), unit: val('ch-unit'), prize: val('ch-prize') };
      if (!c.title || isNaN(c.points) || c.points < 0 || c.points > 1000) { $('#ch-error').textContent = 'Give it a title and a number of points between 0 and 1000.'; return; }
      if (c.kind === 'race' && !c.unit) { $('#ch-error').textContent = 'A race needs a unit (km, km/h…).'; return; }
      if (ui.editCh && ui.editCh !== 'new') c.id = ui.editCh; else c.day = day();
      ui.editCh = null;
      Store.saveChallenge(c).then(function (ok) { if (ok) flash('Challenge saved.'); });
    } else if (kind === 'event') {
      var ev = { time: val('ev-time'), title: val('ev-title'), detail: val('ev-detail') };
      if (!ev.title) { $('#ev-error').textContent = 'Say what is happening.'; return; }
      if (ui.editEv && ui.editEv !== 'new') ev.id = ui.editEv; else ev.day = day();
      ui.editEv = null;
      Store.saveEvent(ev).then(function (ok) { if (ok) flash('Programme updated.'); });
    } else if (kind === 'message') {
      Store.setSetting('message', val('set-message')).then(function (ok) { if (ok) flash('Message saved.'); });
    }
  });
  window.addEventListener('hashchange', function () { ui.confirm = null; ui.rejecting = null; ui.editCh = null; ui.editEv = null; window.scrollTo(0, 0); render(); });

  Store.on(function (evt) {
    if (evt.type === 'error') { flash(evt.message); return; }
    if (evt.type === 'approved' || evt.type === 'rejected') return;      // player toasts, not for this page
    render();
  });
  render();
})();
