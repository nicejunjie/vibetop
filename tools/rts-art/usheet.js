// Every unit (facing 1 for vehicles), both factions, both player colours.  -> out/usheet.png
// node usheet.js [zoom]
const { open, save } = require('./_pw');
(async () => {
  const sc = Number(process.argv[2] || 3);
  const { b, p, errs } = await open({ width: 1400, height: 900 });
  const png = await p.evaluate((sc) => {
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
  }, sc);
  console.log(save('usheet.png', png), 'errors:', errs.length ? errs : 'none'); await b.close();
})();
