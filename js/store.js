// Data layer. The screens (js/app.js, js/admin.js) only talk to `Store`.
//
// One Store, two back ends:
//   * local    - everything lives in this browser (the demo). Defined at the bottom of this file.
//   * supabase - shared between all phones. Defined in js/store.supabase.js, which registers
//                itself as window.SupabaseBackend when js/config.js is filled in.
// A back end only loads and writes data; every rule of the game (points, bingo, feed,
// what counts as "today") is here, once.
(function () {
  var ME_KEY = 'mim28-me-v1';
  var listeners = [];
  var photos = {};                     // proof id -> photo (data URL), filled on demand
  var seen = null;                     // proof id -> last known status, for my team (drives the toasts)

  var state = {
    ready: false,
    me: readJSON(ME_KEY),              // { teamId, name } - this device only
    teams: clone(SEED.teams),          // { id, code, room, members, name, color, avatar }
    ledger: [],                        // { id, teamId, label, points, submissionId, at }
    submissions: [],                   // { id, teamId, kind, refId, value, status, by, note, at }
    ballots: [],                       // { voteId, voterId, teamId }
    events: [],                        // { id, day, time, title, detail, position }
    challenges: [],                    // { id, day, kind, title, desc, points, closes, unit, prize, position }
    players: [],                       // { teamId, name, joinedAt, lastSeen }
    settings: { today: 'auto', message: SEED.message, epoch: 1 },
    admin: { status: 'checking', email: '' }   // 'checking' | 'out' | 'in' | 'denied'
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function writeJSON(key, v) {
    try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function emit(evt) { listeners.forEach(function (fn) { fn(evt || {}); }); }
  function fail(what) {
    return function (err) {
      console.error('[store] ' + what, err);
      emit({ type: 'error', message: what + (err && err.message ? ': ' + err.message : '') });
      return false;
    };
  }

  // ---------- rules of the game ----------
  function team(id) { return byId(state.teams, id); }
  function displayName(t) { return t ? (t.name || t.room) : '?'; }
  function challenge(id) { return byId(state.challenges, id); }
  function bingoSquare(id) { return byId(SEED.bingo, id); }

  function today() {
    var s = state.settings.today;
    if (s && s !== 'auto' && SEED.dates[s]) return s;
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());   // the phone's own date
    for (var k in SEED.dates) if (SEED.dates[k] === iso) return k;
    return SEED.today;                 // before / after the trip: the first day with challenges
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
  // The latest proof a team sent for a challenge or a bingo square.
  function submissionFor(teamId, kind, refId) {
    var best = null;
    state.submissions.forEach(function (s) {
      if (s.teamId === teamId && s.kind === kind && s.refId === refId && (!best || String(s.at) >= String(best.at))) best = s;
    });
    return best;
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
  // Points = every line the organisers awarded + the bingo line bonus, which is worked out
  // from the approved squares (so an undo can never leave a stale bonus behind).
  function points(teamId) {
    var sum = completedLines(teamId) * SEED.bingoLine;
    state.ledger.forEach(function (l) { if (l.teamId === teamId) sum += l.points; });
    return sum;
  }
  function ledgerOf(teamId) {
    var rows = state.ledger.filter(function (l) { return l.teamId === teamId; })
      .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    var lines = completedLines(teamId);
    if (lines) rows.push({ id: 'bingo-lines', teamId: teamId, label: 'Bingo lines × ' + lines, points: lines * SEED.bingoLine, derived: true });
    return rows;
  }
  function achievement(sub) {
    if (sub.kind === 'bingo') { var b = bingoSquare(sub.refId); return b ? b.text : 'a bingo square'; }
    var c = challenge(sub.refId); return c ? c.title : 'a challenge';
  }
  // What approving a proof is worth.
  function awardsFor(sub) {
    if (sub.kind === 'bingo') return [{ label: 'Bingo square', points: SEED.bingoPoints }];
    var c = challenge(sub.refId);
    if (!c) return [];
    if (c.kind === 'race') return [{ label: c.title + ' (taking part)', points: SEED.racePart }];
    return [{ label: c.title, points: c.points }];
  }
  function decorate(s) {
    var c = s.kind === 'challenge' ? challenge(s.refId) : null;
    return { id: s.id, team: team(s.teamId), kind: s.kind, refId: s.refId, text: achievement(s), value: s.value,
      unit: c ? c.unit : '', status: s.status, by: s.by, note: s.note, at: s.at, worth: awardsFor(s).reduce(function (n, a) { return n + a.points; }, 0) };
  }
  function newestFirst(a, b) { return String(b.at).localeCompare(String(a.at)); }

  // ---------- toasts for my team: a proof of ours was approved or rejected ----------
  function watchMine() {
    if (!state.me) { seen = null; return; }
    var now = {}, changed = [];
    state.submissions.forEach(function (s) {
      if (s.teamId !== state.me.teamId) return;
      now[s.id] = s.status;
      if (seen && seen[s.id] === 'pending' && s.status !== 'pending') changed.push(s);
    });
    var first = !seen;
    seen = now;
    if (first) return;
    changed.forEach(function (s) {
      if (s.status === 'rejected') { emit({ type: 'rejected', label: achievement(s), note: s.note }); return; }
      // the points line may land a moment after the status change
      setTimeout(function () {
        var pts = 0;
        state.ledger.forEach(function (l) { if (l.submissionId === s.id) pts += l.points; });
        emit({ type: 'approved', label: achievement(s), points: pts });
      }, 700);
    });
  }

  // ---------- outbox: proofs waiting to be sent ----------
  // A proof is saved on the phone first (IndexedDB), then sent. With bad signal it simply waits
  // there and is retried until it goes through, even if the app is closed and reopened later.
  // submit_proof() is safe to call twice for the same square or challenge, so a retry after a
  // reply that got lost on the way back never creates a duplicate.
  var OUTBOX_KEY = 'mim28-outbox-v1';
  var outbox = [];          // { id, teamId, kind, refId, value, by, at, photo (data URL), url, tries, waiting }
  var Box = (function () {
    var dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
        var r = indexedDB.open('mim28', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('outbox', { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        r.onblocked = function () { rej(new Error('IndexedDB blocked')); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('outbox', mode), req = fn(t.objectStore('outbox'));
          t.oncomplete = function () { res(req && req.result); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    // fallback when IndexedDB is not there (very old phones, some private modes): localStorage
    function ls() { return readJSON(OUTBOX_KEY) || []; }
    function keep(item) { var o = {}; for (var k in item) if (k !== 'waiting') o[k] = item[k]; return o; }
    return {
      all: function () { return tx('readonly', function (st) { return st.getAll(); }).catch(function () { return ls(); }); },
      put: function (item) {
        return tx('readwrite', function (st) { return st.put(keep(item)); }).catch(function () {
          writeJSON(OUTBOX_KEY, ls().filter(function (x) { return x.id !== item.id; }).concat([keep(item)]));
        });
      },
      del: function (id) {
        return tx('readwrite', function (st) { return st['delete'](id); }).catch(function () {
          writeJSON(OUTBOX_KEY, ls().filter(function (x) { return x.id !== id; }));
        });
      },
      clear: function () { writeJSON(OUTBOX_KEY, null); return tx('readwrite', function (st) { return st.clear(); }).catch(function () {}); }
    };
  })();
  function asSub(it) {
    return { id: it.id, teamId: it.teamId, kind: it.kind, refId: it.refId, value: it.value, status: 'pending', by: it.by,
      note: null, at: it.at, sending: true, waiting: !!it.waiting };
  }
  // proofs still on this phone are shown as "sending" on top of what the database knows
  function withOutbox() {
    var have = {};
    state.submissions.forEach(function (x) { have[x.id] = x; });
    outbox.forEach(function (it) {
      photos[it.id] = it.photo;
      if (have[it.id]) have[it.id].waiting = !!it.waiting;
      else state.submissions.push(asSub(it));
    });
  }
  function dropSub(id) { state.submissions = state.submissions.filter(function (x) { return x.id !== id; }); }
  // no signal, a timeout, a server hiccup: worth trying again. A refusal from the database is not.
  function isNetwork(err) {
    if (!err) return true;
    if (err.timeout) return true;
    var code = String(err.code || ''), status = +(err.status || err.statusCode || 0);
    if (code === 'P0001' || /^(22|23|42)/.test(code)) return false;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
    return true;
  }
  function timeout(promise, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { var e = new Error('No answer in time'); e.timeout = true; rej(e); }, ms);
      promise.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function toBlob(dataUrl) {
    try {
      var parts = dataUrl.split(','), bin = atob(parts[1]), n = bin.length, u8 = new Uint8Array(n);
      while (n--) u8[n] = bin.charCodeAt(n);
      return new Blob([u8], { type: 'image/jpeg' });
    } catch (e) { return null; }
  }
  var flushing = false, retryTimer = null, saidWaiting = false;
  function retryLater(tries) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(sendOutbox, Math.min(60000, 4000 * Math.pow(2, Math.min(tries, 4))));   // 8s, 16s, 32s, then every minute
  }
  function sendOutbox() {
    if (flushing || !outbox.length || !backend || !state.ready) return;
    flushing = true; clearTimeout(retryTimer);
    var item = outbox[0];
    var step = item.url || !backend.uploadPhoto
      ? Promise.resolve(item.url || item.photo)
      : timeout(backend.uploadPhoto(toBlob(item.photo), item.teamId), 90000).then(function (url) {
          item.url = url || 'inline'; Box.put(item); return url || item.photo;
        }, function (err) {
          if (isNetwork(err)) throw err;
          item.url = 'inline'; Box.put(item); return item.photo;          // no storage bucket: keep the photo in the database
        });
    step.then(function (photo) {
      if (photo === 'inline') photo = item.photo;
      var row = asSub(item);
      return timeout(backend.submit(row, photo), 60000).then(function (saved) {
        outbox = outbox.filter(function (x) { return x.id !== item.id; });
        Box.del(item.id);
        if (saved && saved.id) photos[saved.id] = photo;
        dropSub(item.id);
        flushing = false;
        emit({ type: 'sent', label: achievement(item), late: item.tries > 0 });
        if (!outbox.some(function (x) { return x.waiting; })) saidWaiting = false;
        sendOutbox();
      });
    }).catch(function (err) {
      flushing = false;
      if (isNetwork(err)) {
        item.tries = (item.tries || 0) + 1; item.waiting = true; Box.put(item);
        withOutbox(); emit({ type: 'submissions' });
        if (!saidWaiting) { saidWaiting = true; emit({ type: 'queued' }); }
        retryLater(item.tries);
      } else {                                                        // the database said no: tell them, let them try again
        outbox = outbox.filter(function (x) { return x.id !== item.id; });
        Box.del(item.id); dropSub(item.id);
        fail('Your proof could not be sent')(err);
        emit({ type: 'submissions' });
        sendOutbox();
      }
    });
  }
  // signal is back, or the app comes back on screen: try straight away
  window.addEventListener('online', function () { sendOutbox(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sendOutbox(); });

  // ---------- what a back end gets to work with ----------
  var ctx = {
    state: state,
    // replace parts of the state, then tell the screens
    set: function (patch, type) {
      for (var k in patch) state[k] = patch[k];
      if (patch.submissions) { withOutbox(); watchMine(); }
      if (patch.ready) setTimeout(sendOutbox, 0);
      emit({ type: type || 'data' });
    },
    emit: emit,
    photos: photos,
    // the organisers restarted the game: this phone signs itself out
    signOutLocal: function () {          // proofs of the old game must not land in the new one
      state.me = null; seen = null; writeJSON(ME_KEY, null);
      outbox.forEach(function (it) { dropSub(it.id); }); outbox = []; Box.clear();
    }
  };

  // ---------- proof photos, fetched only when a screen shows them ----------
  var wanted = [], waiting = {}, timer = null;
  function loadPhoto(id) {
    if (photos[id]) return Promise.resolve(photos[id]);
    if (waiting[id]) return waiting[id].promise;
    var w = waiting[id] = {};
    w.promise = new Promise(function (res) { w.resolve = res; });
    wanted.push(id);
    if (!timer) timer = setTimeout(flush, 40);
    return w.promise;
  }
  function flush() {
    timer = null;
    var ids = wanted.splice(0, 6);                       // a few at a time: photos are heavy on 4G
    if (wanted.length) timer = setTimeout(flush, 40);
    backend.loadPhotos(ids).then(function (map) {
      ids.forEach(function (id) {
        if (map && map[id]) photos[id] = map[id];
        waiting[id].resolve(photos[id] || null); delete waiting[id];
      });
    }, function () { ids.forEach(function (id) { waiting[id].resolve(null); delete waiting[id]; }); });
  }
  // Fill every [data-photo="<proof id>"] element under `root` (an <img>, or any box as a background).
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); fill(en.target); } });
  }, { rootMargin: '300px' }) : null;
  function paint(el, url) {
    if (el.tagName === 'IMG') el.src = url; else el.style.backgroundImage = 'url(' + url + ')';
    el.classList.add('loaded');
  }
  function fill(el) {
    loadPhoto(el.getAttribute('data-photo')).then(function (url) { if (url) paint(el, url); else el.classList.add('missing'); });
  }
  function hydratePhotos(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-photo]:not(.loaded)'), function (el) {
      var cached = photos[el.getAttribute('data-photo')];
      if (cached) paint(el, cached); else if (io) io.observe(el); else fill(el);
    });
  }

  // ---------- public API ----------
  var backend;
  window.Store = {
    demo: true,
    on: function (fn) { listeners.push(fn); },
    ready: function () { return state.ready; },

    // --- who am I
    me: function () { return state.me; },
    myTeam: function () { return state.me ? team(state.me.teamId) : null; },
    signIn: function (teamId, name) {
      state.me = { teamId: teamId, name: name }; writeJSON(ME_KEY, state.me); seen = null; watchMine();
      emit({ type: 'me' });
      backend.seen(teamId, name).catch(fail('Could not register you'));
    },
    signOut: function () { ctx.signOutLocal(); emit({ type: 'me' }); },

    // --- teams
    team: team,
    teams: function () { return state.teams; },
    displayName: displayName,
    findRoom: function (code) {
      code = String(code || '').trim().toUpperCase();
      for (var i = 0; i < state.teams.length; i++) if (state.teams[i].code === code) return state.teams[i];
      return null;
    },
    usedColors: function () {
      var mine = state.me && state.me.teamId;
      return state.teams.filter(function (t) { return t.id !== mine; }).map(function (t) { return t.color; });
    },
    nameTeam: function (name, color) {
      var t = this.myTeam(); if (!t) return;
      t.name = name; t.color = color; emit({ type: 'teams' });
      backend.updateTeam(t.id, { name: name, color: color }).catch(fail('Could not save the team name'));
    },
    setAvatar: function (dataUrl) {
      var t = this.myTeam(); if (!t) return;
      t.avatar = dataUrl; emit({ type: 'teams' });
      backend.updateTeam(t.id, { avatar: dataUrl }).catch(fail('Could not save the team photo'));
    },
    players: function (teamId) { return state.players.filter(function (p) { return !teamId || p.teamId === teamId; }); },
    hasJoined: function (teamId, name) {
      return state.players.some(function (p) { return p.teamId === teamId && p.name === name; });
    },

    // --- points
    points: points,
    ledger: ledgerOf,
    ranking: function () {
      return state.teams.map(function (t, i) { return { team: t, index: i, points: points(t.id) }; })
        .sort(function (a, b) { return b.points - a.points || a.index - b.index; });
    },

    // --- challenges, bingo, proofs
    today: today,
    message: function () { return state.settings.message || SEED.message; },
    settings: function () { return state.settings; },
    challenge: challenge,
    challenges: function (day) {
      return state.challenges.filter(function (c) { return !day || c.day === day; })
        .sort(function (a, b) { return a.position - b.position || String(a.id).localeCompare(String(b.id)); });
    },
    bingoCard: bingoCard,
    submissionFor: submissionFor,
    achievement: achievement,
    // Put a photo somewhere shareable and return what to store: a Supabase Storage link,
    // or the inline image itself (demo, or when the upload fails).
    uploadPhoto: function (blob, inline) {
      if (!blob || !backend.uploadPhoto) return Promise.resolve(inline || null);
      return backend.uploadPhoto(blob, state.me ? state.me.teamId : 'anon').then(function (url) { return url || inline || null; },
        function (e) { console.warn('[store] photo upload failed, keeping the inline image', e && e.message); return inline || null; });
    },
    // Save the proof on this phone, show it straight away, and send it as soon as there is signal.
    // photo: the shrunk JPEG as a data URL. Resolves once it is safely stored on the phone.
    submit: function (kind, refId, value, photo) {
      var item = { id: 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), teamId: state.me.teamId, kind: kind,
        refId: refId, value: value || null, by: state.me.name, at: new Date().toISOString(), photo: photo, url: null, tries: 0 };
      outbox.push(item);
      withOutbox(); emit({ type: 'submissions' });
      return Box.put(item).then(function () { sendOutbox(); return true; });
    },
    // proofs on this phone that are still waiting to go out
    outbox: function () { return { count: outbox.length, waiting: outbox.some(function (x) { return x.waiting; }) }; },
    sendNow: function () { sendOutbox(); },
    // approved proofs with their photo, newest first (the feed, and a team's profile)
    posts: function (teamId) {
      return state.submissions.filter(function (s) { return s.status === 'approved' && team(s.teamId) && (!teamId || s.teamId === teamId); })
        .sort(newestFirst).map(decorate);
    },
    feed: function () { return this.posts(null); },
    photo: function (id) { return photos[id] || null; },
    loadPhoto: loadPhoto,
    hydratePhotos: hydratePhotos,

    // --- votes
    ballot: function (voteId) {
      var v = backend.voterId();
      for (var i = 0; i < state.ballots.length; i++) if (state.ballots[i].voteId === voteId && state.ballots[i].voterId === v) return state.ballots[i].teamId;
      return null;
    },
    vote: function (voteId, teamId) {
      if (this.ballot(voteId) || teamId === state.me.teamId) return false;
      state.ballots.push({ voteId: voteId, voterId: backend.voterId(), teamId: teamId }); emit({ type: 'ballots' });
      backend.vote(voteId, teamId).catch(fail('Your vote could not be saved'));
      return true;
    },
    tally: function (voteId) {
      var count = {};
      state.ballots.forEach(function (b) { if (b.voteId === voteId) count[b.teamId] = (count[b.teamId] || 0) + 1; });
      return state.teams.map(function (t) { return { team: t, votes: count[t.id] || 0 }; })
        .filter(function (x) { return x.votes; }).sort(function (a, b) { return b.votes - a.votes; });
    },

    // --- programme
    events: function (day) {
      return state.events.filter(function (e) { return e.day === day; })
        .sort(function (a, b) { return a.position - b.position || String(a.at).localeCompare(String(b.at)); });
    },

    // =================== organisers (js/admin.js) ===================
    admin: {
      session: function () { return state.admin; },
      login: function (email, password) { return backend.adminLogin(email, password); },
      logout: function () { return backend.adminLogout(); }
    },
    // every proof, decorated for display. filter: { status, teamId, ref } (ref = 'challenge:c1' | 'bingo')
    proofs: function (filter) {
      filter = filter || {};
      return state.submissions.filter(function (s) {
        if (s.sending || !team(s.teamId)) return false;
        if (filter.status && s.status !== filter.status) return false;
        if (filter.teamId && s.teamId !== filter.teamId) return false;
        if (filter.ref === 'bingo' && s.kind !== 'bingo') return false;
        if (filter.ref && filter.ref !== 'bingo' && (s.kind !== 'challenge' || 'challenge:' + s.refId !== filter.ref)) return false;
        return true;
      }).sort(filter.status === 'pending' ? function (a, b) { return -newestFirst(a, b); } : newestFirst).map(decorate);
    },
    approveSubmission: function (id, pointsOverride) {
      var s = byId(state.submissions, id);
      if (!s || s.status !== 'pending') return Promise.resolve(false);
      var awards = awardsFor(s);
      if (pointsOverride != null && awards.length) awards[0].points = pointsOverride;
      return backend.approve(id, awards).catch(fail('Could not approve'));
    },
    rejectSubmission: function (id, note) { return backend.reject(id, note || '').catch(fail('Could not reject')); },
    reopenSubmission: function (id) { return backend.reopen(id).catch(fail('Could not undo')); },
    award: function (teamId, label, pts) {
      return backend.award(teamId, String(label).slice(0, 80), Math.round(pts)).catch(fail('Could not award the points'));
    },
    removeLedger: function (id) { return backend.removeLedger(id).catch(fail('Could not remove the line')); },
    allLedger: function () { return state.ledger.slice().sort(newestFirst); },

    // races: best approved number per team, highest first
    raceResults: function (challengeId) {
      var best = {};
      state.submissions.forEach(function (s) {
        if (s.kind !== 'challenge' || s.refId !== challengeId || s.status !== 'approved') return;
        var v = parseFloat(s.value);
        if (!isNaN(v) && (!best[s.teamId] || v > best[s.teamId])) best[s.teamId] = v;
      });
      return Object.keys(best).map(function (id) { return { team: team(id), value: best[id] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },
    podiumPoints: function (c) { return [c.points, Math.round(c.points * 0.7), Math.round(c.points * 0.5)]; },
    podiumLabel: function (c, place) { return c.title + ' · ' + ['1st', '2nd', '3rd'][place] + ' place'; },
    podiumAwarded: function (c) {
      var self = this;
      return state.ledger.some(function (l) { return l.label === self.podiumLabel(c, 0); });
    },
    awardPodium: function (challengeId) {
      var c = challenge(challengeId), self = this;
      if (!c || this.podiumAwarded(c)) return Promise.resolve(false);
      var pts = this.podiumPoints(c);
      return Promise.all(this.raceResults(challengeId).slice(0, 3).map(function (r, i) {
        return self.award(r.team.id, self.podiumLabel(c, i), pts[i]);
      }));
    },

    saveChallenge: function (c) {
      if (!c.id && c.position == null) c.position = state.challenges.reduce(function (m, x) { return Math.max(m, x.position); }, 0) + 10;
      return backend.saveChallenge(c).catch(fail('Could not save the challenge'));
    },
    deleteChallenge: function (id) { return backend.deleteChallenge(id).catch(fail('Could not delete the challenge')); },
    saveEvent: function (e) {
      if (!e.id && e.position == null) e.position = this.events(e.day).reduce(function (m, x) { return Math.max(m, x.position); }, 0) + 10;
      return backend.saveEvent(e).catch(fail('Could not save the programme line'));
    },
    deleteEvent: function (id) { return backend.deleteEvent(id).catch(fail('Could not remove the programme line')); },
    // move a programme line up (-1) or down (+1) within its day
    moveEvent: function (id, dir) {
      var e = byId(state.events, id); if (!e) return Promise.resolve(false);
      var day = this.events(e.day), i = day.indexOf(e), other = day[i + dir];
      if (!other) return Promise.resolve(false);
      var a = e.position, b = other.position;
      if (a === b) b = a + dir;
      return Promise.all([backend.saveEvent({ id: e.id, position: b }), backend.saveEvent({ id: other.id, position: a })])
        .catch(fail('Could not move the line'));
    },
    setSetting: function (key, value) { return backend.setSetting(key, value).catch(fail('Could not save the setting')); },
    // clear a team's chosen name and photo (moderation)
    resetTeam: function (teamId) { return backend.updateTeam(teamId, { name: null, avatar: null }).catch(fail('Could not reset the team')); },
    // start again from zero: points, proofs, votes, players, team names and photos
    restart: function () { return backend.restart().catch(fail('Could not restart')); }
  };

  // ---------- pick the back end ----------
  backend = window.SupabaseBackend ? window.SupabaseBackend(ctx) : LocalBackend(ctx);
  window.Store.demo = !window.SupabaseBackend;
  backend.init();
  Box.all().then(function (items) {
    outbox = (items || []).filter(function (it) { return it && it.id && it.photo; })
      .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    if (!outbox.length) return;
    withOutbox(); emit({ type: 'submissions' }); sendOutbox();
  });
  if (state.me) backend.seen(state.me.teamId, state.me.name).catch(function () {});

  // =====================================================================
  // Local back end: the demo. Everything is kept in this browser's storage,
  // shared between the player app and the back office when both are open.
  // =====================================================================
  function LocalBackend(ctx) {
    var KEY = 'mim28-demo-v2', VOTER = 'this-device';
    var keys = ['teams', 'ledger', 'submissions', 'ballots', 'events', 'challenges', 'players', 'settings'];
    var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
    var now = function () { return new Date().toISOString(); };
    var st = ctx.state;

    function fresh() {
      var events = [];
      SEED.days.forEach(function (d) {
        (SEED.schedule[d[0]] || []).forEach(function (it, i) {
          events.push({ id: 'e-' + d[0] + i, day: d[0], time: it[0], title: it[1], detail: it[2] || '', position: (i + 1) * 10, at: '' });
        });
      });
      return {
        teams: clone(SEED.teams),
        ledger: SEED.teams.map(function (t, i) {           // so the demo mountain is not empty
          return { id: 'seed-' + t.id, teamId: t.id, label: 'Earlier challenges', points: SEED.seedPoints[i], submissionId: null, at: '2026-01-01T00:00:00.000Z' };
        }),
        submissions: [], ballots: [], players: [],
        events: events,
        challenges: SEED.challenges.map(function (c, i) {
          return { id: c.id, day: c.day, kind: c.kind, title: c.title, desc: c.desc, points: c.points, closes: c.closes || '', unit: c.unit || '', prize: c.prize || '', position: (i + 1) * 10 };
        }),
        settings: { today: 'auto', message: SEED.message, epoch: 1 },
        photos: {}
      };
    }
    function read() { var d = readJSON(KEY); return d && d.settings ? d : null; }
    function persist() {
      var d = { photos: {} };
      for (var ph in ctx.photos) d.photos[ph] = ctx.photos[ph];
      keys.forEach(function (k) { d[k] = k === 'submissions' ? st[k].filter(function (x) { return !x.sending; }) : st[k]; });
      for (var id in d.photos) if (id.indexOf('tmp-') === 0) delete d.photos[id];
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage full or private mode: keep going in memory */ }
    }
    function adopt(d) {
      var patch = {};
      keys.forEach(function (k) { patch[k] = d[k]; });
      for (var id in ctx.photos) delete ctx.photos[id];
      for (var p in d.photos) ctx.photos[p] = d.photos[p];
      return patch;
    }
    // apply a change, save it, tell the screens (and the other tab through the storage event)
    function commit(type) { persist(); ctx.set({ submissions: st.submissions }, type); return Promise.resolve(true); }

    return {
      voterId: function () { return VOTER; },
      init: function () {
        var d = read() || fresh();
        var patch = adopt(d);
        patch.ready = true;
        patch.admin = { status: 'in', email: 'demo' };
        ctx.set(patch, 'ready');
        persist();
        // the back office and the player app open in two tabs: keep them in step
        window.addEventListener('storage', function (e) {
          if (e.key === KEY) { var n = read(); if (n) ctx.set(adopt(n), 'data'); }
          if (e.key === ME_KEY) { st.me = readJSON(ME_KEY); ctx.emit({ type: 'me' }); }
        });
      },
      seen: function (teamId, name) {
        var p = st.players.filter(function (x) { return x.teamId === teamId && x.name === name; })[0];
        if (p) p.lastSeen = now(); else st.players.push({ teamId: teamId, name: name, joinedAt: now(), lastSeen: now() });
        return commit('players');
      },
      updateTeam: function (teamId, patch) {
        var t = byId(st.teams, teamId); for (var k in patch) t[k] = patch[k];
        return commit('teams');
      },
      submit: function (tmp, photo) {
        var s = byId(st.submissions, tmp.id), tmpId = tmp.id;       // `s` is the temporary row itself
        if (!s) { s = clone(tmp); st.submissions.push(s); }
        if (st.submissions.some(function (x) { return !x.sending && x.teamId === s.teamId && x.kind === s.kind && x.refId === s.refId && x.status !== 'rejected'; })) {
          st.submissions = st.submissions.filter(function (x) { return x !== s; });       // already there: same as submit_proof()
          return Promise.resolve(null);
        }
        s.id = uid('s'); delete s.sending; delete s.waiting;
        delete ctx.photos[tmpId]; ctx.photos[s.id] = photo;
        commit('submissions');
        return Promise.resolve(s);
      },
      loadPhotos: function (ids) {
        var map = {}; ids.forEach(function (id) { if (ctx.photos[id]) map[id] = ctx.photos[id]; });
        return Promise.resolve(map);
      },
      vote: function () { return commit('ballots'); },

      adminLogin: function () { return Promise.resolve(true); },
      adminLogout: function () { return Promise.resolve(true); },
      approve: function (id, awards) {
        var s = byId(st.submissions, id);
        if (!s || s.status !== 'pending') return Promise.resolve(false);
        s.status = 'approved'; s.note = null;
        awards.forEach(function (a) {
          if (a.points) st.ledger.push({ id: uid('l'), teamId: s.teamId, label: a.label, points: a.points, submissionId: id, at: now() });
        });
        return commit('submissions');
      },
      reject: function (id, note) {
        var s = byId(st.submissions, id);
        if (!s || s.status !== 'pending') return Promise.resolve(false);
        s.status = 'rejected'; s.note = note || null;
        return commit('submissions');
      },
      reopen: function (id) {
        var s = byId(st.submissions, id);
        if (!s || s.status === 'pending') return Promise.resolve(false);
        s.status = 'pending'; s.note = null;
        st.ledger = st.ledger.filter(function (l) { return l.submissionId !== id; });
        return commit('submissions');
      },
      award: function (teamId, label, pts) {
        st.ledger.push({ id: uid('l'), teamId: teamId, label: label, points: pts, submissionId: null, at: now() });
        return commit('ledger');
      },
      removeLedger: function (id) { st.ledger = st.ledger.filter(function (l) { return l.id !== id; }); return commit('ledger'); },
      saveChallenge: function (c) {
        var old = c.id && byId(st.challenges, c.id);
        if (old) { for (var k in c) old[k] = c[k]; }
        else { c.id = uid('c-'); st.challenges.push(c); }
        return commit('challenges');
      },
      deleteChallenge: function (id) { st.challenges = st.challenges.filter(function (c) { return c.id !== id; }); return commit('challenges'); },
      saveEvent: function (e) {
        var old = e.id && byId(st.events, e.id);
        if (old) { for (var k in e) old[k] = e[k]; }
        else { e.id = uid('e-'); e.at = now(); st.events.push(e); }
        return commit('events');
      },
      deleteEvent: function (id) { st.events = st.events.filter(function (e) { return e.id !== id; }); return commit('events'); },
      setSetting: function (key, value) { st.settings[key] = value; return commit('settings'); },
      restart: function () {
        var d = fresh();
        d.events = st.events; d.challenges = st.challenges;                 // content is kept, like on the real site
        d.settings = { today: st.settings.today, message: st.settings.message, epoch: (st.settings.epoch || 1) + 1 };
        ctx.signOutLocal();
        ctx.set(adopt(d), 'data'); persist();
        ctx.emit({ type: 'me' });
        return Promise.resolve(true);
      }
    };
  }
})();
