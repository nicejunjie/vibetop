// @ts-check
// Layout guard: nothing may sit outside the viewport with no way to scroll to it.
//
// v1.19.165. Two bugs in one week were the same shape and neither had a test:
// the Token Stats x-axis label that ran past the panel border and gave the page
// a horizontal scrollbar, and Upload's hidden file input — ~253px wide by
// default, absolutely positioned with no box — dragging a scrollbar behind it at
// every phone width. Both were found by a fifteen-line scanner, after the fact.
// This is that scanner, run before the fact.
//
// The whole signal is "reachable by scrolling something" vs "stranded". A
// taskbar, a tab strip and a wide table all extend past the viewport ON PURPOSE
// and are reached by scrolling their own container; a label that escapes a panel
// has no container to scroll and is simply gone. So an element only counts when
// its nearest scrollable ancestor is nothing at all.

const { test, expect } = require('@playwright/test');

// Every static page the shell can open. (The xpra surfaces — Browser, X11,
// Office — are a remote canvas: nothing here can measure them, and driving them
// disturbs the shared display.)
const PAGES = [
  '/', '/landing.html', '/notes.html', '/monitor.html', '/token-stats.html',
  '/upload.html', '/files.html', '/filesx.html', '/x11launcher.html', '/update.html',
  '/minesweeper.html', '/solitaire.html', '/game2048.html', '/circuit.html', '/rts.html',
];

// 320 is the narrowest phone still in use and where cramped layouts break first;
// 390/430 are the common iPhone widths. Wider than that has never stranded
// anything, so the matrix stays small enough to run every time.
const WIDTHS = [320, 390, 430];

// Sampled TWICE, a beat apart, and only what appears in both counts. Pages that
// fetch and re-render (notes tabs, the file list, the stats charts) pass through
// intermediate layouts where a strip has not become scrollable yet — a real
// strand is still there a moment later, a half-built one is not.
async function scan(page) {
  const a = await scanOnce(page);
  await page.waitForTimeout(400);
  const b = await scanOnce(page);
  return {
    sideways: a.sideways && b.sideways,
    stranded: b.stranded.filter((x) => a.stranded.includes(x)),
  };
}

// The scanner runs in the page. Returns everything stranded, plus whether the
// document itself scrolls sideways (which is the same bug seen from outside).
async function scanOnce(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const stranded = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right <= vw + 2 && r.left >= -2) return;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX === 'auto' || acs.overflowX === 'scroll') return;   // reachable
      }
      stranded.push(
        el.tagName.toLowerCase() +
        (el.id ? '#' + el.id : '') +
        (typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
        ' right=' + Math.round(r.right) + '/' + vw +
        ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"');
    });
    return {
      sideways: document.documentElement.scrollWidth > vw + 2,
      // one line per distinct element, so a repeated row does not bury the rest
      stranded: [...new Set(stranded)].slice(0, 10),
    };
  });
}

test.describe('layout', () => {
  // The spec sets its own viewport for every check, so the device projects would
  // only repeat the same work ten times. One Chromium and one WebKit is the
  // coverage that matters — they differ on intrinsic sizing, which is exactly
  // what strands an element.
  // (test.skip's own condition callback is handed fixtures only — no testInfo —
  // so the project name has to be read in a hook.)
  const LANES = ['desktop-chromium', 'iphone-17'];
  test.beforeEach(({}, testInfo) => {
    test.skip(!LANES.includes(testInfo.project.name),
      'one Chromium + one WebKit lane is enough; this spec drives its own viewports');
  });

  for (const path of PAGES) {
    // (Deliberately no pageerror assertion: this spec is about geometry, and
    // games.spec.js / surface-health.spec.js already own runtime errors.)
    test(`nothing is stranded outside the viewport: ${path}`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 820 });
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        // live pages fetch and re-render (stats, listings, the usage strip)
        await page.waitForTimeout(1600);
        const r = await scan(page);
        expect(r.stranded, `${path} @ ${width}px — outside the viewport with nothing to scroll`)
          .toEqual([]);
        expect(r.sideways, `${path} @ ${width}px — the page scrolls sideways`).toBe(false);
      }
    });
  }

  // A squat window is the other way a control leaves: the game-over card that
  // put its third button below the bottom edge (v1.19.161/162) was invisible at
  // any width and only showed up when the window got short.
  test('no control is stranded below a squat window', async ({ page }) => {
    for (const path of PAGES) {
      await page.setViewportSize({ width: 430, height: 260 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const out = await page.evaluate(() => {
        const vh = document.documentElement.clientHeight;
        const bad = [];
        document.querySelectorAll('button, a[href], input, select, [role=button]').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return;
          const r = el.getBoundingClientRect();
          if (r.height < 4 || r.width < 4) return;
          if (r.bottom <= vh + 2 && r.top >= -2) return;
          for (let a = el.parentElement; a; a = a.parentElement) {
            const acs = getComputedStyle(a);
            if ((acs.overflowY === 'auto' || acs.overflowY === 'scroll') &&
                a.scrollHeight > a.clientHeight + 2) return;
          }
          if (document.documentElement.scrollHeight > vh + 2) return;   // the page itself scrolls
          bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
                   ' "' + (el.textContent || el.value || '').trim().slice(0, 24) + '"');
        });
        return [...new Set(bad)].slice(0, 8);
      });
      expect(out, `${path} @ 430x260 — control below the fold with nothing to scroll`).toEqual([]);
    }
  });
});
