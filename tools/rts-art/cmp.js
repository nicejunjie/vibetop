// Dump every structure (both factions, player 0) to out/mine_<fac>_<key>.png for side-by-sides.
const { open, save } = require('./_pw');
(async () => {
  const { b, p, errs } = await open({ width: 800, height: 600 });
  const out = await p.evaluate(() => {
    const S = window.__rtsTest.spr(), r = {};
    const dump = (name, A) => {
      const c = document.createElement('canvas'); c.width = A.s.w; c.height = A.s.h;
      c.getContext('2d').drawImage(A.s.c, 0, 0);
      r[name] = c.toDataURL('image/png').slice(22);
    };
    for (const fk of ['dir', 'col']) for (const k of Object.keys(S.bld[0][fk])) dump(`${fk}_${k}`, S.bld[0][fk][k]);
    // `wall`/`gate` in SPR.bld are the four-way CAMEO piece; the RA2 SHP frame
    // is one isolated segment, so dump that too — it is what aspect.py measures.
    if (window.__rtsTest.wallSeg)
      for (const fk of ['dir', 'col']) dump(`${fk}_wallseg`, window.__rtsTest.wallSeg(0, fk, 0));
    return r;
  });
  for (const k in out) save(`mine_${k}.png`, out[k]);
  console.log('ok', Object.keys(out).length, 'errors:', errs.length ? errs : 'none'); await b.close();
})();
