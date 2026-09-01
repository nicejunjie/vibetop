const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const key = process.argv[2] || 'power', zoom = Number(process.argv[3] || 4);
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1100,height:760}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts);
  const png = await p.evaluate(([k, z]) => {
    const A = window.__rtsTest.spr().bld[0][k];
    const c = document.createElement('canvas'); c.width=1100; c.height=760;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle='#6e7a48'; g.fillRect(0,0,1100,760);
    g.drawImage(A.s.c, 20, 20, A.s.w*z, A.s.h*z);
    return c.toDataURL('image/png').slice(22);
  }, [key, zoom]);
  require('fs').writeFileSync('/home/junjie/.claude/jobs/927560e4/tmp/one.png', Buffer.from(png,'base64'));
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
