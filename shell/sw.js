/* Service worker for the mini-OS desktop PWA.
 *
 * Caches only the shell and the lightweight static app pages so cold loads are
 * instant. Everything live or auth-sensitive is network-only and never touched:
 *   /api/*        manager API (status, notes, desktop state, uploads…)
 *   /browser/*    xpra HTML5 client + WebSocket (Browser app, Chromium)
 *   /x11-display/* xpra HTML5 client + WebSocket (X11 desktop)
 *   /office/*     xpra HTML5 client + WebSocket (Office app / LibreOffice)
 *   /tN/*         ttyd terminals + WebSocket
 *   /terminals/   tabbed terminal UI (tied to live /tN/ iframes)
 *   /fileview/*   raw file passthrough
 *   /services.json host-local, changes out of band
 *   /cdn-cgi/*    Cloudflare Access challenge/redirects — caching these breaks auth
 *
 * Bump VERSION whenever the shell/static pages change; activate() drops old
 * caches. sw.js itself is served no-store (nginx `location /`), so the browser
 * re-checks it on navigation and picks up the new VERSION.
 */
const VERSION = 'v625';
const CACHE = 'shell-' + VERSION;
// A ring of the last navigations this worker answered (path, how it was
// served, status, elapsed). It outlives VERSION so the shell can read it after
// a recovery and post it to /api/clientlog: a white page on a phone after a
// Cloudflare Access expiry is otherwise invisible to every log we keep, because
// nothing the blocked device did reached the origin (2026-09-11).
const TRACE_CACHE = 'vt-trace', TRACE_KEY = '/__vt/swtrace', TRACE_MAX = 40;
async function trace(entry) {
  try {
    const c = await caches.open(TRACE_CACHE);
    const old = await c.match(TRACE_KEY);
    let ring = [];
    if (old) { try { ring = await old.json(); } catch (_) { ring = []; } }
    if (!Array.isArray(ring)) ring = [];
    ring.push(Object.assign({ t: Date.now(), v: VERSION }, entry));
    if (ring.length > TRACE_MAX) ring = ring.slice(-TRACE_MAX);
    await c.put(TRACE_KEY, new Response(JSON.stringify(ring), { headers: { 'Content-Type': 'application/json' } }));
  } catch (_) {}
}
// What a failed page load shows instead of the browser's blank error page — an
// installed iOS web app has no error UI at all, so a navigation the worker
// cannot answer was a white screen. The button is a top-level, network-only
// navigation (vtreauth), which is also how an expired Access session is renewed.
// The network answered a page navigation with a redirect — Cloudflare Access
// sending an expired session to its login page. Relaying that redirect from a
// worker left an installed iOS web app on a white page; handing the browser a
// page that navigates to /reauth.html (a path the worker never answers) makes
// the next hop a native navigation, which the browser follows to the login
// page like any other. One hop only: /reauth.html comes back as /?vtreauth,
// and a redirect on THAT is passed through as before.
function handoffPage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Vibetop</title><meta http-equiv="refresh" content="1;url=/reauth.html?vt=' + Date.now() + '">' +
    '<style>html{background:#0e1117;color:#aab4c5;font:15px system-ui,sans-serif}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}</style>' +
    '<p>Signing in\u2026</p><script>location.replace("/reauth.html?vt=' + Date.now() + '");</script>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
