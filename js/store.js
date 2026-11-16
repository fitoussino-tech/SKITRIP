// Data layer. The screens only talk to `Store`, never to storage directly,
// so this demo version can be swapped for a Supabase version with the same methods.
(function () {
  // When Supabase is configured (js/config.js), the shared store in
  // js/store.supabase.js takes over and this demo store steps aside.
  if (window.CONFIG && window.CONFIG.SUPABASE_URL && window.CONFIG.SUPABASE_ANON_KEY) return;
  var KEY = 'mim28-demo-v1';
  var listeners = [];
  var state = load() || fresh();

  function fresh() {
    return {
      me: null,                                   // { teamId, name }
      teams: JSON.parse(JSON.stringify(SEED.teams)),
      ledger: SEED.teams.map(function (t, i) {    // every line of points ever awarded
        return { teamId: t.id, label: 'Earlier challenges', points: SEED.seedPoints[i] };
      }),
      submissions: [],                            // { id, teamId, kind, refId, value, thumb, status, by }
      ballots: {},                                // voteId -> teamId voted for
      lines: {},                                  // teamId -> bingo lines already rewarded
      events: []                                  // extra calendar events added in the back office
    };
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: keep going in memory */ } }
  function emit(evt) { save(); listeners.forEach(function (fn) { fn(evt || {}); }); }

  function team(id) { return state.teams.filter(function (t) { return t.id === id; })[0] || null; }
  function points(teamId) {
    return state.ledger.reduce(function (sum, l) { return l.teamId === teamId ? sum + l.points : sum; }, 0);
  }
  function displayName(t) { return t.name || t.room; }
  function achievement(sub) {
    if (sub.kind === 'bingo') {
      var b = SEED.bingo.filter(function (x) { return x.id === sub.refId; })[0];
      return b ? b.text : 'a bingo square';
    }
    var c = SEED.challenges.filter(function (x) { return x.id === sub.refId; })[0];
    return c ? c.title : 'a challenge';
  }

  // Same 16 squares for everyone, in an order that depends on the team.
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

  // In the real app an organiser approves in the back office. In the demo it happens by itself.
  function approve(subId) {
    var s = state.submissions.filter(function (x) { return x.id === subId; })[0];
    if (!s || s.status !== 'pending') return;
    s.status = 'approved';
    var gained = 0, label;
    if (s.kind === 'bingo') {
      gained = SEED.bingoPoints; label = 'Bingo square';
    } else {
      var ch = SEED.challenges.filter(function (c) { return c.id === s.refId; })[0];
      gained = ch.kind === 'race' ? 20 : ch.points;
      label = ch.title + (ch.kind === 'race' ? ' (taking part)' : '');
    }
    state.ledger.push({ teamId: s.teamId, label: label, points: gained });
    if (s.kind === 'bingo') {
      var lines = completedLines(s.teamId), before = state.lines[s.teamId] || 0;
      if (lines > before) {
        var bonus = (lines - before) * SEED.bingoLine;
        state.ledger.push({ teamId: s.teamId, label: 'Bingo line bonus', points: bonus });
        state.lines[s.teamId] = lines; gained += bonus;
      }
    }
    emit({ type: 'approved', points: gained, label: label });
  }

  // A proof still waiting when the page was closed gets approved shortly after it reopens.
  state.submissions.forEach(function (s) {
    if (s.status === 'pending') setTimeout(function () { approve(s.id); }, 2500);
  });

  window.Store = {
    demo: true,
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
    signIn: function (teamId, name) { state.me = { teamId: teamId, name: name }; emit(); },
    nameTeam: function (name, color) { var t = this.myTeam(); t.name = name; t.color = color; emit(); },
    usedColors: function () {
      var mine = state.me && state.me.teamId;
      return state.teams.filter(function (t) { return t.id !== mine; }).map(function (t) { return t.color; });
    },
    bingoCard: bingoCard,
    submissionFor: submissionFor,
    submissions: function (teamId) { return state.submissions.filter(function (s) { return s.teamId === teamId; }); },
    submit: function (kind, refId, value, thumb) {
      var s = { id: 's' + Date.now(), teamId: state.me.teamId, kind: kind, refId: refId,
        value: value, thumb: thumb, status: 'pending', by: state.me.name };
      state.submissions.push(s); emit({ type: 'submitted' });
      setTimeout(function () { approve(s.id); }, 3500);
      return s;
    },
    ballot: function (voteId) { return state.ballots[voteId] || null; },
    vote: function (voteId, teamId) {
      if (state.ballots[voteId] || teamId === state.me.teamId) return false;
      state.ballots[voteId] = teamId; emit({ type: 'voted' }); return true;
    },
    avatar: function (teamId) { var t = team(teamId); return t ? (t.avatar || null) : null; },
    setAvatar: function (dataUrl) { var t = this.myTeam(); if (!t) return; t.avatar = dataUrl; emit({ type: 'avatar' }); },
    achievement: achievement,
    posts: function (teamId) {
      return state.submissions
        .filter(function (s) { return s.status === 'approved' && s.thumb && (!teamId || s.teamId === teamId); })
        .slice().reverse()
        .map(function (s) { return { id: s.id, team: team(s.teamId), text: achievement(s), thumb: s.thumb, by: s.by, at: s.id }; });
    },
    feed: function () { return this.posts(null); },
    events: function (day) { return state.events.filter(function (e) { return e.day === day; }); },
    pending: function () {
      return state.submissions.filter(function (s) { return s.status === 'pending'; })
        .map(function (s) { return { id: s.id, team: team(s.teamId), text: achievement(s), thumb: s.thumb, by: s.by, value: s.value, kind: s.kind, at: s.id }; });
    },
    approveSubmission: function (id) { approve(id); },
    rejectSubmission: function (id) { var s = state.submissions.filter(function (x) { return x.id === id; })[0]; if (s) { s.status = 'rejected'; emit({ type: 'submissions' }); } },
    addEvent: function (ev) { state.events.push({ id: 'e' + Date.now(), day: ev.day, time: ev.time || '', title: ev.title, detail: ev.detail || '' }); emit({ type: 'events' }); },
    deleteEvent: function (id) { state.events = state.events.filter(function (e) { return e.id !== id; }); emit({ type: 'events' }); },
    reset: function () { state = fresh(); emit({ type: 'reset' }); }
  };
})();
