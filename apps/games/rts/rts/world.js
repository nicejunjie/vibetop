// Iron Frontier — world.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

export var TW = 64, TH = 32;          // isometric tile: 64 wide, 32 tall (2:1 diamond)

export var MAP = 64;                  // map is MAP x MAP tiles

export var DPR = Math.min(window.devicePixelRatio || 1, 2);

// Terrain codes
export var T_GROUND = 0, T_ROCK = 1, T_ORE = 2, T_WATER = 3, T_CLIFF = 4, T_TREE = 5, T_ROAD = 6;

// Step-3 terrain. RAMP and BRIDGE are the two PASSABLE members of an
// otherwise blocking family: a ramp is the slope that breaks a cliff wall,
// a bridge is the deck that carries a road over water. Neither is in
// solidT(), so every mover honours them for free — astar, tilePassable,
// separation, the AI — while canPlace refuses them separately, because
// "you may walk here" and "you may build here" are different questions.
// GEM is an ore variant worth double per bail (RA2: gems 50, ore 25).
// CIV is a neutral civilian building: solid, unowned, never owner-coloured.
export var T_RAMP = 7, T_BRIDGE = 8, T_GEM = 9, T_CIV = 10;

// RA2 terrain is not flat: a cliff is the wall between height LEVEL n and
// n+1, and everything standing on the upper level -- ground, ore, trees,
// units, buildings, decals -- draws that much further up the screen. One
// level is exactly the height of the baked cliff face (CLIFF_H), so a
// plateau's surface meets the crown of the cliff that rings it.
export var HSTEP = 32;

export var GEM_MULT = 2;

function solidT(t) { return t === T_ROCK || t === T_WATER || t === T_CLIFF || t === T_TREE || t === T_CIV; }

// A destroyed bridge span: the deck is gone, the water underneath is not,
// so the cell reverts to T_WATER and `g.bwrk` remembers the broken abutment
// so the render can draw the torn deck ends instead of clean shoreline.
export function oreT(t) { return t === T_ORE || t === T_GEM; }

export function waterish(t) { return t === T_WATER || t === T_BRIDGE; }   // the deck reads as water to the shoreline

// ---- Mover classes (RA2 `SpeedType=` / `MovementZone=`) --------------- //
// Three ground classes share ONE A*. LAND (Track/Wheel/Foot, MovementZone
// Normal) never enters water; NAVAL (`Naval=yes`, SpeedType=Float,
// MovementZone=Water) never leaves it; AMPHIBIOUS (the Landing Craft and
// the Amphibious Transport, MovementZone=AmphibiousDestroyer) does both.
// The class is threaded through blocked() / tilePassable() / astar() as an
// OPTIONAL last argument, and `undefined` means LAND — so every call site
// written before the navy existed keeps its exact behaviour and the pinned
// Iron Frontier sim snapshots do not move.
//
// A bridge deck is a LOW bridge in RA2: every naval hull that matters
// carries `TooBigToFitUnderBridge=true`, so the water under a span is not
// navigable. T_BRIDGE therefore BLOCKS a ship even though it is walkable.
export var MV_LAND = 0, MV_NAVAL = 1, MV_AMPH = 2;

export function terrPass(t, mv) {
  if (mv === MV_NAVAL) return t === T_WATER;
  if (mv === MV_AMPH) return t === T_WATER || !solidT(t);
  return !solidT(t);
}

// ---- water connectivity ----------------------------------------------- //
// A hull cannot swim across a beach. Every `T_WATER` cell carries the label
// of the BODY of water it belongs to (`g.wzone`, 0 = dry), worked out once
// when the terrain is final; two cells with different labels have no route
// between them for anything that floats, however short the straight line
// looks. Without it the AI pointed a Destroyer at a target across a spit —
// or in a second lake entirely — and re-issued the same impossible order
// every ten seconds for the rest of the match.
//
// 8-connected, because `astar` steps diagonally; and a diagonal step is
// refused when BOTH of its orthogonals are blocked, so the fill obeys the
// same no-corner-cutting rule and two pools that meet at a single corner
// stay separate bodies.
//
// TERRAIN, not occupancy. A structure can straddle a channel and cut a body
// in two, but that is transient — it can be sold, or shot — and A* already
// handles it the way it always has. `wzone` answers the PERMANENT question,
// so it only has to be recomputed when the terrain itself changes, which is
// a bridge span collapsing or being repaired.
export var WZ_DX = [1, -1, 0, 0, 1, 1, -1, -1], WZ_DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function buildableT(t) { return t === T_GROUND || t === T_ROAD; }  // never a ramp, a bridge deck or a civilian lot

