// The leaderboard mountain: one alpinist per team, altitude = points.
(function () {
  var TOP = 78, BASE = 452, PEAK_X = 180;

  // Where a team stands for a given share of the summit score (0 = chalet, 1 = summit).
  function spot(index, share) {
    var f = Math.max(0, Math.min(1, share));
    var y = BASE - f * (BASE - TOP);
    var half = (y - 52) / 420 * 160 * 0.55;          // usable half-width of the mountain at this height
    var lane = (index % 5 - 2) / 2;                   // five climbing routes, from -1 to 1
    var row = Math.floor(index / 5) - 1;              // keeps teams on the same route apart
    var x = PEAK_X + lane * half + Math.sin(f * 9 + index) * half * 0.12 + row * 8 * (1 - f);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function alpinist(entry, mine) {
    var t = entry.team, start = spot(entry.index, 0);
    var initial = (Store.displayName(t).replace(/^(The|Les) /, '')[0] || '?').toUpperCase();
    return '<g class="alp' + (mine ? ' mine' : '') + '" data-act="team-info" data-id="' + t.id + '" ' +
      'data-index="' + entry.index + '" data-points="' + entry.points + '" ' +
      'style="transform:translate(' + start.x + 'px,' + start.y + 'px)">' +
      (mine ? '<circle class="ring" r="17" fill="none" stroke="#fff" stroke-width="2"/>' : '') +
      '<path d="M-9 -5 Q0 -21 9 -5 Z" fill="#fff"/><circle cx="0" cy="-17" r="3" fill="#fff"/>' +
      '<circle r="10.5" fill="' + t.color + '" stroke="#fff" stroke-width="2.5"/>' +
      '<text y="4" text-anchor="middle">' + initial + '</text>' +
      (mine ? '<text class="you" y="27" text-anchor="middle">YOU</text>' : '') +
      '</g>';
  }

  function svg(ranking, myTeamId) {
    var marks = [0.25, 0.5, 0.75].map(function (f) {
      var y = BASE - f * (BASE - TOP);
      return '<path class="mark" d="M22 ' + y + ' H338"/><text class="mark-t" x="338" y="' + (y - 5) + '" text-anchor="end">' +
        Math.round(SEED.summit * f) + ' pts</text>';
    }).join('');
    // Drawn from last to first so the leaders sit on top.
    var climbers = ranking.slice().reverse().map(function (e) { return alpinist(e, e.team.id === myTeamId); }).join('');
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
    // Call after the SVG is in the page: every alpinist climbs from the chalet to its altitude.
    climb: function (root) {
      var nodes = root.querySelectorAll('.alp');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          Array.prototype.forEach.call(nodes, function (n) {
            var p = spot(+n.getAttribute('data-index'), +n.getAttribute('data-points') / SEED.summit);
            n.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
          });
        });
      });
    }
  };
})();
