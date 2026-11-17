// The leaderboard mountain: one alpinist per team, altitude = points.
(function () {
  var TOP = 78, BASE = 452, PEAK_X = 180, GAP = 27, FIELD = 0.66;
  var last = {};                                       // team id -> where its alpinist was last drawn

  function halfWidth(y) { return (y - 52) / 420 * 160 * FIELD; }   // usable half-width of the mountain at this height

  // Where a team stands for a given share of the summit score (0 = chalet, 1 = summit).
  function spot(index, share) {
    var f = Math.max(0, Math.min(1, share));
    var y = BASE - f * (BASE - TOP);
    var half = halfWidth(y);
    var lane = (index % 5 - 2) / 2;                   // five climbing routes, from -1 to 1
    var row = Math.floor(index / 5) - 1;              // keeps teams on the same route apart
    var x = PEAK_X + lane * half + Math.sin(f * 9 + index) * half * 0.12 + row * 8 * (1 - f);
    return { x: x, y: y };
  }

  // Target position of every team, nudged sideways so two alpinists never sit on top of each other.
  function layout(ranking, myTeamId) {
    var pts = ranking.map(function (e) {
      var p = spot(e.index, e.points / SEED.summit);
      return { id: e.team.id, x: p.x, y: p.y, index: e.index, mine: e.team.id === myTeamId };
    });
    for (var pass = 0; pass < 30; pass++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
          var gap = GAP + (a.mine || b.mine ? 9 : 0);     // my own marker carries a ring and a label
          if (d >= gap) continue;
          moved = true;
          var push = (gap - d) / 2 + 0.5, dir = dx === 0 ? (a.index < b.index ? 1 : -1) : (dx > 0 ? 1 : -1);
          a.x -= dir * push; b.x += dir * push;
          // a crowd that cannot spread any wider (everyone at base camp on day one) forms a second row
          if (pass >= 10) { if (dy > 0) { a.y -= push; b.y += push; } else { b.y -= push * 2; } }
        }
      }
      pts.forEach(function (p) {                       // stay on the mountain
        var half = Math.max(halfWidth(p.y) / FIELD * 0.82, 6);
        p.y = Math.max(TOP, Math.min(BASE, p.y));
        p.x = Math.max(PEAK_X - half, Math.min(PEAK_X + half, p.x));
      });
      if (!moved) break;
    }
    var map = {};
    pts.forEach(function (p) { map[p.id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; });
    return map;
  }

  function alpinist(entry, mine, target) {
    var t = entry.team, start = last[t.id] || spot(entry.index, 0);
    var initial = (Store.displayName(t).replace(/^(The|Les) /, '')[0] || '?').toUpperCase();
    var face = t.avatar
      ? '<clipPath id="c-' + t.id + '"><circle r="10.5"/></clipPath>' +
        '<image href="' + t.avatar + '" x="-10.5" y="-10.5" width="21" height="21" clip-path="url(#c-' + t.id + ')" preserveAspectRatio="xMidYMid slice"/>' +
        '<circle r="10.5" fill="none" stroke="#fff" stroke-width="2.5"/>'
      : '<circle r="10.5" fill="' + t.color + '" stroke="#fff" stroke-width="2.5"/><text y="4" text-anchor="middle">' + initial + '</text>';
    return '<g class="alp' + (mine ? ' mine' : '') + '" data-act="team-info" data-id="' + t.id + '" ' +
      'data-x="' + target.x + '" data-y="' + target.y + '" ' +
      'style="transform:translate(' + start.x + 'px,' + start.y + 'px)">' +
      (mine ? '<circle class="ring" r="17" fill="none" stroke="#fff" stroke-width="2"/>' : '') +
      '<path d="M-9 -5 Q0 -21 9 -5 Z" fill="#fff"/><circle cx="0" cy="-17" r="3" fill="#fff"/>' +
      face +
      (mine ? '<g class="you"><rect x="-15" y="15" width="30" height="13" rx="6.5"/><text y="24.5" text-anchor="middle">YOU</text></g>' : '') +
      '</g>';
  }

  function svg(ranking, myTeamId) {
    var marks = [0.25, 0.5, 0.75].map(function (f) {
      var y = BASE - f * (BASE - TOP);
      return '<path class="mark" d="M22 ' + y + ' H338"/><text class="mark-t" x="338" y="' + (y - 5) + '" text-anchor="end">' +
        Math.round(SEED.summit * f) + ' pts</text>';
    }).join('');
    var where = layout(ranking, myTeamId);
    // Drawn from last to first so the leaders sit on top, and my own team above everyone.
    var order = ranking.slice().reverse();
    order.sort(function (a, b) { return (a.team.id === myTeamId) - (b.team.id === myTeamId); });
    var climbers = order.map(function (e) { return alpinist(e, e.team.id === myTeamId, where[e.team.id]); }).join('');
    return '<svg class="mountain" viewBox="0 0 360 500" role="img" aria-label="Leaderboard mountain">' +
      '<g fill="#fff"><circle cx="40" cy="40" r="2"/><circle cx="310" cy="64" r="2.5"/><circle cx="92" cy="110" r="1.6"/><circle cx="270" cy="150" r="1.6"/><circle cx="330" cy="210" r="2"/><circle cx="30" cy="230" r="1.8"/></g>' +
      '<path d="M-10 472 L50 300 L78 330 L112 250 L150 472 Z" fill="#131C3E" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M220 472 L262 280 L292 316 L322 262 L372 472 Z" fill="#131C3E" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M14 472 L58 400 L78 410 L112 300 L130 312 L160 150 L170 160 L180 52 L192 150 L204 140 L232 300 L250 286 L284 400 L302 388 L346 472 Z" fill="#1B2857" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M180 52 L160 150 L170 160 L177 146 L184 161 L192 150 Z" fill="#F2F6FF" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M180 52 V26" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M180 27 L198 33 L180 40 Z" fill="#FF5C7A" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
      marks +
      '<path d="M0 472 Q90 462 180 470 T360 466 V500 H0 Z" fill="#F2F6FF"/>' +
      '<path d="M0 472 Q90 462 180 470 T360 466" fill="none" stroke="#fff" stroke-width="3"/>' +
      '<g stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M28 468 L38 440 L48 468 Z" fill="#3DBE6B"/><path d="M318 466 L327 442 L336 466 Z" fill="#3DBE6B"/><path d="M52 470 L60 450 L68 470 Z" fill="#2FA85A"/></g>' +
      '<g stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M166 470 V456 H194 V470 Z" fill="#FF8A3D"/><path d="M162 457 L180 444 L198 457 Z" fill="#E8413C"/></g>' +
      climbers + '</svg>';
  }

  window.Mountain = {
    html: function (ranking, myTeamId) { return svg(ranking, myTeamId); },
    // Call after the SVG is in the page: every alpinist climbs from where it last stood
    // (the chalet the first time) to its altitude.
    climb: function (root) {
      var nodes = root.querySelectorAll('.alp');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          Array.prototype.forEach.call(nodes, function (n) {
            var x = +n.getAttribute('data-x'), y = +n.getAttribute('data-y');
            n.style.transform = 'translate(' + x + 'px,' + y + 'px)';
            last[n.getAttribute('data-id')] = { x: x, y: y };
          });
        });
      });
    }
  };
})();
