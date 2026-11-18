// The salamander. One drawing, several poses: the pose is a data attribute and the
// movement is done in CSS (see "Mascot" in style.css).
// Poses: idle, wave, celebrate, dance.
(function () {
  // outline colour follows the time of day (.mascot { color } in style.css)
  var W = 'stroke="currentColor"', G = '#3DBE6B', G2 = '#2FA85A';
  var body =
    '<g class="m-all"><g transform="rotate(-5 340 300)" stroke-linecap="round" stroke-linejoin="round">' +
    // far ski, boot and leg
    '<path d="M164 412 Q170 436 198 438 L522 438" fill="none" ' + W + ' stroke-width="20"/>' +
    '<path d="M164 412 Q170 436 198 438 L522 438" fill="none" stroke="#FFC933" stroke-width="9"/>' +
    '<rect x="370" y="412" width="62" height="24" rx="9" fill="#C7352F" ' + W + ' stroke-width="6"/>' +
    '<path d="M404 380 L400 416" fill="none" ' + W + ' stroke-width="32"/>' +
    '<path d="M404 380 L400 416" fill="none" stroke="' + G2 + '" stroke-width="19"/>' +
    '<path d="M402 398 L401 408" fill="none" stroke="#FF5C7A" stroke-width="19" stroke-linecap="butt"/>' +
    // raised arm and pole (this is the part that waves)
    '<g class="m-arm">' +
    '<path d="M470 70 L404 214" fill="none" ' + W + ' stroke-width="7"/>' +
    '<path d="M352 252 L424 176" fill="none" ' + W + ' stroke-width="32"/>' +
    '<path d="M352 252 L424 176" fill="none" stroke="' + G2 + '" stroke-width="19"/>' +
    '<path d="M398 204 L411 190" fill="none" stroke="#FF5C7A" stroke-width="19" stroke-linecap="butt"/>' +
    '<circle cx="428" cy="172" r="15" fill="' + G2 + '" ' + W + ' stroke-width="6"/>' +
    '</g>' +
    // crest
    '<path d="M326 168 L374 146 L366 190 L420 182 L401 226 L457 232 L429 270 L480 292 L436 312 L352 228 Z" fill="#FF8A3D" ' + W + ' stroke-width="7"/>' +
    // near ski, boot and leg
    '<path d="M140 428 Q146 454 176 456 L542 456" fill="none" ' + W + ' stroke-width="20"/>' +
    '<path d="M140 428 Q146 454 176 456 L542 456" fill="none" stroke="#FFC933" stroke-width="9"/>' +
    '<rect x="300" y="430" width="66" height="26" rx="10" fill="#E8413C" ' + W + ' stroke-width="6"/>' +
    '<path d="M352 372 L336 432" fill="none" ' + W + ' stroke-width="34"/>' +
    '<path d="M352 372 L336 432" fill="none" stroke="' + G + '" stroke-width="21"/>' +
    '<path d="M342 410 L338 424" fill="none" stroke="#FF5C7A" stroke-width="21" stroke-linecap="butt"/>' +
    // body, belly, spots
    '<path d="M290 250 C280 300 300 360 350 385 L400 392 C450 400 505 392 545 350 C560 335 572 318 580 300 C545 335 475 338 432 310 C412 270 382 238 348 224 C352 182 322 150 285 152 C250 152 215 175 200 195 C192 208 200 222 220 224 C250 228 275 240 290 250 Z" fill="' + G + '" ' + W + ' stroke-width="7"/>' +
    '<path d="M300 262 C296 300 312 344 352 366 C340 330 336 296 340 262 C326 252 312 252 300 262 Z" fill="#BFF0C9"/>' +
    '<g fill="#FFC933"><circle cx="378" cy="290" r="11"/><circle cx="400" cy="340" r="9"/><circle cx="455" cy="356" r="10"/><circle cx="510" cy="350" r="7"/><circle cx="372" cy="250" r="6"/></g>' +
    // headband, eye, nostril, smile
    '<path d="M283 154 L316 236" fill="none" ' + W + ' stroke-width="27" stroke-linecap="butt"/>' +
    '<path d="M283 154 L316 236" fill="none" stroke="#E8413C" stroke-width="15" stroke-linecap="butt"/>' +
    '<g fill="none" ' + W + ' stroke-width="3.5"><path d="M283 172 L297 168"/><path d="M289 188 L303 184"/><path d="M295 204 L309 200"/><path d="M301 220 L315 216"/></g>' +
    '<ellipse cx="252" cy="188" rx="15" ry="12" fill="#fff"/><circle cx="247" cy="190" r="6" fill="#0E1530"/>' +
    '<circle cx="211" cy="203" r="3" fill="#fff"/>' +
    '<path d="M207 215 Q230 228 258 222" fill="none" ' + W + ' stroke-width="5"/>' +
    // front pole and arm
    '<path d="M196 300 L176 420" fill="none" ' + W + ' stroke-width="7"/>' +
    '<path d="M162 408 L190 414" fill="none" ' + W + ' stroke-width="6"/>' +
    '<path d="M312 286 L214 306" fill="none" ' + W + ' stroke-width="32"/>' +
    '<path d="M312 286 L214 306" fill="none" stroke="' + G + '" stroke-width="19"/>' +
    '<path d="M246 300 L230 303" fill="none" stroke="#FF5C7A" stroke-width="19" stroke-linecap="butt"/>' +
    '<circle cx="204" cy="308" r="16" fill="' + G + '" ' + W + ' stroke-width="6"/>' +
    '</g></g>' +
    // heart
    '<g class="m-heart"><path d="M128 196 C92 166 104 132 128 150 C152 132 164 166 128 196 Z" fill="#FF5C7A" ' + W + ' stroke-width="6" stroke-linejoin="round"/>' +
    '<g fill="none" ' + W + ' stroke-width="5" stroke-linecap="round"><path d="M112 122 L106 106"/><path d="M130 118 L130 100"/><path d="M148 122 L156 106"/></g></g>';

  window.Mascot = {
    svg: function (pose) {
      return '<svg class="mascot" data-pose="' + (pose || 'idle') + '" viewBox="80 50 540 440" role="img" aria-label="The salamander mascot on skis">' + body + '</svg>';
    },
    // Play a pose once on an existing mascot element, then go back to idle.
    play: function (el, pose, ms) {
      if (!el) return;
      el.setAttribute('data-pose', pose);
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.setAttribute('data-pose', 'idle'); }, ms || 1800);
    }
  };
})();
