// Gives the salamander a 2.5D feel: the hero mascots tilt toward you as you move
// the phone (gyroscope) or the pointer. Drives CSS vars on <html>; the look lives
// in style.css. No library, and it respects reduced-motion.
(function () {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  var root = document.documentElement;
  var tx = 0, ty = 0, rx = 0, ry = 0;          // target / current rotation (deg)
  var MAXY = 24, MAXX = 16;

  function clamp(v, m) { return v < -m ? -m : (v > m ? m : v); }

  function apply() {
    rx += (tx - rx) * 0.12;
    ry += (ty - ry) * 0.12;
    root.style.setProperty('--mrx', rx.toFixed(2) + 'deg');
    root.style.setProperty('--mry', ry.toFixed(2) + 'deg');
    root.style.setProperty('--shx', (ry * -0.7).toFixed(1) + 'px');
    requestAnimationFrame(apply);
  }

  // Pointer (desktop hover, or finger drag on touch)
  window.addEventListener('pointermove', function (e) {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    ty = clamp((e.clientX / w - 0.5) * 2 * MAXY, MAXY);
    tx = clamp(-(e.clientY / h - 0.5) * 2 * MAXX, MAXX);
  });
  window.addEventListener('pointerleave', function () { tx = 0; ty = 0; });

  // Gyroscope
  function onTilt(e) {
    if (e == null || e.gamma == null) return;
    ty = clamp(e.gamma * 0.55, MAXY);          // left-right
    tx = clamp((e.beta - 45) * 0.35, MAXX);    // front-back (45 = holding the phone up)
  }
  function enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {   // iOS 13+
      DeviceOrientationEvent.requestPermission()
        .then(function (p) { if (p === 'granted') window.addEventListener('deviceorientation', onTilt); })
        .catch(function () {});
    } else {
      window.addEventListener('deviceorientation', onTilt);
    }
  }
  // iOS needs a user gesture to ask for gyro access; piggyback on the first tap.
  window.addEventListener('pointerdown', function once() {
    enableGyro();
    window.removeEventListener('pointerdown', once);
  });

  requestAnimationFrame(apply);
})();
