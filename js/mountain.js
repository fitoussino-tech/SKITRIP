// The Mountain tab: the panorama climb.
// One long mountain you swipe along from the chalet (left) to the summit (right).
// It opens on the whole mountain, then zooms onto your room. Altitude = points.
// The look follows the time of day on the phone: morning, midday, golden hour, night
// (colours in css/style.css, under "Mountain tab"). Add ?time=morning|day|golden|night to the URL to preview one.
(function () {
  var H = 380, KZ = 4.4, TS = 0.8, BASE = 352, TOPY = 50;
  var STEPS = [[0, 'Chalet'], [250, 'Chairlift'], [500, 'Mid-station'], [750, 'Igloo bar'], [1000, 'Refuge'],
    [1250, 'Glacier'], [1500, 'Col'], [1750, 'Last push'], [2000, 'Summit']];
  var PERIODS = {
    morning: { label: 'Good morning, skiers', hours: '06:00 – 11:00', lightFromLeft: true },
    day: { label: 'Bluebird day', hours: '11:00 – 16:00', lightFromLeft: true },
    golden: { label: 'Last runs, golden light', hours: '16:00 – 19:00', lightFromLeft: false },
    night: { label: 'Après-ski edition', hours: '19:00 – 06:00', lightFromLeft: true }
  };
  var ui = { zoom: 'all', sel: null, autoDone: false, scroll: 0, raf: 0, timer: 0 };
  var cache = {};

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function px(n) { return (Math.round(n * 10) / 10) + 'px'; }
  function ord(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function initial(t) { return (Store.displayName(t).replace(/^(The|Les) /, '')[0] || '?').toUpperCase(); }

  function period() {
    var m = /[?&]time=(morning|day|golden|night)\b/.exec(location.search);
    if (m) return m[1];
    var h = new Date().getHours();
    return h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'golden' : 'night';
  }

  // ---------- the drawing ----------
  function macro(t) {
    if (t <= TS) {
      var u = t / TS;
      return BASE - (BASE - TOPY) * Math.pow(u, 1.45)
        - 18 * Math.exp(-Math.pow((u - 0.42) / 0.07, 2))
        - 12 * Math.exp(-Math.pow((u - 0.7) / 0.05, 2));
    }
    var v = (t - TS) / (1 - TS);
    return TOPY + (BASE - 40 - TOPY) * Math.pow(v, 0.7);
  }
  function tOf(p) { return 0.04 + (TS - 0.04) * Math.min(Math.max(p, 0), SEED.summit) / SEED.summit; }
  // ridged noise: sharp peaks, rounded troughs, the look of rock ridges
  function ridged(x, s) {
    return (1 - Math.abs(Math.sin(x / s + 0.7))) * 0.55 + (1 - Math.abs(Math.sin(x / (s * 0.43) + 2.1))) * 0.3 +
      (1 - Math.abs(Math.sin(x / (s * 0.19) + 4.4))) * 0.15;
  }

  // The mountain drawn for a width W in real pixels, with ridges (lam, amp) sized for that width.
  // The big shape is the same at every width, so the trail and the climbers line up in both drawings.
  function mountain(W, lam, amp, lightFromLeft) {
    var key = [W, lam, amp, lightFromLeft].join('|');
    if (cache[key]) return cache[key];
    var f1 = function (n) { return n.toFixed(1); };
    var toD = function (list) { return list.map(function (q, i) { return (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); }).join(' '); };
    var close = ' L' + f1(W) + ' ' + H + ' L0 ' + H + ' Z';
    var crest = function (x) {
      var t = x / W, keep = 1 - Math.exp(-Math.pow((t - TS) / 0.035, 2));
      var foot = Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.05);
      return macro(t) - amp * ridged(x, lam) * keep * foot + amp * 0.35;
    };
    var step = Math.max(1, W / 720), xs = [], x;
    for (x = 0; x <= W + 0.01; x += step) xs.push(Math.min(x, W));
    var P = xs.map(function (v) { return [v, crest(v)]; });
    var range = function (base, peaks, s, a) {
      return toD(xs.map(function (v) {
        var t = v / W, y = base;
        peaks.forEach(function (pk) { y -= pk[2] * Math.exp(-Math.pow((t - pk[0]) / pk[1], 2)); });
        return [v, y - a * ridged(v + 400, s)];
      })) + close;
    };

    // shadow faces: a wedge on the side of each peak that faces away from the sun
    var R = P.map(function (q) { return q[1] - macro(q[0] / W); });
    var peaks = [], win = Math.max(3, Math.round(lam * 1.6 / step)), i, j;
    for (i = win; i < P.length - win; i++) {
      if (P[i][1] > BASE - 20) continue;
      var ok = true;
      for (j = i - win; j <= i + win && ok; j++) if (R[j] < R[i]) ok = false;
      if (ok && (!peaks.length || i - peaks[peaks.length - 1] > win)) peaks.push(i);
    }
    var iTop = 0;
    P.forEach(function (q, k) { if (q[1] < P[iTop][1]) iTop = k; });
    var shade = '';
    var wedge = function (ip, iv, depthK, footK) {
      var dir = iv > ip ? 1 : -1, seg = [], k;
      for (k = ip; k !== iv + dir; k += dir) seg.push(P[k]);
      seg.push([P[iv][0], Math.min(H, P[iv][1] + (BASE - P[iv][1]) * footK)]);
      seg.push([P[ip][0] + (P[iv][0] - P[ip][0]) * 0.45, Math.min(H, P[ip][1] + (BASE - P[ip][1]) * depthK)]);
      shade += toD(seg) + ' Z ';
    };
    peaks.forEach(function (ip, k) {
      if (Math.abs(ip - iTop) <= win) return;
      var dir = lightFromLeft ? 1 : -1;
      var nxt = lightFromLeft ? (k + 1 < peaks.length ? peaks[k + 1] : P.length - 1) : (k > 0 ? peaks[k - 1] : 0);
      var iv = ip;
      for (var m = ip; m !== nxt; m += dir) if (R[m] > R[iv]) iv = m;
      // small faceted shadows that hug the ridge (only on the detailed, zoomed drawing)
      if (lam >= 10 && Math.abs(iv - ip) >= 2 && R[iv] - R[ip] > amp * 0.25) wedge(ip, iv, 0.16, 0.04);
    });
    if (lightFromLeft) wedge(iTop, P.length - 1, 1.3, 1);
    else wedge(iTop, Math.round((TS - 0.26) * (P.length - 1)), 0.95, 0.5);

    // snow cap with a ragged lower edge that dips into the gullies
    var snowY = function (v) { return 158 + 16 * ridged(v + 90, lam * 1.6) - 8 + 6 * Math.sin(v / (lam * 0.9)); };
    var above = P.filter(function (q) { return q[1] < snowY(q[0]); });
    var snow = '';
    if (above.length > 1) {
      var a0 = above[0][0], a1 = above[above.length - 1][0];
      var back = P.filter(function (q) { return q[0] >= a0 && q[0] <= a1; }).reverse()
        .map(function (q) { return 'L' + f1(q[0]) + ' ' + f1(Math.max(q[1], snowY(q[0]))); });
      snow = toD(above) + ' ' + back.join(' ') + ' Z';
    }

    // pine forest along the foot, then the snowy valley floor
    var tw = lam * 1.05, forest = '', n = 0;
    for (x = -tw; x < W + tw; x += tw * 0.72, n++) {
      var h = lam * (2.1 + ((n * 37) % 9) / 6), b = 368 - ((n * 13) % 3);
      forest += 'M' + f1(x - tw / 2) + ' ' + b + ' L' + f1(x) + ' ' + f1(b - h) + ' L' + f1(x + tw / 2) + ' ' + b + ' Z ';
    }
    var ground = 'M0 366 Q' + f1(W * 0.25) + ' 360 ' + f1(W * 0.5) + ' 365 T' + f1(W) + ' 364 V380 H0 Z';
    var trail = [];
    for (x = W * 0.02; x <= W * tOf(SEED.summit) + 0.01; x += step) trail.push([x, macro(x / W) + 12]);

    cache[key] = {
      far2: range(250, [[0.28, 0.2, 140], [0.62, 0.14, 95], [0.97, 0.12, 170]], lam * 2.2, amp * 1.4),
      far1: range(300, [[0.12, 0.1, 80], [0.5, 0.16, 120], [0.9, 0.1, 110]], lam * 1.6, amp * 1.1),
      body: toD(P) + close, crest: toD(P), shade: shade, snow: snow, forest: forest, ground: ground, trail: toD(trail)
    };
    return cache[key];
  }

  function layer(cls, viewW, art, zoomed) {
    return '<svg class="layer ' + cls + '" viewBox="0 0 ' + viewW.toFixed(1) + ' 380" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="m-far2" d="' + art.far2 + '"/><path class="m-far1" d="' + art.far1 + '"/>' +
      '<path class="m-rock" d="' + art.body + '"/><path class="m-snow" d="' + art.snow + '"/>' +
      '<path class="m-shade" d="' + art.shade + '"/>' +
      '<path class="m-edge' + (zoomed ? ' z' : '') + '" d="' + art.crest + '"/>' +
      '<path class="m-trail-under' + (zoomed ? ' z' : '') + '" d="' + art.trail + '"/>' +
      '<path class="m-trail' + (zoomed ? ' z' : '') + '" d="' + art.trail + '"/>' +
      '<path class="m-forest" d="' + art.forest + '"/><path class="m-ground" d="' + art.ground + '"/></svg>';
  }

  // ---------- the data ----------
  // Points each room had at midnight (local time), to show who moved up or down today.
  function standings() {
    var ranking = Store.ranking(), midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    var since = {};
    Store.allLedger().forEach(function (l) {
      if (Date.parse(l.at) >= midnight.getTime()) since[l.teamId] = (since[l.teamId] || 0) + l.points;
    });
    var before = ranking.map(function (e) { return { id: e.team.id, index: e.index, pts: e.points - (since[e.team.id] || 0) }; })
      .sort(function (a, b) { return b.pts - a.pts || a.index - b.index; });
    var rankThen = {};
    before.forEach(function (e, i) { rankThen[e.id] = i + 1; });
    return ranking.map(function (e, i) {
      return { team: e.team, points: e.points, rank: i + 1, then: rankThen[e.team.id], move: rankThen[e.team.id] - (i + 1) };
    });
  }

  function cardHtml(rows, id) {
    var me = Store.me().teamId, r = rows.filter(function (x) { return x.team.id === id; })[0] || rows[0];
    var ahead = rows[r.rank - 2], t = r.team;
    var move = r.move > 0 ? '▲ ' + r.move + ' today' : r.move < 0 ? '▼ ' + (-r.move) + ' today' : 'Same place as this morning';
    var face = t.avatar ? ' has-photo" style="background-image:url(' + t.avatar + ')' : '" style="background:' + t.color;
    return '<span class="m-face' + face + '">' + (t.avatar ? '' : esc(initial(t))) + '</span>' +
      '<div class="m-card-main"><b>' + esc(Store.displayName(t)) + (t.id === me ? ' <i>(you)</i>' : '') + '</b>' +
      '<span class="m-muted">' + ord(r.rank) + ' of ' + rows.length + ' · ' + Math.max(0, SEED.summit - r.points) + ' pts to the summit</span>' +
      '<span class="' + (r.move > 0 ? 'm-up' : r.move < 0 ? 'm-down' : 'm-muted') + '">' + move +
      (ahead ? ' · ' + (ahead.points - r.points) + ' pts to pass ' + esc(Store.displayName(ahead.team)) : '') + '</span>' +
      '<button class="m-link" data-act="team-info" data-id="' + t.id + '">Open their page: bingo, challenges, photos</button></div>' +
      '<span class="m-score">' + r.points + '</span>';
  }

  // ---------- the screen ----------
  function view() {
    var when = period(), P = PERIODS[when];
    var VW = Math.max(260, Math.min(window.innerWidth || 390, 480) - 32), ZW = VW * KZ;
    var rows = standings(), myId = Store.me().teamId;
    var mine = rows.filter(function (r) { return r.team.id === myId; })[0] || rows[0];
    if (!ui.sel || !rows.some(function (r) { return r.team.id === ui.sel; })) ui.sel = myId;
    var ov = mountain(VW, 5, 7, P.lightFromLeft), zo = mountain(ZW, 15, 16, P.lightFromLeft);

    // rooms close together on the zoomed climb are lifted onto taller poles so none overlaps
    var xAt = function (r, K) { return tOf(r.points) * VW * K; };
    var lastX = [-1e9, -1e9, -1e9, -1e9], tier = {};
    rows.slice().sort(function (a, b) { return xAt(a, KZ) - xAt(b, KZ); }).forEach(function (r) {
      var x = xAt(r, KZ), k = -1;
      for (var i = 0; i < lastX.length; i++) if (x - lastX[i] >= 38) { k = i; break; }
      if (k < 0) k = lastX.indexOf(Math.min.apply(null, lastX));
      tier[r.team.id] = k; lastX[k] = x;
    });
    var named = {}; named[myId] = 1; named[rows[0].team.id] = 1;
    if (rows[mine.rank - 2]) named[rows[mine.rank - 2].team.id] = 1;
    if (rows[mine.rank]) named[rows[mine.rank].team.id] = 1;

    var pins = rows.map(function (r) {
      var t = r.team, me = t.id === myId, y = macro(tOf(r.points)) + 12;
      var xo = xAt(r, 1), xz = xAt(r, KZ), so = me ? 16 : 11, sz = me ? 40 : 32, stem = 12 + tier[t.id] * 40;
      var yo = y - so / 2, yz = y - sz - stem;
      var vars = '--ox:' + px(xo - so / 2) + ';--oy:' + px(yo) + ';--os:' + px(so) + ';--zx:' + px(xz - sz / 2) + ';--zy:' + px(yz) + ';--zs:' + px(sz) +
        ';--sox:' + px(xo - 1) + ';--soy:' + px(y) + ';--szx:' + px(xz - 1) + ';--szy:' + px(y - stem) + ';--szh:' + px(stem) +
        ';--cox:' + px(xo - 60) + ';--coy:' + px(yo - 22) + ';--czx:' + px(xz - 60) + ';--czy:' + px(yz - 22) + ';--glow:' + t.color;
      var face = t.avatar ? 'background-image:url(' + t.avatar + ');background-size:cover;background-position:center' : 'background:' + t.color;
      var name = Store.displayName(t);
      var chip = me ? 'You · ' + ord(r.rank) : r.rank === 1 ? 'Leader · ' + name : name;
      return '<span class="m-stem" style="' + vars + '"></span>' +
        '<button class="m-pin' + (me ? ' me' : '') + '" data-act="mtn-pick" data-id="' + t.id + '" style="' + vars + ';' + face + ';z-index:' + (me ? 25 : 10 + tier[t.id]) + '" ' +
        'aria-label="' + esc(name + ', ' + ord(r.rank) + ', ' + r.points + ' points') + '">' + (t.avatar ? '' : '<span class="m-ini">' + esc(initial(t)) + '</span>') + '</button>' +
        (named[t.id] ? '<span class="m-chip' + (me ? ' me' : '') + '" style="' + vars + '"><span>' + esc(chip) + '</span></span>' : '');
    }).join('');

    var steps = STEPS.map(function (s) {
      var p = s[0], t = tOf(p), y = macro(t) + 12, xo = t * VW, xz = t * ZW, major = p % 500 === 0;
      if (p === 0) return '';
      if (p === SEED.summit) {
        return '<span class="m-flag-label top" style="--ox:' + px(xo + 24) + ';--zx:' + px(xz + 24) + ';--y:' + px(macro(TS) - 46) + '">' +
          '<i class="o">' + p + '</i><i class="z">Summit · ' + p + '</i></span>';
      }
      return '<span class="m-pole' + (major ? ' major' : '') + '" style="--ox:' + px(xo - 1) + ';--zx:' + px(xz - 1) + ';--y:' + px(y) + '"></span>' +
        '<span class="m-flag-label' + (major ? ' major' : '') + '" style="--ox:' + px(xo + 1) + ';--zx:' + px(xz + 1) + ';--y:' + px(y) + '">' +
        '<i class="o">' + p + '</i><i class="z">' + s[1] + ' · ' + p + '</i></span>';
    }).join('');

    // who you passed today (or who passed you)
    var passed = rows.filter(function (r) { return r.team.id !== myId && r.then < mine.then && r.rank > mine.rank; });
    var passer = rows.filter(function (r) { return r.team.id !== myId && r.then > mine.then && r.rank < mine.rank; });
    var banner = passed.length
      ? '<div class="m-banner"><span class="m-up">▲</span> You passed ' + esc(Store.displayName(passed[0].team)) + (passed.length > 1 ? ' and ' + (passed.length - 1) + ' more' : '') + ' today</div>'
      : passer.length ? '<div class="m-banner"><span class="m-down">▼</span> ' + esc(Store.displayName(passer[0].team)) + ' passed you today</div>' : '';

    // the short ranking: the top 3 and the rooms either side of you
    var want = {}; [0, 1, 2, mine.rank - 2, mine.rank - 1, mine.rank].forEach(function (i) { if (i >= 0 && i < rows.length) want[i] = 1; });
    var idx = Object.keys(want).map(Number).sort(function (a, b) { return a - b; }), list = '';
    idx.forEach(function (i, k) {
      if (k && i - idx[k - 1] > 1) list += '<span class="m-gap">· · ·</span>';
      var r = rows[i], mv = r.move > 0 ? '▲' + r.move : r.move < 0 ? '▼' + (-r.move) : '–';
      list += '<button class="m-row' + (r.team.id === myId ? ' me' : '') + '" data-act="mtn-pick" data-id="' + r.team.id + '">' +
        '<span class="m-rank">' + r.rank + '</span><span class="m-dot" style="background:' + r.team.color + '"></span>' +
        '<span class="m-name">' + esc(Store.displayName(r.team)) + '</span>' +
        '<span class="m-move ' + (r.move > 0 ? 'm-up' : r.move < 0 ? 'm-down' : 'm-muted') + '">' + mv + '</span>' +
        '<span class="m-pts">' + r.points + '</span></button>';
    });

    var sky = when === 'night' ? '<span class="m-stars"></span>' : '';
    return '<section class="mtn' + (ui.zoom === 'me' ? ' zoomed' : '') + '" data-time="' + when + '" style="--vw:' + px(VW) + ';--zw:' + px(ZW) + '">' +
      '<header class="m-head"><div><span class="m-kicker">' + P.label + '</span><h2 class="m-title">The Climb</h2></div>' +
      '<span class="m-time">' + P.hours + '</span></header>' +
      '<div class="m-frame">' + sky + '<span class="m-sun"></span>' +
      '<div class="m-scroll"><div class="m-track">' +
      layer('ov', VW, ov, false) + layer('zo', ZW, zo, true) +
      '<svg class="m-chalet" viewBox="0 0 34 28" style="--ox:' + px(0.025 * VW - 17) + ';--zx:' + px(0.025 * ZW - 17) + '" aria-hidden="true">' +
      '<path class="wall" d="M5 26 V12 H29 V26 Z"/><path class="roof" d="M2 13 L17 2 L32 13 Z"/><path class="door" d="M14 26 V18 H20 V26"/></svg>' +
      '<svg class="m-summit" viewBox="0 0 30 40" style="--ox:' + px(TS * VW - 3) + ';--zx:' + px(TS * ZW - 3) + ';--y:' + px(macro(TS) - 44) + '" aria-hidden="true">' +
      '<path class="pole" d="M3 39 V3"/><path class="flag" d="M3 4 L27 11 L3 18 Z"/></svg>' +
      steps + pins + '</div></div>' +
      banner + '<div class="m-hint">← swipe along the climb →</div></div>' +
      '<div class="m-seg"><button class="seg-all" data-act="mtn-zoom" data-z="all">Whole mountain</button>' +
      '<button class="seg-me" data-act="mtn-zoom" data-z="me">My room</button></div>' +
      '<div class="m-card" id="m-card">' + cardHtml(rows, ui.sel) + '</div>' +
      '<div class="m-list">' + list + '</div></section>';
  }

  function scroller() { return document.querySelector('.mtn .m-scroll'); }

  // Keep my room centred while the climb widens or narrows (also across a live update mid-zoom).
  function follow() {
    cancelAnimationFrame(ui.raf);
    var start = performance.now();
    var stepFn = function (now) {
      var sc = scroller(), me = document.querySelector('.mtn .m-pin.me');
      if (!sc || !me) return;
      var r = me.getBoundingClientRect(), s = sc.getBoundingClientRect();
      sc.scrollLeft += (r.left + r.width / 2) - (s.left + s.width / 2);
      ui.scroll = sc.scrollLeft;
      if (now - start < 1150) ui.raf = requestAnimationFrame(stepFn);
    };
    ui.raf = requestAnimationFrame(stepFn);
    // and once more when the zoom has finished, in case animation frames were paused (tab in the background)
    clearTimeout(ui.settle);
    ui.settle = setTimeout(function () { if (ui.zoom === 'me') stepFn(start + 1e9); }, 1000);
  }

  function zoom(z) {
    ui.zoom = z;
    ui.autoDone = true;
    var root = document.querySelector('.mtn');
    if (!root) return;
    root.classList.toggle('zoomed', z === 'me');
    if (z === 'me') follow(); else { cancelAnimationFrame(ui.raf); ui.scroll = 0; }
  }

  // Called after the screen is put on the page (also after every live update).
  function mount() {
    var sc = scroller();
    if (!sc) return;
    if (ui.zoom === 'me') sc.scrollLeft = ui.scroll;
    sc.addEventListener('scroll', function () { ui.scroll = sc.scrollLeft; }, { passive: true });
    clearTimeout(ui.timer);
    if (!ui.autoDone) ui.timer = setTimeout(function () { if (!ui.autoDone && document.querySelector('.mtn')) zoom('me'); }, 1300);
  }

  function select(id) {
    ui.sel = id;
    var card = document.getElementById('m-card');
    if (card) card.innerHTML = cardHtml(standings(), id);
  }

  window.Mountain = {
    view: view, mount: mount, zoom: zoom, select: select, period: period,
    leave: function () { clearTimeout(ui.timer); cancelAnimationFrame(ui.raf); }
  };
})();