export var P_HUMAN = 0, P_AI = 1;

// `P_HUMAN` used to carry three unrelated jobs at once, and they only ever
// agreed because side 0 was the only human. A second human at seat 1 pulls
// them apart, so each now has its own name:
//
//   P_HUMAN / P_AI   a SIDE INDEX. Structural, always 0 and 1: `g.side[p]`,
//                    `newSide(P_HUMAN)`, `stepSW(g, P_HUMAN)`, the win test.
//                    Never varies, never depends on who is watching.
//   ME / FOE         the player whose SCREEN this is, and the other one.
//                    Every eva/say/sfx/creditPop, the cursor, the sidebar,
//                    the minimap, the selection, the shroud and the score
//                    card. Follows the local client's seat (`NET.active.p`)
//                    and MUST NOT reach anything the state hash covers —
//                    two clients disagree about ME by construction.
//   isAiSide(g, p)   "this side is driven by the AI". These MUTATE, so a
//                    wrong answer is a desync rather than a cosmetic slip.
//
// `ME` is view state exactly like `g.seen`, which is already per-client and
// already outside `stateHash`; that is what makes it safe.
export var ME = P_HUMAN, FOE = P_AI;

export function setSeat(p) { ME = p | 0; FOE = 1 - ME; }

// The AI that drives a side, or null if a person does. `g.ai` is seat 1's
// and `g.ai2` seat 0's (AI-vs-AI runs), which the code already knew in the
// ad-hoc form `p === P_AI ? g.ai : g.ai2`.
export function aiOf(g, p) { return p === P_AI ? g.ai : g.ai2; }

export function isAiSide(g, p) { return !!aiOf(g, p); }

// The OTHER side index. Not a view question and not an AI one: a side flip.
export function otherSide(p) { return p === P_HUMAN ? P_AI : P_HUMAN; }

// The top bar's icons are DRAWN, not typed. U+23F8/U+25B6/U+2694 are
// text-presentation glyphs: at 12px they came out as a bare square, a
// thin triangle and an X that read as a close button. Same font
// dependency that made the paradrop clock a tofu box.
export var PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.3" y="4.5" width="4.2" height="15" rx="1.2"/></svg>';

export var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5,4.6 L19,12 L7.5,19.4 Z"/></svg>';

export var SND_ON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5,9.2 L7.2,9.2 L12.2,5.0 L12.2,19.0 L7.2,14.8 L3.5,14.8 Z"/><path d="M14.6,8.6 A5.2,5.2 0 0 1 14.6,15.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17.0,6.0 A8.4,8.4 0 0 1 17.0,18.0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

export var SND_OFF_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5,9.2 L7.2,9.2 L12.2,5.0 L12.2,19.0 L7.2,14.8 L3.5,14.8 Z"/><path d="M15.0,9.4 L20.4,14.8 M20.4,9.4 L15.0,14.8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';

// RA2's "Neutral"/"Special" house. Civilian blocks, tech buildings and the
// bridge repair huts belong to it: they sit in `g.blds` like any structure
// (so occupancy, pathing, targeting and rendering all work unchanged) but
// they have no side record, no power grid and no bearing on who has lost.
// Everything that indexes `g.side[p]` therefore has to check for it.
export var P_NEUT = -1;

export function neutral(p) { return p < 0; }

// --------------------------------------------------------------------- //
//  Isometric projection
// --------------------------------------------------------------------- //
export function worldX(gx, gy) { return (gx - gy) * (TW / 2); }

export function worldY(gx, gy) { return (gx + gy) * (TH / 2); }

export function gridAt(wx, wy) {
  var a = wx / (TW / 2), b = wy / (TH / 2);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

// rules.ini [General] GuardModeStray=2.0 — how far a guarding unit may
// leave its post to engage before it is told to go back.
export var GUARD_STRAY = 2.0;
