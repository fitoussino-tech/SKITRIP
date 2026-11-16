// Organisers' back office: review proofs and edit the calendar.
// Reuses the shared Store (js/store.supabase.js). The passcode only hides the UI;
// it is not hard security (see js/config.js).
(function () {
  var cfg = window.CONFIG || {};
  var GATE_KEY = 'mim28-admin-ok';
  var root = document.getElementById('admin');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  if (!window.Store || window.Store.demo) {
    root.innerHTML = '<section class="card"><h1>Admin</h1><p>Supabase is not connected. Fill in <b>js/config.js</b> first.</p></section>';
    return;
  }

  function authed() { try { return sessionStorage.getItem(GATE_KEY) === '1'; } catch (e) { return false; } }

  function viewGate() {
    return '<section class="card gate"><h1>Organisers</h1><p>Enter the passcode to review proofs and edit the programme.</p>' +
      '<form id="gate"><input id="pass" class="field" type="password" placeholder="Passcode" autocomplete="off">' +
      '<p class="error" id="gate-err"></p><button class="btn" type="submit">Enter</button></form></section>';
  }

  function reviewCard(p) {
    var name = Store.displayName(p.team);
    return '<article class="rev"><div class="rev-img" style="background-image:url(' + (p.thumb || '') + ')"></div>' +
      '<div class="rev-main"><p class="rev-team"><span class="dot" style="background:' + p.team.color + '"></span><b>' + esc(name) + '</b></p>' +
      '<p class="rev-ach">' + esc(p.text) + (p.value ? ' · ' + esc(p.value) : '') + '</p>' +
      '<p class="fine">by ' + esc(p.by || '?') + '</p>' +
      '<div class="rev-act"><button class="btn small ok" data-approve="' + p.id + '">Approve</button>' +
      '<button class="btn small no" data-reject="' + p.id + '">Reject</button></div></div></article>';
  }

  function eventForm() {
    var opts = SEED.days.map(function (d) { return '<option value="' + d[0] + '">' + esc(d[1]) + '</option>'; }).join('');
    return '<form id="evf" class="evf"><div class="evrow"><select id="ev-day" class="field">' + opts + '</select>' +
      '<input id="ev-time" class="field" placeholder="Time, e.g. 18:00" maxlength="12"></div>' +
      '<input id="ev-title" class="field" placeholder="What is happening?" maxlength="80">' +
      '<input id="ev-detail" class="field" placeholder="Details (optional)" maxlength="160">' +
      '<button class="btn" type="submit">Add to the calendar</button></form>';
  }

  function eventList() {
    var all = [];
    SEED.days.forEach(function (d) { Store.events(d[0]).forEach(function (e) { all.push({ day: d[1], ev: e }); }); });
    if (!all.length) return '<p class="fine">No added events yet.</p>';
    return '<ul class="evlist">' + all.map(function (x) {
      return '<li><span>' + esc(x.day) + (x.ev.time ? ' · ' + esc(x.ev.time) : '') + ' — <b>' + esc(x.ev.title) + '</b></span>' +
        '<button class="link" data-del="' + x.ev.id + '">remove</button></li>';
    }).join('') + '</ul>';
  }

  function viewApp() {
    var pending = Store.pending();
    var queue = pending.length ? pending.map(reviewCard).join('') : '<p class="fine">Nothing to review right now. 🎉</p>';
    return '<header class="abar"><h1>Admin</h1><span class="count">' + pending.length + ' to review</span></header>' +
      '<section><h2>Proofs</h2>' + queue + '</section>' +
      '<section><h2>Programme</h2>' + eventForm() + eventList() + '</section>';
  }

  function render() { root.innerHTML = authed() ? viewApp() : viewGate(); }

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'gate') {
      var v = document.getElementById('pass').value;
      if (v && v === cfg.ADMIN_PASSCODE) { try { sessionStorage.setItem(GATE_KEY, '1'); } catch (x) {} render(); }
      else document.getElementById('gate-err').textContent = 'Wrong passcode.';
    } else if (e.target.id === 'evf') {
      var title = document.getElementById('ev-title').value.trim();
      if (!title) { return; }
      Store.addEvent({
        day: document.getElementById('ev-day').value,
        time: document.getElementById('ev-time').value.trim(),
        title: title,
        detail: document.getElementById('ev-detail').value.trim()
      });
      e.target.reset();
    }
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-approve]'); if (a) { Store.approveSubmission(a.getAttribute('data-approve')); return; }
    var r = e.target.closest('[data-reject]'); if (r) { Store.rejectSubmission(r.getAttribute('data-reject')); return; }
    var d = e.target.closest('[data-del]'); if (d) { Store.deleteEvent(d.getAttribute('data-del')); return; }
  });

  // Re-render on any live change, but only once the organiser is in.
  Store.on(function () { if (authed()) render(); });
  render();
})();
