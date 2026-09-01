const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts);
  const out = await p.evaluate(() => {
    const S = window.__rtsTest.spr(); const r = {};
    for (const k of ['base','power','refinery','barracks','factory','sentry']) {
      const A = S.bld[0].dir[k];
      const c = document.createElement('canvas'); c.width=A.s.w; c.height=A.s.h;
      const g=c.getContext('2d'); g.drawImage(A.s.c,0,0,A.s.w,A.s.h);
      r[k] = c.toDataURL('image/png').slice(22);
    }
    return r;
  });
  const fs=require('fs');
  for (const k in out) fs.writeFileSync(`/home/junjie/.claude/jobs/927560e4/tmp/mine_${k}.png`, Buffer.from(out[k],'base64'));
  console.log('ok'); await b.close();
})();
