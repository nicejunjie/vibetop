// Curated exact C&C Wiki file titles, never fuzzy search results or cameos.
// Sources are kept separately from game identities so shared art is explicit.
'use strict';
const sources = {};
const entries = [];
function ref(id, title, kind, file) {
  sources[id] = { title, kind, ...(file ? { file: `sprites/${file}` } : {}) };
  return id;
}
function entry(type, key, faction, name, ra2, refs, note = '') {
  entries.push({ type, key, faction, name, ra2, refs, note });
}
function unit(key, faction, name, ra2, title, file, voxel) {
  const refs = [ref(key, title, title.endsWith('.gif') ? 'sprite animation' : 'in-game image', file)];
  if (voxel) refs.push(ref(`${key}-voxel`, voxel, 'voxel render'));
  entry('unit', key, faction, name, ra2, refs);
}
unit('chronominer','dir','Chrono Miner','CMIN','CNCRA2 Chrono Miner.png','allied-chrono-miner.png','Chrono Miner Voxel Render.jpg');
unit('warminer','col','War Miner','HARV','RA2 War Miner.png','soviet-war-miner.png');
unit('rifle','dir','GI','E1','GI animation.gif');
unit('conscript','col','Conscript','E2','Conscrip animation.gif');
unit('rocket','dir','Guardian GI','GGI','Guardian GI animation.gif');
entries.at(-1).note = "Yuri’s Revenge unit; no vanilla RA2 equivalent. Includes deployed missile stance.";
unit('flak','col','Flak Trooper','FLAKT','Flak Trooper animation.gif');
unit('rocketeer','dir','Rocketeer','JUMPJET','Rocketeer animation.gif');
unit('harrier','dir','Harrier','ORCA','RA2 Harriers.png',null,'Harrier Voxel Render.jpg');
unit('kirov','col','Kirov Airship','ZEP','CNCRA2 Kirov Airship.png',null,'Kirov Voxel Render.jpg');
unit('lancer','dir','Grizzly Battle Tank','GTNK','CNCRA2 Grizzly Battle Tank.png','allied-grizzly-tank.png','Grizzly Battle Tank Voxel Render.jpg');
unit('mammoth','col','Apocalypse Tank','MTNK','RA2 Apocalypse Tank.png','apocalypse.png','Apocalypse tank Voxel Render.jpg');
ref('engineer','RA2 Engineer animation.gif','sprite animation');
for (const faction of ['dir','col']) entry('unit','engineer',faction,`${faction==='dir'?'Allied':'Soviet'} Engineer`,faction==='dir'?'ENGINEER':'SENGINEER',['engineer'],'Both factions use the same engineer SHP with owner remap; separate game identities share this source.');
for (const [faction,name,code] of [['dir','Allied','ADOG'],['col','Soviet','DOG']]) {
  entry('unit','dog',faction,`${name} Attack Dog`,code,[ref(`dog-${faction}`,`${name} Attack Dog animation.gif`,'sprite animation'),ref(`dog-${faction}-field`,`CNCRA2 ${name} Attack Dog.png`,'in-game image')]);
}
unit('ifv','dir','Infantry Fighting Vehicle','FV','CNCRA2 IFV Default.png','allied-ifv.png');
entries.at(-1).refs.push(ref('ifv-voxel','IFV Voxel Render.jpg','voxel render','allied-ifv-voxel.png'));
unit('mirage','dir','Mirage Tank','MGTK','CNCRA2 Mirage Tank.png','allied-mirage-tank.png','Mirage tank Voxel Render.jpg');
unit('tanya','dir','Tanya','TANY','Tanya animation.gif');
unit('rhino','col','Rhino Heavy Tank','HTNK','RA2 Rhino Tank.png','rhino.png','Rhino Tank Voxel Render.jpg');
unit('flaktrack','col','Flak Track','HTK','RA2 Flak Track.png','soviet-flak-track.png','Flak track Voxel Render.jpg');
unit('v3','col','V3 Rocket Launcher','V3','RA2 V3 Rocket Launcher.png','soviet-v3.png');
unit('teslatrooper','col','Tesla Trooper','SHK','Tesla Trooper animation.gif');
unit('ivan','col','Crazy Ivan','IVAN','Crazy Ivan animation.gif');
unit('drone','col','Terror Drone','DRON','RA2 Terror Drone.png','terror-drone.png');
entries.at(-1).refs.push(ref('drone-animation','Terror Drone animation.gif','sprite animation'));
unit('teslatank','col','Tesla Tank','TTNK','RA2 Tesla Tank.png','soviet-tesla-tank-sheet.png');
unit('prismtank','dir','Prism Tank','SREF','CNCRA2 Prism Tank.png','allied-prism-tank.png','Prism Tank Voxel Render.jpg');
unit('desolator','col','Desolator','DESO','Desolator animation.gif');
unit('yuri','col','Yuri / Psi-Corps Trooper','YURI','RA2 Psi Corps Trooper.png');
unit('cleg','dir','Chrono Legionnaire','CLEG','Chrono Legionnaire animation.gif');
unit('spy','dir','Spy','SPY','Spy animation.gif');
unit('nighthawk','dir','NightHawk Transport','SHAD','CNCRA2 NightHawk Transport.png',null,'NightHawk Voxel Render.jpg');
unit('apc','col','Soviet Amphibious Transport','SAPC','Amphibious Transport (Soviet).jpg',null,'Amphibious transport - Soviet Voxel Render.jpg');
unit('destroyer','dir','Destroyer','DEST','CNCRA2 Destroyer.png',null,'Destroyer Voxel Render.jpg');
unit('aegis','dir','Aegis Cruiser','AEGIS','CNCRA2 Aegis Cruiser.png',null,'Aegis Voxel Render.jpg');
unit('carrier','dir','Aircraft Carrier','CARRIER','CNCRA2 Aircraft Carrier.png',null,'Aircraft Carrier Voxel Render.jpg');
unit('hornet','dir','Hornet','HORNET','Hornet.jpg',null,'Hornet Voxel Render.jpg');
unit('dolphin','dir','Dolphin','DLPH','CNCRA2 Dolphin.png');
unit('lcraft','dir','Allied Amphibious Transport','LCRF','Amphibious Transport (Allied).jpg',null,'Amphibious transport - Allied Voxel Render.jpg');
unit('sub','col','Typhoon Attack Sub','SUB','CNCRA2 Typhoon Attack Sub.png',null,'Typhoon Voxel Render.jpg');
unit('seascorp','col','Sea Scorpion','HYD','CNCRA2 Sea Scorpion.png',null,'Sea scorpion Voxel Render.jpg');
unit('dread','col','Dreadnought','DRED','CNCRA2 Dreadnought.png',null,'Dreadnought Voxel Render.jpg');
unit('squid','col','Giant Squid','SQD','CNCRA2 Giant Squid.png');
entry('unit','mcv','dir','Allied Mobile Construction Vehicle','AMCV',[
  ref('mcv-dir','CNCRA2 Allied MCV.png','in-game image','allied-mcv.png'),
  ref('mcv-dir-voxel','Allied MCV Voxel Render.jpg','voxel render','allied-mcv-voxel.webp'),
  ref('mcv-dir-deploy','Allied MCV animation.gif','deployment animation')
]);
entry('unit','mcv','col','Soviet Mobile Construction Vehicle','SMCV',[
  ref('mcv-col','CNCRA2 Soviet MCV.png','in-game image'),
  ref('mcv-col-deploy','Soviet MCV animation.gif','deployment animation')
]);

