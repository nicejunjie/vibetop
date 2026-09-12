// Iron Frontier — main.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.
// the boot section; it imports every module so evaluation order is the section order

import './ai.js';
import { bakeAll } from './bake/bake.js';
import './bake/buildings.js';
import './bake/civ.js';
import './bake/infantry.js';
import './bake/kit.js';
import './bake/ships.js';
import './bake/states.js';
import './bake/terrain.js';
import './bake/vehicles.js';
import './bake/walls.js';
import './blds.js';
import './combat-tables.js';
import './combat.js';
import './entities.js';
import { FACTIONS } from './factions.js';
import './geom.js';
import './hooks.js';
import './mapgen.js';
import './move.js';
import './net.js';
import './neutral.js';
import './opts.js';
import './ore.js';
import './path.js';
import './production.js';
import './rng.js';
import './roster.js';
import './shroud.js';
import './special.js';
import { DIFF, difficulty, faction, setDifficulty, setFaction } from './state.js';
import './supers.js';
import './transport.js';
import './ui/audio.js';
import './ui/cursors.js';
import { stage } from './ui/dom.js';
import './ui/hud.js';
import './ui/input.js';
import { tick } from './ui/loop.js';
import { enterLoaded, loadOpts, menu } from './ui/menus.js';
import './ui/minimap.js';
import { buildPanel } from './ui/panel.js';
import './ui/render.js';
import { loadGame, lsGet, resumeWanted } from './ui/save.js';
import { resize } from './ui/screen.js';
import './units/aircraft/harrier.js';
import './units/aircraft/kirov.js';
import './units/infantry/cleg.js';
import './units/infantry/conscript.js';
import './units/infantry/desolator.js';
import './units/infantry/dog.js';
import './units/infantry/engineer.js';
import './units/infantry/flak-trooper.js';
import './units/infantry/gi.js';
import './units/infantry/guardian-gi.js';
import './units/infantry/ivan.js';
import './units/infantry/rocketeer.js';
import './units/infantry/spy.js';
import './units/infantry/tanya.js';
import './units/infantry/teslatrooper.js';
import './units/infantry/yuri.js';
import './units/ships/aegis.js';
import './units/ships/carrier.js';
import './units/ships/destroyer.js';
import './units/ships/dolphin.js';
import './units/ships/dread.js';
import './units/ships/lcraft.js';
import './units/ships/seascorp.js';
import './units/ships/squid.js';
import './units/ships/sub.js';
import './units/structures/airforce.js';
import './units/structures/barracks.js';
import './units/structures/base.js';
import './units/structures/chrono.js';
import './units/structures/cloningvats.js';
import './units/structures/curtain.js';
import './units/structures/depot.js';
import './units/structures/factory.js';
import './units/structures/flakcannon.js';
import './units/structures/gapgen.js';
import './units/structures/gate.js';
import './units/structures/grandcannon.js';
import './units/structures/lab.js';
import './units/structures/nuke.js';
import './units/structures/patriot.js';
import './units/structures/power.js';
import './units/structures/prism.js';
import './units/structures/psisensor.js';
import './units/structures/purifier.js';
import './units/structures/radar.js';
import './units/structures/reactor.js';
import './units/structures/refinery.js';
import './units/structures/sentry.js';
import './units/structures/sentrygun.js';
import './units/structures/shipyard.js';
import './units/structures/spysat.js';
import './units/structures/tesla.js';
import './units/structures/wall.js';
import './units/structures/weather.js';
import './units/vehicles/apc.js';
import './units/vehicles/chronominer.js';
import './units/vehicles/drone.js';
import './units/vehicles/flaktrack.js';
import './units/vehicles/ifv.js';
import './units/vehicles/lancer.js';
import './units/vehicles/mammoth.js';
import './units/vehicles/mcv.js';
import './units/vehicles/mirage.js';
import './units/vehicles/nighthawk.js';
import './units/vehicles/rhino.js';
import './units/vehicles/spectre.js';
import './units/vehicles/teslatank.js';
import './units/vehicles/v3.js';
import './units/vehicles/warminer.js';
import './watch.js';
import './world.js';

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
