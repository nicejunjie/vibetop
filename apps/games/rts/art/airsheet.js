// Air layer sheet: 8 facings of Harrier (armed/empty) and Kirov (idle/prop), Rocketeer flame phases, Flak Trooper, Guardian GI; both player colours, bbox + aspect printed.  -> out/airsheet.png
const { open, save } = require('./_pw');
(async () => {
  const sc = Number(process.argv[2] || 2);
  const { b, p, errs } = await open({ width: 1400, height: 1400 });
  const out = await p.evaluate((sc) => {
    const S = window.__rtsTest.spr();
    const rows = [];
    for (const pl of [0, 1]) {
      rows.push({ label: `harrier p${pl}`, fr: S.unit[pl].dir.harrier });
      rows.push({ label: `harrier empty p${pl}`, fr: S.unit[pl].dir.harrier.empty });
      rows.push({ label: `kirov p${pl}`, fr: S.unit[pl].col.kirov });
      rows.push({ label: `kirov prop p${pl}`, fr: S.unit[pl].col.kirov.anim });
      const r = S.unit[pl].dir.rocketeer, f = S.unit[pl].col.flak, gg = S.unit[pl].dir.rocket;
      rows.push({ label: `rocketeer/flak/guardian p${pl}`, fr: [r.walk[0], r.walk[1], r.walk[2], f, f.walk[1], gg, gg.walk[1]] });
    }
    const a0 = rows[0].fr[0];
    const c = document.createElement('canvas'); c.width = 8 * (176 * sc + 2) + 20; c.height = rows.length * (132 * sc + 22) + 10;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6e7a48'; g.fillRect(0, 0, c.width, c.height);
    g.font = '13px monospace';
    let y = 10; const bbs = {};
    for (const row of rows) {
      let x = 10;
      for (let d = 0; d < row.fr.length; d++) {
        const a = row.fr[d];
        g.drawImage(a.c, x, y, a.w * sc, a.h * sc);
        if (a.bb) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.strokeRect(x + a.bb.x0 * sc, y + a.bb.y0 * sc, (a.bb.x1 - a.bb.x0) * sc, (a.bb.y1 - a.bb.y0) * sc); }
        x += a.w * sc + 2;
      }
      g.fillStyle = '#000'; g.fillText(row.label, 12, y + 14);
      bbs[row.label] = row.fr.map(a => a.bb ? [(a.bb.x1 - a.bb.x0), (a.bb.y1 - a.bb.y0), ((a.bb.x1 - a.bb.x0) / (a.bb.y1 - a.bb.y0)).toFixed(2)] : null);
      y += 132 * sc + 22;
    }
    return { png: c.toDataURL('image/png').slice(22), bbs };
  }, sc);
  console.log(save('airsheet.png', out.png), 'errors:', errs.length ? errs : 'none');
  for (const k in out.bbs) console.log(k, JSON.stringify(out.bbs[k]));
  await b.close();
})();
