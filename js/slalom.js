// Easter egg: "Salamander Slalom", a tiny endless runner in the spirit of Chrome's dinosaur game.
// Opens when someone taps the salamander on Today 5 times in a row (see 'poke' in app.js).
// Tap / Space / ↑ to jump (hold for a higher jump), swipe down / ↓ to tuck under chairlift seats.
// Each player's best run goes to a shared leaderboard with names (Store.slalomTop / slalomSave).
//
// Smoothness: the game runs on a fixed 120 steps per second whatever the screen's refresh
// rate, and draws in between steps. The world is 640 units high and scaled to the screen,
// so a metre is the same on every phone. Mountains, obstacles and the salamander are drawn
// once into bitmaps (glow included) and only copied each frame, which phones do cheaply.
(function () {
  var BEST_KEY = 'mim28-slalom-best';
  var STEP = 1 / 120, VH = 640, GROUND = 512, M = 28;      // M: world units per metre
  var PW = 104, PH = 85;                                    // the salamander, in world units
  var el, cv, cx, panel, hud, W, H, VW, u, dpr, oy = 0;
  // How much piste you see ahead decides how fair it is. A phone held upright is narrow, so
  // the world is scaled to show at least MIN_VIEW units across (and at most MAX_VIEW on a
  // laptop), with the sky filling the space above.
  var MIN_VIEW = 640, MAX_VIEW = 900;
  var raf = 0, last = 0, acc = 0, touch = false;
  var g = null, pal = {}, art = {}, board = { list: null, loading: false };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  function best() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }
  function css(name, fallback) { return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback; }
  function readPalette() {
    pal = {
      night: document.body.getAttribute('data-time') === 'night',
      far: css('--ridge-far', '#1B2759'), near: css('--ridge-near', '#121A40'), cap: css('--snowcap', '#F2F6FF'),
      ground: css('--ground', '#F2F6FF'), line: css('--ridge-line', 'rgba(255,255,255,.7)'),
      text: css('--text', '#fff'), mascot: css('--mascot-line', '#fff')
    };
  }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  // ---------- pre-drawn art ----------
  // Mountains: a strip that repeats seamlessly (every wave fits a whole number of times in it).
  function ridgeTile(seed, base, amp, color, waves) {
    var TW = Math.ceil(Math.max(VW * 1.6, 1400)), c = canvas(TW * u * dpr, VH * u * dpr), x2 = c.getContext('2d');
    x2.scale(u * dpr, u * dpr);
    // wave lengths in world units, rounded so each fits a whole number of times in the strip
    var k = waves.map(function (L) { return Math.max(1, Math.round(TW / L)); });
    var pts = [];
    for (var x = 0; x <= TW; x += 8) {
      var a = Math.PI * x / TW;
      pts.push([x, base - amp * (0.55 * Math.abs(Math.sin(a * k[0] + seed)) + 0.3 * Math.abs(Math.sin(a * k[1] + seed * 2)) + 0.15 * Math.sin(2 * a * k[2]))]);
    }
    x2.fillStyle = color; x2.beginPath(); x2.moveTo(0, VH);
    pts.forEach(function (q) { x2.lineTo(q[0], q[1]); });
    x2.lineTo(TW, VH); x2.closePath(); x2.fill();
    x2.fillStyle = pal.cap;                                   // snow on the peaks
    pts.forEach(function (q, i) {
      var a = pts[i - 1], b = pts[i + 1];
      if (a && b && q[1] <= a[1] && q[1] < b[1] && q[1] < base - amp * 0.5) {
        x2.beginPath(); x2.moveTo(q[0] - 15, q[1] + 13); x2.lineTo(q[0], q[1]); x2.lineTo(q[0] + 15, q[1] + 13); x2.closePath(); x2.fill();
      }
    });
    return { c: c, w: TW, top: Math.max(0, Math.floor(base - amp * 1.05 - 4)) };
  }
  // one obstacle drawn into its own bitmap, with room around it for the night glow
  var PAD = 18;
  function glow(x2, color, blur) { if (pal.night) { x2.shadowColor = color; x2.shadowBlur = blur * u * dpr; } }
  function sprite(kind, w, h) {
    var c = canvas((w + PAD * 2) * u * dpr, (h + PAD * 2) * u * dpr), x2 = c.getContext('2d');
    x2.scale(u * dpr, u * dpr); x2.translate(PAD, PAD);
    drawThing(x2, kind, w, h);
    return c;
  }
  function drawThing(x2, k, w, h) {
    var dark = pal.night ? '#3DF5FF' : '#2E5B45', trunk = pal.night ? '#FF4FD8' : '#6B4A32';
    x2.lineJoin = 'round';
    if (k === 'tree' || k === 'trees') {
      var n = k === 'trees' ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var tw = w / n, tx = i * tw, th = i ? h * 0.82 : h, ty = h - th;
        x2.shadowBlur = 0; x2.fillStyle = trunk; x2.fillRect(tx + tw * 0.43, ty + th * 0.8, tw * 0.14, th * 0.2);
        glow(x2, dark, 12); x2.fillStyle = pal.night ? 'rgba(61,245,255,.18)' : dark; x2.strokeStyle = dark; x2.lineWidth = 2.5;
        x2.beginPath();
        x2.moveTo(tx + tw / 2, ty); x2.lineTo(tx + tw * 0.92, ty + th * 0.45); x2.lineTo(tx + tw * 0.68, ty + th * 0.45);
        x2.lineTo(tx + tw, ty + th * 0.82); x2.lineTo(tx, ty + th * 0.82); x2.lineTo(tx + tw * 0.32, ty + th * 0.45); x2.lineTo(tx + tw * 0.08, ty + th * 0.45);
        x2.closePath(); x2.fill(); x2.stroke(); x2.shadowBlur = 0;
        x2.fillStyle = pal.cap; x2.beginPath(); x2.moveTo(tx + tw / 2, ty); x2.lineTo(tx + tw * 0.64, ty + th * 0.2); x2.lineTo(tx + tw * 0.36, ty + th * 0.2); x2.closePath(); x2.fill();
      }
    } else if (k === 'rock') {
      glow(x2, '#FF4FD8', 10);
      x2.fillStyle = pal.night ? '#22195A' : '#7C7F93'; x2.strokeStyle = pal.night ? '#FF4FD8' : '#4F5266'; x2.lineWidth = 2.5;
      x2.beginPath(); x2.moveTo(0, h); x2.lineTo(w * 0.12, h * 0.35); x2.lineTo(w * 0.45, 0); x2.lineTo(w * 0.82, h * 0.25); x2.lineTo(w, h); x2.closePath(); x2.fill(); x2.stroke(); x2.shadowBlur = 0;
      x2.fillStyle = pal.cap; x2.beginPath(); x2.moveTo(w * 0.3, h * 0.15); x2.lineTo(w * 0.45, 0); x2.lineTo(w * 0.66, h * 0.14); x2.closePath(); x2.fill();
    } else if (k === 'snowman') {
      glow(x2, '#FFFFFF', 12);
      x2.fillStyle = '#FFFFFF'; x2.strokeStyle = pal.night ? '#3DF5FF' : '#9AA8C7'; x2.lineWidth = 2.5;
      [[0.5, 0.74, 0.27], [0.5, 0.42, 0.2]].forEach(function (c) { x2.beginPath(); x2.arc(w * c[0], h * c[1], h * c[2], 0, Math.PI * 2); x2.fill(); x2.stroke(); });
      x2.shadowBlur = 0;
      x2.fillStyle = '#E2464B'; x2.fillRect(w * 0.22, h * 0.55, w * 0.56, h * 0.07);
      x2.fillStyle = '#FF8A2A'; x2.beginPath(); x2.moveTo(w * 0.5, h * 0.4); x2.lineTo(w * 0.95, h * 0.44); x2.lineTo(w * 0.5, h * 0.46); x2.fill();
      x2.fillStyle = '#0E1530'; x2.fillRect(w * 0.22, h * 0.1, w * 0.56, h * 0.06); x2.fillRect(w * 0.32, -h * 0.08, w * 0.36, h * 0.2);
    } else if (k === 'flag') {
      x2.strokeStyle = pal.text; x2.lineWidth = 3; x2.beginPath(); x2.moveTo(2, h); x2.lineTo(2, 0); x2.stroke();
      glow(x2, '#FF4FD8', 12); x2.fillStyle = pal.night ? '#FF4FD8' : '#E2464B';
      x2.beginPath(); x2.moveTo(3, 0); x2.lineTo(w * 1.6, h * 0.14); x2.lineTo(3, h * 0.3); x2.closePath(); x2.fill();
    } else if (k === 'chair') {
      glow(x2, '#3DF5FF', 14); x2.fillStyle = pal.night ? '#3DF5FF' : '#E2464B';
      x2.fillRect(0, h * 0.15, w, h * 0.22); x2.fillRect(0, h * 0.62, w, h * 0.16);
      x2.fillRect(w * 0.04, h * 0.15, w * 0.1, h * 0.63); x2.fillRect(w * 0.86, h * 0.15, w * 0.1, h * 0.63); x2.shadowBlur = 0;
      x2.strokeStyle = pal.text; x2.lineWidth = 2.5; x2.beginPath(); x2.moveTo(0, h * 0.95); x2.lineTo(w, h * 0.95); x2.stroke();
    }
  }
  // the real salamander drawing, mirrored so it skis forward, as a bitmap
  function makePlayer() {
    var svg = Mascot.svg('idle').replace(/currentColor/g, pal.mascot);
    if (svg.indexOf('xmlns=') < 0) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    var img = new Image();
    img.onload = function () {
      var c = canvas((PW + PAD * 2) * u * dpr, (PH + PAD * 2) * u * dpr), x2 = c.getContext('2d');
      x2.scale(u * dpr, u * dpr); x2.translate(PAD + PW, PAD); x2.scale(-1, 1);
      if (pal.night) { x2.shadowColor = '#3DF5FF'; x2.shadowBlur = 12 * u * dpr; }
      x2.drawImage(img, 0, 0, PW, PH);
      art.player = c;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var KINDS = { rock: [40, 24], tree: [44, 78], snowman: [40, 58], trees: [78, 64], flag: [18, 66], chair: [64, 46] };
  function buildArt() {
    var player = art.player;
    art = { far: ridgeTile(1.3, GROUND - 120, 230, pal.far, [820, 310, 520]), near: ridgeTile(4.1, GROUND - 30, 150, pal.near, [560, 230, 360]), things: {}, player: player };
    Object.keys(KINDS).forEach(function (k) { art.things[k] = sprite(k, KINDS[k][0], KINDS[k][1]); });
    makePlayer();
  }

  // ---------- the run ----------
  function newRun() {
    g = {
      state: 'ready', t: 0, dist: 0, prev: 0, speed: 330, score: 0, best: best(), newBest: false,
      p: { x: Math.min(110, VW * 0.14), y: 0, prevY: 0, vy: 0, onGround: true, tuck: false, holding: false, buffer: 0 },
      obs: [], nextAt: 700, flakes: [], shake: 0, mark: 0, flash: 0, sprays: []
    };
    for (var i = 0; i < 36; i++) g.flakes.push({ x: Math.random() * VW, y: Math.random() * VH, r: Math.random() * 2 + 1, s: Math.random() * 30 + 25 });
  }
  function spawn() {
    var at = g.nextAt, m = g.score;
    if (m > 350 && Math.random() < 0.22) {                    // chairlift seat: tuck under it
      g.obs.push({ k: 'chair', wx: at, w: 64, h: 46, y: GROUND - 110 });
    } else {
      var pool = m < 120 ? ['rock', 'tree', 'snowman'] : ['rock', 'tree', 'snowman', 'trees', 'flag'];
      var k = pool[Math.floor(Math.random() * pool.length)], d = KINDS[k];
      g.obs.push({ k: k, wx: at, w: d[0], h: d[1], y: GROUND - d[1] });
      if (m > 600 && Math.random() < 0.25) g.obs.push({ k: 'rock', wx: at + d[0] + 16, w: 40, h: 24, y: GROUND - 24 });
    }
    // always leave enough room to land and jump again at the current speed
    g.nextAt = at + g.speed * 0.62 + 170 + Math.random() * 380;
  }
  function jumpNow() { var p = g.p; p.vy = -960; p.onGround = false; p.tuck = false; p.buffer = 0; }
  function press() {
    if (!g) return;
    if (g.state === 'ready' || g.state === 'paused') start();
    if (g.state !== 'run') return;
    g.p.holding = true;
    if (g.p.onGround) jumpNow(); else g.p.buffer = 0.13;      // pressed just before landing: jump as soon as it lands
  }
  function release() { if (g) g.p.holding = false; }
  function tuck(on) {
    if (!g || g.state !== 'run') return;
    g.p.tuck = on;
    if (on && !g.p.onGround) g.p.vy = Math.max(g.p.vy, 900);    // drop fast
  }
  function hitbox(p) {
    var h = p.tuck ? PH * 0.62 : PH;
    return { x: p.x + PW * 0.24, y: GROUND + p.y - h * 0.92, w: PW * 0.5, h: h * 0.82 };
  }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function step(dt) {
    var p = g.p;
    g.t += dt;
    if (g.shake > 0) g.shake -= dt;
    if (g.flash > 0) g.flash -= dt;
    g.prev = g.dist; p.prevY = p.y;
    var drift = g.state === 'run' ? g.speed * 0.3 : 20;
    g.flakes.forEach(function (f) { f.y += f.s * dt * 2; f.x -= drift * dt; if (f.y > VH) f.y = -5; if (f.x < -5) f.x = VW + 5; });
    g.sprays.forEach(function (s) { s.t += dt; s.x -= (g.speed * 0.6 + 60) * dt; s.y -= 30 * dt; });
    g.sprays = g.sprays.filter(function (s) { return s.t < 0.35; });
    if (g.state !== 'run') return;
    g.speed = Math.min(860, g.speed + 9 * dt);
    g.dist += g.speed * dt;
    g.score = Math.floor(g.dist / M);
    if (Math.floor(g.score / 500) > g.mark) { g.mark = Math.floor(g.score / 500); g.flash = 1.1; }   // blink every 500 m
    // jump: holding makes it floatier on the way up
    if (!p.onGround) {
      p.vy += (p.vy < 0 && p.holding ? 2100 : 3600) * dt; p.y += p.vy * dt;
      if (p.y >= 0) { p.y = 0; p.vy = 0; p.onGround = true; if (p.buffer > 0) jumpNow(); }
    }
    if (p.buffer > 0) p.buffer -= dt;
    if (p.onGround && Math.random() < 0.5) g.sprays.push({ x: p.x + PW * 0.12, y: GROUND - 2, r: 1 + Math.random() * 2.2, t: 0 });
    while (g.nextAt < g.dist + VW + 60) spawn();
    g.obs = g.obs.filter(function (o) { return o.wx - g.dist + o.w > -80; });
    var hb = hitbox(p);
    for (var i = 0; i < g.obs.length; i++) {
      var o = g.obs[i], x = o.wx - g.dist;
      if (x > hb.x + hb.w + 10) break;
      var box = o.k === 'chair' ? { x: x + 6, y: o.y, w: o.w - 12, h: o.h } : { x: x + o.w * 0.18, y: o.y + o.h * 0.12, w: o.w * 0.64, h: o.h * 0.88 };
      if (overlap(hb, box)) { crash(); break; }
    }
  }
  function crash() {
    g.state = 'over'; g.t = 0; g.shake = 0.3;
    if (g.score > g.best) { g.best = g.score; g.newBest = true; saveBest(g.score); }
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
    board.loading = true;
    showPanel();
    Store.slalomSave(g.score).then(function () { return Store.slalomTop(); }).then(function (list) {
      board.loading = false;
      if (list) board.list = list;
      if (g.state === 'over') showPanel();
    });
  }

  // ---------- drawing ----------
  function draw(alpha) {
    var p = g.p, dist = g.prev + (g.dist - g.prev) * alpha, py = p.prevY + (p.y - p.prevY) * alpha;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    cx.translate(0, oy); cx.scale(u, u);
    var below = (H - oy) / u;                                       // world units down to the bottom of the screen
    if (g.shake > 0) cx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
    [[art.far, 0.12], [art.near, 0.3]].forEach(function (L) {
      var t = L[0], off = (dist * L[1]) % t.w, k = t.c.height / VH;     // only the band with mountains in it is copied
      var a = t.top, hh = GROUND + 4 - t.top;
      cx.drawImage(t.c, 0, a * k, t.c.width, hh * k, -off, a, t.w, hh);
      cx.drawImage(t.c, 0, a * k, t.c.width, hh * k, t.w - off, a, t.w, hh);
    });
    cx.fillStyle = pal.ground; cx.fillRect(-20, GROUND, VW + 40, below - GROUND + 20);
    cx.strokeStyle = pal.line; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-20, GROUND); cx.lineTo(VW + 20, GROUND); cx.stroke();
    cx.strokeStyle = pal.night ? 'rgba(61,245,255,.35)' : 'rgba(120,140,190,.35)'; cx.lineWidth = 2;
    var off = dist % 90;
    cx.beginPath();
    for (var x = -off; x < VW; x += 90) { cx.moveTo(x, GROUND + 22); cx.lineTo(x + 34, GROUND + 22); cx.moveTo(x + 45, GROUND + 52); cx.lineTo(x + 70, GROUND + 52); }
    cx.stroke();
    cx.fillStyle = 'rgba(255,255,255,.85)';
    cx.beginPath();
    g.flakes.forEach(function (f) { cx.moveTo(f.x + f.r, f.y); cx.arc(f.x, f.y, f.r, 0, Math.PI * 2); });
    cx.fill();
    g.obs.forEach(function (o) {
      var x = o.wx - dist;
      if (x > VW + 40) return;
      if (o.k === 'chair') { cx.strokeStyle = pal.text; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(x + o.w / 2, 60); cx.lineTo(x + o.w / 2, o.y + o.h * 0.15); cx.stroke(); }
      cx.drawImage(art.things[o.k], x - PAD, o.y - PAD, o.w + PAD * 2, o.h + PAD * 2);
    });
    // powder spray behind the skis
    cx.fillStyle = '#fff';
    g.sprays.forEach(function (s) { cx.globalAlpha = 1 - s.t / 0.35; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, Math.PI * 2); cx.fill(); });
    cx.globalAlpha = 1;
    // the salamander: squashed when tucking, nose up when climbing, tumbling after a crash
    var h = p.tuck ? PH * 0.66 : PH, top = GROUND + py - h + 6, k = h / PH;
    cx.save();
    cx.translate(p.x + PW / 2, top + h / 2);
    if (!p.onGround && g.state === 'run') cx.rotate(Math.max(-0.35, Math.min(0.35, p.vy / 2600)));
    if (g.state === 'over') cx.rotate(Math.min(0.9, g.t * 6));
    if (art.player) cx.drawImage(art.player, -PW / 2 - PAD, -h / 2 - PAD * k, PW + PAD * 2, (PH + PAD * 2) * k);
    else { cx.fillStyle = '#3DBE6B'; cx.fillRect(-PW / 4, -h / 2, PW / 2, h); }
    cx.restore();
  }
  function pad5(n) { return ('00000' + n).slice(-5); }
  var hudText = '';
  function drawHud() {
    var blink = g.flash > 0 && Math.floor(g.flash * 7) % 2 === 0;
    var s = 'HI ' + pad5(g.best) + '  ' + (blink ? '     ' : pad5(g.score));
    if (s !== hudText) { hudText = s; hud.textContent = s; }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    draw(acc / STEP); drawHud();
  }

  // ---------- the card above the game: start, pause, results and leaderboard ----------
  function rows(list) {
    var me = Store.me(), myId = me ? me.teamId + '|' + me.name : '', mine = -1;
    list.forEach(function (r, i) { if (r.teamId + '|' + r.name === myId) mine = i; });
    var show = list.slice(0, 10).map(function (r, i) { return [r, i]; });
    if (mine >= 10) show.push([list[mine], mine]);
    if (!show.length) return '<p class="sl-empty">No runs yet. Be the first on the board!</p>';
    return '<ol class="sl-board">' + show.map(function (x) {
      var r = x[0], i = x[1], t = Store.team(r.teamId), isMe = i === mine;
      return '<li class="' + (isMe ? 'me' : '') + (i >= 10 ? ' gap' : '') + '"><span class="sl-rank">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span>' +
        '<span class="sl-who"><b>' + esc(r.name) + (isMe ? ' <i>you</i>' : '') + '</b><small>' + esc(t ? Store.displayName(t) : '') + '</small></span>' +
        '<span class="sl-m">' + r.best + ' m</span></li>';
    }).join('') + '</ol>';
  }
  function boardHtml() {
    if (board.loading && !board.list) return '<p class="sl-empty">Loading the leaderboard…</p>';
    if (!board.list) return '<p class="sl-empty">The leaderboard needs signal. Your best run is saved on your phone and will show up later.</p>';
    return rows(board.list);
  }
  function showPanel() {
    var how = touch ? 'Tap to jump, hold for higher. Swipe down to tuck under chairlifts.' : 'Space or ↑ to jump, hold for higher. ↓ to tuck under chairlifts.';
    var html;
    if (g.state === 'ready') {
      html = '<h2>Salamander Slalom</h2><p class="sl-how">' + how + '</p>' +
        '<button class="btn" data-sl="start">' + (touch ? 'Start' : 'Start (space)') + '</button>' +
        '<h3>Leaderboard</h3>' + boardHtml();
    } else if (g.state === 'paused') {
      html = '<h2>Paused</h2><p class="sl-how">' + g.score + ' m so far</p><button class="btn" data-sl="start">Keep going</button>';
    } else if (g.state === 'over') {
      html = '<h2>Wipeout!</h2><p class="sl-score">' + g.score + ' m</p>' +
        '<p class="sl-how">' + (g.newBest ? '<b>New personal best!</b>' : 'Your best: ' + g.best + ' m') + '</p>' +
        '<button class="btn" data-sl="again">Go again' + (touch ? '' : ' (space)') + '</button>' +
        '<h3>Leaderboard</h3>' + boardHtml();
    } else { panel.hidden = true; return; }
    panel.innerHTML = html; panel.hidden = false;
  }
  function start() {
    if (g.state === 'over') newRun();
    g.state = 'run'; panel.hidden = true;
    if (panel.contains(document.activeElement)) el.focus({ preventScroll: true });   // so Space can't "click" a hidden button
  }

  // ---------- open / close / controls ----------
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = el.clientWidth; H = el.clientHeight;
    u = Math.max(Math.min(H / VH, W / MIN_VIEW), W / MAX_VIEW); VW = W / u;
    oy = H - VH * u > 0 ? (H - VH * u) * 0.7 : H - VH * u;        // the piste sits a bit below the middle of a tall screen
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  function build() {
    el = document.createElement('div');
    el.id = 'slalom'; el.hidden = true; el.tabIndex = -1;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Salamander Slalom, a secret mini game');
    el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="sl-hud" aria-hidden="true"></div>' +
      '<button class="sl-close" aria-label="Close the game">×</button><div class="sl-panel" aria-live="polite"></div>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas'); cx = cv.getContext('2d');
    panel = el.querySelector('.sl-panel'); hud = el.querySelector('.sl-hud');
    el.querySelector('.sl-close').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sl]');
      if (!b) return;
      if (b.getAttribute('data-sl') === 'again') newRun();
      start();
    });
    var y0 = null, x0 = null;
    cv.addEventListener('pointerdown', function (e) {
      touch = e.pointerType !== 'mouse';
      x0 = e.clientX; y0 = e.clientY;
      if (g.state === 'over') return;                          // after a crash, use the button: no accidental restarts
      press();
    });
    cv.addEventListener('pointermove', function (e) {
      if (y0 === null) return;
      if (e.clientY - y0 > 30 && e.clientY - y0 > Math.abs(e.clientX - x0)) { release(); tuck(true); }
    });
    window.addEventListener('pointerup', function () { if (y0 === null) return; y0 = null; release(); tuck(false); });
    window.addEventListener('pointercancel', function () { y0 = null; release(); tuck(false); });
    window.addEventListener('resize', function () { if (!el.hidden) { size(); buildArt(); } });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && g && g.state === 'run') { g.state = 'paused'; showPanel(); }
    });
    document.addEventListener('keydown', function (e) {
      if (el.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        if (e.repeat) return;
        if (g.state === 'over') { if (g.t > 0.5) { newRun(); start(); } return; }
        press();
      }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); tuck(true); }
    });
    document.addEventListener('keyup', function (e) {
      if (el.hidden) return;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') release();
      if (e.key === 'ArrowDown' || e.key === 's') tuck(false);
    });
  }
  function open() {
    if (!el) build();
    touch = !window.matchMedia('(hover: hover)').matches;
    el.hidden = false; document.body.classList.add('sl-open');
    readPalette(); size(); art = {}; buildArt(); newRun();
    board.loading = true; showPanel();
    Store.slalomTop().then(function (list) {
      board.loading = false; board.list = list;
      // a best run that never reached the leaderboard (no signal at the time) is sent now
      var me = Store.me(), local = best();
      if (list && me && local) {
        var mine = list.filter(function (r) { return r.teamId === me.teamId && r.name === me.name; })[0];
        if (!mine || mine.best < local) {
          Store.slalomSave(local).then(function () { return Store.slalomTop(); })
            .then(function (l) { if (l) { board.list = l; if (g.state !== 'run') showPanel(); } });
        }
      }
      if (g.state !== 'run') showPanel();
    });
    last = 0; acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    var b = panel.querySelector('[data-sl]'); if (b) b.focus({ preventScroll: true });
  }
  function close() {
    if (!el || el.hidden) return;
    cancelAnimationFrame(raf); raf = 0;
    el.hidden = true; document.body.classList.remove('sl-open');
    var b = document.querySelector('.mascot-btn'); if (b) b.focus({ preventScroll: true });
  }

  window.Slalom = { open: open, close: close, isOpen: function () { return !!el && !el.hidden; },
    _state: function () { return g; } };              // _state is for the tests
})();
