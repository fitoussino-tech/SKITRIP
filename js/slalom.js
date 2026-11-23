// Easter egg: "Salamander Slalom", a tiny endless runner in the spirit of Chrome's dinosaur game.
// Opens when someone taps the salamander on Today 5 times in a row (see 'poke' in app.js).
// Tap / Space / ↑ to jump (hold for a higher jump), swipe down / ↓ to tuck under chairlift seats.
// Colours come from the time-of-day palette in style.css, the best score stays on the phone.
(function () {
  var BEST_KEY = 'mim28-slalom-best';
  var el, cv, cx, W, H, dpr, raf = 0, last = 0;
  var g = null;                     // the current run
  var sprite = null, spriteColor = '';
  var pal = {};

  function best() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }
  function css(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }
  function readPalette() {
    pal = {
      night: document.body.getAttribute('data-time') === 'night',
      far: css('--ridge-far', '#1B2759'), near: css('--ridge-near', '#121A40'), cap: css('--snowcap', '#F2F6FF'),
      ground: css('--ground', '#F2F6FF'), line: css('--ridge-line', 'rgba(255,255,255,.7)'),
      text: css('--text', '#fff'), muted: css('--muted', '#AEB9E6'), accent: css('--accent', '#FFC933'), ink: css('--accent-ink', '#FFC933'),
      card: css('--card-bg', '#18244D'), mascot: css('--mascot-line', '#fff')
    };
  }
  // the real salamander drawing, turned into an image the canvas can draw
  function loadSprite() {
    if (sprite && spriteColor === pal.mascot) return;
    spriteColor = pal.mascot;
    var svg = Mascot.svg('idle').replace(/currentColor/g, pal.mascot);
    if (svg.indexOf('xmlns=') < 0) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    sprite = new Image();
    sprite.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- the run ----------
  function unit() { return H / 640; }                 // everything scales with the screen height
  function groundY() { return H * 0.8; }
  function newRun() {
    var u = unit();
    g = {
      state: 'ready', t: 0, dist: 0, speed: 330 * u, score: 0, best: best(), newBest: false,
      p: { x: Math.max(24, W * 0.12), y: 0, vy: 0, w: 104 * u, h: 85 * u, onGround: true, tuck: false, holding: false },
      obs: [], gap: 600 * u, flakes: [], bonus: [], shake: 0, pops: []
    };
    for (var i = 0; i < 40; i++) g.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 2 + 1) * u, s: Math.random() * 30 + 20 });
  }
  var KINDS = [
    { k: 'rock', w: 40, h: 24 },
    { k: 'tree', w: 44, h: 78 },
    { k: 'snowman', w: 40, h: 58 },
    { k: 'trees', w: 78, h: 64 },
    { k: 'flag', w: 18, h: 66 }
  ];
  function spawn() {
    var u = unit(), m = g.score;
    if (m > 350 && Math.random() < 0.22) {                 // chairlift seat: tuck under it
      g.obs.push({ k: 'chair', x: W + 20, w: 64 * u, h: 46 * u, y: groundY() - 64 * u - 46 * u });
    } else {
      var pool = m < 120 ? KINDS.slice(0, 3) : KINDS;
      var o = pool[Math.floor(Math.random() * pool.length)];
      g.obs.push({ k: o.k, x: W + 20, w: o.w * u, h: o.h * u, y: groundY() - o.h * u });
      if (m > 600 && Math.random() < 0.25) g.obs.push({ k: 'rock', x: W + 20 + o.w * u + 16 * u, w: 40 * u, h: 24 * u, y: groundY() - 24 * u });
    }
    if (Math.random() < 0.35) g.bonus.push({ x: W + 220 * u, y: groundY() - (110 + Math.random() * 70) * u, r: 13 * u, got: false });
    var minGap = g.speed * 0.62 + 150 * u;
    g.gap = minGap + Math.random() * 380 * u;
  }
  function jump() {
    if (!g) return;
    if (g.state === 'ready') { g.state = 'run'; }
    if (g.state === 'over') { if (g.t > 0.6) { newRun(); g.state = 'run'; } return; }
    var p = g.p;
    if (p.onGround) { p.vy = -960 * unit(); p.onGround = false; p.tuck = false; }
    p.holding = true;
  }
  function release() { if (g) g.p.holding = false; }
  function tuck(on) {
    if (!g || g.state !== 'run') return;
    g.p.tuck = on;
    if (on && !g.p.onGround) g.p.vy = Math.max(g.p.vy, 900 * unit());     // drop fast
  }
  function hitbox(p) {
    var h = p.tuck ? p.h * 0.62 : p.h;
    return { x: p.x + p.w * 0.24, y: groundY() + p.y - h * 0.92, w: p.w * 0.5, h: h * 0.82 };
  }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function step(dt) {
    var u = unit(), p = g.p;
    g.t += dt;
    g.flakes.forEach(function (f) { f.y += f.s * dt * u * 2; f.x -= (g.state === 'run' ? g.speed * 0.3 : 20 * u) * dt; if (f.y > H) f.y = -5; if (f.x < -5) f.x = W + 5; });
    if (g.state !== 'run') return;
    g.speed = Math.min(900 * u, g.speed + 9 * u * dt);
    var dx = g.speed * dt;
    g.dist += dx; g.score = Math.floor(g.dist / (28 * u));                    // metres
    // jump physics: holding makes it floatier on the way up
    var grav = (p.vy < 0 && p.holding ? 2100 : 3600) * u;
    if (!p.onGround) {
      p.vy += grav * dt; p.y += p.vy * dt;
      if (p.y >= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
    }
    g.gap -= dx;
    if (g.gap <= 0) spawn();
    g.obs.forEach(function (o) { o.x -= dx; });
    g.obs = g.obs.filter(function (o) { return o.x + o.w > -40; });
    g.bonus.forEach(function (b) { b.x -= dx; });
    g.bonus = g.bonus.filter(function (b) { return b.x > -30 && !b.got; });
    g.pops.forEach(function (x) { x.t += dt; x.y -= 40 * u * dt; });
    g.pops = g.pops.filter(function (x) { return x.t < 0.9; });
    var hb = hitbox(p);
    g.bonus.forEach(function (b) {
      if (overlap(hb, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 })) {
        b.got = true; g.dist += 25 * 28 * u;                                     // +25, like a bingo square
        g.pops.push({ x: b.x, y: b.y, t: 0, txt: '+25' });
      }
    });
    for (var i = 0; i < g.obs.length; i++) {
      var o = g.obs[i], box = o.k === 'chair' ? { x: o.x + 6 * u, y: o.y, w: o.w - 12 * u, h: o.h } : { x: o.x + o.w * 0.18, y: o.y + o.h * 0.12, w: o.w * 0.64, h: o.h * 0.88 };
      if (overlap(hb, box)) { crash(); break; }
    }
  }
  function crash() {
    g.state = 'over'; g.t = 0; g.shake = 0.35;
    if (g.score > g.best) { g.best = g.score; g.newBest = true; saveBest(g.score); }
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
  }

  // ---------- drawing ----------
  function ridge(seed, base, amp, color, speedK, capColor) {
    var off = (g.dist * speedK) % 2000, u = unit();
    cx.fillStyle = color; cx.beginPath(); cx.moveTo(0, H);
    var pts = [];
    for (var x = -40; x <= W + 40; x += 20) {
      var wx = x + off;
      var y = base - amp * (0.55 * Math.abs(Math.sin(wx / (260 * u) + seed)) + 0.3 * Math.abs(Math.sin(wx / (97 * u) + seed * 2)) + 0.15 * Math.sin(wx / (41 * u)));
      pts.push([x, y]); cx.lineTo(x, y);
    }
    cx.lineTo(W + 40, H); cx.closePath(); cx.fill();
    if (capColor) {                                       // snow on the tops
      cx.fillStyle = capColor;
      pts.forEach(function (q, i) {
        var a = pts[i - 1], b = pts[i + 1];
        if (a && b && q[1] < a[1] && q[1] < b[1] && q[1] < base - amp * 0.55) {
          cx.beginPath(); cx.moveTo(q[0] - 16 * u, q[1] + 14 * u); cx.lineTo(q[0], q[1]); cx.lineTo(q[0] + 16 * u, q[1] + 14 * u); cx.closePath(); cx.fill();
        }
      });
    }
  }
  function glow(color, blur) { if (pal.night) { cx.shadowColor = color; cx.shadowBlur = blur; } }
  function noGlow() { cx.shadowBlur = 0; }
  function drawObstacle(o) {
    var u = unit(), x = o.x, y = o.y, w = o.w, h = o.h;
    var dark = pal.night ? '#3DF5FF' : '#2E5B45', trunk = pal.night ? '#FF4FD8' : '#6B4A32';
    cx.save();
    if (o.k === 'tree' || o.k === 'trees') {
      var n = o.k === 'trees' ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var tw = w / n, tx = x + i * tw, th = i ? h * 0.82 : h, ty = y + (h - th);
        cx.fillStyle = trunk; cx.fillRect(tx + tw * 0.43, ty + th * 0.8, tw * 0.14, th * 0.2);
        glow(dark, 12); cx.fillStyle = pal.night ? 'rgba(61,245,255,.18)' : dark; cx.strokeStyle = dark; cx.lineWidth = 2.5 * u;
        cx.beginPath();
        cx.moveTo(tx + tw / 2, ty); cx.lineTo(tx + tw * 0.92, ty + th * 0.45); cx.lineTo(tx + tw * 0.68, ty + th * 0.45);
        cx.lineTo(tx + tw, ty + th * 0.82); cx.lineTo(tx, ty + th * 0.82); cx.lineTo(tx + tw * 0.32, ty + th * 0.45); cx.lineTo(tx + tw * 0.08, ty + th * 0.45);
        cx.closePath(); cx.fill(); cx.stroke(); noGlow();
        cx.fillStyle = pal.cap; cx.beginPath(); cx.moveTo(tx + tw / 2, ty); cx.lineTo(tx + tw * 0.64, ty + th * 0.2); cx.lineTo(tx + tw * 0.36, ty + th * 0.2); cx.closePath(); cx.fill();
      }
    } else if (o.k === 'rock') {
      glow('#FF4FD8', 10);
      cx.fillStyle = pal.night ? '#22195A' : '#7C7F93'; cx.strokeStyle = pal.night ? '#FF4FD8' : '#4F5266'; cx.lineWidth = 2.5 * u;
      cx.beginPath(); cx.moveTo(x, y + h); cx.lineTo(x + w * 0.12, y + h * 0.35); cx.lineTo(x + w * 0.45, y); cx.lineTo(x + w * 0.82, y + h * 0.25); cx.lineTo(x + w, y + h); cx.closePath(); cx.fill(); cx.stroke(); noGlow();
      cx.fillStyle = pal.cap; cx.beginPath(); cx.moveTo(x + w * 0.3, y + h * 0.15); cx.lineTo(x + w * 0.45, y); cx.lineTo(x + w * 0.66, y + h * 0.14); cx.closePath(); cx.fill();
    } else if (o.k === 'snowman') {
      glow('#FFFFFF', 12);
      cx.fillStyle = '#FFFFFF'; cx.strokeStyle = pal.night ? '#3DF5FF' : '#9AA8C7'; cx.lineWidth = 2.5 * u;
      [[0.5, 0.74, 0.27], [0.5, 0.42, 0.2]].forEach(function (c) { cx.beginPath(); cx.arc(x + w * c[0], y + h * c[1], h * c[2], 0, Math.PI * 2); cx.fill(); cx.stroke(); });
      noGlow();
      cx.fillStyle = '#E2464B'; cx.fillRect(x + w * 0.22, y + h * 0.55, w * 0.56, h * 0.07);
      cx.fillStyle = '#FF8A2A'; cx.beginPath(); cx.moveTo(x + w * 0.5, y + h * 0.4); cx.lineTo(x + w * 0.95, y + h * 0.44); cx.lineTo(x + w * 0.5, y + h * 0.46); cx.fill();
      cx.fillStyle = '#0E1530'; cx.fillRect(x + w * 0.22, y + h * 0.1, w * 0.56, h * 0.06); cx.fillRect(x + w * 0.32, y - h * 0.08, w * 0.36, h * 0.2);
    } else if (o.k === 'flag') {
      cx.strokeStyle = pal.text; cx.lineWidth = 3 * u; cx.beginPath(); cx.moveTo(x + 2 * u, y + h); cx.lineTo(x + 2 * u, y); cx.stroke();
      glow('#FF4FD8', 12); cx.fillStyle = pal.night ? '#FF4FD8' : '#E2464B';
      cx.beginPath(); cx.moveTo(x + 3 * u, y); cx.lineTo(x + w * 1.6, y + h * 0.14); cx.lineTo(x + 3 * u, y + h * 0.3); cx.closePath(); cx.fill(); noGlow();
    } else if (o.k === 'chair') {
      cx.strokeStyle = pal.text; cx.lineWidth = 2.5 * u;
      cx.beginPath(); cx.moveTo(x + w / 2, H * 0.12); cx.lineTo(x + w / 2, y + h * 0.15); cx.stroke();
      glow('#3DF5FF', 14); cx.fillStyle = pal.night ? '#3DF5FF' : '#E2464B';
      cx.fillRect(x, y + h * 0.15, w, h * 0.22);                            // backrest
      cx.fillRect(x, y + h * 0.62, w, h * 0.16);                            // seat
      cx.fillRect(x + w * 0.04, y + h * 0.15, w * 0.1, h * 0.63);
      cx.fillRect(x + w * 0.86, y + h * 0.15, w * 0.1, h * 0.63); noGlow();
      cx.strokeStyle = pal.text; cx.beginPath(); cx.moveTo(x, y + h * 0.95); cx.lineTo(x + w, y + h * 0.95); cx.stroke();   // footrest
    }
    cx.restore();
  }
  function txt(s, x, y, size, color, align) {
    cx.font = size + 'px Righteous, "Gochi Hand", system-ui, sans-serif';
    cx.fillStyle = color; cx.textAlign = align || 'left'; cx.textBaseline = 'middle';
    cx.fillText(s, x, y);
  }
  function pad(n) { return ('00000' + n).slice(-5); }
  function draw() {
    var u = unit(), gy = groundY(), p = g.p;
    cx.save();
    cx.clearRect(0, 0, W, H);
    if (g.shake > 0) cx.translate((Math.random() - 0.5) * 12 * u, (Math.random() - 0.5) * 8 * u);
    ridge(1.3, gy - 120 * u, 230 * u, pal.far, 0.12, pal.cap);
    ridge(4.1, gy - 30 * u, 150 * u, pal.near, 0.3, pal.cap);
    // the piste
    cx.fillStyle = pal.ground; cx.fillRect(-20, gy, W + 40, H - gy + 20);
    glow(pal.line, 10); cx.strokeStyle = pal.line; cx.lineWidth = 3 * u; cx.beginPath(); cx.moveTo(-20, gy); cx.lineTo(W + 20, gy); cx.stroke(); noGlow();
    cx.strokeStyle = pal.night ? 'rgba(61,245,255,.35)' : 'rgba(120,140,190,.35)'; cx.lineWidth = 2 * u;
    var off = g.dist % (90 * u);
    for (var x = -off; x < W; x += 90 * u) { cx.beginPath(); cx.moveTo(x, gy + 22 * u); cx.lineTo(x + 34 * u, gy + 22 * u); cx.moveTo(x + 45 * u, gy + 52 * u); cx.lineTo(x + 70 * u, gy + 52 * u); cx.stroke(); }
    // snowflakes
    cx.fillStyle = pal.night ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.9)';
    g.flakes.forEach(function (f) { cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, Math.PI * 2); cx.fill(); });
    // bonus points
    g.bonus.forEach(function (b) {
      glow(pal.accent, 16); cx.fillStyle = pal.accent; cx.beginPath(); cx.arc(b.x, b.y + Math.sin(g.dist / 40 + b.x) * 4 * u, b.r, 0, Math.PI * 2); cx.fill(); noGlow();
      txt('★', b.x, b.y + Math.sin(g.dist / 40 + b.x) * 4 * u + 1, Math.round(15 * u), '#0E1530', 'center');
    });
    g.obs.forEach(drawObstacle);
    // the salamander (squashed when tucking, tilted in the air)
    var h = p.tuck ? p.h * 0.66 : p.h, top = gy + p.y - h + 6 * u;
    cx.save();
    cx.translate(p.x + p.w / 2, top + h / 2);
    if (!p.onGround) cx.rotate(Math.max(-0.35, Math.min(0.35, p.vy / (2600 * u))));
    if (g.state === 'over') cx.rotate(0.9);
    if (pal.night) { cx.shadowColor = '#3DF5FF'; cx.shadowBlur = 12; }
    if (sprite && sprite.complete && sprite.naturalWidth) cx.drawImage(sprite, -p.w / 2, -h / 2, p.w, h);
    else { cx.fillStyle = '#3DBE6B'; cx.fillRect(-p.w / 4, -h / 2, p.w / 2, h); }
    cx.restore();
    if (p.onGround && g.state === 'run' && Math.random() < 0.6) {                // powder spray
      cx.fillStyle = 'rgba(255,255,255,.85)';
      for (var i = 0; i < 3; i++) { cx.beginPath(); cx.arc(p.x + p.w * 0.1 - Math.random() * 20 * u, gy - Math.random() * 10 * u, (1 + Math.random() * 2.5) * u, 0, Math.PI * 2); cx.fill(); }
    }
    g.pops.forEach(function (x) { cx.globalAlpha = 1 - x.t / 0.9; txt(x.txt, x.x, x.y, Math.round(22 * u), pal.ink, 'center'); cx.globalAlpha = 1; });
    // score, top right like the dinosaur
    var sz = Math.round(20 * u);
    txt('BEST ' + pad(g.best) + '   ' + pad(g.score) + ' m', W - 64, 34 * u + 12, sz, pal.text, 'right');
    // messages
    if (g.state === 'ready') {
      txt('Salamander Slalom', W / 2, H * 0.3, Math.round(Math.min(34 * u, W / 11)), pal.text, 'center');
      txt(touch ? 'Tap to jump · swipe down to tuck' : 'Space or ↑ to jump · ↓ to tuck', W / 2, H * 0.3 + 40 * u, Math.round(Math.min(16 * u, W / 24)), pal.muted, 'center');
      txt(touch ? 'Tap to start' : 'Press space to start', W / 2, H * 0.3 + 80 * u, Math.round(20 * u), pal.ink, 'center');
    } else if (g.state === 'over') {
      txt('Wipeout!', W / 2, H * 0.28, Math.round(40 * u), pal.text, 'center');
      txt(g.score + ' m' + (g.newBest ? ' · new best!' : ' · best ' + g.best + ' m'), W / 2, H * 0.28 + 42 * u, Math.round(20 * u), g.newBest ? pal.ink : pal.muted, 'center');
      if (g.t > 0.6) txt(touch ? 'Tap to go again' : 'Space to go again', W / 2, H * 0.28 + 84 * u, Math.round(18 * u), pal.ink, 'center');
    }
    cx.restore();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (g.shake > 0) g.shake -= dt;
    step(dt); draw();
  }

  // ---------- open / close / controls ----------
  var touch = false, ty0 = null, tx0 = null, tTap = false;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = el.clientWidth; H = el.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function build() {
    el = document.createElement('div');
    el.id = 'slalom'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Salamander Slalom, a secret mini game');
    el.innerHTML = '<canvas aria-hidden="true"></canvas><button class="sl-close" aria-label="Close the game">×</button>' +
      '<p class="sl-sr" aria-live="polite"></p>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas'); cx = cv.getContext('2d');
    el.querySelector('.sl-close').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    cv.addEventListener('pointerdown', function (e) {
      touch = e.pointerType !== 'mouse';
      tx0 = e.clientX; ty0 = e.clientY; tTap = true;
      jump();
    });
    cv.addEventListener('pointermove', function (e) {
      if (ty0 === null) return;
      if (e.clientY - ty0 > 30 && Math.abs(e.clientY - ty0) > Math.abs(e.clientX - tx0)) { release(); tuck(true); tTap = false; }
    });
    window.addEventListener('pointerup', function () { if (ty0 === null) return; ty0 = null; release(); tuck(false); });
    window.addEventListener('resize', function () { if (!el.hidden) size(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && g && g.state === 'run') { g.state = 'ready'; } });
    document.addEventListener('keydown', function (e) {
      if (el.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); if (!e.repeat) jump(); }
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
    readPalette(); loadSprite();
    el.hidden = false; document.body.classList.add('sl-open');
    size(); newRun();
    el.querySelector('.sl-sr').textContent = 'You found the secret game. ' + (touch ? 'Tap to jump.' : 'Press space to jump.');
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    el.querySelector('.sl-close').focus({ preventScroll: true });
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
