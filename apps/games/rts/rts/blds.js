// Iron Frontier — blds.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

var BLDS = {
  base: {
    fac: null, cat: 'str',
    name: 'Construction Yard', em: '🏛️', cost: 3000, build: 126,
    // art.ini [GACNST]/[NACNST] Foundation=4x4.
    armour: 'concrete', gw: 4, gh: 4, hp: 1000, power: 0, sight: 8, makes: 'b', desc: 'Builds structures'
  },
  power: {
    fac: null, cat: 'str', byFac: { col: { name: 'Tesla Reactor', cost: 600, power: 150, build: 25, gw: 3, gh: 2, desc: '+150 power' } },   // Tesla Reactor (NAPOWR) Foundation=3x2
    name: 'Power Plant', em: '⚡', cost: 800, build: 34,
    // art.ini [GAPOWR] Foundation=2x2.
    armour: 'wood', gw: 2, gh: 2, hp: 750, power: 200, sight: 4, makes: null, desc: '+200 power'
  },
  refinery: {
    fac: null, cat: 'str',
    req: 'power', name: 'Refinery', em: '🏭', cost: 2000, build: 84,
    // art.ini [GAREFN]/[NAREFN] Foundation=4x3.
    armour: 'wood', gw: 4, gh: 3, hp: 1000, power: -50, sight: 6, makes: null, desc: 'Ore drop-off, +1 harvester'
  },
  barracks: {
    fac: null, cat: 'str', byFac: { col: { gw: 2, gh: 2 } },   // [NAHAND] Foundation=2x2 — the Soviet hall is the squat one
    req: 'power', name: 'Barracks', em: '⛺', cost: 500, build: 21,
    // art.ini [GAPILE] Foundation=3x2.
    armour: 'steel', gw: 3, gh: 2, hp: 500, power: -10, sight: 5, makes: 'i', desc: 'Trains infantry'
  },
  factory: {
    fac: null, cat: 'str',
    reqAll: ['refinery', 'barracks'], name: 'War Factory', em: '🏗️', cost: 2000, build: 84,
    // art.ini [GAWEAP]/[NAWEAP] Foundation=5x3 — RA2's long assembly hall.
    armour: 'wood', gw: 5, gh: 3, hp: 1000, power: -25, sight: 4, makes: 'v', desc: 'Builds vehicles'
  },
  // [GAYARD] / [NAYARD] $1000 / Str 1500 / concrete / Foundation 4x4 /
  // Adjacent=12 / Sight 10, `Naval=yes` + `WaterBound=yes` — the footprint
  // must be OPEN WATER, and RA2's own maps always put it against the shore.
  // Prerequisite=PROC,POWER,*CNST. GAYARD is TechLevel 4, NAYARD 2.
  shipyard: {
    fac: null, cat: 'str', water: true, adj: 12,
    byFac: { col: { power: -20 } },
    reqAll: ['refinery', 'power'], name: 'Shipyard', em: '⚓', cost: 1000, build: 42,
    armour: 'concrete', gw: 4, gh: 4, hp: 1500, power: -25, sight: 10, makes: 'n',
    desc: 'Builds ships. Goes on open water against the shore'
  },
  sentry: {
    cat: 'def',
    req: 'barracks', name: 'Pillbox', em: '🗼', cost: 500, build: 21, fac: 'dir', adj: 8,
    armour: 'steel', gw: 1, gh: 1, hp: 400, power: 0, sight: 7, makes: null,
    dmg: 50, rate: 104, rng: 5.5, splash: 0,
    wh: 'SA', desc: 'Rapid fire, shreds infantry'
  },
  tesla: {
    cat: 'def',
    req: 'radar', name: 'Tesla Coil', em: '⚡', cost: 1500, build: 63, fac: 'col',   // [TESLA] Prerequisite=POWER,RADAR
    armour: 'steel', gw: 1, gh: 1, hp: 600, power: -75, sight: 8, makes: null,
    dmg: 200, rate: 480, rng: 7, splash: 0,
    wh: 'Electric', desc: 'Heavy jolt, hungry for power'
  },
  // ---- RA2 tech tree, phase A. `req` = prerequisite structure(s), any of.
  airforce: {
    fac: 'dir', cat: 'str', req: 'refinery',
    name: 'Airforce Command', em: '📡', cost: 1000, build: 42,
    // art.ini [GAAIRC] Foundation=3x2.
    armour: 'steel', gw: 3, gh: 2, hp: 600, power: -50, sight: 5, makes: 'a', desc: 'Radar; unlocks tier 2; four Harrier pads'
  },
  radar: {
    fac: 'col', cat: 'str', req: 'refinery',
    name: 'Radar Tower', em: '📡', cost: 1000, build: 42,
    armour: 'wood', gw: 2, gh: 2, hp: 1000, power: -50, sight: 10, makes: null, desc: 'Radar; unlocks tier 2'
  },
  depot: {
    fac: null, cat: 'str', req: 'factory', byFac: { col: { power: -20, gw: 4, gh: 3 } },   // [GADEPT] -25 3x3 / [NADEPT] -20 4x3
    name: 'Service Depot', em: '🔧', cost: 800, build: 34,
    armour: 'wood', gw: 3, gh: 3, hp: 1200, power: -25, sight: 5, makes: null, desc: 'Repairs vehicles parked on it'
  },
  lab: {
    fac: null, cat: 'str', req: ['airforce', 'radar'], reqAll: ['factory'], byFac: { col: { gh: 3 } },   // [NATECH] Foundation=3x3
    name: 'Battle Lab', em: '🔬', cost: 2000, build: 84,
    // art.ini [GATECH] Foundation=3x2.
    armour: 'wood', gw: 3, gh: 2, hp: 500, power: -100, sight: 6, makes: null, desc: 'Unlocks tier 3'
  },
  purifier: {
    fac: 'dir', cat: 'str', req: 'lab',
    name: 'Ore Purifier', em: '💎', cost: 2500, build: 105,
    // art.ini [GAOREP] Foundation=3x3.
    armour: 'wood', gw: 3, gh: 3, hp: 900, power: -200, sight: 5, makes: null, desc: '+25% ore income'
  },
  reactor: {
    fac: 'col', cat: 'str', req: 'lab',
    name: 'Nuclear Reactor', em: '☢️', cost: 1000, build: 42,
    // art.ini [NANRCT] Foundation=4x4. The 2x3 here was read off [NAAPWR],
    // which has art but NO rules.ini section at all — dead art. rules.ini's
    // `Name=Nuclear Reactor` is on [NANRCT] (line 15992), and that is the
    // 4x4. Being a third of its real footprint made the Collective's biggest
    // structure the same size as a Radar Tower.
    armour: 'concrete', gw: 4, gh: 4, hp: 1000, power: 2000, sight: 5, makes: null, desc: '+2000 power'
  },
  prism: {
    cat: 'def', req: 'airforce',
    name: 'Prism Tower', em: '🔆', cost: 1500, build: 63, fac: 'dir',
    armour: 'steel', gw: 1, gh: 1, hp: 600, power: -75, sight: 8, makes: null,
    dmg: 120, rate: 240, rng: 8, splash: 0,
    wh: 'PrismWarhead', desc: 'Long-range light beam'
  },
  sentrygun: {
    cat: 'def',
    req: 'barracks', name: 'Sentry Gun', em: '🔫', cost: 500, build: 21, fac: 'col', adj: 8,
    armour: 'steel', gw: 1, gh: 1, hp: 400, power: 0, sight: 7, makes: null,
    dmg: 50, rate: 104, rng: 5.5, splash: 0,
    wh: 'SA', desc: 'Cheap anti-infantry gun, no power'
  },
  // ---- Walls and gates -------------------------------------------------
  // [GAWALL]/[NAWALL]: $100 a segment, Strength 300, Armor=concrete,
  // Adjacent=8 (this is what lets a wall CHAIN out across the map),
  // Repairable=false, Selectable=no, Prerequisite=GAPILE/NAHAND, TechLevel 1.
  // [General] WallBuildSpeedCoefficient=3.0 — a segment comes off the yard
  // three times faster than its cost would otherwise buy.
  wall: {
    cat: 'def', req: 'barracks', fac: null, adj: 12, wall: true, norep: true,
    byFac: { col: { name: 'Soviet Wall' } },
    // build time: $100 at the game's ~cost/24 rate is 4.2s; [General]
    // WallBuildSpeedCoefficient=3.0 divides that, so a segment is 1.4s.
    name: 'Allied Wall', em: '🧱', cost: 100, build: 1.4,
    armour: 'concrete', gw: 1, gh: 1, hp: 300, power: 0, sight: 1, makes: null,
    desc: 'Drag to lay a line; stops tanks and small arms'
  },
  // [GAGATE_A]/[NAGATE_A]: $250, Strength 100, Armor=wood, Gate=yes,
  // DeployTime=.044, GateCloseDelay=.2. It opens for its OWNER and for
  // nobody else, which is the whole point of putting one in a wall.
  gate: {
    cat: 'def', req: 'barracks', fac: null, adj: 12, gate: true,
    byFac: { col: { name: 'Soviet Gate' } },
    name: 'Allied Gate', em: '🚪', cost: 250, build: 10,
    armour: 'wood', gw: 1, gh: 1, hp: 100, power: 0, sight: 2, makes: null,
    desc: 'Opens for your own units, shut to everyone else'
  },
  // [GAGAP] $1000, Strength 600, Armor=wood, Power=-100, Sight 5,
  // GapGenerator=yes, GapRadiusInCells=10, Prerequisite=GATECH, TechLevel 7.
  gapgen: {
    cat: 'def', req: 'lab', fac: 'dir', gap: 10,
    name: 'Gap Generator', em: '🌫️', cost: 1000, build: 42,
    // art.ini [GAGAP] Foundation=1x1 — a single mast on one cell.
    armour: 'wood', gw: 1, gh: 1, hp: 600, power: -100, sight: 5, makes: null,
    desc: 'Re-shrouds ten cells of the enemy map'
  },
  // [GTGCAN] $2000, Strength 900, Armor=steel, Power=-100, Sight 10,
  // Prerequisite=RADAR (the Allied radar building is the Airforce Command),
  // TechLevel 7, Turret=yes. [GrandCannonWeapon] 150 damage, ROF 120 (=480),
  // Range 15, MinimumRange 3 — it cannot defend its own feet.
  grandcannon: {
    cat: 'def', req: 'airforce', fac: 'dir', launch: 26,
    name: 'Grand Cannon', em: '💣', cost: 2000, build: 84,
    armour: 'steel', gw: 2, gh: 2, hp: 900, power: -100, sight: 10, makes: null,
    dmg: 150, rate: 480, rng: 15, minRng: 3, splash: 2,
    wh: 'GrandCannonWH', desc: 'Fifteen-cell siege gun; blind inside three'
  },
  // ---- AA defences (air layer). ag:false = cannot engage anything on the ground.
  patriot: {
    // RA2 NASAM.
    cat: 'def', req: 'barracks',   // [NASAM] Prerequisite=BARRACKS
    name: 'Patriot Missile', em: '🎯', cost: 1000, build: 42, fac: 'dir', adj: 8,
    armour: 'steel', gw: 1, gh: 1, hp: 900, power: -50, sight: 10, makes: null, aa: true, ag: false, launch: 34,
    dmg: 75, rate: 220, rng: 12, splash: 0.3,
    wh: 'SAMWH', desc: 'Anti-air missiles; cannot hit ground'
  },
  flakcannon: {
    // RA2 NAFLAK.
    cat: 'def', req: 'barracks',   // [NAFLAK] Prerequisite=BARRACKS
    name: 'Flak Cannon', em: '🎇', cost: 1000, build: 42, fac: 'col', adj: 8,
    armour: 'steel', gw: 1, gh: 1, hp: 900, power: -50, sight: 10, makes: null, aa: true, ag: false, flak: true, launch: 40,
    dmg: 40, rate: 80, rng: 12, splash: 1,
    wh: 'FlakWH', desc: 'Anti-air flak bursts; cannot hit ground'
  },
  // ---- Superweapons (RA2 rules.ini): $2500/$5000, 1000hp concrete, -200
  // power, Battle Lab required, one each. A second silo does not stack —
  // RA2 runs ONE timer per superweapon per player, and so do we.
  chrono: {
    cat: 'def', fac: 'dir', req: 'lab', sw: 'chrono',
    name: 'Chronosphere', em: '\ud83c\udf00', cost: 2500, build: 105,
    // art.ini [GACSPH] Foundation=4x3.
    armour: 'concrete', gw: 4, gh: 3, hp: 750, power: -200, sight: 6, makes: null, max: 1,
    desc: 'Teleports up to nine vehicles anywhere'
  },
  weather: {
    cat: 'def', fac: 'dir', req: 'lab', sw: 'storm',
    name: 'Weather Control Device', em: '\u26c8\ufe0f', cost: 5000, build: 210,
    armour: 'concrete', gw: 3, gh: 3, hp: 1000, power: -200, sight: 6, makes: null, max: 1,
    desc: 'Calls a lightning storm on any target'
  },
  curtain: {
    cat: 'def', fac: 'col', req: 'lab', sw: 'curtain',
    name: 'Iron Curtain', em: '\ud83d\udee1\ufe0f', cost: 2500, build: 105,
    armour: 'concrete', gw: 3, gh: 3, hp: 750, power: -200, sight: 6, makes: null, max: 1,
    desc: 'Makes your units invulnerable for fifty seconds'
  },
  nuke: {
    cat: 'def', fac: 'col', req: 'lab', sw: 'nuke',
    name: 'Nuclear Missile Silo', em: '\u2622\ufe0f', cost: 5000, build: 210,
    armour: 'concrete', gw: 3, gh: 3, hp: 1000, power: -200, sight: 6, makes: null, max: 1,
    desc: 'Launches a nuclear missile at any target'
  },
  // ---- Spy Satellite Uplink ([GASPYSAT]) -------------------------------
  // $1500, Strength 1000, Armor=wood, Power=-100, Powered=true, Sight 5,
  // Prerequisite=GATECH,GACNST, TechLevel 9, `SpySat=yes`. It has no
  // weapon and no radius: while it stands AND the grid holds, the whole
  // map is yours to see. Pull the power and the shroud comes straight back.
  spysat: {
    cat: 'str', fac: 'dir', req: 'lab', spysat: true, max: 1,
    name: 'SpySat Uplink', em: '🛰️', cost: 1500, build: 63,
    armour: 'wood', gw: 2, gh: 2, hp: 1000, power: -100, sight: 5, makes: null,
    desc: 'Reveals the entire map while it stands and is powered'
  },
  // ---- Psychic Sensor ([NAPSIS]) ---------------------------------------
  // $1000, Strength 750, Armor=wood, Power=-50, Sight 10, TechLevel 10,
  // `SensorArray=yes`, `PsychicDetectionRadius=15`. RA2 does not reveal the
  // enemy — it reveals his INTENT: anything inside the radius that is on
  // its way to attack you is drawn with a line to what it means to kill.
  psisensor: {
    cat: 'def', fac: 'col', req: 'lab', psi: 15, max: 1,
    name: 'Psychic Sensor', em: '🔮', cost: 1000, build: 42,
    armour: 'wood', gw: 2, gh: 2, hp: 750, power: -50, sight: 10, makes: null,
    desc: 'Shows what enemies inside fifteen cells intend to attack'
  },
  // ---- Cloning Vats ([NACLON]) -----------------------------------------
  // $2500, Strength 1000, Armor=wood, Power=-200, `Cloning=yes`,
  // Prerequisite=NATECH,NACNST, TechLevel 9, BuildLimit=1. Every man the
  // barracks turns out walks out of the vats a second time, free.
  cloningvats: {
    cat: 'str', fac: 'col', req: 'lab', clone: true, max: 1,
    name: 'Cloning Vats', em: '🧬', cost: 2500, build: 105,
    // art.ini [NACLON] Foundation=2x2.
    armour: 'wood', gw: 2, gh: 2, hp: 1000, power: -200, sight: 5, makes: null,
    desc: 'Every infantryman you train is duplicated here, free'
  },

  // ===================================================================== //
  //  The neutral house (RA2's civilian/"Special" side). None of these are
  //  buildable: they are laid down by the map generator, they carry
  //  `neut:true` so the win condition and the sidebar both ignore them, and
  //  the only way to own one is to walk in.
  // ===================================================================== //
  // Garrisonable city blocks. rules.ini gives 155 civilian sections
  // `CanBeOccupied=yes` with `MaxNumberOccupants` 1-10 — [CACITY01] is 10,
  // the small European sets are 3 — and `[General] ThreatPerOccupant=10`.
  // Strength 1000, Armor=steel on the RA2 blocks; the filling station is the
  // wooden one. `occ` is our MaxNumberOccupants.
  civflat: { cat: 'neut', neut: true, civ: 1, occCap: 10, art: 1,
    name: 'Apartment Block', em: '🏢', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 1000, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — up to ten of your riflemen can hold it' },
  civware: { cat: 'neut', neut: true, civ: 1, occCap: 6, art: 2,
    name: 'Warehouse', em: '🏬', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 1000, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — up to six of your riflemen can hold it' },
  civshop: { cat: 'neut', neut: true, civ: 1, occCap: 3, art: 0,
    name: 'Corner Shop', em: '🏪', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 1000, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — up to three of your riflemen can hold it' },
  civfuel: { cat: 'neut', neut: true, civ: 1, occCap: 2, art: 3, explodes: 1,
    name: 'Filling Station', em: '⛽', cost: 0, build: 0,
    armour: 'wood', gw: 1, gh: 1, hp: 600, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — two riflemen, and it burns' },
  civoffice: { cat: 'neut', neut: true, civ: 1, occCap: 10, art: 4,
    name: 'Office Block', em: '🏢', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 1000, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — up to ten of your riflemen can hold it' },
  civrow: { cat: 'neut', neut: true, civ: 1, occCap: 4, art: 5,
    name: 'Shop Row', em: '🏪', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 800, power: 0, sight: 4, makes: null,
    desc: 'Civilian block — up to four of your riflemen can hold it' },
  civruin: { cat: 'neut', neut: true, civ: 1, occCap: 4, art: 6,
    name: 'Ruined Block', em: '🧱', cost: 0, build: 0,
    armour: 'steel', gw: 1, gh: 1, hp: 700, power: 0, sight: 4, makes: null,
    desc: 'A bombed-out shell — four riflemen can still hold the walls' },
  civsilo: { cat: 'neut', neut: true, civ: 1, occCap: 4, art: 7,
    name: 'Grain Depot', em: '🌾', cost: 0, build: 0,
    armour: 'wood', gw: 1, gh: 1, hp: 700, power: 0, sight: 4, makes: null,
    desc: 'Civilian depot — four riflemen, and it burns' },
  civfarm: { cat: 'neut', neut: true, civ: 1, occCap: 4, art: 8,
    name: 'Farmhouse', em: '🏠', cost: 0, build: 0,
    armour: 'wood', gw: 1, gh: 1, hp: 600, power: 0, sight: 4, makes: null,
    desc: 'Farmhouse — four riflemen can hold it, and it burns' },
  civbarn: { cat: 'neut', neut: true, civ: 1, occCap: 6, art: 9,
    name: 'Barn', em: '🛖', cost: 0, build: 0,
    armour: 'wood', gw: 1, gh: 1, hp: 700, power: 0, sight: 4, makes: null,
    desc: 'Barn — up to six of your riflemen can hold it, and it burns' },
  // [CAOILD] Strength 1000, Armor=steel, Capturable=yes, NeedsEngineer=yes,
  // Unsellable=yes, ProduceCashStartup=1000, ProduceCashAmount=20,
  // ProduceCashDelay=100 frames.
  oilderrick: { cat: 'neut', neut: true, tech: 1, cash: 20, cashDelay: 100, cashStart: 1000, explodes: 1,
    name: 'Oil Derrick', em: '🛢️', cost: 1000, build: 0,
    armour: 'steel', gw: 2, gh: 2, hp: 1000, power: 0, sight: 4, makes: null,
    desc: 'Capture with an Engineer: $1000 now, then a steady trickle' },
  // [CATHOSP] Strength 800, Armor=concrete, `Hospital=yes`.
  hospital: { cat: 'neut', neut: true, tech: 1, heal: 4,
    name: 'Tech Hospital', em: '🏥', cost: 800, build: 0,
    armour: 'concrete', gw: 2, gh: 2, hp: 800, power: 0, sight: 4, makes: null,
    desc: 'Capture with an Engineer: heals your infantry standing near it' },
  // [CAAIRP] Strength 800, Armor=concrete, `SuperWeapon=ParaDropSpecial`
  // ([ParaDropSpecial] RechargeTime=4). [General] AllyParaDropInf=E1
  // AllyParaDropNum=6 / SovParaDropInf=E2 SovParaDropNum=9.
  airport: { cat: 'neut', neut: true, tech: 1, sw: 'para',
    name: 'Tech Airport', em: '✈️', cost: 800, build: 0,
    armour: 'concrete', gw: 3, gh: 2, hp: 800, power: 0, sight: 4, makes: null,
    desc: 'Capture with an Engineer: a paratrooper drop every four minutes' },
  // [CABHUT] Strength 2000, `BridgeRepairHut=yes`, Immune=yes. It cannot be
  // shot; an engineer walking in rebuilds the span it belongs to.
  bhut: { cat: 'neut', neut: true, hut: true, immune: true,
    name: 'Bridge Repair Hut', em: '🛖', cost: 0, build: 0,
    armour: 'concrete', gw: 1, gh: 1, hp: 2000, power: 0, sight: 3, makes: null,
    desc: 'Send an Engineer in to rebuild a fallen bridge span' }
};
