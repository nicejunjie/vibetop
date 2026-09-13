'use strict';
/**
 * ONE static-file server for every RTS art tool — and the "play it from the
 * repo" command.
 *
 * Every art tool used to carry its own three-entry route table (`/rts.html`,
 * `/gamescore.js`, `/vibe-modal.js`) or its own `[RTS, ROOT, shared]` candidate
 * walk — nine copies of the same eight lines, each with its own MIME rule and
 * its own idea of caching. That was survivable while the game was ONE file; it
 * stops being survivable the moment the page loads modules, because then a
 * route table has to enumerate the module tree and a wrong `content-type` on a
 * `.js` is a hard module-load failure rather than a cosmetic detail.
 *
 * So: resolve the request against the real tree instead of a table.
 *   - `apps/games/rts/` first, then `shared/` (that is where `gamescore.js` and
 *     `vibe-modal.js` live, and both are optional — the page guards them).
 *   - `.js` is served as `text/javascript`: `<script type="module">` REFUSES a
 *     response whose MIME is not a JS type, so this is load-bearing.
 *   - `cache-control: no-store` everywhere, so a tool never measures a sprite
 *     baked from a page the browser kept from the previous run.
 *   - `..` segments are refused outright, and every resolved path is proved to
 *     be under one of the roots.
 *
 * `ART_HTML` (or `{ artHtml }`) replaces ONLY the `/rts.html` body; every other
 * path still comes from the real tree. That is how a new art metric is proved
 * RED against a patched build before it is recorded —
 * `tools/peer-vs-self-control.js --bite` writes a patched copy of rts.html to a
 * temp dir, sets `ART_HTML` and re-runs art-metrics against it.
 *
 * As a CLI:  node apps/games/rts/tools/lib/serve-rts.js [--port 8099]
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const RTS = path.resolve(__dirname, '..', '..');              // apps/games/rts
const ROOT = path.resolve(RTS, '..', '..', '..');             // repo root
const SHARED = path.join(ROOT, 'shared');

const MIME = {
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

/** `rel` under `root`, only if it stays under it and names a real file. */
function fileUnder(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, '.' + rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  try { return fs.statSync(full).isFile() ? full : null; } catch (e) { return null; }
}

/**
 * serve({ root, extraRoots, artHtml, port }) -> { server, port, url, close() }
 *
 *   root       default `apps/games/rts`
 *   extraRoots fallback roots, default `[<repo>/shared]`
 *   artHtml    override for the `/rts.html` body, default `process.env.ART_HTML`
 *   port       default 0 (an ephemeral port, which is what the tools want)
 */
function serve(opts) {
  const o = opts || {};
  const root = o.root || RTS;
  const extraRoots = o.extraRoots || [SHARED];
  const artHtml = o.artHtml !== undefined ? o.artHtml : process.env.ART_HTML;
  const roots = [root].concat(extraRoots);

  const server = http.createServer((req, rep) => {
    let url = String(req.url || '/').split('?')[0].split('#')[0];
    try { url = decodeURIComponent(url); } catch (e) { /* keep the raw form */ }
    if (url === '/' || url.endsWith('/')) url += 'rts.html';
    const deny = url.split('/').some((s) => s === '..') || url.indexOf('\0') >= 0;

    let file = null;
    if (!deny) {
      if (url === '/rts.html' && artHtml) file = artHtml;
      else {
        // rts.html reaches the two shared scripts by their REPO path so the page
        // also works opened straight off the disk; the browser normalises that to
        // a leading `/shared/`, which no root under apps/games/rts can satisfy.
        const u = url.startsWith('/shared/') ? url.slice('/shared'.length) : url;
        for (const r of roots) { file = fileUnder(r, u) || fileUnder(r, url); if (file) break; }
      }
    }
    if (!file || !fs.existsSync(file)) {
      rep.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return rep.end('not found\n');
    }
    // The MIME comes from the URL, not from the file on disk: with ART_HTML the
    // override may be any path, and it is still the page.
    const body = fs.readFileSync(file);
    rep.writeHead(200, {
      'content-type': mimeOf(url),
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    rep.end(body);
  });

  return new Promise((res, rej) => {
    server.on('error', rej);
    server.listen(o.port === undefined ? 0 : o.port, '127.0.0.1', () => {
      const port = server.address().port;
      res({
        server,
        port,
        url: 'http://127.0.0.1:' + port,
        close() { server.close(); },
      });
    });
  });
}

module.exports = { serve, RTS, ROOT, SHARED, MIME, mimeOf };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--port');
  const port = i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 8099;
  serve({ port }).then((s) => {
    console.log('serving ' + RTS + ' (then ' + SHARED + ') at ' + s.url + '/rts.html');
  }).catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
}
