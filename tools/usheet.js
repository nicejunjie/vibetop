const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
  const png = await p.evaluate(() => {
    const S = window.__rtsTest.spr();
    const c = document.createElement('canvas'); c.width = 1400; c.height = 700;
    const g = c.getContext('2d'); g.fillStyle = '#6e7a48'; g.fillRect(0,0,1400,700);
    g.font = '14px monospace';
    const sc = 2.6;
    let x = 12, y = 20;
    for (const pl of [0]) {
      x = 12;
      for (const k of Object.keys(S.unit[pl])) {
        const arr = S.unit[pl][k], a = Array.isArray(arr) ? arr[1] : arr;
        g.drawImage(a.c, x, y, a.w * sc, a.h * sc);
        g.fillStyle = '#000'; g.fillText(k, x + 6, y + a.h * sc + 14);
        x += a.w * sc + 4;
      }
      y += 340;
    }
    return c.toDataURL('image/png').slice(22);
  });
  require('fs').writeFileSync('/home/junjie/.claude/jobs/927560e4/tmp/usheet.png', Buffer.from(png,'base64'));
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
