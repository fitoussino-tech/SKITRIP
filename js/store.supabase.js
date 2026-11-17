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
  var STORAGE_PREFIX = String(cfg.SUPABASE_URL).replace(/\/+$/, '') + '/storage/v1/object/public/';
  // Strict: exactly the public URL shape our uploadPhoto() produces. Blocks any
  // crafted value with ) ; ' etc. that could break out of a CSS url(...) sink.
  var STORAGE_RE = new RegExp('^' + STORAGE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'proofs/[A-Za-z0-9_-]+/[0-9]+-[a-z0-9]+\\.jpg$');

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
    lines: {},                                              // teamId -> bingo lines already rewarded
    events: []                                              // extra calendar events added in the back office
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

  // ---------- untrusted-input guards ----------
  // Shared data comes from other phones, so sanitise the two fields app.js injects
  // into HTML without escaping: `thumb` (an <img src>) and `color` (inline style).
  // Everything else app.js renders through esc(). This blocks stored XSS at the
  // boundary; the DB adds CHECK constraints as a second layer (see schema.sql).
  function safeThumb(v) {
    if (typeof v !== 'string') return null;
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]*$/i.test(v)) return v;                 // inline (legacy)
    if (STORAGE_RE.test(v)) return v;                                                                      // our Storage URL (strict path)
    return null;
  }
  function safeColor(v) {
    return (typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) ? v : null;
  }
  // status is injected into a class attribute by app.js, so allow-list it.
  function safeStatus(v) {
    return (v === 'approved' || v === 'rejected') ? v : 'pending';
  }
  function clamp(v, n) { return typeof v === 'string' ? v.slice(0, n) : v; }

  // Human label for a proof: the challenge title, or the bingo square text.
  function achievement(sub) {
    if (sub.kind === 'bingo') {
      var b = SEED.bingo.filter(function (x) { return x.id === sub.refId; })[0];
      return b ? b.text : 'a bingo square';
    }
    var c = SEED.challenges.filter(function (x) { return x.id === sub.refId; })[0];
    return c ? c.title : 'a challenge';
  }

  // ---------- row mapping ----------
  function mapSub(row) {
    return { id: row.id, teamId: row.team_id, kind: row.kind, refId: row.ref_id,
      value: row.value, thumb: safeThumb(row.thumb), status: safeStatus(row.status),
      by: row.by, createdAt: row.created_at };
  }
  function mapLedger(row) { return { teamId: row.team_id, label: row.label, points: row.points }; }
  function mapEvent(row) {
    return { id: row.id, day: row.day, time: row.time, title: row.title, detail: row.detail, at: row.created_at };
  }

  // ---------- loads ----------
  function loadTeams() {
    return db.from('teams').select('*').then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (row) {
        var t = team(row.id);
        if (!t) return;
        t.name = clamp(row.name, 40);                 // esc()'d by app.js; cap length only
        var col = safeColor(row.color);
        if (col) t.color = col;                        // ignore unsafe colours, keep the seed one
        t.room = row.room; t.code = row.code;
        t.avatar = safeThumb(row.avatar);
        if (row.members) t.members = row.members;
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

  function loadEvents() {
    return db.from('events').select('*').order('created_at').then(function (res) {
      if (res.error || !res.data) return;
      state.events = res.data.map(mapEvent);
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
      .then(function () { return Promise.all([loadTeams(), loadLedger(), loadSubmissions(), loadMyBallots(), loadEvents()]); })
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' },
        function () { loadEvents().then(function () { emit({ type: 'events' }); }); })
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
    // ----- team profile photo -----
    avatar: function (teamId) { var t = team(teamId); return t ? (t.avatar || null) : null; },
    setAvatar: function (dataUrl) {
      var t = this.myTeam(); if (!t) return;
      t.avatar = dataUrl; emit({ type: 'avatar' });
      db.from('teams').update({ avatar: dataUrl }).eq('id', t.id).then(function () {});
    },
    // Upload a shrunk photo to Storage, return its public URL. Falls back to the
    // inline data URL if Storage is not set up yet, so the app keeps working.
    uploadPhoto: function (blob, fallback) {
      if (!blob) return Promise.resolve(fallback || null);
      var path = (state.me ? state.me.teamId : 'anon') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      return db.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
        .then(function (res) {
          if (res.error) throw res.error;
          var pub = db.storage.from('proofs').getPublicUrl(path);
          return (pub && pub.data && pub.data.publicUrl) || fallback || null;
        })
        .catch(function (e) { console.warn('[store] photo upload failed, keeping inline image', e && e.message); return fallback || null; });
    },

    // ----- feed / team posts -----
    achievement: achievement,
    posts: function (teamId) {                     // approved proofs with a photo, newest first
      return state.submissions
        .filter(function (s) { return s.status === 'approved' && s.thumb && (!teamId || s.teamId === teamId); })
        .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })
        .map(function (s) { return { id: s.id, team: team(s.teamId), text: achievement(s), thumb: s.thumb, by: s.by, at: s.createdAt }; });
    },
    feed: function () { return this.posts(null); },

    // ----- calendar -----
    events: function (day) { return state.events.filter(function (e) { return e.day === day; }); },

    // ----- admin back office -----
    pending: function () {                          // proofs waiting for review, oldest first
      return state.submissions
        .filter(function (s) { return s.status === 'pending'; })
        .sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); })
        .map(function (s) { return { id: s.id, team: team(s.teamId), text: achievement(s),
          thumb: s.thumb, by: s.by, value: s.value, kind: s.kind, at: s.createdAt }; });
    },
    approveSubmission: function (id) {
      var s = state.submissions.filter(function (x) { return x.id === id; })[0];
      if (s && s.status === 'pending') approve(s);
    },
    rejectSubmission: function (id) {
      db.from('submissions').update({ status: 'rejected' }).eq('id', id)
        .then(function () { loadSubmissions().then(function () { emit({ type: 'submissions' }); }); });
    },
    addEvent: function (ev) {
      return db.from('events').insert({ day: ev.day, time: ev.time || '', title: ev.title, detail: ev.detail || '' })
        .then(function () { return loadEvents(); }).then(function () { emit({ type: 'events' }); });
    },
    deleteEvent: function (id) {
      return db.from('events').delete().eq('id', id)
        .then(function () { return loadEvents(); }).then(function () { emit({ type: 'events' }); });
    },

    // In the shared app, "reset" just signs this phone out. It never wipes the DB.
    reset: function () {
      state.me = null; try { localStorage.removeItem(ME_KEY); } catch (e) {}
      emit({ type: 'reset' });
    }
  };

  init();
})();
