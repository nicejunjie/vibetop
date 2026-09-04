// Shared bits for the rts art harness. Configure with env:
//   RTS_URL  full page URL (default http://127.0.0.1:${RTS_PORT||8099}/rts.html)
//   RTS_OUT  output directory (default apps/games/rts/art/out, gitignored)
const path = require('path'), fs = require('fs');
let pw;
try { pw = require('playwright'); }
catch (e) { pw = require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright'); }
const URL = process.env.RTS_URL || `http://127.0.0.1:${process.env.RTS_PORT || 8099}/rts.html`;
const OUT = process.env.RTS_OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
async function open(viewport) {
  const b = await pw.chromium.launch(); const p = await b.newPage({ viewport });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL);
  await p.waitForFunction(() => !!window.__rts, null, { timeout: 20000 });
  return { b, p, errs };
}
function save(name, b64) { const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; }
module.exports = { open, save, OUT, URL };
