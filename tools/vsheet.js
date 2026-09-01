const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:760}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts);
  const png = await p.evaluate(() => {
    const S = window.__rtsTest.spr();
    const c = document.createElement('canvas'); c.width=1400; c.height=760;
    const g = c.getContext('2d'); g.fillStyle='#6e7a48'; g.fillRect(0,0,1400,760);
    g.font='13px monospace'; const sc=2.0;
    let y=10;
    for (const k of ['lancer','mammoth','harvester','spectre']) {
      let x=10;
      for (let d=0; d<8; d++) {
        const a=S.unit[0][k][d];
        g.drawImage(a.c, x, y, a.w*sc, a.h*sc);
        x += a.w*sc + 2;
      }
      g.fillStyle='#000'; g.fillText(k, 12, y+16);
      y += 178;
    }
    return c.toDataURL('image/png').slice(22);
  });
  require('fs').writeFileSync('/home/junjie/.claude/jobs/927560e4/tmp/vsheet.png', Buffer.from(png,'base64'));
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