const isRedirect = (res) => !!res && (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400));
function unreachablePage(why) {
  const safe = String(why || '').replace(/[<>&]/g, '');
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Vibetop</title><style>html{background:#0e1117;color:#e0e0e0;font:16px/1.5 system-ui,sans-serif}' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px env(safe-area-inset-right) 24px env(safe-area-inset-left)}' +
    'main{max-width:360px}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#aab4c5}' +
    'a{display:block;padding:14px 18px;border-radius:10px;background:#2f81f7;color:#fff;text-decoration:none;text-align:center;font-weight:600;min-height:44px}' +
    'small{display:block;margin-top:14px;color:#6e7a8a}</style>' +
    '<main><h1>Vibetop can\u2019t be reached</h1><p>The page did not load. If your sign-in expired, the next try goes through the sign-in page.</p>' +
    '<a href="/reauth.html?vt=' + Date.now() + '">Try again</a><small>' + safe + '</small></main>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const PRECACHE = [
  '/',
  '/vibe-modal.js',
  '/coach.js',
  '/appreg.js', '/deskstate.js', '/usage-strips.js', '/winmgr.js',
  '/keybar.js',
  '/apph.js',
  '/landing.html',
  '/notes.html',
  '/monitor.html',
  '/token-stats.html',
  '/upload.html',
  '/x11launcher.html',
  '/files.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

// The ONLY page navigations we cache. An HTML page not in this set (e.g.
// office-editor.html, update.html, loggedout.html) is served network-only, so it
// can never go stale after a deploy that didn't bump VERSION.
const SHELL_PAGES = new Set(PRECACHE.filter((p) => p === '/' || p.endsWith('.html')));

// Paths that must always hit the network (live data, websockets, auth).
// `/files/` is gone with FileBrowser — the Files app is /files.html plus
// /filesx.html, both ordinary cacheable shell pages served from the web root.
// `reauth.html` is the sign-in hop: a navigation the worker must never answer,
// so the browser itself follows Cloudflare Access's redirect (see below).
const BYPASS = /^\/(api|browser|x11-display|office|onlyoffice|t\d|terminals|fileview|services\.json|cdn-cgi|reauth\.html|rts\/)/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Don't let one failed precache (e.g. an auth hiccup) abort the install.
    await Promise.allSettled(PRECACHE.map(async (u) => {
      try {
        const r = await fetch(u, { cache: 'no-cache' });
        if (r && r.ok && !r.redirected) await cache.put(u, r);
      } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== TRACE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;     // third-party: leave alone
  if (BYPASS.test(url.pathname)) return;           // live/auth paths: network only

  if (req.mode === 'navigate') {
    // Re-auth navigation (the shell's "Sign in again" link adds ?vtreauth):
    // go STRAIGHT to the network so Cloudflare's redirect to
    // the login page comes through. Never the cached (un-authenticated) shell —
    // that's the black-screen-on-expired-Access bug. No timeout, no fallback.
    if (url.searchParams.has('vtreauth')) {
      const t0 = Date.now();
      e.respondWith(fetch(req).then((res) => {
        e.waitUntil(trace({ p: url.pathname, k: 'reauth', how: 'net', s: res.status, ty: res.type, rd: !!res.redirected, ms: Date.now() - t0 }));
        return res;
      }).catch((err) => {
        e.waitUntil(trace({ p: url.pathname, k: 'reauth', how: 'error', err: String(err && err.message || err), ms: Date.now() - t0 }));
        return unreachablePage('sign-in navigation failed');
      }));
      return;
    }
    // Only known shell pages are cached; any other HTML stays network-only.
    const cacheable = SHELL_PAGES.has(url.pathname);
    // Page loads (the shell + static app HTML): network-first with a short
    // timeout. This keeps Cloudflare Access working — an expired session
    // returns a redirect we pass straight through and never cache, so the
    // login page shows instead of a stale desktop — while still falling back
    // to the cached shell when the network STALLS (the iOS-Safari-on-flaky-
    // wifi case, where a request can hang 60-100s). Best of both.
    e.respondWith((async () => {
      const t0 = Date.now(), k = cacheable ? 'shell' : 'page';
      const note = (entry) => e.waitUntil(trace(Object.assign({ p: url.pathname, k, ms: Date.now() - t0 }, entry)));
      const cache = await caches.open(CACHE);
      // Start the network fetch and let it update the cache WHENEVER it
      // resolves — even after we've already served the cached copy on timeout.
      // (Previously the fetch was abandoned on timeout, so a consistently-slow
      // connection would serve the same stale shell forever and never refresh.)
      const networkPromise = fetch(req).then((res) => {
        if (cacheable && res && res.ok && res.type === 'basic' && !res.redirected) cache.put(req, res.clone());
        return res;
      });
      try {
        const res = await Promise.race([
          networkPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
        ]);
        if (isRedirect(res)) { note({ how: 'handoff', s: res.status, ty: res.type }); return handoffPage(); }
        note({ how: 'net', s: res.status, ty: res.type, rd: !!res.redirected });
        return res;
      } catch (err) {
        // Timed out (or errored). For a known shell page, serve its cached copy
        // (or the desktop shell '/' as a last resort) so the app still opens
        // offline. For any OTHER same-origin page (office-editor.html,
        // update.html, loggedout.html…) do NOT substitute the desktop shell —
        // that would render the wrong page; wait for the real network response.
        // A navigation nobody can answer gets the unreachable page, never the
        // browser's blank error page.
        const why = String(err && err.message || err);
        const late = () => networkPromise.then((res) => {
          if (isRedirect(res)) { note({ how: 'handoff', s: res.status, ty: res.type, why }); return handoffPage(); }
          note({ how: 'late', s: res.status, ty: res.type, rd: !!res.redirected, why });
          return res;
        }, (err2) => {
          note({ how: 'error', why: why + ' / ' + String(err2 && err2.message || err2) });
          return unreachablePage(why === 'timeout' ? 'the network did not answer' : 'the network failed');
        });
        if (cacheable) {
          const hit = (await cache.match(req)) || (await cache.match('/'));
          if (hit) { note({ how: 'cache', why }); return hit; }
        }
        return late();
      }
    })());
    return;
  }

  // Static sub-resources (JS/CSS/icons/manifest): cache-first, refresh in the
  // background (stale-while-revalidate). Only cache clean same-origin 200s.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic' && !res.redirected) {
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
