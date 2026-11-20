// Screens and interactions for the player app.
(function () {
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var app = $('#app'), tabsEl = $('#tabs'), sheetEl = $('#sheet'), toastEl = $('#toast');
  var TABS = ['today', 'feed', 'mountain', 'team', 'schedule'];
  var join = { step: 'code', teamId: null, error: '' };   // state of the join flow
  var schedDay = null;                                     // day shown in the programme (null = today)
  var draft = null;                                        // submission being prepared in the sheet
  var pickedColor = null;

  function currentTab() {
    var t = location.hash.replace('#', '');
    return TABS.indexOf(t) >= 0 ? t : 'today';
  }
  function dayLabel(key) { var d = SEED.days.filter(function (x) { return x[0] === key; })[0]; return d ? d[1] : key; }
  function chip(sub) {
    if (!sub) return '';
    if (sub.sending) return sub.waiting ? '<span class="chip pending">Saved · waiting for signal</span>' : '<span class="chip pending">Sending…</span>';
    if (sub.status === 'pending') return '<span class="chip pending">Waiting for review</span>';
    if (sub.status === 'approved') return '<span class="chip ok">Approved</span>';
    return '<span class="chip no">Rejected</span>';
  }
  function initial(t) { return esc((Store.displayName(t)[0] || '?').toUpperCase()); }
  function ledgerRows(rows) {
    return rows.slice().reverse().map(function (l) {
      return '<li><span>' + esc(l.label) + '</span><b>' + (l.points < 0 ? '−' + (-l.points) : '+' + l.points) + '</b></li>';
    }).join('') || '<li class="empty"><span>No points yet. Go get some!</span></li>';
  }

  // ---------- Join ----------
  function viewLoading() {
    return '<section class="join"><div class="hero small">' + Mascot.svg('idle') + '</div><p class="lead">Waxing the skis…</p></section>';
  }
  function viewJoin() {
    if (join.step === 'name') {
      var t = Store.team(join.teamId);
      return '<section class="join"><div class="hero small">' + Mascot.svg('wave') + '</div>' +
        '<h1>Room found!</h1><p class="lead">' + esc(t.room) + '. Who are you?</p>' +
        '<div class="names">' + t.members.map(function (n) {
          return '<button class="btn ghost" data-act="pick-name" data-name="' + esc(n) + '">' + esc(n) + '</button>';
        }).join('') + '</div>' +
        '<button class="link" data-act="join-back">Not my room</button></section>';
    }
    return '<section class="join"><div class="hero">' + Mascot.svg('wave') + '</div>' +
      '<h1>MIM28 Ski Trip</h1><p class="lead">Fifteen rooms. One summit. Enter your room code to start climbing.</p>' +
      '<form data-form="join"><input id="code" class="field big" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="6" placeholder="ROOM CODE" aria-label="Room code">' +
      '<p class="error" id="join-error">' + esc(join.error) + '</p>' +
      '<button class="btn" type="submit">Join my room</button></form>' +
      (Store.demo ? '<p class="hint">' + (window.STORE_OFFLINE ? 'The server could not be reached, so this is the offline demo. ' : 'Demo: ') + 'use the code <b>DEMO</b></p>' : '') +
      '<p class="hint org"><a class="link" href="admin.html">Organisers</a></p></section>';
  }
  function viewNameTeam() {
    var used = Store.usedColors();
    var free = SEED.palette.filter(function (c) { return used.indexOf(c) < 0; });
    if (!pickedColor || free.indexOf(pickedColor) < 0) pickedColor = free[0];
    return '<section class="join"><div class="hero small">' + Mascot.svg('celebrate') + '</div>' +
      '<h1>You are first in!</h1><p class="lead">Name your team and choose your alpinist\'s colour. Choose well: your roommates are stuck with it.</p>' +
      '<form data-form="team"><input id="team-name" class="field" maxlength="24" placeholder="Team name" aria-label="Team name">' +
      '<div class="swatches">' + free.map(function (c) {
        return '<button type="button" class="swatch' + (c === pickedColor ? ' on' : '') + '" style="background:' + c + '" data-act="pick-color" data-color="' + c + '" aria-label="Colour ' + c + '"></button>';
      }).join('') + '</div>' +
      '<p class="error" id="team-error"></p><button class="btn" type="submit">Start climbing</button></form>' +
      '<button class="link" data-act="sign-out">Not my room</button></section>';
  }

  // ---------- Today ----------
  // proofs saved on this phone that could not go out yet
  function outboxBanner() {
    var o = Store.outbox();
    if (!o.count || !o.waiting) return '';
    return '<div class="outbox" role="status"><span><b>' + (o.count === 1 ? '1 proof' : o.count + ' proofs') + ' saved on your phone.</b> ' +
      'No signal right now: ' + (o.count === 1 ? 'it sends' : 'they send') + ' by itself as soon as you have some. Keep the app open if you can.</span>' +
      '<button class="btn small" data-act="send-now">Try now</button></div>';
  }
  function viewToday() {
    var me = Store.me(), team = Store.myTeam(), day = Store.today();
    var cards = Store.challenges(day).map(function (c) {
      var sub = Store.submissionFor(team.id, 'challenge', c.id);
      var send = '<button class="btn small" data-act="open-submit" data-kind="challenge" data-id="' + esc(c.id) + '">' + (sub ? 'Try again' : 'Submit proof') + '</button>';
      var action = !sub ? send
        : chip(sub) + (sub.value ? '<span class="val">' + esc(sub.value) + ' ' + esc(c.unit || '') + '</span>' : '') + (sub.status === 'rejected' ? send : '');
      return '<article class="card ' + c.kind + '"><header><span class="tag">' + (c.kind === 'race' ? 'Race' : 'Mission') + '</span>' +
        '<span class="pts">' + (c.kind === 'race' ? 'up to ' : '') + c.points + ' pts</span></header>' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p>' +
        (c.prize ? '<p class="fine">' + esc(c.prize) + '</p>' : '') +
        (sub && sub.status === 'rejected' && sub.note ? '<p class="note">The jury says: ' + esc(sub.note) + '</p>' : '') +
        '<footer><span class="fine">' + (c.closes ? 'Closes ' + esc(c.closes) : '') + '</span>' + action + '</footer></article>';
    }).join('') || '<article class="card quiet"><h3>No challenges yet today</h3><p>The salamander is still thinking. Your bingo card is always open in the Team tab.</p></article>';
    var votes = SEED.votes.filter(function (v) { return v.open; }).map(function (v) {
      var b = Store.ballot(v.id);
      return '<article class="card vote"><header><span class="tag">Vote</span></header><h3>' + esc(v.title) + '</h3><p>' + esc(v.note) + '</p>' +
        '<footer>' + (b ? '<span class="chip ok">You voted for ' + esc(Store.displayName(Store.team(b))) + '</span>'
          : '<span class="fine">Results at the reveal</span><button class="btn small" data-act="open-vote" data-id="' + v.id + '">Vote</button>') + '</footer></article>';
    }).join('');
    return '<section>' + outboxBanner() + '<div class="hello"><button class="mascot-btn" data-act="poke" aria-label="Poke the salamander">' + Mascot.svg('idle') + '</button>' +
      '<div class="bubble"><b>Hi ' + esc(me.name) + '!</b> ' + esc(Store.message()) + '</div></div>' +
      '<h2>' + esc(dayLabel(day)) + ' January <span>challenges</span></h2>' + cards + votes +
      (Store.demo ? '<p class="hint">Demo mode: nothing leaves this browser. Approve your own proofs in the <a class="link" href="admin.html">back office</a>.</p>' : '') +
      '</section>';
  }

  // ---------- Mountain ----------
  // The panorama climb lives in js/mountain.js; its look follows the time of day.
  function viewMountain() { return Mountain.view(); }

  // ---------- Team ----------
  function viewTeam() {
    var team = Store.myTeam(), me = Store.me();
    var rank = 1;
    Store.ranking().forEach(function (e, i) { if (e.team.id === team.id) rank = i + 1; });
    var squares = Store.bingoCard(team.id).map(function (sq) {
      var sub = Store.submissionFor(team.id, 'bingo', sq.id), cls = sub ? sub.status : 'empty';
      var open = !sub || sub.status === 'rejected';
      return '<button class="sq ' + cls + '" ' + (open ? 'data-act="open-submit" data-kind="bingo" data-id="' + sq.id + '"' : 'disabled') + '>' +
        (sub && sub.status !== 'rejected' ? '<img alt="" data-photo="' + esc(sub.id) + '">' : '') + '<span>' + esc(sq.text) + '</span></button>';
    }).join('');
    return '<section>' + outboxBanner() + '<div class="team-head" style="--team:' + team.color + '"><label class="badge edit' + (team.avatar ? ' has' : '') + '"' +
      (team.avatar ? ' style="background-image:url(' + team.avatar + ')"' : '') + ' title="Change team photo">' +
      (team.avatar ? '' : initial(team)) + '<input id="team-photo" type="file" accept="image/*"></label>' +
      '<div><h2>' + esc(Store.displayName(team)) + '</h2><p class="fine">' + esc(team.room) + ' · ' + team.members.map(function (n) {
        return n === me.name ? '<b>' + esc(n) + '</b>' : esc(n);
      }).join(', ') + '</p></div>' +
      '<div class="total"><b>' + Store.points(team.id) + '</b><span>pts · #' + rank + '</span></div></div>' +
      '<h2>Bingo <span>' + SEED.bingoPoints + ' pts a square, +' + SEED.bingoLine + ' a line. Dashed = waiting for review, red = try again.</span></h2>' +
      '<div class="bingo">' + squares + '</div>' +
      '<h2>Points <span>most recent first</span></h2><ul class="ledger panel">' + ledgerRows(Store.ledger(team.id)) + '</ul>' +
      '<p class="hint">Signed in as ' + esc(me.name) + '. <button class="link" data-act="sign-out">Switch player</button>' +
      (Store.demo ? ' · <button class="link" data-act="restart">Restart the demo</button>' : '') + '</p></section>';
  }

  // ---------- Schedule ----------
  function viewSchedule() {
    var day = schedDay || Store.today();
    var days = SEED.days.map(function (d) {
      return '<button class="day' + (d[0] === day ? ' on' : '') + '" data-act="pick-day" data-day="' + d[0] + '">' + d[1] + '</button>';
    }).join('');
    var items = Store.events(day).map(function (it) {
      return '<li><time>' + esc(it.time) + '</time><div><b>' + esc(it.title) + '</b>' + (it.detail ? '<p>' + esc(it.detail) + '</p>' : '') + '</div></li>';
    }).join('') || '<li class="empty"><div>Nothing planned yet for this day.</div></li>';
    return '<section><h2>Programme <span>times can still move, check back</span></h2><div class="days">' + days + '</div><ul class="timeline panel">' + items + '</ul></section>';
  }

  // ---------- Feed ----------
  function viewFeed() {
    var posts = Store.feed();
    if (!posts.length) {
      return '<section><h2>Feed <span>validated moments</span></h2>' +
        '<article class="card quiet"><h3>Nothing here yet</h3><p>Approved proofs land here, newest first. Send one from Today or from your bingo card.</p></article></section>';
    }
    var items = posts.map(function (p) {
      var name = Store.displayName(p.team), av = p.team.avatar;
      var head = '<header class="post-head" data-act="team-info" data-id="' + p.team.id + '">' +
        (av ? '<img class="avatar" alt="" src="' + av + '">'
            : '<span class="avatar ini" style="background:' + p.team.color + '">' + initial(p.team) + '</span>') +
        '<span class="post-meta"><b>' + esc(name) + '</b> accomplished <i>' + esc(p.text) + '</i></span></header>';
      return '<article class="post">' + head + '<img class="post-img" alt="' + esc(name + ': ' + p.text) + '" data-photo="' + esc(p.id) + '"></article>';
    }).join('');
    return '<section><h2>Feed <span>validated moments, newest first</span></h2>' + items + '</section>';
  }

  // ---------- Sheets ----------
  function openSheet(html) {
    sheetEl.innerHTML = '<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet-body" role="dialog" aria-modal="true">' +
      '<button class="close" data-act="close-sheet" aria-label="Close">×</button>' + html + '</div>';
    sheetEl.hidden = false;
    Store.hydratePhotos(sheetEl);
  }
  function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ''; draft = null; render(); }

  function sheetSubmit(kind, id) {
    var title, desc, unit = '';
    if (kind === 'bingo') {
      var sq = SEED.bingo.filter(function (b) { return b.id === id; })[0];
      title = 'Bingo square'; desc = sq.text;
    } else {
      var c = Store.challenge(id);
      if (!c) return;
      title = c.title; desc = c.desc; unit = c.kind === 'race' ? c.unit : '';
    }
    draft = { kind: kind, refId: id, unit: unit, race: kind !== 'bingo' && Store.challenge(id).kind === 'race', thumb: null };
    openSheet('<h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p>' +
      (draft.race ? '<label class="row">Your number<span class="unit"><input id="sub-value" class="field" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0"><em>' + esc(unit) + '</em></span></label>' : '') +
      '<label class="photo" id="photo-box"><input id="sub-photo" type="file" accept="image/*"><span id="photo-label">Add a photo or screenshot</span></label>' +
      (Store.demo ? '<button class="link" data-act="sample-photo">No photo handy? Use a sample</button>' : '') +
      '<p class="error" id="sub-error"></p><button class="btn" data-act="send-submit">Send to the jury</button>');
  }
  function sheetVote(id) {
    var v = SEED.votes.filter(function (x) { return x.id === id; })[0], mine = Store.me().teamId;
    openSheet('<h3>' + esc(v.title) + '</h3><p>' + esc(v.note) + '</p><div class="vote-list">' +
      Store.teams().filter(function (t) { return t.id !== mine; }).map(function (t) {
        return '<button class="btn ghost" data-act="cast-vote" data-vote="' + v.id + '" data-id="' + t.id + '"><span class="dot" style="background:' + t.color + '"></span>' + esc(Store.displayName(t)) + '</button>';
      }).join('') + '</div>');
  }
  function sheetTeam(id) {
    var t = Store.team(id), posts = Store.posts(id);
    if (!t) return;
    var badge = t.avatar
      ? '<div class="badge has" style="background-image:url(' + t.avatar + ')"></div>'
      : '<div class="badge">' + initial(t) + '</div>';
    var gallery = posts.length
      ? '<div class="gallery">' + posts.map(function (p) {
          return '<div class="gphoto" data-photo="' + esc(p.id) + '"><span>' + esc(p.text) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="fine">No posts yet.</p>';
    openSheet('<div class="team-head" style="--team:' + t.color + '">' + badge +
      '<div><h3>' + esc(Store.displayName(t)) + '</h3><p class="fine">' + esc(t.room) + ' · ' + t.members.map(esc).join(', ') + '</p></div>' +
      '<div class="total"><b>' + Store.points(id) + '</b><span>pts</span></div></div>' +
      '<h3 class="sub">Posts</h3>' + gallery +
      '<h3 class="sub">Points</h3><ul class="ledger">' + ledgerRows(Store.ledger(id)) + '</ul>');
  }

  // Shrink a photo in the browser before it is sent, so uploads stay light on mountain 4G.
  function shrink(file, max, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var inline = cv.toDataURL('image/jpeg', 0.72);
        if (cv.toBlob) cv.toBlob(function (blob) { done(inline, blob); }, 'image/jpeg', 0.72);
        else done(inline, null);
      };
      img.onerror = function () { done(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { done(null); };
    reader.readAsDataURL(file);
  }
  function samplePhoto() {
    var cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
    var g = cv.getContext('2d');
    g.fillStyle = '#18244D'; g.fillRect(0, 0, 320, 240);
    g.fillStyle = '#F2F6FF'; g.beginPath(); g.moveTo(0, 240); g.lineTo(110, 90); g.lineTo(170, 160); g.lineTo(230, 70); g.lineTo(320, 240); g.fill();
    g.fillStyle = '#FFC933'; g.beginPath(); g.arc(262, 48, 22, 0, 7); g.fill();
    return cv.toDataURL('image/jpeg', 0.72);
  }
  function setPhoto(dataUrl, blob) {
    if (!draft) return;
    draft.thumb = dataUrl; draft.blob = blob || null;
    var box = $('#photo-box');
    if (box && dataUrl) { box.style.backgroundImage = 'url(' + dataUrl + ')'; box.classList.add('has'); $('#photo-label').textContent = 'Change photo'; }
    if (!dataUrl) $('#sub-error').textContent = 'That file could not be read. Try another photo.';
    else $('#sub-error').textContent = '';
  }

  // ---------- Toast ----------
  // One at a time. A toast stays at least 2.2 s, so two pieces of news in a row are both read.
  var toastQueue = [], toastShownAt = 0, toastHide, toastNext;
  function showToast(t) {
    toastEl.innerHTML = Mascot.svg(t[1] || 'celebrate') + '<div>' + t[0] + '</div>';
    toastEl.hidden = false; toastShownAt = Date.now();
    clearTimeout(toastHide); clearTimeout(toastNext);
    toastHide = setTimeout(function () { toastEl.hidden = true; }, 4200);
    if (toastQueue.length) toastNext = setTimeout(function () { showToast(toastQueue.shift()); }, 2200);
  }
  function toast(html, pose) {
    var wait = 2200 - (Date.now() - toastShownAt);
    if (toastEl.hidden || wait <= 0) { showToast([html, pose]); return; }
    toastQueue.push([html, pose]);
    if (toastQueue.length === 1) { clearTimeout(toastNext); toastNext = setTimeout(function () { showToast(toastQueue.shift()); }, wait); }
  }

  // ---------- Time of day ----------
  // The whole app follows the phone's clock: morning 06-11, day 11-16, golden 16-19, night 19-06
  // (?time=morning|day|golden|night previews one). The palettes live at the end of css/style.css.
  var BAR = { morning: '#F7EEF4', day: '#EEF4FC', golden: '#2B1734', night: '#0B0820' }, shownTime = null;
  function applyTime() {
    var t = Mountain.period();
    if (t === shownTime) return;
    shownTime = t;
    document.body.setAttribute('data-time', t);
    var bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute('content', BAR[t]);
  }
  // check once a minute; when the period changes, redraw (the mountain re-draws its own light)
  setInterval(function () {
    var before = shownTime;
    if (Mountain.period() === before) return;
    if (document.querySelector('#sheet:not([hidden]) input, #app input:focus')) { applyTime(); return; }   // don't wipe what someone is typing
    render();
  }, 60000);

  // ---------- Render ----------
  function view() {
    var me = Store.me(), team = Store.myTeam();
    if (!me) return { welcome: true, html: viewJoin() };
    if (!Store.ready()) return { welcome: true, html: viewLoading() };       // signed in, data still loading
    if (!team) { Store.signOut(); return { welcome: true, html: viewJoin() }; }
    if (!team.name) return { welcome: true, html: viewNameTeam() };
    return { tab: currentTab() };
  }
  function render() {
    var v = view();
    document.body.classList.toggle('welcome', !!v.welcome);
    document.body.classList.toggle('in-app', !v.welcome);
    var onMountain = !v.welcome && v.tab === 'mountain';
    document.body.classList.toggle('on-mountain', onMountain);
    if (!onMountain) Mountain.leave();
    applyTime();
    tabsEl.hidden = !!v.welcome;
    if (v.welcome) {
      // data can change while someone is typing their room code or team name: keep what they typed
      var keep = {}, focus = document.activeElement && document.activeElement.id;
      Array.prototype.forEach.call(app.querySelectorAll('input[id]'), function (i) { keep[i.id] = i.value; });
      app.innerHTML = v.html;
      for (var id in keep) { var el = document.getElementById(id); if (el) el.value = keep[id]; }
      if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
      return;
    }
    Array.prototype.forEach.call(tabsEl.querySelectorAll('a'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-tab') === v.tab);
    });
    app.innerHTML = { today: viewToday, feed: viewFeed, mountain: viewMountain, team: viewTeam, schedule: viewSchedule }[v.tab]();
    if (v.tab === 'mountain') Mountain.mount();
    Store.hydratePhotos(app);
  }

  // ---------- Events ----------
  function resetJoin() { join = { step: 'code', teamId: null, error: '' }; }
  var actions = {
    'join-back': function () { resetJoin(); render(); },
    'pick-name': function (el) { Store.signIn(join.teamId, el.getAttribute('data-name')); location.hash = 'today'; },
    'pick-color': function (el) {
      pickedColor = el.getAttribute('data-color');
      Array.prototype.forEach.call(document.querySelectorAll('.swatch'), function (s) { s.classList.toggle('on', s === el); });
    },
    'poke': function (el) { Mascot.play($('.mascot', el), 'dance', 2200); },
    'sign-out': function () { resetJoin(); Store.signOut(); },
    'restart': function () {
      openSheet('<h3>Restart the demo?</h3><p>Points, proofs, votes and team names go back to the start, and you choose your room again.</p>' +
        '<button class="btn" data-act="restart-yes">Yes, restart</button>');
    },
    'restart-yes': function () { sheetEl.hidden = true; sheetEl.innerHTML = ''; resetJoin(); Store.restart(); },
    'open-submit': function (el) { sheetSubmit(el.getAttribute('data-kind'), el.getAttribute('data-id')); },
    'open-vote': function (el) { sheetVote(el.getAttribute('data-id')); },
    'team-info': function (el) { sheetTeam(el.getAttribute('data-id')); },
    'close-sheet': closeSheet,
    'sample-photo': function () { setPhoto(samplePhoto()); },
    'send-now': function (el) { el.disabled = true; el.textContent = 'Trying…'; Store.sendNow(); },
    'send-submit': function () {
      var value = '';
      if (draft.race) {
        value = ($('#sub-value').value || '').trim();
        if (!value || isNaN(+value) || +value <= 0) { $('#sub-error').textContent = 'Enter your number first.'; return; }
      }
      if (!draft.thumb) { $('#sub-error').textContent = 'Add a photo as proof first.'; return; }
      var d = draft; closeSheet();
      // saved on the phone first, then sent: bad signal can delay a proof but never lose it
      Store.submit(d.kind, d.refId, value, d.thumb);
    },
    'cast-vote': function (el) {
      var t = Store.team(el.getAttribute('data-id'));
      closeSheet();
      if (Store.vote(el.getAttribute('data-vote'), t.id)) toast('<b>Vote counted</b> for ' + esc(Store.displayName(t)) + '.', 'wave');
    },
    'pick-day': function (el) { schedDay = el.getAttribute('data-day'); render(); },
    'mtn-zoom': function (el) { Mountain.zoom(el.getAttribute('data-z')); },
    'mtn-pick': function (el) { Mountain.select(el.getAttribute('data-id')); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var kind = e.target.getAttribute('data-form');
    if (kind === 'join') {
      var room = Store.findRoom($('#code').value);
      if (!room) { join.error = 'No room has that code. Check it with your roommates.'; $('#join-error').textContent = join.error; return; }
      join = { step: 'name', teamId: room.id, error: '' }; render();
    } else if (kind === 'team') {
      var name = $('#team-name').value.trim();
      if (name.length < 2) { $('#team-error').textContent = 'Give your team a name first.'; return; }
      Store.nameTeam(name, pickedColor);
      location.hash = 'today';
      toast('<b>' + esc(name) + '</b> is on the mountain. Good luck!', 'celebrate');
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'code') { join.error = ''; $('#join-error').textContent = ''; }
    if (e.target.id === 'team-name') $('#team-error').textContent = '';
    if (e.target.id === 'sub-value') $('#sub-error').textContent = '';
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'sub-photo' && e.target.files[0]) shrink(e.target.files[0], Store.demo ? 640 : 1080, setPhoto);
    if (e.target.id === 'team-photo' && e.target.files[0]) shrink(e.target.files[0], 256, function (d, blob) {
      if (!d) return;
      Store.uploadPhoto(blob, d).then(function (photo) {
        if (photo) { Store.setAvatar(photo); toast('<b>Nice!</b> Team photo set.', 'celebrate'); }
      });
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheetEl.hidden) closeSheet(); });
  window.addEventListener('hashchange', function () { app.scrollTop = 0; window.scrollTo(0, 0); render(); });

  Store.on(function (evt) {
    if (evt.type === 'approved') toast('<b>' + (evt.points ? '+' + evt.points + ' points!' : 'Approved!') + '</b> ' + esc(evt.label), 'celebrate');
    if (evt.type === 'rejected') toast('<b>Not this time.</b> ' + esc(evt.label) + (evt.note ? ': ' + esc(evt.note) : '') + '. You can try again.', 'idle');
    if (evt.type === 'sent') toast('<b>Sent!</b> ' + (evt.late ? esc(evt.label) + ' finally went through. ' : '') + 'The jury is having a look.', 'wave');
    if (evt.type === 'queued') toast('<b>No signal?</b> No worries, your proof is saved on your phone and will send by itself.', 'idle');
    if (evt.type === 'error') toast('<b>Oops.</b> ' + esc(evt.message), 'idle');
    if (evt.type === 'me' && !Store.me()) { resetJoin(); if (!sheetEl.hidden) { sheetEl.hidden = true; sheetEl.innerHTML = ''; draft = null; } }
    if (sheetEl.hidden) render();
  });
  render();
})();
