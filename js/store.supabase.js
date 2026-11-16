// Shared data layer backed by Supabase. Same public shape as the demo Store in
// store.js, so none of the screens (app.js) change. A local in-memory cache keeps
// every getter synchronous; writes go to Supabase and Realtime pushes changes back
// to every connected phone.
//
// Skips itself (leaving the demo store in place) when Supabase is not configured.
(function () {
  var cfg = window.CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;          // not configured -> demo
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[store] Supabase client script missing; staying on demo.');
    return;
  }

  var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var autoApprove = cfg.AUTO_APPROVE !== false;

  var ME_KEY = 'mim28-me-v1';
  var DEVICE_KEY = 'mim28-device-v1';
  var listeners = [];

  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  function deviceId() {
    var id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
      id = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  }
  var VOTER = deviceId();

  // Cache mirrors the demo state. Teams start from SEED so the UI has something to
  // show on first paint; Supabase hydrates name/colour/points right after.
  var state = {
    me: readJSON(ME_KEY),                                   // { teamId, name }
    teams: JSON.parse(JSON.stringify(SEED.teams)),
    ledger: [],                                             // { teamId, label, points }
    submissions: [],                                        // { id, teamId, kind, refId, value, thumb, status, by }
    ballots: {},                                            // voteId -> teamId (this device only)
    lines: {}                                               // teamId -> bingo lines already rewarded
  };

  function emit(evt) { listeners.forEach(function (fn) { fn(evt || {}); }); }

  // ---------- pure helpers (identical to the demo) ----------
  function team(id) { return state.teams.filter(function (t) { return t.id === id; })[0] || null; }
  function points(teamId) {
    return state.ledger.reduce(function (sum, l) { return l.teamId === teamId ? sum + l.points : sum; }, 0);
  }
  function displayName(t) { return t.name || t.room; }
  function bingoCard(teamId) {
    var seed = parseInt(teamId.slice(1), 10) * 9301 + 49297;
    var squares = SEED.bingo.slice();
    for (var i = squares.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      var j = Math.floor(seed / 233280 * (i + 1));
      var tmp = squares[i]; squares[i] = squares[j]; squares[j] = tmp;
    }
    return squares;
  }
  function submissionFor(teamId, kind, refId) {
    var list = state.submissions.filter(function (s) { return s.teamId === teamId && s.kind === kind && s.refId === refId; });
    return list[list.length - 1] || null;
  }
  function completedLines(teamId) {
    var card = bingoCard(teamId).map(function (sq) {
      var s = submissionFor(teamId, 'bingo', sq.id); return !!s && s.status === 'approved';
    });
    var n = 0, r, c, ok;
    for (r = 0; r < 4; r++) { ok = true; for (c = 0; c < 4; c++) ok = ok && card[r * 4 + c]; if (ok) n++; }
    for (c = 0; c < 4; c++) { ok = true; for (r = 0; r < 4; r++) ok = ok && card[r * 4 + c]; if (ok) n++; }
    ok = true; for (r = 0; r < 4; r++) ok = ok && card[r * 5]; if (ok) n++;
    ok = true; for (r = 0; r < 4; r++) ok = ok && card[r * 3 + 3]; if (ok) n++;
    return n;
  }

  // ---------- row mapping ----------
  function mapSub(row) {
    return { id: row.id, teamId: row.team_id, kind: row.kind, refId: row.ref_id,
      value: row.value, thumb: row.thumb, status: row.status, by: row.by };
  }
  function mapLedger(row) { return { teamId: row.team_id, label: row.label, points: row.points }; }

  // ---------- loads ----------
  function loadTeams() {
    return db.from('teams').select('*').then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (row) {
        var t = team(row.id);
        if (t) { t.name = row.name; t.color = row.color; t.room = row.room; t.code = row.code;
          if (row.members) t.members = row.members; }
      });
    });
  }
  function loadLedger() {
    return db.from('ledger').select('*').then(function (res) {
      if (res.error || !res.data) return;
      state.ledger = res.data.map(mapLedger);
    });
  }
  function loadSubmissions() {
    return db.from('submissions').select('*').order('created_at').then(function (res) {
      if (res.error || !res.data) return;
      state.submissions = res.data.map(mapSub);
      state.teams.forEach(function (t) { state.lines[t.id] = completedLines(t.id); });
    });
  }
  function loadMyBallots() {
    return db.from('ballots').select('vote_id, team_id').eq('voter_id', VOTER).then(function (res) {
      if (res.error || !res.data) return;
      var map = {};
      res.data.forEach(function (row) { map[row.vote_id] = row.team_id; });
      state.ballots = map;
    });
  }

  // Seed the teams table the first time (idempotent: existing rows are left as-is,
  // so player-chosen names and colours are never overwritten).
  function seedTeams() {
    var rows = SEED.teams.map(function (t) {
      return { id: t.id, code: t.code, room: t.room, members: t.members, name: t.name, color: t.color };
    });
    return db.from('teams').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  }

  function init() {
    seedTeams()
      .then(function () { return Promise.all([loadTeams(), loadLedger(), loadSubmissions(), loadMyBallots()]); })
      .then(function () { emit({ type: 'ready' }); })
      .catch(function (e) { console.error('[store] init failed', e); });

    db.channel('skitrip')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },
        function () { loadTeams().then(function () { emit({ type: 'teams' }); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger' },
        function () { loadLedger().then(function () { emit({ type: 'ledger' }); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' },
        function () { loadSubmissions().then(function () { emit({ type: 'submissions' }); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ballots' },
        function () { loadMyBallots().then(function () { emit({ type: 'ballots' }); }); })
      .subscribe();
  }

  // ---------- interim approval (no back office yet) ----------
  function approve(sub) {
    var gained = 0, label;
    if (sub.kind === 'bingo') {
      gained = SEED.bingoPoints; label = 'Bingo square';
    } else {
      var ch = SEED.challenges.filter(function (c) { return c.id === sub.refId; })[0];
      if (!ch) return;
      gained = ch.kind === 'race' ? 20 : ch.points;
      label = ch.title + (ch.kind === 'race' ? ' (taking part)' : '');
    }

    var writes = [{ team_id: sub.teamId, label: label, points: gained }];

    // mark approved in the cache so bingo-line maths sees it
    var local = state.submissions.filter(function (s) { return s.id === sub.id; })[0];
    if (local) local.status = 'approved';

    if (sub.kind === 'bingo') {
      var now = completedLines(sub.teamId), before = state.lines[sub.teamId] || 0;
      if (now > before) {
        var bonus = (now - before) * SEED.bingoLine;
        writes.push({ team_id: sub.teamId, label: 'Bingo line bonus', points: bonus });
        state.lines[sub.teamId] = now; gained += bonus;
      }
    }

    db.from('submissions').update({ status: 'approved' }).eq('id', sub.id).then(function () {});
    db.from('ledger').insert(writes).then(function () {
      Promise.all([loadLedger(), loadSubmissions()]).then(function () {
        emit({ type: 'approved', points: gained, label: label });
      });
    });
  }

  // ---------- public API (same shape as the demo Store) ----------
  window.Store = {
    demo: false,
    on: function (fn) { listeners.push(fn); },
    me: function () { return state.me; },
    myTeam: function () { return state.me ? team(state.me.teamId) : null; },
    team: team,
    teams: function () { return state.teams; },
    points: points,
    displayName: displayName,
    ledger: function (teamId) { return state.ledger.filter(function (l) { return l.teamId === teamId; }); },
    ranking: function () {
      return state.teams.map(function (t, i) { return { team: t, index: i, points: points(t.id) }; })
        .sort(function (a, b) { return b.points - a.points; });
    },
    findRoom: function (code) {
      code = String(code || '').trim().toUpperCase();
      return state.teams.filter(function (t) { return t.code === code; })[0] || null;
    },
    signIn: function (teamId, name) { state.me = { teamId: teamId, name: name }; writeJSON(ME_KEY, state.me); emit(); },
    nameTeam: function (name, color) {
      var t = this.myTeam(); if (!t) return;
      t.name = name; t.color = color; emit();
      db.from('teams').update({ name: name, color: color }).eq('id', t.id).then(function () {});
    },
    usedColors: function () {
      var mine = state.me && state.me.teamId;
      return state.teams.filter(function (t) { return t.id !== mine; }).map(function (t) { return t.color; });
    },
    bingoCard: bingoCard,
    submissionFor: submissionFor,
    submissions: function (teamId) { return state.submissions.filter(function (s) { return s.teamId === teamId; }); },
    submit: function (kind, refId, value, thumb) {
      var s = { id: 'tmp' + Date.now(), teamId: state.me.teamId, kind: kind, refId: refId,
        value: value, thumb: thumb, status: 'pending', by: state.me.name };
      state.submissions.push(s); emit({ type: 'submitted' });        // optimistic
      db.from('submissions')
        .insert({ team_id: s.teamId, kind: kind, ref_id: refId, value: value, thumb: thumb,
          status: 'pending', by: s.by })
        .select().single()
        .then(function (res) {
          if (res.error || !res.data) { console.error('[store] submit failed', res.error); return; }
          var saved = mapSub(res.data);
          // replace the optimistic row
          state.submissions = state.submissions.filter(function (x) { return x.id !== s.id; });
          state.submissions.push(saved);
          if (autoApprove) approve(saved); else emit({ type: 'submissions' });
        });
      return s;
    },
    ballot: function (voteId) { return state.ballots[voteId] || null; },
    vote: function (voteId, teamId) {
      if (state.ballots[voteId] || teamId === state.me.teamId) return false;
      state.ballots[voteId] = teamId; emit({ type: 'voted' });       // optimistic
      db.from('ballots').insert({ vote_id: voteId, voter_id: VOTER, team_id: teamId }).then(function (res) {
        if (res.error) { delete state.ballots[voteId]; emit({ type: 'ballots' }); }
      });
      return true;
    },
    // In the shared app, "reset" just signs this phone out. It never wipes the DB.
    reset: function () {
      state.me = null; try { localStorage.removeItem(ME_KEY); } catch (e) {}
      emit({ type: 'reset' });
    }
  };

  init();
})();
