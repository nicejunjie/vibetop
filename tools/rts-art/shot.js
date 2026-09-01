const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
  await p.locator('#facRow button').first().click();
  await p.locator('#ovA').click();
  await p.waitForFunction(() => window.__rts() && window.__rts().state === 'play');
  // Put one of everything on screen next to the base, then look at it.
  await p.evaluate(() => {
    const H = window.__rtsTest, g = H.get(), s = g.start[0];
    H.give(0, 99999);
    const put = (t, dx, dy) => H.spawn(t, 0, s.x + dx, s.y + dy);
    ['lancer','spectre','harvester','rifle','rocket'].forEach((t,i) => put(t, -4 + i*2, 4));
    ['mammoth','conscript'].forEach((t,i) => H.spawn(t, 1, s.x - 4 + i*2, s.y + 7));
    for (const [k, dx, dy] of [['power',5,-2],['refinery',5,2],['barracks',-6,-2],['factory',-6,2],['sentry',2,-5]])
      if (H.api.canPlace(g, 0, k, s.x+dx, s.y+dy)) H.build(k, 0, s.x+dx, s.y+dy);
    if (H.api.canPlace(g, 1, 'tesla', s.x+4, s.y-5)) H.build('tesla', 1, s.x+4, s.y-5);
    H.step(30);
    window.__rtsFocus && window.__rtsFocus(s.x, s.y + 2);
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '/home/junjie/.claude/jobs/927560e4/tmp/art.png' });
  console.log('page errors:', errs.length ? errs : 'none');
  await b.close();
})();
