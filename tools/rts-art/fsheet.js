// Contact sheet of every structure, both factions (player 0 colour).  -> out/fsheet.png
//
// The canvas is MEASURED, never guessed.  A hard-coded 1500x4200 used to cut
// the whole Collective row off the bottom (and only painted the top 2600 of
// the background), and it re-broke silently every time the roster grew.  So
// this lays the rows out first, with no drawing, and allocates exactly what
// the layout came to.  RTS_SHEET_W overrides the width.
const { open, save } = require('./_pw');
const W = Number(process.env.RTS_SHEET_W || 1500);
(async () => {
  const { b, p, errs } = await open({ width: 800, height: 600 });
  const { png, size } = await p.evaluate((W) => {
    const S = window.__rtsTest.spr();
    const sc = 1.7, PAD = 10, GAP = 8, LBL = 26, ROWGAP = 34, HDR = 22;
    // ---- pass 1: lay out, measure only ----------------------------------
    const items = [];
    let y = PAD, total = 0;
    for (const [fk, pl] of [['dir', 0], ['col', 1]]) {
      items.push({ hdr: fk, x: PAD, y: y + 14 });
      y += HDR;
      let x = PAD, maxh = 0;
      for (const k of Object.keys(S.bld[pl][fk])) {
        const a = S.bld[pl][fk][k], w = a.s.w * sc, h = a.s.h * sc;
        if (x + w > W - PAD && x > PAD) { x = PAD; y += maxh + LBL; maxh = 0; }
        items.push({ a, k: fk + ':' + k, x, y, w, h });
        x += w + GAP; maxh = Math.max(maxh, h);
        total++;
      }
      y += maxh + LBL + ROWGAP;
    }
    const H = Math.ceil(y);
    // ---- pass 2: allocate exactly that, then draw ------------------------
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#6e7a48'; g.fillRect(0, 0, W, H);      // the WHOLE sheet, not a slice of it
    g.font = '13px monospace';
    for (const it of items) {
      if (it.hdr) {
        g.fillStyle = '#111'; g.font = 'bold 15px monospace';
        g.fillText(it.hdr === 'dir' ? 'DIRECTORATE' : 'COLLECTIVE', it.x, it.y);
        g.font = '13px monospace';
        continue;
      }
      g.drawImage(it.a.s.c, it.x, it.y, it.w, it.h);
      g.fillStyle = '#000'; g.fillText(it.k, it.x + 4, it.y + it.h + 12);
    }
    return { png: c.toDataURL('image/png').slice(22), size: [W, H, total] };
  }, W);
  console.log(save('fsheet.png', png), `canvas ${size[0]}x${size[1]}`, `${size[2]} sprites`,
              'errors:', errs.length ? errs : 'none');
  await b.close();
})();
