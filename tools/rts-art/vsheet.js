// All 32 facings of each vehicle, both factions (harvester differs per
// faction).  RA2 renders a voxel at 32 bearings; the sheet is drawn in two
// rows of 16 per unit so a full turn reads left to right.  -> out/vsheet.png
// node vsheet.js [zoom] [rows]        rows: 'hull' adds the hull/turret split
const { open, save } = require('./_pw');
(async () => {
  const sc = Number(process.argv[2] || 2.0);
  const mode = process.argv[3] || '';
  const { b, p, errs } = await open({ width: 1400, height: 1400 });
  const png = await p.evaluate(([sc, mode]) => {
    const S = window.__rtsTest.spr();
    const N = 32, PER = 16;
    const rows = mode === 'hull'
      ? [['dir', 0, 'lancer', 'hull'], ['dir', 0, 'lancer', 'turret'],
         ['col', 1, 'mammoth', 'hull'], ['col', 1, 'mammoth', 'turret']]
      : [['dir', 0, 'lancer', ''], ['dir', 0, 'prismtank', ''], ['dir', 0, 'chronominer', ''],
         ['col', 1, 'mammoth', ''], ['col', 1, 'warminer', ''], ['col', 1, 'rhino', '']];
    const pick = (fk, pl, k, part) => {
      const A = S.unit[pl][fk][k];
      return part ? A[part] : A;
    };
    const a0 = pick(rows[0][0], rows[0][1], rows[0][2], rows[0][3])[0];
    const bands = N / PER;
    const c = document.createElement('canvas');
    c.width = PER * (a0.w * sc + 2) + 20;
    c.height = rows.length * bands * (a0.h * sc + 2) + rows.length * 20 + 10;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6e7a48'; g.fillRect(0, 0, c.width, c.height);
    g.font = '13px monospace';
    let y = 10;
    for (const [fk, pl, k, part] of rows) {
      const set = pick(fk, pl, k, part);
      g.fillStyle = '#000';
      g.fillText(`${fk}:${k}${part ? ':' + part : ''} player=${pl}`, 12, y + 12);
      y += 16;
      for (let band = 0; band < bands; band++) {
        let x = 10;
        for (let i = 0; i < PER; i++) {
          const a = set[band * PER + i];
          g.drawImage(a.c, x, y, a.w * sc, a.h * sc);
          x += a.w * sc + 2;
        }
        y += a0.h * sc + 2;
      }
      y += 4;
    }
    return c.toDataURL('image/png').slice(22);
  }, [sc, mode]);
  console.log(save(mode ? `vsheet-${mode}.png` : 'vsheet.png', png), 'errors:', errs.length ? errs : 'none');
  await b.close();
})();
