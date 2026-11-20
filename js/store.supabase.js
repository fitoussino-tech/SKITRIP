// Supabase back end for the Store (see js/store.js): data shared live between all phones.
// It only loads rows, writes them, and listens for changes. The rules of the game live in store.js.
// Database structure and access rules: supabase/schema.sql, schema_v2.sql, schema_v3.sql.
//
// Skips itself (the Store then runs the local demo) when js/config.js is empty.
(function () {
  var cfg = window.CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[store] The Supabase client did not load; running the offline demo instead.');
    window.STORE_OFFLINE = true;
    return;
  }

  window.SupabaseBackend = function (ctx) {
    var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var st = ctx.state;
    var EPOCH_KEY = 'mim28-epoch-v1', DEVICE_KEY = 'mim28-device-v1';

    // one anonymous id per device, used for "one vote per device"
    var VOTER = null;
    try { VOTER = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!VOTER) {
      VOTER = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(DEVICE_KEY, VOTER); } catch (e) {}
    }

    function data(res) { if (res.error) throw res.error; return res.data; }

    // ---------- untrusted-input guards ----------
    // Rows come from other phones. These three values are put into HTML attributes by the
    // screens, so they are checked here (the database checks them too).
    // A photo is either an inline image or a link into this project's "proofs" bucket, in
    // exactly the shape uploadPhoto() produces (<room>/<time>-<random>.jpg). Neither pattern
    // allows quotes or brackets, so a photo is safe inside src="" and a CSS url().
    var BUCKET_URL = String(cfg.SUPABASE_URL).replace(/\/+$/, '') + '/storage/v1/object/public/proofs/';
    function safePhoto(v) {
      if (typeof v !== 'string') return null;
      if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]*$/i.test(v)) return v;
      if (v.indexOf(BUCKET_URL) === 0 && /^[A-Za-z0-9_-]+\/[0-9]+-[a-z0-9]+\.jpg$/.test(v.slice(BUCKET_URL.length))) return v;
      return null;
    }
    function safeColor(v) { return (typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) ? v : null; }
    function safeStatus(v) { return (v === 'approved' || v === 'rejected') ? v : 'pending'; }
    function safeDay(v) { return SEED.dates[v] ? v : SEED.days[0][0]; }
    function text(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }

    // ---------- row -> state ----------
    function mapSub(r) {
      return { id: r.id, teamId: r.team_id, kind: r.kind === 'bingo' ? 'bingo' : 'challenge', refId: r.ref_id,
        value: r.value, status: safeStatus(r.status), by: r.by, note: r.note, at: r.created_at };
    }

    // ---------- loaders: each returns the part of the state it refreshes ----------
    var load = {
      teams: function () {
        return db.from('teams').select('*').then(data).then(function (rows) {
          var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
          // the list of rooms (and their order) comes from js/seed.js; the database adds what players chose
          return { teams: SEED.teams.map(function (seed) {
            var r = byId[seed.id] || {};
            return { id: seed.id, code: r.code || seed.code, room: r.room || seed.room,
              members: Array.isArray(r.members) ? r.members : seed.members,
              name: r.name ? text(r.name, 40) : null, color: safeColor(r.color) || seed.color, avatar: safePhoto(r.avatar) };
          }) };
        });
      },
      ledger: function () {
        return db.from('ledger').select('id, team_id, label, points, submission_id, created_at').then(data).then(function (rows) {
          return { ledger: rows.map(function (r) {
            return { id: r.id, teamId: r.team_id, label: r.label, points: +r.points || 0, submissionId: r.submission_id, at: r.created_at };
          }) };
        });
      },
      submissions: function () {
        return db.from('submissions').select('id, team_id, kind, ref_id, value, status, by, note, created_at').order('created_at')
          .then(data).then(function (rows) {
            return { submissions: rows.map(mapSub) };        // proofs still on this phone are added back by the Store's outbox
          });
      },
      ballots: function () {
        return db.from('ballots').select('vote_id, voter_id, team_id').then(data).then(function (rows) {
          return { ballots: rows.map(function (r) { return { voteId: r.vote_id, voterId: r.voter_id, teamId: r.team_id }; }) };
        });
      },
      events: function () {
        return db.from('events').select('*').then(data).then(function (rows) {
          return { events: rows.map(function (r) {
            return { id: r.id, day: safeDay(r.day), time: r.time, title: r.title, detail: r.detail, position: +r.position || 0, at: r.created_at };
          }) };
        });
      },
      challenges: function () {
        return db.from('challenges').select('*').then(data).then(function (rows) {
          return { challenges: rows.map(function (r) {
            return { id: r.id, day: safeDay(r.day), kind: r.kind === 'race' ? 'race' : 'mission', title: r.title, desc: r.description,
              points: +r.points || 0, closes: r.closes, unit: r.unit, prize: r.prize, position: +r.position || 0 };
          }) };
        });
      },
      players: function () {
        return db.from('players').select('*').then(data).then(function (rows) {
          return { players: rows.map(function (r) { return { teamId: r.team_id, name: r.name, joinedAt: r.joined_at, lastSeen: r.last_seen }; }) };
        });
      },
      settings: function () {
        return db.from('settings').select('key, value').then(data).then(function (rows) {
          var s = { today: 'auto', message: SEED.message, epoch: 1 };
          rows.forEach(function (r) { s[r.key] = r.value; });
          checkEpoch(s.epoch);
          return { settings: s };
        });
      }
    };
    var tables = Object.keys(load);

    // The organisers restarted the game: the epoch changed, so this phone signs itself out.
    function checkEpoch(epoch) {
      var known = null;
      try { known = localStorage.getItem(EPOCH_KEY); } catch (e) {}
      if (known !== null && known !== String(epoch) && st.me) { ctx.signOutLocal(); setTimeout(function () { ctx.emit({ type: 'me' }); }, 0); }
      try { localStorage.setItem(EPOCH_KEY, String(epoch)); } catch (e) {}
    }

    function refresh(names) {
      return Promise.all(names.map(function (n) { return load[n](); })).then(function (parts) {
        var patch = {};
        parts.forEach(function (p) { for (var k in p) patch[k] = p[k]; });
        ctx.set(patch, names.length === 1 ? names[0] : 'data');
        return true;
      });
    }
    // a burst of changes on one table (a restart deletes many rows) becomes one reload
    var timers = {};
    function refreshSoon(name) {
      clearTimeout(timers[name]);
      timers[name] = setTimeout(function () { refresh([name]).catch(function (e) { console.error('[store] reload ' + name, e); }); }, 150);
    }

    // Create the rooms the first time the app runs against an empty project.
    // Existing rows are left alone, so nothing a team chose is ever overwritten.
    function seedTeams() {
      var rows = SEED.teams.map(function (t) { return { id: t.id, code: t.code, room: t.room, members: t.members, name: null, color: t.color }; });
      return db.from('teams').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).then(function (res) {
        if (res.error) console.warn('[store] could not create the rooms', res.error);
      });
    }

    // ---------- organiser session ----------
    function setAdmin(status, email) { ctx.set({ admin: { status: status, email: email || '' } }, 'admin'); }
    function checkAdmin(session) {
      if (!session || !session.user) { setAdmin('out'); return Promise.resolve(false); }
      return db.rpc('is_admin').then(function (res) {
        var yes = !res.error && res.data === true;
        setAdmin(yes ? 'in' : 'denied', session.user.email);
        return yes;
      });
    }

    return {
      voterId: function () { return VOTER; },

      init: function () {
        seedTeams()
          .then(function () { return refresh(tables); })
          .then(function () { ctx.set({ ready: true }, 'ready'); })
          .catch(function (e) {
            console.error('[store] first load failed', e);
            ctx.set({ ready: true }, 'ready');
            ctx.emit({ type: 'error', message: 'Could not reach the server. Check your connection and reload.' });
          });

        var ch = db.channel('skitrip');
        tables.forEach(function (name) {
          ch.on('postgres_changes', { event: '*', schema: 'public', table: name }, function () { refreshSoon(name); });
        });
        ch.subscribe();

        // a phone coming back from sleep may have missed live changes
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') refresh(tables).catch(function () {});
        });

        db.auth.getSession().then(function (res) { return checkAdmin(res.data && res.data.session); })
          .catch(function () { setAdmin('out'); });
        db.auth.onAuthStateChange(function (event, session) {
          // never call Supabase from inside this callback: defer it
          if (event === 'SIGNED_OUT') setTimeout(function () { setAdmin('out'); }, 0);
        });
      },

      // ---------- players ----------
      seen: function (teamId, name) {
        return db.rpc('player_seen', { p_team: teamId, p_name: name }).then(data);
      },
      updateTeam: function (teamId, patch) {
        return db.from('teams').update(patch).eq('id', teamId).then(data).then(function () { return refresh(['teams']); });
      },
      submit: function (tmp, photo) {
        return db.rpc('submit_proof', { p_team: tmp.teamId, p_kind: tmp.kind, p_ref: tmp.refId, p_value: tmp.value || '', p_by: tmp.by, p_photo: photo })
          .then(data).then(function (row) {
            var saved = mapSub(row);
            ctx.photos[saved.id] = photo;
            var list = st.submissions.filter(function (s) { return s.id !== tmp.id && s.id !== saved.id; });
            list.push(saved);
            ctx.set({ submissions: list }, 'submissions');
            return saved;
          });
      },
      // Upload a photo to the public "proofs" bucket and return its link.
      uploadPhoto: function (blob, folder) {
        if (!db.storage) return Promise.resolve(null);
        var path = String(folder).replace(/[^A-Za-z0-9_-]/g, '') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
        return db.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }).then(function (res) {
          if (res.error) throw res.error;
          var url = db.storage.from('proofs').getPublicUrl(path).data.publicUrl;
          return safePhoto(url);
        });
      },
      loadPhotos: function (ids) {
        ids = ids.filter(function (id) { return String(id).indexOf('tmp-') !== 0; });
        if (!ids.length) return Promise.resolve({});
        return db.from('submission_photos').select('submission_id, data').in('submission_id', ids).then(data).then(function (rows) {
          var map = {};
          rows.forEach(function (r) { var p = safePhoto(r.data); if (p) map[r.submission_id] = p; });
          return map;
        });
      },
      vote: function (voteId, teamId) {
        return db.from('ballots').insert({ vote_id: voteId, voter_id: VOTER, team_id: teamId }).then(function (res) {
          if (res.error) { refreshSoon('ballots'); throw res.error; }
          return true;
        });
      },

      // ---------- organisers ----------
      adminLogin: function (email, password) {
        return db.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) throw res.error;
          return checkAdmin(res.data.session);
        });
      },
      adminLogout: function () { return db.auth.signOut().then(function () { setAdmin('out'); return true; }); },

      approve: function (id, awards) {
        return db.rpc('approve_submission', { p_id: id, p_awards: awards }).then(data)
          .then(function (ok) { return refresh(['submissions', 'ledger']).then(function () { return ok === true; }); });
      },
      reject: function (id, note) {
        return db.rpc('reject_submission', { p_id: id, p_note: note }).then(data)
          .then(function (ok) { return refresh(['submissions']).then(function () { return ok === true; }); });
      },
      reopen: function (id) {
        return db.rpc('reopen_submission', { p_id: id }).then(data)
          .then(function (ok) { return refresh(['submissions', 'ledger']).then(function () { return ok === true; }); });
      },
      award: function (teamId, label, pts) {
        return db.from('ledger').insert({ team_id: teamId, label: label, points: pts }).then(data)
          .then(function () { return refresh(['ledger']); });
      },
      removeLedger: function (id) {
        return db.from('ledger').delete().eq('id', id).then(data).then(function () { return refresh(['ledger']); });
      },
      saveChallenge: function (c) {
        var row = {};
        ['day', 'kind', 'title', 'points', 'closes', 'unit', 'prize', 'position'].forEach(function (k) { if (c[k] != null) row[k] = c[k]; });
        if (c.desc != null) row.description = c.desc;
        var q;
        if (c.id) q = db.from('challenges').update(row).eq('id', c.id);
        else {
          if (row.position == null) row.position = st.challenges.reduce(function (m, x) { return Math.max(m, x.position); }, 0) + 10;
          q = db.from('challenges').insert(row);
        }
        return q.then(data).then(function () { return refresh(['challenges']); });
      },
      deleteChallenge: function (id) {
        return db.from('challenges').delete().eq('id', id).then(data).then(function () { return refresh(['challenges']); });
      },
      saveEvent: function (e) {
        var row = {};
        ['day', 'time', 'title', 'detail', 'position'].forEach(function (k) { if (e[k] != null) row[k] = e[k]; });
        var q = e.id ? db.from('events').update(row).eq('id', e.id) : db.from('events').insert(row);
        return q.then(data).then(function () { return refresh(['events']); });
      },
      deleteEvent: function (id) {
        return db.from('events').delete().eq('id', id).then(data).then(function () { return refresh(['events']); });
      },
      setSetting: function (key, value) {
        return db.from('settings').upsert({ key: key, value: value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
          .then(data).then(function () { return refresh(['settings']); });
      },
      restart: function () {
        return db.rpc('reset_game').then(data).then(function () { return refresh(tables); });
      }
    };
  };
})();
