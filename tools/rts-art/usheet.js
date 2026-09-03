// Every unit, both factions, both player colours.  -> out/usheet.png
// Vehicles show facing 1; infantry are a lazy facing/state atlas, so they get
// their own sheets too:
//   node usheet.js [zoom]                  the roster (as before)
//   node usheet.js [zoom] facings [state]  every infantry kind x 8 facings
//   node usheet.js [zoom] states  [kind]   one kind x every RA2 sequence
const { open, save } = require('./_pw');
const sc = Number(process.argv[2] || 3);
const mode = process.argv[3] || 'roster';
const arg = process.argv[4] || '';

const ROSTER = ([sc]) => {
  const S = window.__rtsTest.spr();
  const rows = [['dir', 0], ['dir', 1], ['col', 1], ['col', 0]];
  const keys = Object.keys(S.unit[0].dir);
  const any = S.unit[0].dir[keys[0]]; const a0 = Array.isArray(any) ? any[1] : any;
  const c = document.createElement('canvas'); c.width = keys.length * (a0.w * sc + 4) + 24; c.height = rows.length * (a0.h * sc + 26) + 10;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#6e7a48'; g.fillRect(0, 0, c.width, c.height);
  g.font = '13px monospace';
  let y = 10;
  for (const [fk, pl] of rows) {
    let x = 12;
    for (const k of keys) {
      const arr = S.unit[pl][fk][k], a = Array.isArray(arr) ? arr[1] : arr;
      g.drawImage(a.c, x, y, a.w * sc, a.h * sc);
      g.fillStyle = '#000'; g.fillText(k, x + 4, y + a.h * sc + 14);
      x += a.w * sc + 4;
    }
    g.fillStyle = '#000'; g.fillText(`fac=${fk} player=${pl}`, 12, y + 12);
    y += a0.h * sc + 26;
  }
  return c.toDataURL('image/png').slice(22);
};

// One row per infantry kind, one column per facing, in SCREEN order.
const FACINGS = ([sc, state]) => {
  const S = window.__rtsTest.spr();
  const dirs = [1, 0, 7, 6, 5, 4, 3, 2], lbl = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
  const keys = Object.keys(S.unit[0].dir).filter(k => S.unit[0].dir[k].fr);
  const CW = 44, CH = 40, PAD = 27;                      // sprite UPAD; the figure sits above it
  const c = document.createElement('canvas');
  c.width = 24 + 8 * (CW * sc + 4); c.height = 24 + keys.length * (CH * sc + 22);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#5d6a3f'; g.fillRect(0, 0, c.width, c.height); g.font = '14px monospace';
  let y = 18;
  for (const k of keys) {
    let x = 12, i = 0;
    for (const d of dirs) {
      const a = S.unit[0].dir[k].fr(state, d, 1), kb = a.c.width / a.w;
      g.drawImage(a.c, (a.w - CW) / 2 * kb, (a.h - PAD - CH + 6) * kb, CW * kb, CH * kb, x, y, CW * sc, CH * sc);
      g.fillStyle = '#dfe8c8'; g.fillText(lbl[i++], x + 3, y + 13);
      x += CW * sc + 4;
    }
    g.fillStyle = '#111'; g.fillText(k + ' ' + state, 14, y + CH * sc + 16);
    y += CH * sc + 22;
  }
  return c.toDataURL('image/png').slice(22);
};

// One row per RA2 sequence, S facing then E facing, every frame of each.
const STATES = ([sc, kind]) => {
  const S = window.__rtsTest.spr(), U = S.unit[0].dir[kind] || S.unit[0].dir.rifle;
  const rows = [['stand', 1], ['walk', 6], ['fire', 3], ['down', 1], ['prone', 1],
                ['crawl', 6], ['fireprone', 2], ['idle1', 3], ['idle2', 3], ['cheer', 2]];
  const CW = 52, CH = 40, PAD = 27, w = CW * sc * 0.5, h = CH * sc * 0.5;
  const c = document.createElement('canvas');
  c.width = 100 + 12 * (w + 4); c.height = 24 + rows.length * (h + 20);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#5d6a3f'; g.fillRect(0, 0, c.width, c.height); g.font = '14px monospace';
  let y = 18;
  for (const [st, n] of rows) {
    let x = 90;
    for (const d of [1, 7]) for (let ph = 0; ph < n; ph++) {
      const a = U.fr(st, d, ph), kb = a.c.width / a.w;
      g.drawImage(a.c, (a.w - CW) / 2 * kb, (a.h - PAD - CH + 6) * kb, CW * kb, CH * kb, x, y, w, h);
      x += w + 4;
    }
    g.fillStyle = '#111'; g.fillText(st, 8, y + 22);
    y += h + 20;
  }
  return c.toDataURL('image/png').slice(22);
};

(async () => {
  const { b, p, errs } = await open({ width: 1400, height: 900 });
  let png, name;
  if (mode === 'facings') { png = await p.evaluate(FACINGS, [sc, arg || 'walk']); name = 'ufacings.png'; }
  else if (mode === 'states') { png = await p.evaluate(STATES, [sc, arg || 'rifle']); name = 'ustates.png'; }
  else { png = await p.evaluate(ROSTER, [sc]); name = 'usheet.png'; }
  console.log(save(name, png), 'errors:', errs.length ? errs : 'none');
  await b.close();
})();
