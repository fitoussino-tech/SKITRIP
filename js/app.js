// Screens and interactions for the player app.
(function () {
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var app = $('#app'), tabsEl = $('#tabs'), sheetEl = $('#sheet'), toastEl = $('#toast');
  var join = { step: 'code', teamId: null, error: '' };   // state of the join flow
  var schedDay = SEED.today;
  var draft = null;                                        // submission being prepared in the sheet
  var pickedColor = null;

  function currentTab() {
    var t = location.hash.replace('#', '');
    return ['today', 'feed', 'mountain', 'team', 'schedule'].indexOf(t) >= 0 ? t : 'today';
  }
  function dayLabel(key) { return SEED.days.filter(function (d) { return d[0] === key; })[0][1]; }
  function chip(sub) {
    if (!sub) return '';
    if (sub.status === 'pending') return '<span class="chip pending">Waiting for review</span>';
    if (sub.status === 'approved') return '<span class="chip ok">Approved</span>';
    return '<span class="chip no">Rejected</span>';
  }

  // ---------- Join ----------
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
      (Store.demo ? '<p class="hint">Demo: use the code <b>DEMO</b></p>' : '') + '</section>';
  }
  function viewNameTeam() {
    var t = Store.myTeam(), used = Store.usedColors();
    var free = SEED.palette.filter(function (c) { return used.indexOf(c) < 0; });
    if (!pickedColor || free.indexOf(pickedColor) < 0) pickedColor = free[0];
    return '<section class="join"><div class="hero small">' + Mascot.svg('celebrate') + '</div>' +
      '<h1>You are first in!</h1><p class="lead">Name your team and choose your alpinist\'s colour. Choose well: your roommates are stuck with it.</p>' +
      '<form data-form="team"><input id="team-name" class="field" maxlength="24" placeholder="Team name" aria-label="Team name">' +
      '<div class="swatches">' + free.map(function (c) {
        return '<button type="button" class="swatch' + (c === pickedColor ? ' on' : '') + '" style="background:' + c + '" data-act="pick-color" data-color="' + c + '" aria-label="Colour ' + c + '"></button>';
      }).join('') + '</div>' +
      '<p class="error" id="team-error"></p><button class="btn" type="submit">Start climbing</button></form></section>';
  }

  // ---------- Today ----------
  function viewToday() {
    var me = Store.me(), team = Store.myTeam();
    var cards = SEED.challenges.filter(function (c) { return c.day === SEED.today; }).map(function (c) {
      var sub = Store.submissionFor(team.id, 'challenge', c.id);
      var action = sub
        ? chip(sub) + (sub.value ? '<span class="val">' + esc(sub.value) + ' ' + esc(c.unit || '') + '</span>' : '')
        : '<button class="btn small" data-act="open-submit" data-kind="challenge" data-id="' + c.id + '">Submit proof</button>';
      return '<article class="card ' + c.kind + '"><header><span class="tag">' + (c.kind === 'race' ? 'Race' : 'Mission') + '</span>' +
        '<span class="pts">' + (c.kind === 'race' ? 'up to ' : '') + c.points + ' pts</span></header>' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p>' +
        (c.prize ? '<p class="fine">' + esc(c.prize) + '</p>' : '') +
        '<footer><span class="fine">Closes ' + esc(c.closes) + '</span>' + action + '</footer></article>';
    }).join('');
    var votes = SEED.votes.filter(function (v) { return v.open; }).map(function (v) {
      var b = Store.ballot(v.id);
      return '<article class="card vote"><header><span class="tag">Vote</span></header><h3>' + esc(v.title) + '</h3><p>' + esc(v.note) + '</p>' +
        '<footer>' + (b ? '<span class="chip ok">You voted for ' + esc(Store.displayName(Store.team(b))) + '</span>'
          : '<span class="fine">Results at the reveal</span><button class="btn small" data-act="open-vote" data-id="' + v.id + '">Vote</button>') + '</footer></article>';
    }).join('');
    return '<section><div class="hello"><button class="mascot-btn" data-act="poke" aria-label="Poke the salamander">' + Mascot.svg('idle') + '</button>' +
      '<div class="bubble"><b>Hi ' + esc(me.name) + '!</b> ' + esc(SEED.message) + '</div></div>' +
      '<h2>' + esc(dayLabel(SEED.today)) + ' January <span>challenges</span></h2>' + cards + votes +
      (Store.demo ? '<p class="hint">Demo mode: proofs approve themselves after a few seconds. <button class="link" data-act="reset">Reset the demo</button></p>' : '') +
      '</section>';
  }

  // ---------- Mountain ----------
  function viewMountain() {
    var ranking = Store.ranking(), mine = Store.me().teamId, top = ranking[0].points || 1;
    var rows = ranking.map(function (e, i) {
      return '<li class="' + (e.team.id === mine ? 'mine' : '') + '" data-act="team-info" data-id="' + e.team.id + '">' +
        '<span class="rank">' + (i + 1) + '</span><span class="dot" style="background:' + e.team.color + '"></span>' +
        '<span class="name">' + esc(Store.displayName(e.team)) + '<i style="width:' + Math.round(e.points / top * 100) + '%;background:' + e.team.color + '"></i></span>' +
        '<span class="score">' + e.points + '</span></li>';
    }).join('');
    return '<section><h2>The mountain <span>' + SEED.summit + ' pts to the summit</span></h2>' +
      '<div class="mountain-wrap">' + Mountain.html(ranking, mine) + '</div>' +
      '<ol class="ranking">' + rows + '</ol></section>';
  }

  // ---------- Team ----------
  function viewTeam() {
    var team = Store.myTeam(), me = Store.me();
    var ranking = Store.ranking(), rank = 1;
    ranking.forEach(function (e, i) { if (e.team.id === team.id) rank = i + 1; });
    var squares = Store.bingoCard(team.id).map(function (sq) {
      var sub = Store.submissionFor(team.id, 'bingo', sq.id), cls = sub ? sub.status : 'empty';
      return '<button class="sq ' + cls + '" ' + (sub ? 'disabled' : 'data-act="open-submit" data-kind="bingo" data-id="' + sq.id + '"') + '>' +
        (sub && sub.thumb ? '<img alt="" src="' + sub.thumb + '">' : '') + '<span>' + esc(sq.text) + '</span></button>';
    }).join('');
    var ledger = Store.ledger(team.id).slice().reverse().map(function (l) {
      return '<li><span>' + esc(l.label) + '</span><b>+' + l.points + '</b></li>';
    }).join('');
    return '<section><div class="team-head" style="--team:' + team.color + '"><label class="badge edit' + (team.avatar ? ' has' : '') + '"' +
      (team.avatar ? ' style="background-image:url(' + team.avatar + ')"' : '') + ' title="Change team photo">' +
      (team.avatar ? '' : esc(Store.displayName(team)[0].toUpperCase())) + '<input id="team-photo" type="file" accept="image/*"></label>' +
      '<div><h2>' + esc(Store.displayName(team)) + '</h2><p class="fine">' + esc(team.room) + ' · ' + team.members.map(function (n) {
        return n === me.name ? '<b>' + esc(n) + '</b>' : esc(n);
      }).join(', ') + '</p></div>' +
      '<div class="total"><b>' + Store.points(team.id) + '</b><span>pts · #' + rank + '</span></div></div>' +
      '<h2>Bingo <span>' + SEED.bingoPoints + ' pts a square, +' + SEED.bingoLine + ' a line</span></h2>' +
      '<div class="bingo">' + squares + '</div>' +
      '<h2>Points <span>most recent first</span></h2><ul class="ledger">' + ledger + '</ul>' +
      '<p class="hint">Signed in as ' + esc(me.name) + '. <button class="link" data-act="sign-out">Not you?</button></p></section>';
  }

  // ---------- Schedule ----------
  function viewSchedule() {
    var days = SEED.days.map(function (d) {
      return '<button class="day' + (d[0] === schedDay ? ' on' : '') + '" data-act="pick-day" data-day="' + d[0] + '">' + d[1] + '</button>';
    }).join('');
    var base = (SEED.schedule[schedDay] || []).map(function (it) { return { time: it[0], title: it[1], detail: it[2] }; });
    var extra = Store.events(schedDay).map(function (e) { return { time: e.time, title: e.title, detail: e.detail }; });
    var items = base.concat(extra).map(function (it) {
      return '<li><time>' + esc(it.time) + '</time><div><b>' + esc(it.title) + '</b>' + (it.detail ? '<p>' + esc(it.detail) + '</p>' : '') + '</div></li>';
    }).join('');
    return '<section><h2>Programme <span>draft, times to be confirmed</span></h2><div class="days">' + days + '</div><ul class="timeline">' + items + '</ul></section>';
  }

  // ---------- Feed ----------
  function viewFeed() {
    var posts = Store.feed();
    if (!posts.length) {
      return '<section><h2>Feed <span>validated moments</span></h2>' +
        '<p class="lead" style="margin-top:28px">Nothing here yet. Approved proofs land here, newest first. Send one from Today or your Team bingo.</p></section>';
    }
    var items = posts.map(function (p) {
      var name = Store.displayName(p.team), av = p.team.avatar;
      var head = '<header class="post-head" data-act="team-info" data-id="' + p.team.id + '">' +
        (av ? '<img class="avatar" alt="" src="' + av + '">'
            : '<span class="avatar ini" style="background:' + p.team.color + '">' + esc(name[0].toUpperCase()) + '</span>') +
        '<span class="post-meta"><b>' + esc(name) + '</b> accomplished <i>' + esc(p.text) + '</i></span></header>';
      return '<article class="post">' + head + '<img class="post-img" alt="" src="' + p.thumb + '"></article>';
    }).join('');
    return '<section><h2>Feed <span>validated moments, newest first</span></h2>' + items + '</section>';
  }

  // ---------- Sheets ----------
  function openSheet(html) {
    sheetEl.innerHTML = '<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet-body" role="dialog" aria-modal="true">' +
      '<button class="close" data-act="close-sheet" aria-label="Close">×</button>' + html + '</div>';
    sheetEl.hidden = false;
  }
  function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ''; draft = null; render(); }

  function sheetSubmit(kind, id) {
    var title, desc, unit = '';
    if (kind === 'bingo') {
      var sq = SEED.bingo.filter(function (b) { return b.id === id; })[0];
      title = 'Bingo square'; desc = sq.text;
    } else {
      var c = SEED.challenges.filter(function (x) { return x.id === id; })[0];
      title = c.title; desc = c.desc; unit = c.kind === 'race' ? c.unit : '';
    }
    draft = { kind: kind, refId: id, unit: unit, thumb: null };
    openSheet('<h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p>' +
      (unit ? '<label class="row">Your number<span class="unit"><input id="sub-value" class="field" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0"><em>' + esc(unit) + '</em></span></label>' : '') +
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
    var t = Store.team(id), ledger = Store.ledger(id).slice().reverse(), posts = Store.posts(id);
    var badge = t.avatar
      ? '<div class="badge has" style="background-image:url(' + t.avatar + ')"></div>'
      : '<div class="badge">' + esc(Store.displayName(t)[0].toUpperCase()) + '</div>';
    var gallery = posts.length
      ? '<div class="gallery">' + posts.map(function (p) {
          return '<div class="gphoto" style="background-image:url(' + p.thumb + ')"><span>' + esc(p.text) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="fine">No posts yet.</p>';
    openSheet('<div class="team-head" style="--team:' + t.color + '">' + badge +
      '<div><h3>' + esc(Store.displayName(t)) + '</h3><p class="fine">' + esc(t.room) + ' · ' + t.members.map(esc).join(', ') + '</p></div>' +
      '<div class="total"><b>' + Store.points(id) + '</b><span>pts</span></div></div>' +
      '<h3 class="sub">Posts</h3>' + gallery +
      '<h3 class="sub">Points</h3><ul class="ledger">' + ledger.map(function (l) { return '<li><span>' + esc(l.label) + '</span><b>+' + l.points + '</b></li>'; }).join('') + '</ul>');
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
        var preview = cv.toDataURL('image/jpeg', 0.72);
        if (cv.toBlob) cv.toBlob(function (blob) { done({ blob: blob, preview: preview }); }, 'image/jpeg', 0.72);
        else done({ blob: null, preview: preview });
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
  function setPhoto(dataUrl) {
    if (!draft) return;
    draft.thumb = dataUrl;
    var box = $('#photo-box');
    if (box && dataUrl) { box.style.backgroundImage = 'url(' + dataUrl + ')'; box.classList.add('has'); $('#photo-label').textContent = 'Change photo'; }
    if (!dataUrl) $('#sub-error').textContent = 'That file could not be read. Try another photo.';
    else $('#sub-error').textContent = '';
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(html, pose) {
    toastEl.innerHTML = Mascot.svg(pose || 'celebrate') + '<div>' + html + '</div>';
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3800);
  }

  // ---------- Render ----------
  function render() {
    var me = Store.me(), team = Store.myTeam();
    if (!me) { tabsEl.hidden = true; app.innerHTML = viewJoin(); return; }
    if (!team.name) { tabsEl.hidden = true; app.innerHTML = viewNameTeam(); return; }
    var tab = currentTab();
    tabsEl.hidden = false;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('a'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-tab') === tab);
    });
    app.innerHTML = { today: viewToday, feed: viewFeed, mountain: viewMountain, team: viewTeam, schedule: viewSchedule }[tab]();
    if (tab === 'mountain') Mountain.climb(app);
  }

  // ---------- Events ----------
  var actions = {
    'join-back': function () { join = { step: 'code', teamId: null, error: '' }; render(); },
    'pick-name': function (el) { Store.signIn(join.teamId, el.getAttribute('data-name')); location.hash = 'today'; },
    'pick-color': function (el) {
      pickedColor = el.getAttribute('data-color');
      Array.prototype.forEach.call(document.querySelectorAll('.swatch'), function (s) { s.classList.toggle('on', s === el); });
    },
    'poke': function (el) { Mascot.play($('.mascot', el), 'dance', 2200); },
    'reset': function () { join = { step: 'code', teamId: null, error: '' }; Store.reset(); },
    'sign-out': function () { join = { step: 'code', teamId: null, error: '' }; Store.reset(); },
    'open-submit': function (el) { sheetSubmit(el.getAttribute('data-kind'), el.getAttribute('data-id')); },
    'open-vote': function (el) { sheetVote(el.getAttribute('data-id')); },
    'team-info': function (el) { sheetTeam(el.getAttribute('data-id')); },
    'close-sheet': closeSheet,
    'sample-photo': function () { setPhoto(samplePhoto()); },
    'send-submit': function () {
      var value = '';
      if (draft.unit) {
        value = ($('#sub-value').value || '').trim();
        if (!value || isNaN(+value) || +value <= 0) { $('#sub-error').textContent = 'Enter your number first.'; return; }
      }
      if (!draft.thumb) { $('#sub-error').textContent = 'Add a photo as proof first.'; return; }
      var d = draft; closeSheet();
      toast('<b>Sending…</b> uploading your photo.', 'wave');
      Store.uploadPhoto(d.blob, d.thumb).then(function (url) {
        Store.submit(d.kind, d.refId, value, url || d.thumb);
        toast('<b>Sent!</b> The jury is having a look.', 'wave');
      });
    },
    'cast-vote': function (el) {
      var t = Store.team(el.getAttribute('data-id'));
      closeSheet(); Store.vote(el.getAttribute('data-vote'), t.id);
      toast('<b>Vote counted</b> for ' + esc(Store.displayName(t)) + '.', 'wave');
    },
    'pick-day': function (el) { schedDay = el.getAttribute('data-day'); render(); }
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
    if (e.target.id === 'code') $('#join-error').textContent = '';
    if (e.target.id === 'team-name') $('#team-error').textContent = '';
    if (e.target.id === 'sub-value') $('#sub-error').textContent = '';
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'sub-photo' && e.target.files[0]) shrink(e.target.files[0], 1280, function (r) {
      if (!r) { setPhoto(null); return; }
      draft.blob = r.blob; setPhoto(r.preview);
    });
    if (e.target.id === 'team-photo' && e.target.files[0]) shrink(e.target.files[0], 256, function (r) {
      if (!r || !r.preview) return;
      toast('<b>Uploading…</b>', 'wave');
      Store.uploadPhoto(r.blob, r.preview).then(function (url) {
        if (url) { Store.setAvatar(url); toast('<b>Nice!</b> Team photo set.', 'celebrate'); }
      });
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheetEl.hidden) closeSheet(); });
  window.addEventListener('hashchange', render);

  Store.on(function (evt) {
    if (evt.type === 'approved') toast('<b>+' + evt.points + ' points!</b> ' + esc(evt.label) + ' approved.', 'celebrate');
    if (sheetEl.hidden) render();
  });
  render();
})();
