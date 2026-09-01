const { chromium } = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1500,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8099/rts.html');
  await p.waitForFunction(() => !!window.__rts);
  const png = await p.evaluate(() => {
    const S=window.__rtsTest.spr();
    const c=document.createElement('canvas'); c.width=1500;c.height=900;
    const g=c.getContext('2d'); g.fillStyle='#6e7a48'; g.fillRect(0,0,1500,900);
    g.font='13px monospace'; const sc=1.7;
    let y=20;
    for (const [fk,pl] of [['dir',0],['col',1]]) {
      let x=10, maxh=0;
      for (const k of Object.keys(S.bld[pl][fk])) {
        const a=S.bld[pl][fk][k], w=a.s.w*sc, h=a.s.h*sc;
        if (x+w>1490){x=10;y+=maxh+26;maxh=0;}
        g.drawImage(a.s.c,x,y,w,h);
        g.fillStyle='#000'; g.fillText(fk+':'+k, x+4, y+h+12);
        x+=w+8; maxh=Math.max(maxh,h);
      }
      y+=maxh+34;
    }
    return c.toDataURL('image/png').slice(22);
  });
  require('fs').writeFileSync('/home/junjie/.claude/jobs/927560e4/tmp/fsheet.png', Buffer.from(png,'base64'));
  console.log('errors:', errs.length?errs:'none'); await b.close();
})();
