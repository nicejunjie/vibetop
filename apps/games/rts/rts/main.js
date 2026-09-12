// Iron Frontier — main.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.
// the boot section; it imports every module so evaluation order is the section order























































































































// --------------------------------------------------------------------- //
//  Boot
// --------------------------------------------------------------------- //
setDifficulty(lsGet('vibetop:rts:diff') || 'normal');

if (!DIFF[difficulty]) setDifficulty('normal');

setFaction(lsGet('vibetop:rts:fac') || 'dir');

if (!FACTIONS[faction]) setFaction('dir');

loadOpts();

// Load-time bake cost, so the art harness can prove a change did not add
// seconds to the boot (infantry facings/states are baked lazily for exactly
// this reason — see docs/design-decisions.md).
var _bake0 = (window.performance && performance.now) ? performance.now() : 0;

bakeAll();

window.__rtsBakeMs = ((window.performance && performance.now) ? performance.now() : 0) - _bake0;

resize();

if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
else window.addEventListener('resize', resize);

buildPanel();

if (resumeWanted() && loadGame('auto')) enterLoaded('auto');
else menu();

requestAnimationFrame(tick);
