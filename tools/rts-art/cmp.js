// Dump every structure (both factions, player 0) to out/mine_<fac>_<key>.png for side-by-sides.
const { open, save } = require('./_pw');
(async () => {
  const { b, p } = await open({ width: 800, height: 600 });
  const out = await p.evaluate(() => {
    const S = window.__rtsTest.spr(); const r = {};
    for (const fk of ['dir', 'col']) for (const k of Object.keys(S.bld[0][fk])) {
      const A = S.bld[0][fk][k];
      const c = document.createElement('canvas'); c.width = A.s.w; c.height = A.s.h;
      c.getContext('2d').drawImage(A.s.c, 0, 0);
      r[`${fk}_${k}`] = c.toDataURL('image/png').slice(22);
    }
    return r;
  });
  for (const k in out) save(`mine_${k}.png`, out[k]);
  console.log('ok', Object.keys(out).length); await b.close();
})();
