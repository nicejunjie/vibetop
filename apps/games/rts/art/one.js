// One structure, zoomed: rows = faction (dir, col), cols = player colour (blue, red).
// node one.js <key> [zoom]     -> out/one_<key>.png
const { open, save } = require('./_pw');
(async () => {
  const key = process.argv[2] || 'power', zoom = Number(process.argv[3] || 4);
  const { b, p, errs } = await open({ width: 1600, height: 1200 });
  const res = await p.evaluate(([k, z]) => {
    const S = window.__rtsTest.spr();
    const cells = [];
    for (const fk of ['dir', 'col']) for (const pl of [0, 1]) cells.push([fk, pl, S.bld[pl][fk][k]]);
    const cw = cells[0][2].s.w * z, ch = cells[0][2].s.h * z;
    const c = document.createElement('canvas'); c.width = cw * 2 + 30; c.height = ch * 2 + 60;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6e7a48'; g.fillRect(0, 0, c.width, c.height);
    g.font = '16px monospace';
    cells.forEach(([fk, pl, A], i) => {
      const x = 10 + (i % 2) * (cw + 10), y = 10 + Math.floor(i / 2) * (ch + 20);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(x, y, cw, ch);   // canvas bounds: art touching this = clipping risk
      g.drawImage(A.s.c, x, y, cw, ch);
      g.fillStyle = '#000'; g.fillText(`${k} fac=${fk} player=${pl} anchor=(${A.ax},${A.ay}) canvas=${A.s.w}x${A.s.h}`, x + 4, y + ch + 14);
    });
    return c.toDataURL('image/png').slice(22);
  }, [key, zoom]);
  console.log(save(`one_${key}.png`, res), 'errors:', errs.length ? errs : 'none'); await b.close();
})();
