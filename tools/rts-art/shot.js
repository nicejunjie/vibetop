// In-game 1:1 scene with one of everything near the base.  -> out/art.png  (and art_col.png as Collective)
const { open, save, OUT } = require('./_pw');
const path = require('path');
(async () => {
  for (const [facIdx, name] of [[0, 'art.png'], [1, 'art_col.png']]) {
    const { b, p, errs } = await open({ width: 1400, height: 900 });
    await p.locator('#facRow button').nth(facIdx).click();
    await p.locator('#ovA').click();
    await p.waitForFunction(() => window.__rts() && window.__rts().state === 'play');
    await p.evaluate(() => {
      const H = window.__rtsTest, g = H.get(), s = g.start[0];
      H.give(0, 99999);
      const mine = g.side[0].fac, theirs = g.side[1].fac;
      const F = { dir: ['lancer', 'spectre', 'rifle'], col: ['mammoth', 'conscript'] };
      [...F[mine], 'harvester', 'rocket'].forEach((t, i) => H.spawn(t, 0, s.x - 4 + i * 2, s.y + 4));
      [...F[theirs], 'harvester'].forEach((t, i) => H.spawn(t, 1, s.x - 4 + i * 2, s.y + 7));
      const def = mine === 'dir' ? 'sentry' : 'tesla', edef = theirs === 'dir' ? 'sentry' : 'tesla';
      for (const [k, dx, dy] of [['power', 5, -2], ['refinery', 5, 2], ['barracks', -6, -2], ['factory', -6, 2], [def, 2, -5]])
        if (H.api.canPlace(g, 0, k, s.x + dx, s.y + dy)) H.build(k, 0, s.x + dx, s.y + dy);
      if (H.api.canPlace(g, 1, edef, s.x + 4, s.y - 5)) H.build(edef, 1, s.x + 4, s.y - 5);
      H.step(30);
      window.__rtsFocus && window.__rtsFocus(s.x, s.y + 2);
    });
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, name) });
    console.log(path.join(OUT, name), 'page errors:', errs.length ? errs : 'none');
    await b.close();
  }
})();
