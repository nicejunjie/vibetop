// Iron Frontier — ui/dom.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

// ===================================================================== //
//  Everything below is presentation — skipped entirely when headless.
// ===================================================================== //

var cv = document.getElementById('cv');

var ctx = cv.getContext('2d');

var mini = document.getElementById('mini');

var mctx = mini.getContext('2d');

var stage = document.getElementById('stage');

var cvW = 800, cvH = 600;

var IS_TOUCH = (function () { try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { return false; } })();

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setCvH(v) { cvH = v; }
function setCvW(v) { cvW = v; }
