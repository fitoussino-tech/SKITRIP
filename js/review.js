// Swipe review for the back office (admin.html): one proof at a time, full screen.
// Swipe right to approve, left to reject (then pick a reason), down to look at it later.
// On a laptop: → approve, ← reject, ↓ later, Z undo, Esc close. Tap the photo to see it full size.
// It only uses Store, like the rest of the back office; admin.js opens it with Review.open(filters).
(function () {
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var REASONS = ['Too blurry to tell', 'Not everyone from the room is in it', 'Doesn’t match the challenge', 'Already sent this one'];
  var ICON = {
    yes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    later: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v11M7 12l5 5 5-5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L5 11l4 4"/><path d="M5 11h9a5 5 0 010 10h-3"/></svg>'
  };

  var deck = document.createElement('div');
  deck.id = 'deck'; deck.hidden = true;
  deck.setAttribute('role', 'dialog'); deck.setAttribute('aria-modal', 'true'); deck.setAttribute('aria-label', 'Review proofs one by one');
  document.body.appendChild(deck);

  var h = {};                 // helpers lent by admin.js: teamChip, ago, plural
  var st = {
    open: false, filter: null,
    queue: [],                // proof ids still to look at, the current one first
    done: 0,
    last: null,               // { id, kind: 'approve' | 'reject' | 'skip', name } for Undo
    rejecting: null,          // id whose reason panel is open
    handled: {},              // ids we approved/rejected: never put back by a refresh
    hold: {},                 // ids just undone: keep them while the database catches up
    note: '', noteTimer: 0,
    busy: false
  };

  function find(id) { return Store.proofs({}).filter(function (p) { return p.id === id; })[0]; }
  function pendingIds() { return Store.proofs(st.filter).map(function (p) { return p.id; }); }
  function kindOf(p) {
    if (p.kind === 'bingo') return ['bingo', 'Bingo'];
    var c = Store.challenges().filter(function (x) { return x.id === p.refId; })[0];
    return c ? [c.kind, { mission: 'Mission', race: 'Race', vote: 'Vote' }[c.kind] || 'Challenge'] : ['mission', 'Challenge'];
  }
  function filterLabel() {
    var bits = [];
    if (st.filter.teamId) { var t = Store.team(st.filter.teamId); if (t) bits.push(Store.displayName(t)); }
    if (st.filter.ref === 'bingo') bits.push('Bingo squares');
    else if (st.filter.ref) {
      var c = Store.challenges().filter(function (x) { return 'challenge:' + x.id === st.filter.ref; })[0];
      if (c) bits.push(c.title);
    }
    return bits.length ? bits.join(' · ') : 'All rooms';
  }

  // ---------- drawing ----------
  function top() {
    var left = st.queue.length, total = left + st.done;
    return '<header class="rv-top"><button class="rv-close" data-rv="close" aria-label="Close and go back to the list">' + ICON.no + '</button>' +
      '<div class="rv-count"><b>' + (left ? left + ' to review' : 'All done') + '</b><span>' + esc(filterLabel()) + (st.done ? ' · ' + st.done + ' done' : '') + '</span></div>' +
      '<span class="rv-bar" aria-hidden="true"><i style="width:' + (total ? Math.round(st.done / total * 100) : 100) + '%"></i></span></header>';
  }
  function card(p, cls) {
    var k = kindOf(p);
    return '<article class="rv-card ' + cls + '" data-id="' + esc(p.id) + '">' +
      '<div class="rv-photo"><div class="rv-blur"></div><img alt="Proof photo from ' + esc(Store.displayName(p.team)) + '" draggable="false"></div>' +
      '<span class="rv-stamp yes">Approve +' + p.worth + '</span><span class="rv-stamp no">Reject</span><span class="rv-stamp later">Later</span>' +
      '<div class="rv-info"><div class="rv-who">' + h.teamChip(p.team) + '<span class="rv-pts">+' + p.worth + '</span></div>' +
      '<p class="rv-what"><span class="kind ' + k[0] + '">' + k[1] + '</span> ' + esc(p.text) + '</p>' +
      (p.value ? '<p class="rv-value">' + esc(p.value) + ' <small>' + esc(p.unit) + '</small></p>' : '') +
      '<p class="fine">sent by ' + esc(p.by || '?') + ' · ' + h.ago(p.at) + '</p></div></article>';
  }
  function controls() {
    var can = !!st.queue.length;
    return '<div class="rv-ctrl">' +
      '<button class="rv-btn no" data-rv="reject" aria-label="Reject (left arrow)"' + (can ? '' : ' disabled') + '>' + ICON.no + '</button>' +
      '<button class="rv-btn mini" data-rv="undo" aria-label="Undo the last one (Z)"' + (st.last ? '' : ' disabled') + '>' + ICON.undo + '</button>' +
      '<button class="rv-btn mini" data-rv="skip" aria-label="Later (down arrow)"' + (st.queue.length > 1 ? '' : ' disabled') + '>' + ICON.later + '</button>' +
      '<button class="rv-btn yes" data-rv="approve" aria-label="Approve (right arrow)"' + (can ? '' : ' disabled') + '>' + ICON.yes + '</button></div>' +
      '<p class="rv-keys">Swipe right to approve, left to reject, down for later<span> · keys → ← ↓, Z undo</span></p>';
  }
  function panel() {
    var p = find(st.rejecting);
    return '<div class="rv-sheet" role="group" aria-label="Reason for rejecting"><h3>Why reject it?</h3>' +
      '<p class="fine">' + (p ? esc(Store.displayName(p.team)) + ' sees the reason and can send a new photo.' : '') + '</p>' +
      '<div class="rv-reasons">' + REASONS.map(function (r) { return '<button class="rv-reason" data-rv="reason" data-note="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div>' +
      '<form class="rv-other" data-rv-form="note"><input id="rv-note" class="field" maxlength="120" placeholder="Other reason…" autocomplete="off">' +
      '<button class="btn small no">Reject</button></form>' +
      '<div class="acts"><button class="btn small quiet" data-rv="reason" data-note="">Reject without a reason</button>' +
      '<button class="btn small quiet" data-rv="unreject">Keep it</button></div></div>';
  }
  function doneView() {
    return '<div class="rv-done">' + Mascot.svg('celebrate') + '<h2>All clear!</h2><p>' +
      (st.done ? 'You went through ' + h.plural(st.done, 'proof') + '. ' : '') + 'New photos show up here as soon as they are sent.</p>' +
      '<button class="btn" data-rv="close">Back to the list</button></div>';
  }
  function note() {
    if (!st.note) return '';
    return '<div class="rv-toast" role="status">' + esc(st.note) +
      (st.last && st.last.kind !== 'skip' ? ' <button data-rv="undo">Undo</button>' : '') + '</div>';
  }

  function draw(enter) {
    if (!st.open) return;
    var id = st.queue[0], p = id && find(id), nx = st.queue[1] && find(st.queue[1]);
    var stage;
    if (!p) stage = doneView();
    else if (st.rejecting) stage = '<div class="rv-stage">' + (nx ? card(nx, 'next') : '') + '</div>' + panel();
    else stage = '<div class="rv-stage">' + (nx ? card(nx, 'next') : '') + card(p, 'cur') + '</div>' + controls();
    deck.innerHTML = top() + stage + note();
    Array.prototype.forEach.call(deck.querySelectorAll('.rv-card'), photo);
    if (st.queue[2]) Store.loadPhoto(st.queue[2]);              // warm up the one after
    var cur = deck.querySelector('.rv-card.cur');
    if (cur) {
      drag(cur);
      if (enter) {                                               // slide back in after an undo or "keep it"
        cur.style.transition = 'none'; cur.style.transform = fling(enter);
        cur.getBoundingClientRect();
        cur.style.transition = ''; cur.style.transform = '';
      }
    }
    if (st.rejecting && window.matchMedia('(hover: hover)').matches) { var n = deck.querySelector('#rv-note'); if (n) n.focus(); }
  }
  function photo(el) {
    var img = el.querySelector('img'), blur = el.querySelector('.rv-blur');
    Store.loadPhoto(el.getAttribute('data-id')).then(function (url) {
      if (!url) { el.classList.add('missing'); return; }
      img.src = url; blur.style.backgroundImage = 'url(' + url + ')';
      el.classList.add('loaded');
    });
  }
  function refreshTop() {
    var t = deck.querySelector('.rv-top');
    if (t) t.outerHTML = top();
  }
  function say(msg) {
    st.note = msg;
    var old = deck.querySelector('.rv-toast');
    if (old) old.remove();
    deck.insertAdjacentHTML('beforeend', note());
    clearTimeout(st.noteTimer);
    st.noteTimer = setTimeout(function () { st.note = ''; var t = deck.querySelector('.rv-toast'); if (t) t.remove(); }, 5000);
  }

  // ---------- gestures ----------
  function fling(dir) {
    return dir === 'right' ? 'translate(130vw, -4vh) rotate(18deg)' : dir === 'left' ? 'translate(-130vw, -4vh) rotate(-18deg)' : 'translate(0, 110vh) rotate(4deg)';
  }
  function away(dir, then) {
    var cur = deck.querySelector('.rv-card.cur');
    st.busy = true;
    if (cur) { cur.classList.add('flying'); cur.style.transform = fling(dir); }
    var nx = deck.querySelector('.rv-card.next');
    if (nx) nx.classList.add('rising');
    setTimeout(function () { st.busy = false; then(); }, cur ? 230 : 0);
  }
  function drag(el) {
    var x0, y0, t0, dx = 0, dy = 0, id = null, moved = false;
    var yes = el.querySelector('.rv-stamp.yes'), no = el.querySelector('.rv-stamp.no'), later = el.querySelector('.rv-stamp.later');
    var nx = deck.querySelector('.rv-card.next');
    el.addEventListener('pointerdown', function (e) {
      if (st.busy || e.button > 0) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); dx = dy = 0; moved = false;
      el.setPointerCapture(id); el.classList.add('held');
    });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      var down = dy > 0 && dy > Math.abs(dx) ? dy : 0;
      el.style.transform = 'translate(' + dx + 'px,' + (down ? dy : dy * 0.25) + 'px) rotate(' + (dx / 18) + 'deg)';
      yes.style.opacity = Math.max(0, Math.min(1, dx / 110));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 110));
      later.style.opacity = Math.max(0, Math.min(1, down / 140));
      if (nx) nx.style.transform = 'scale(' + (0.94 + 0.06 * Math.min(1, (Math.abs(dx) + down) / 160)) + ')';
    });
    function end(e) {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('held');
      var v = dx / Math.max(1, Date.now() - t0);
      if (!moved) { reset(); zoom(el); return; }
      if (dx > 110 || (dx > 40 && v > 0.6)) return approve();
      if (dx < -110 || (dx < -40 && v < -0.6)) return reject();
      if (dy > 150 && dy > Math.abs(dx) && st.queue.length > 1) return skip();
      reset();
    }
    function reset() {
      el.style.transform = ''; yes.style.opacity = no.style.opacity = later.style.opacity = '';
      if (nx) nx.style.transform = '';
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', function (e) { if (e.pointerId === id) { id = null; el.classList.remove('held'); reset(); } });
  }
  function zoom(el) {
    var img = el.querySelector('img'), lb = document.getElementById('lightbox');
    if (!img || !img.src || !lb) return;
    lb.innerHTML = '<img alt="Proof photo, full size" src="' + img.src + '"><button class="close" aria-label="Close">×</button>';
    lb.hidden = false;
  }

  // ---------- decisions ----------
  function nameOf(id) { var p = find(id); return p ? Store.displayName(p.team) : 'that room'; }
  function approve() {
    var id = st.queue[0], p = id && find(id);
    if (!p || st.busy) return;
    away('right', function () {
      st.queue.shift(); st.handled[id] = 1; st.done++;
      st.last = { id: id, kind: 'approve' };
      st.note = 'Approved ' + Store.displayName(p.team) + ' · +' + p.worth;
      draw(); say(st.note);
      Store.approveSubmission(id).then(function (ok) {
        if (ok === false) { st.done--; st.last = null; refreshTop(); say('Someone else already dealt with that one.'); }
      });
    });
  }
  function reject() {
    var id = st.queue[0];
    if (!id || st.busy) return;
    away('left', function () { st.rejecting = id; draw(); });
  }
  function confirmReject(why) {
    var id = st.rejecting;
    if (!id) return;
    st.rejecting = null;
    st.queue = st.queue.filter(function (x) { return x !== id; });
    st.handled[id] = 1; st.done++;
    st.last = { id: id, kind: 'reject' };
    draw(); say('Rejected ' + nameOf(id) + (why ? ' · “' + why + '”' : ''));
    Store.rejectSubmission(id, why);
  }
  function unreject() { st.rejecting = null; draw('left'); }
  function skip() {
    if (st.queue.length < 2 || st.busy) return;
    away('down', function () {
      var id = st.queue.shift(); st.queue.push(id);
      st.last = { id: id, kind: 'skip' };
      draw(); say('Moved to the end of the pile.');
    });
  }
  function undo() {
    var l = st.last;
    if (!l || st.busy) return;
    st.last = null;
    var back = function () {
      st.queue = st.queue.filter(function (x) { return x !== l.id; });
      st.queue.unshift(l.id);
      draw(l.kind === 'approve' ? 'right' : l.kind === 'reject' ? 'left' : 'down');
    };
    if (l.kind === 'skip') { back(); return; }
    st.hold[l.id] = Date.now();
    Store.reopenSubmission(l.id).then(function (ok) {
      if (ok === false) { say('Could not undo that one.'); return; }
      delete st.handled[l.id]; st.done--;
      back(); say('Back in the pile' + (l.kind === 'approve' ? ', its points were removed.' : '.'));
    });
  }

  // ---------- keeping up with the database ----------
  // new proofs join the end of the pile; ones another organiser dealt with leave it
  function sync() {
    if (!st.open || st.busy) return;
    var now = Date.now(), live = {}, before = st.queue[0];
    pendingIds().forEach(function (id) { live[id] = 1; });
    st.queue = st.queue.filter(function (id) { return live[id] || (st.hold[id] && now - st.hold[id] < 8000); });
    Object.keys(live).forEach(function (id) { if (st.queue.indexOf(id) < 0 && !st.handled[id]) st.queue.push(id); });
    if (st.rejecting && !live[st.rejecting] && !st.hold[st.rejecting]) { st.rejecting = null; draw(); say('Someone else already dealt with that one.'); return; }
    if (st.rejecting) { refreshTop(); return; }
    if (st.queue[0] !== before) { draw(); if (before && !live[before]) say('Someone else already dealt with that one.'); }
    else {                                                        // same card: just the counts and the card behind
      refreshTop();
      var ctrl = deck.querySelector('.rv-ctrl'), stage = deck.querySelector('.rv-stage');
      if (ctrl) { ctrl.nextElementSibling.remove(); ctrl.outerHTML = controls(); }
      if (stage && !stage.querySelector('.rv-card.next') && st.queue[1]) {
        stage.insertAdjacentHTML('afterbegin', card(find(st.queue[1]), 'next'));
        photo(stage.querySelector('.rv-card.next'));
      }
      if (!before && st.queue.length) draw();
    }
  }

  // ---------- open / close ----------
  function open(filter) {
    st.filter = { status: 'pending', teamId: (filter && filter.teamId) || '', ref: (filter && filter.ref) || '' };
    st.queue = pendingIds(); st.done = 0; st.last = null; st.rejecting = null; st.handled = {}; st.hold = {}; st.note = '';
    st.open = true; deck.hidden = false;
    document.body.classList.add('deck-open');
    draw();
    var c = deck.querySelector('.rv-close'); if (c && !deck.querySelector('#rv-note')) c.focus({ preventScroll: true });
  }
  function close() {
    st.open = false; deck.hidden = true; deck.innerHTML = '';
    clearTimeout(st.noteTimer);
    document.body.classList.remove('deck-open');
    if (h.onClose) h.onClose();
  }

  deck.addEventListener('click', function (e) {
    var el = e.target.closest('[data-rv]');
    if (!el || el.disabled) return;
    e.preventDefault();
    var a = el.getAttribute('data-rv');
    if (a === 'close') close();
    else if (a === 'approve') approve();
    else if (a === 'reject') reject();
    else if (a === 'skip') skip();
    else if (a === 'undo') undo();
    else if (a === 'reason') confirmReject(el.getAttribute('data-note'));
    else if (a === 'unreject') unreject();
  });
  deck.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = deck.querySelector('#rv-note');
    confirmReject(n ? n.value.trim() : '');
  });
  document.addEventListener('keydown', function (e) {
    if (!st.open || e.metaKey || e.ctrlKey || e.altKey) return;
    var lb = document.getElementById('lightbox');
    if (lb && !lb.hidden) return;                                // Esc there closes the photo first
    var typing = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if (e.key === 'Escape') { e.preventDefault(); if (st.rejecting) unreject(); else close(); return; }
    if (typing || st.rejecting) return;
    var k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'a') { e.preventDefault(); approve(); }
    else if (k === 'arrowleft' || k === 'r') { e.preventDefault(); reject(); }
    else if (k === 'arrowdown' || k === 's') { e.preventDefault(); skip(); }
    else if (k === 'z' || k === 'backspace') { e.preventDefault(); undo(); }
  });

  window.Review = {
    init: function (helpers) { h = helpers; },
    open: open, close: close, sync: sync,
    isOpen: function () { return st.open; }
  };
})();
