// All 8 facings of each vehicle, both factions (harvester differs per faction).  -> out/vsheet.png
// node vsheet.js [zoom]
const { open, save } = require('./_pw');
(async () => {
  const sc = Number(process.argv[2] || 2.0);
  const { b, p, errs } = await open({ width: 1400, height: 1400 });
  const png = await p.evaluate((sc) => {
    const S = window.__rtsTest.spr();
    const rows = [['dir', 0, 'lancer'], ['dir', 0, 'spectre'], ['dir', 0, 'harvester'],
                  ['col', 1, 'mammoth'], ['col', 1, 'harvester'], ['col', 0, 'harvester']];
    const a0 = S.unit[0].dir.lancer[0];
    const c = document.createElement('canvas'); c.width = 8 * (a0.w * sc + 2) + 20; c.height = rows.length * (a0.h * sc + 22) + 10;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6e7a48'; g.fillRect(0, 0, c.width, c.height);
    g.font = '13px monospace';
    let y = 10;
    for (const [fk, pl, k] of rows) {
      let x = 10;
      for (let d = 0; d < 8; d++) {
        const a = S.unit[pl][fk][k][d];
        g.drawImage(a.c, x, y, a.w * sc, a.h * sc);
        x += a.w * sc + 2;
      }
      g.fillStyle = '#000'; g.fillText(`${fk}:${k} player=${pl}`, 12, y + 14);
      y += a0.h * sc + 22;
    }
    return c.toDataURL('image/png').slice(22);
  }, sc);
  console.log(save('vsheet.png', png), 'errors:', errs.length ? errs : 'none'); await b.close();
})();