// Core and defense buildings: record each faction's real art independently.
function building(key,faction,name,ra2,title,file,kind='sprite animation') {
  entry('building',key,faction,name,ra2,[ref(`${key}-${faction}`,title,kind,file)]);
}
building('base','dir','Allied Construction Yard','GACNST','Allied Construction Yard animation 1.gif','buildings/allied-construction-yard.gif');
building('base','col','Soviet Construction Yard','NACNST','Soviet Construction Yard animation 2.gif','buildings/soviet-construction-yard.gif');
building('power','dir','Power Plant','GAPOWR','RA2 Power Plant.png','buildings/allied-power-plant.png','in-game image');
building('power','col','Tesla Reactor','NAPOWR','Tesla reactor animation 1.gif');
building('refinery','dir','Allied Ore Refinery','GAREFN','RA2 Ore Refinery.gif','buildings/allied-ore-refinery.gif');
building('refinery','col','Soviet Ore Refinery','NAREFN','Soviet Ore refinery animation.gif');
building('barracks','dir','Allied Barracks','GAPILE','Allied Barrack animation 1.gif');
building('barracks','col','Soviet Barracks','NAHAND','Soviet Barracks animation 2.gif');
building('factory','dir','Allied War Factory','GAWEAP','RA2 Allied War Factory.gif','buildings/allied-war-factory.gif');
building('factory','col','Soviet War Factory','NAWEAP','Soviet War Factory animation.gif');
building('shipyard','dir','Allied Naval Shipyard','GAYARD','Allied Naval shipyard animation.gif');
building('shipyard','col','Soviet Naval Shipyard','NAYARD','Soviet Naval shipyard animation.gif');
building('depot','dir','Allied Service Depot','GADEPT','Allied Service depot animation.gif');
building('depot','col','Soviet Service Depot','NADEPT','RA2 Soviet Service Depot.gif','buildings/soviet-service-depot.gif');
building('lab','dir','Allied Battle Lab','GATECH','RA2 Allied Battle Lab.gif','buildings/allied-battle-lab.gif');
building('lab','col','Soviet Battle Lab','NATECH','RA2 Soviet Battle Lab.gif','buildings/soviet-battle-lab.gif');
building('sentry','dir','Pillbox','GAPILL','Pillbox animation 1.gif');
building('tesla','col','Tesla Coil','TESLA (art: NATSLA)','RA2 Tesla Coil.gif','buildings/tesla-coil.gif');
building('radar','col','Radar Tower','NARADR','Radar Tower animation.gif');
building('airforce','dir','Airforce Command Headquarters','GAAIRC','Airforce Command Headquarter animation.gif');
building('purifier','dir','Ore Purifier','GAOREP','Ore purifier animation 1.gif');
building('reactor','col','Nuclear Reactor','NANRCT','Nuclear reactor animation 2.gif');
building('prism','dir','Prism Tower','ATESLA (art: GAPRIS)','Prism tower animation 1.gif');
building('wall','dir','Allied Fortress Wall','GAWALL','Allied Fortress Walls animation.gif');
building('wall','col','Soviet Fortress Wall','NAWALL','Soviet Fortress Walls animation.gif');
building('gapgen','dir','Gap Generator','GAGAP','Gapgenerator2.jpg',null,'in-game image');
building('grandcannon','dir','Grand Cannon','GTGCAN','Grand Cannon animation.gif');
building('sentrygun','col','Sentry Gun','NALASR','Sentry gun animation.gif');
building('patriot','dir','Patriot Missile System','NASAM','Patriot missile system animation.gif');
building('flakcannon','col','Flak Cannon','NAFLAK','Flak cannon animation.gif');
building('chrono','dir','Chronosphere','GACSPH','Chronosphere animation 1.gif');
building('weather','dir','Weather Control Device','GAWEAT','Weather Control Device animation 1.gif');
building('curtain','col','Iron Curtain','NAIRON','Iron curtain animation 2.gif');
building('nuke','col','Nuclear Missile Silo','NAMISL','Nuclear missile silo animation 1.gif');
building('spysat','dir','SpySat Uplink','GASPYSAT','Spy Satellite Uplink animation.gif');
building('psisensor','col','Psychic Sensor','NAPSIS','Psychic Sensor animation 1.gif');
building('cloningvats','col','Cloning Vats','NACLON','Soviet Cloning vat animation 2.gif');
building('oilderrick','neutral','Tech Oil Derrick','CAOILD','RA2 Tech Oil Derrick.png',null,'in-game image');
building('hospital','neutral','Tech Hospital','CATHOSP','Tech Hospital.png',null,'in-game image');
building('airport','neutral','Tech Airport','CAAIRP','TechAirport.png',null,'in-game image');

ref('map-lone-guardian','RA2A01.jpg','original RA2 mission panorama');
ref('map-eagle-dawn','RA2A02.jpg','original RA2 mission panorama');
ref('map-manhattan','Manhattan Mayhem.jpg','Yuri’s Revenge map render');

module.exports = { sources, entries };
