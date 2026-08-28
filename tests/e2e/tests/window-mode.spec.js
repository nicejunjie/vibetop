// @ts-check
// Window mode (v1.19.x) — the floating window manager.
//
// Runs on the TABLET lanes, the form factor window mode is actually built for
// (its gate needs >= 600 on the short side AND >= 900 on the long one, so phones
// stay full-screen). This is the coverage that did not exist while v1.19.5–.9
// shipped five consecutive hit-testing bugs — each found by ad-hoc iPad
// emulation, none by a test.
//
// Window mode is per-DEVICE (localStorage 'vibetop:wm'), never server state, so
// each test enables it in an init script and no test can leak into another
// project's run.

const { test, expect } = require('@playwright/test');
const { openApp, openStartMenu } = require('../helpers');

const TABLET = ['ipad-pro-11', 'ipad-pro-11-landscape', 'ipad-gen-11'];

// Enable window mode before any script on the page runs, so the first render is
// already in window mode (toggling afterwards races the desktop-state fetch).
async function useWindowMode(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('vibetop:wm', '1'); localStorage.removeItem('vibetop:wins'); } catch (e) {}
  });
}

// Monitor/Services/Token Stats live in the Start menu's Utilities FLYOUT, so the
// plain openApp() helper can't see them (their row isn't visible until it opens).
async function openUtility(page, id) {
  await openStartMenu(page);
  await page.locator('#sm-util-parent').click();
  await page.locator(`#startmenu .sm-item[data-id="${id}"]`).first().click();
  await expect(page.locator(`#task-apps .task-app[data-id="${id}"]`)).toBeVisible();
}

// Tidying is folded into the toggle: turning windows ON always lays them out in an
// even split, so the reset gesture is tap-off, tap-on. There is no ▦ button.
async function tidy(page) {
  await page.locator('#wm-btn').click();
  await page.waitForTimeout(250);
  await page.locator('#wm-btn').click();
  await page.waitForTimeout(450);
}

const geom = (page, id) => page.locator(`#win-${id}`).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top),
           width: Math.round(r.width), height: Math.round(r.height),
           z: Number(getComputedStyle(el).zIndex) || 0,
           focused: el.classList.contains('focused'),
           floating: el.classList.contains('floating'),
           maximized: el.classList.contains('maximized') };
});

test.describe('window mode', () => {
  test.beforeEach(async ({ page }) => { await useWindowMode(page); });

  // --- the size gate --------------------------------------------------------

  test('tablets get windows in BOTH orientations', async ({ page }, info) => {
    test.skip(!TABLET.includes(info.project.name), 'tablet lanes only');
    await page.goto('/');
    await openApp(page, 'notes');
    // iPad gen 11 portrait is 656x944 — under the OLD `max>=1000 || w>=900` gate,
    // so window mode silently switched itself off when that iPad was rotated.
    await expect(page.locator('body')).toHaveClass(/\bwm\b/);
    await expect(page.locator('#win-notes')).toHaveClass(/floating/);
    await expect(page.locator('#win-notes .win-titlebar')).toBeVisible();
  });

  test('phones never get windows even with the flag on', async ({ page }, info) => {
    test.skip(TABLET.includes(info.project.name) || info.project.name.startsWith('desktop'),
              'phone lanes only');
    await page.goto('/');
    await openApp(page, 'notes');
    await expect(page.locator('body')).not.toHaveClass(/\bwm\b/);
    expect((await geom(page, 'notes')).floating).toBe(false);
  });

  // --- everything below needs an actual window ------------------------------

  test.describe('with windows open', () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(!TABLET.includes(info.project.name), 'tablet lanes only');
      await page.goto('/');
      await openApp(page, 'notes');
      await openApp(page, 'upload');
      await expect(page.locator('#win-upload')).toHaveClass(/floating/);
    });

    // REGRESSION (was: the fixed #sys-warn banner covered a Tidy'd window's title
    // bar, so its ×/▢/– all hit-tested to the banner and the window could not be
    // closed, moved or maximized). The banner is now a flex child that SHRINKS
    // #frames, so no window can ever sit under it.
    test('the warning banner can never cover a window title bar', async ({ page }) => {
      const warn = await page.evaluate(() => {
        const el = document.getElementById('sys-warn');
        return { position: getComputedStyle(el).position, h: Math.round(el.getBoundingClientRect().height) };
      });
      expect(warn.position).not.toBe('fixed');   // in-flow, so it resizes the frame

      await tidy(page);                          // an even split puts the top row at y=8
      await page.waitForTimeout(400);
      const hit = await page.evaluate(() => {
        const w = document.getElementById('win-notes');
        const bar = w.querySelector('.win-titlebar').getBoundingClientRect();
        const close = w.querySelector('.wt-close').getBoundingClientRect();
        const at = (r) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const inWarn = (el) => !!(el && el.closest && el.closest('#sys-warn'));
        return { bar: inWarn(at(bar)), close: inWarn(at(close)) };
      });
      expect(hit.bar).toBe(false);
      expect(hit.close).toBe(false);
      // ...and the × actually works after a Tidy.
      await page.locator('#win-notes .wt-close').click({ timeout: 4000 });
      await expect(page.locator('#win-notes')).toHaveCount(0);
    });

    // REGRESSION (was: the double-tap was decided on the second POINTERDOWN, so
    // "tap the title bar to focus, then drag to move" maximized instead of
    // moving). Now decided on pointerup, only if the gesture stayed put.
    test('tap the title bar then drag → moves, does not maximize', async ({ page }) => {
      const before = await geom(page, 'notes');
      const bar = await page.locator('#win-notes .win-titlebar').boundingBox();
      await page.mouse.click(bar.x + 70, bar.y + bar.height / 2);   // tap to focus
      await page.waitForTimeout(100);                               // well inside the 400ms window
      await page.mouse.move(bar.x + 70, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + 190, bar.y + bar.height / 2 + 70, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = await geom(page, 'notes');
      expect(after.maximized).toBe(false);
      // Assert on whichever axis has room: a stacked portrait window is already
      // full-width, so it can only move vertically (clamped horizontally).
      expect(Math.max(after.left - before.left, after.top - before.top)).toBeGreaterThan(40);
    });

    test('a genuine double-tap on the title bar still maximizes, and restores', async ({ page }) => {
      const bar = await page.locator('#win-notes .win-titlebar').boundingBox();
      const x = bar.x + 70, y = bar.y + bar.height / 2;
      await page.mouse.click(x, y);
      await page.mouse.click(x, y);                          // same spot, no movement
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
      await page.mouse.click(x, y);
      await page.mouse.click(x, y);
      await expect(page.locator('#win-notes')).not.toHaveClass(/maximized/);
    });

    // REGRESSION (was: pointer events inside an iframe don't bubble, and there was
    // no relay — so clicking an app's own content never focused or raised it).
    test('clicking inside a window body focuses and raises it', async ({ page }) => {
      const before = await geom(page, 'notes');
      expect(before.focused).toBe(false);             // upload was opened last
      const box = await page.locator('#win-notes .win-body').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator('#win-notes')).toHaveClass(/focused/, { timeout: 4000 });
      expect((await geom(page, 'notes')).z).toBeGreaterThan(before.z);
    });

    // Terminal and Files are WRAPPERS hosting their own iframes (desktop →
    // terminals.html → /tN/), so a click-to-focus listener on the wrapper's
    // document alone never sees a click in the actual terminal or file list —
    // the two most-used apps were exactly the ones the first fix missed.
    test('clicking inside a NESTED-iframe app (Files) focuses its window', async ({ page }) => {
      test.slow();   // FileBrowser cold-starts per user
      await openApp(page, 'files');
      await expect(page.locator('#win-files')).toHaveClass(/floating/);
      await page.waitForTimeout(3000);                       // let the inner iframe load + get wired
      await page.locator('#win-notes .win-titlebar .wt-name').click();   // focus notes
      await expect(page.locator('#win-notes')).toHaveClass(/focused/);
      const box = await page.locator('#win-files .win-body').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
      await expect(page.locator('#win-files')).toHaveClass(/focused/, { timeout: 6000 });
    });

    test('the maximize control flips to Restore while maximized', async ({ page }) => {
      const btn = page.locator('#win-notes .wt-max');
      await expect(btn).toHaveAttribute('aria-label', 'Maximize');
      await btn.click();
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
      await expect(btn).toHaveAttribute('aria-label', 'Restore');
      await btn.click();
      await expect(btn).toHaveAttribute('aria-label', 'Maximize');
    });

    test('a minimized window is marked in the taskbar, and its button restores it', async ({ page }) => {
      const tb = page.locator('#task-apps .task-app[data-id="notes"]');
      await page.locator('#win-upload .win-titlebar .wt-name').click();   // focus upload
      await expect(tb).not.toHaveClass(/minimized/);
      await page.locator('#win-notes .wt-min').click();
      await expect(tb).toHaveClass(/minimized/);
      await expect(page.locator('#win-notes')).not.toHaveClass(/active/); // off-screen
      await tb.click();                                                   // taskbar restores it
      await expect(tb).not.toHaveClass(/minimized/);
      await expect(page.locator('#win-notes')).toHaveClass(/active/);
    });

    test('the taskbar button of the focused window minimizes it', async ({ page }) => {
      const tb = page.locator('#task-apps .task-app[data-id="upload"]');
      await expect(page.locator('#win-upload')).toHaveClass(/focused/);
      await tb.click();
      await expect(tb).toHaveClass(/minimized/);
    });

    test('title-bar controls are keyboard reachable and operable', async ({ page }) => {
      const attrs = await page.locator('#win-notes .win-titlebar')
        .evaluate((bar) => Array.from(bar.querySelectorAll('.wt-min,.wt-max,.wt-close'))
          .map((el) => ({ tabindex: el.getAttribute('tabindex'), role: el.getAttribute('role'),
                          label: el.getAttribute('aria-label') })));
      expect(attrs).toHaveLength(3);
      expect(attrs.every((a) => a.tabindex === '0' && a.role === 'button' && a.label)).toBe(true);
      // Enter on the focused control acts.
      await page.locator('#win-notes .wt-max').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
    });

    // REGRESSION: a coach banner sits at bottom:60, on top of the bottom edge and
    // SE grip of any window reaching that far. It stacked above the window and ate
    // the drag, so a window could not be resized — the tip that says "drag an edge
    // to resize" was blocking the resize. v1.19.9 patched only the window-mode tip
    // via a racy one-shot querySelector; the per-app tips were never covered.
    test('resize works, and no coach banner can block the grips', async ({ page }) => {
      const probe = () => page.evaluate(() => {
        const w = document.getElementById('win-notes');
        const g = w.querySelector('.win-rz-se').getBoundingClientRect();
        const el = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2);
        const c = document.querySelector('.vibe-coach');
        return { onGrip: !!(el && el.classList && el.classList.contains('win-rz-se')),
                 blockedByCoach: !!(el && el.closest && el.closest('.vibe-coach')),
                 coachClickThrough: c ? getComputedStyle(c).pointerEvents === 'none' : null };
      });
      const before = await probe();
      expect(before.blockedByCoach).toBe(false);
      expect(before.onGrip).toBe(true);
      if (before.coachClickThrough !== null) expect(before.coachClickThrough).toBe(true);

      const g0 = await geom(page, 'notes');
      const grip = await page.locator('#win-notes .win-rz-se').boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 - 120, grip.y + grip.height / 2 - 90, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      const g1 = await geom(page, 'notes');
      // On a narrow portrait tablet a tiled window can already sit ON the minimum
      // width, where shrinking further is correctly impossible — assert the axis
      // that still has room.
      const min = await page.evaluate(() => (window.VibeWin ? window.VibeWin.MINW : 320));
      if (g0.width > min + 60) expect(g1.width).toBeLessThan(g0.width - 50);
      expect(g1.height).toBeLessThan(g0.height - 40);
    });

    test('Tidy tiles two windows into halves (side by side, or stacked in portrait)', async ({ page }) => {
      await tidy(page);
      await page.waitForTimeout(300);
      const a = await geom(page, 'notes'), b = await geom(page, 'upload');
      const box = await page.evaluate(() => {
        const r = document.getElementById('frames').getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      if (box.h > box.w) {
        // Portrait: stacked. Side-by-side here would be two ~320px slivers pinned
        // at the minimum width (measured on the 656px-wide iPad gen 11).
        expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(3);
        expect(Math.abs(a.left - b.left)).toBeLessThanOrEqual(2);
        expect(Math.abs(a.top - b.top)).toBeGreaterThan(a.height / 2);
      } else {
        expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(a.top - b.top)).toBeLessThanOrEqual(2);
        expect(Math.abs(a.left - b.left)).toBeGreaterThan(a.width / 2);
      }
    });

    // Opening a 2nd app used to cascade it 32px, covering ~90% of the first — so
    // window mode looked exactly like the full-screen switcher.
    // REGRESSION: Tidy used ceil(sqrt(n)) columns regardless of frame width, so on
    // a narrow tablet the tiles were clamped up to MINW and OVERLAPPED — a
    // window's ×/▢/– hit-tested to its neighbour and the first tap did nothing.
    test('Tidy never leaves a window control covered by another window', async ({ page }) => {
      test.slow();
      for (const id of ['monitor', 'tokenstats']) await openUtility(page, id).catch(() => {});
      await tidy(page);
      await page.waitForTimeout(500);
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#frames .win.floating.active').forEach((w) => {
          ['.wt-close', '.wt-max', '.wt-min'].forEach((sel) => {
            const b = w.querySelector(sel).getBoundingClientRect();
            const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            const owner = el && el.closest ? el.closest('.win') : null;
            if (!owner || owner.id !== w.id) out.push({ win: w.id, ctl: sel, owner: owner && owner.id });
          });
        });
        return out;
      });
      expect(bad).toEqual([]);
    });

    // REGRESSION: double-tap-maximize returned before markUserArranged(), so the
    // next app opened auto-tiled the window and silently threw the maximize away —
    // while the ▢ button's maximize survived. Same intent, opposite result.
    test('double-tap maximize survives opening another app (same as the ▢ button)', async ({ page }) => {
      const bar = await page.locator('#win-notes .win-titlebar').boundingBox();
      const x = bar.x + 70, y = bar.y + bar.height / 2;
      await page.mouse.click(x, y);
      await page.mouse.click(x, y);
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
      await openUtility(page, 'monitor');
      await page.waitForTimeout(600);
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
    });

    test('a second window does not bury the first', async ({ page }) => {
      const a = await geom(page, 'notes'), b = await geom(page, 'upload');
      const overlapX = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
      const overlapY = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
      const covered = (overlapX * overlapY) / (a.width * a.height);
      expect(covered).toBeLessThan(0.5);
    });

    // Resizing must work from every edge and corner, like any OS window — and the
    // pointer must SAY so on approach (the cursor is the affordance on a desktop;
    // the visible SE grip is only for touch, which has no hover). The NE corner was
    // the one dead direction: the × is z-index 5 and the handles 3-4, so the button
    // won the 9x9 square they shared. Fixed by insetting the controls from the frame
    // edge (padding-right 18 > the 16px corner zone) — which is also why the three
    // controls are re-checked here: the previous fix for "× stole the tap" is what
    // created the dead corner, so these two must be tested together, forever.
    const DIRS = [
      ['n',  0,  30], ['s',  0, 30], ['e', 40,  0], ['w', -40, 0],
      ['ne', 40, -30], ['nw', -40, -30], ['se', 40, 30], ['sw', -40, 30],
    ];
    for (const [dir, dx, dy] of DIRS) {
      test(`resizes from the ${dir} edge/corner`, async ({ page }) => {
        const before = await geom(page, 'notes');
        const box = await page.locator(`#win-notes .win-rz-${dir}`).boundingBox();
        expect(box, `no .win-rz-${dir} handle`).toBeTruthy();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await geom(page, 'notes');
        // Grabbing an edge changes the size along that axis and leaves the other alone.
        const wantW = dx !== 0 ? Math.abs(dx) : 0;
        const wantH = dy !== 0 ? Math.abs(dy) : 0;
        expect(Math.abs((after.width - before.width) - wantW)).toBeLessThanOrEqual(3);
        expect(Math.abs((after.height - before.height) - wantH)).toBeLessThanOrEqual(3);
      });
    }

    // THE report: "still cannot resize from left or right". All four edges worked
    // when aimed INSIDE the border — but Tidy insets each tile by GAP=8, so two
    // side-by-side tiles have a 16px gutter, and the obvious place to grab (the
    // divider between them) was bare #frames: elementFromPoint returned the desktop
    // with cursor `auto`. Left/right felt broken and top/bottom didn't, because a
    // side-by-side split only ever puts a gutter on the VERTICAL edges. The grab
    // ring now reaches outside the window so the two rings meet inside the gutter.
    test('the gutter between two tiled windows is grabbable end to end', async ({ page }) => {
      await tidy(page);
      await page.waitForTimeout(400);
      const layout = await page.evaluate(() => {
        const r = (id) => document.querySelector('#win-' + id).getBoundingClientRect();
        const a = r('notes'), b = r('upload');
        // Only meaningful for a side-by-side split; portrait tablets stack instead.
        const sideBySide = Math.abs(a.top - b.top) < 4 && a.right < b.left;
        return { sideBySide, gapL: Math.round(a.right), gapR: Math.round(b.left),
                 y: Math.round(a.top + a.height / 2) };
      });
      test.skip(!layout.sideBySide, 'this lane tiles vertically — no vertical gutter');

      // Every pixel across the gutter must offer a resize, with no dead seam in the
      // middle (an 8px reach left exactly one dead pixel there — the border eats one).
      const dead = await page.evaluate(({ gapL, gapR, y }) => {
        const bad = [];
        for (let x = gapL; x <= gapR; x++) {
          const el = document.elementFromPoint(x, y);
          const cur = el ? getComputedStyle(el).cursor : 'none';
          // WebKit-family engines apply the Safari-only col-resize override
          // (desktop.html @supports -webkit-named-image) on the e/w handles.
          if (cur !== 'ew-resize' && cur !== 'col-resize') bad.push(x + ':' + cur);
        }
        return bad;
      }, layout);
      expect(dead, `dead pixels in the gutter: ${dead.join(', ')}`).toEqual([]);

      // And grabbing it actually resizes the window on that side.
      const before = await geom(page, 'notes');
      const x = layout.gapL + 2;                       // the left window's half of the gutter
      await page.mouse.move(x, layout.y);
      await page.mouse.down();
      await page.mouse.move(x + 50, layout.y, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      const after = await geom(page, 'notes');
      expect(after.width).toBeGreaterThan(before.width + 40);
    });

    // The drag mask covers every iframe for the duration of a gesture so the pointer
    // stream survives crossing one — which means ITS cursor is the cursor for the
    // whole drag. With none set it fell back to a plain arrow the instant you
    // pressed: the resize cursor appeared on hover and vanished the moment it
    // mattered ("works, but the cursor shape doesn't change").
    test('the resize cursor holds for the whole drag, not just on hover', async ({ page }) => {
      // e/n have two valid values: the canonical keyword (Chromium/Firefox) or the
      // Safari-only public-NSCursor mapping (WebKit applies the @supports block).
      for (const [dir, want] of [['e', ['ew-resize', 'col-resize']], ['n', ['ns-resize', 'row-resize']], ['se', ['nwse-resize']]]) {
        const box = await page.locator(`#win-notes .win-rz-${dir}`).boundingBox();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 30, cy + 20, { steps: 6 });
        const mask = await page.evaluate(() => {
          const m = document.getElementById('win-dragmask');
          return { display: getComputedStyle(m).display, cursor: getComputedStyle(m).cursor };
        });
        await page.mouse.up();
        await page.waitForTimeout(150);
        expect(mask.display).toBe('block');       // it really is covering the iframes
        expect(want).toContain(mask.cursor);
      }
      // Moving by the title bar carries the move cursor the same way.
      const tb = await page.locator('#win-notes .win-titlebar').boundingBox();
      await page.mouse.move(tb.x + 60, tb.y + tb.height / 2);
      await page.mouse.down();
      await page.mouse.move(tb.x + 100, tb.y + 40, { steps: 6 });
      const moveCur = await page.evaluate(() =>
        getComputedStyle(document.getElementById('win-dragmask')).cursor);
      await page.mouse.up();
      expect(moveCur).toBe('move');
    });

    test('every edge and corner shows its resize cursor, and the controls keep theirs', async ({ page }) => {
      const seen = await page.locator('#win-notes').evaluate((w) => {
        const r = w.getBoundingClientRect();
        const cur = (x, y) => {
          const el = document.elementFromPoint(x, y);
          return el ? getComputedStyle(el).cursor : '(none)';
        };
        return {
          n:  cur(r.left + r.width / 2, r.top + 2),
          s:  cur(r.left + r.width / 2, r.bottom - 2),
          w:  cur(r.left + 2, r.top + r.height / 2),
          e:  cur(r.right - 2, r.top + r.height / 2),
          ne: cur(r.right - 6, r.top + 6),
          nw: cur(r.left + 6, r.top + 6),
          se: cur(r.right - 6, r.bottom - 6),
          sw: cur(r.left + 6, r.bottom - 6),
          titlebar: cur(r.left + r.width / 2, r.top + 16),
          close: cur(r.right - 24, r.top + 16),
        };
      });
      // straight edges: canonical keyword, or the Safari-only public-NSCursor
      // mapping in WebKit-family engines (see the @supports block in desktop.html)
      expect(['ns-resize', 'row-resize']).toContain(seen.n);
      expect(['ns-resize', 'row-resize']).toContain(seen.s);
      expect(['ew-resize', 'col-resize']).toContain(seen.e);
      expect(['ew-resize', 'col-resize']).toContain(seen.w);
      expect(seen.ne).toBe('nesw-resize');
      expect(seen.sw).toBe('nesw-resize');
      expect(seen.nw).toBe('nwse-resize');
      expect(seen.se).toBe('nwse-resize');
      expect(seen.titlebar).toBe('move');      // drag to move
      expect(seen.close).toBe('pointer');      // the × is NOT under the resize ring
    });

    // The toggle's ONE surface is the 🗔 taskbar button — no Start-menu row. Three
    // arrangements were tried: Utilities flyout only (couldn't be found), flyout +
    // button (same switch twice — "two window control buttons in the status bar"),
    // and row-only (v1.19.42, removed the wrong one). See docs/design-decisions.md.
    test('the 🗔 taskbar toggle is the only surface, and the Start menu has no window row', async ({ page }) => {
      const btn = page.locator('#wm-btn');
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');   // this lane starts on
      await expect(page.locator('#tidy-btn')).toHaveCount(0);       // folded into the toggle

      await openStartMenu(page);
      await expect(page.locator('#startmenu .sm-item[data-id="winmode"]')).toHaveCount(0);
      await expect(page.locator('#startmenu')).not.toContainText('Floating windows');
      await page.keyboard.press('Escape');

      await btn.click();                                           // -> off
      await page.waitForTimeout(400);
      await expect(page.locator('body')).not.toHaveClass(/\bwm\b/);
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expect(btn).toBeVisible();        // still reachable when OFF — the whole point

      await btn.click();                                           // -> back on
      await page.waitForTimeout(400);
      await expect(page.locator('body')).toHaveClass(/\bwm\b/);
    });

    // Snap layouts hang off the TASKBAR icon, not off a window. They started on a
    // window's ▢ (Windows 11 style) and that was the wrong home: the palette
    // arranges EVERY window, so a control sitting on window A silently moved B and
    // C — "all windows can be controlled from another window". Scope matches
    // location now; ▢ is plain maximize again. See docs/design-decisions.md.
    test('hovering the taskbar 🗔 offers exactly the layouts that fit the open windows', async ({ page }) => {
      await openApp(page, 'files');            // three windows
      await page.waitForTimeout(600);

      // What SHOULD be offered on this lane, straight from the pure geometry: one
      // zone per open window, and only if it fits at MINW/MINH. A narrow tablet in
      // portrait legitimately has nothing to offer for three windows.
      const expected = await page.evaluate(() => {
        const f = document.getElementById('frames').getBoundingClientRect();
        const vis = document.querySelectorAll('#frames .win.floating:not(.minimized)').length;
        return window.VibeWin.layoutsFor({ w: Math.round(f.width), h: Math.round(f.height) }, 3)
          .map((l) => l.name);
      });

      await page.locator('#wm-btn').hover();
      const palette = page.locator('#win-layouts');
      if (!expected.length) {                  // nothing fits here — the palette must stay shut
        await page.waitForTimeout(900);
        await expect(palette).not.toHaveClass(/open/);
        return;
      }
      await expect(palette).toHaveClass(/open/, { timeout: 3000 });
      const names = await palette.locator('.wl-name').allTextContents();
      expect(names.sort()).toEqual(expected.sort());

      // The point of the exact-count rule: a 2-zone layout would minimize the 3rd
      // window, so with three open it must not be on offer at all.
      expect(names).not.toContain('Halves');
      expect(names).not.toContain('Stacked');

      await palette.locator('.wl-opt').first().locator('.wl-grid').click();
      await page.waitForTimeout(500);
      await expect(palette).not.toHaveClass(/open/);

      // All three placed — none minimized, none overlapping.
      const gs = [];
      for (const id of ['notes', 'upload', 'files']) {
        const g = await geom(page, id);
        expect(g.min, `${id} should not be minimized by a 3-zone layout`).toBeFalsy();
        gs.push(g);
      }
      for (let a = 0; a < gs.length; a++) {
        for (let b = a + 1; b < gs.length; b++) {
          const ox = Math.min(gs[a].left + gs[a].width, gs[b].left + gs[b].width) - Math.max(gs[a].left, gs[b].left);
          const oy = Math.min(gs[a].top + gs[a].height, gs[b].top + gs[b].height) - Math.max(gs[a].top, gs[b].top);
          expect(Math.max(0, ox) * Math.max(0, oy)).toBeLessThanOrEqual(4);   // no real overlap
        }
      }
    });

    // "For 3 windows, how do I choose which one is the one in 1+2?" — the palette
    // answers it in place: each zone previews the icon of the window that will
    // land there (focused → zone 0, rest in taskbar order), hovering a zone
    // previews the focused window THERE instead, and clicking a zone commits
    // exactly what is shown. Preview and placement share VibeWin.zoneAssign, so
    // the preview cannot lie.
    test('the palette previews who goes where, and clicking a zone steers the focused window', async ({ page }) => {
      await openApp(page, 'files');            // notes, upload, files -> three windows
      await page.waitForTimeout(600);
      const offered = await page.evaluate(() => {
        const f = document.getElementById('frames').getBoundingClientRect();
        return window.VibeWin.layoutsFor({ w: Math.round(f.width), h: Math.round(f.height) }, 3)
          .map((l) => l.key);
      });
      test.skip(!offered.length, 'no 3-window layout fits this lane');

      // Focus notes (it is not focused — files was opened last), so the expected
      // assignment is deterministic: notes must preview in zone 0.
      await page.locator('#task-apps .task-app[data-id="notes"]').click();
      await page.waitForTimeout(300);

      await page.locator('#wm-btn').hover();
      const palette = page.locator('#win-layouts');
      await expect(palette).toHaveClass(/open/, { timeout: 3000 });
      const grid = palette.locator('.wl-opt').first().locator('.wl-grid');
      const zone = (j) => grid.locator(`.wl-zone[data-zone="${j}"]`);

      // The zone renders the same markup as the taskbar button (svg preferred,
      // emoji fallback), so compare innerHTML — an svg icon has no textContent.
      const notesIcon = await page.evaluate(() =>
        document.querySelector('#task-apps .task-app[data-id="notes"] .icon').innerHTML);
      const zoneHTML = (j) => zone(j).evaluate((el) => el.innerHTML);

      // Preview truth: the focused window's icon sits in the main zone, and every
      // zone carries some window's icon.
      expect(await zoneHTML(0)).toBe(notesIcon);
      await expect(zone(0)).toHaveAttribute('title', / with Notes here$/);
      for (let j = 0; j < 3; j++) expect((await zoneHTML(j)).length).toBeGreaterThan(0);

      // Hovering zone 1 previews the focused window THERE...
      await zone(1).hover();
      expect(await zoneHTML(1)).toBe(notesIcon);
      await expect(zone(1)).toHaveAttribute('title', / with Notes here$/);

      // ...and clicking commits it: notes lands exactly in zone 1's geometry.
      const zones = await page.evaluate((key) => {
        const f = document.getElementById('frames').getBoundingClientRect();
        return window.VibeWin.layoutGeoms(key, { w: Math.round(f.width), h: Math.round(f.height) });
      }, offered[0]);
      const fr = await page.evaluate(() => {
        const r = document.getElementById('frames').getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
      });
      await zone(1).click();
      await page.waitForTimeout(500);
      await expect(palette).not.toHaveClass(/open/);
      const g = await geom(page, 'notes');
      expect(Math.abs(g.left - (fr.left + zones[1].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(g.top - (fr.top + zones[1].top))).toBeLessThanOrEqual(2);
      expect(Math.abs(g.width - zones[1].width)).toBeLessThanOrEqual(2);
      expect(Math.abs(g.height - zones[1].height)).toBeLessThanOrEqual(2);
      expect(g.focused, 'the steered window keeps focus').toBe(true);

      // --- full slot assignment ------------------------------------------------
      // Re-open the palette: the applied layout's tile must preview REALITY (who
      // is where now — notes is in zone 1), not re-derive the focused rule.
      await page.mouse.move(10, 10);
      await page.locator('#wm-btn').hover();
      await expect(palette).toHaveClass(/open/, { timeout: 3000 });
      const grid2 = palette.locator('.wl-opt').first().locator('.wl-grid');
      const z2 = (j) => grid2.locator(`.wl-zone[data-zone="${j}"]`);
      const html2 = (j) => z2(j).evaluate((el) => el.innerHTML);
      expect(await html2(1)).toBe(notesIcon);

      // Drag zone 0's icon onto zone 2: those two occupants swap — including
      // windows that are NOT focused, which zone-clicking alone cannot reach.
      const before = { z0: await html2(0), z2: await html2(2) };
      expect(before.z0).not.toBe(notesIcon);   // notes sits in zone 1, so this
      expect(before.z2).not.toBe(notesIcon);   // drag moves two unfocused windows
      const b0 = await z2(0).boundingBox(), b2 = await z2(2).boundingBox();
      await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
      await page.mouse.down();
      await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await expect(palette).not.toHaveClass(/open/);   // the drop committed

      // The two swapped windows really traded places on the desktop.
      const idFor = (html) => page.evaluate((h) => {
        const btns = [...document.querySelectorAll('#task-apps .task-app')];
        const hit = btns.find((b) => b.querySelector('.icon').innerHTML === h);
        return hit && hit.dataset.id;
      }, html);
      const a = await idFor(before.z0), b = await idFor(before.z2);
      const ga = await geom(page, a), gb = await geom(page, b);
      expect(Math.abs(ga.left - (fr.left + zones[2].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(ga.top - (fr.top + zones[2].top))).toBeLessThanOrEqual(2);
      expect(Math.abs(gb.left - (fr.left + zones[0].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(gb.top - (fr.top + zones[0].top))).toBeLessThanOrEqual(2);
      // And notes never moved: full assignment means the third window stays put.
      const gn = await geom(page, 'notes');
      expect(Math.abs(gn.left - (fr.left + zones[1].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(gn.top - (fr.top + zones[1].top))).toBeLessThanOrEqual(2);
    });

    test('▢ is plain maximize — it must not open the palette', async ({ page }) => {
      await page.locator('#win-notes .wt-max').hover();
      await page.waitForTimeout(800);
      await expect(page.locator('#win-layouts')).not.toHaveClass(/open/);
      await page.locator('#win-notes .wt-max').click();
      await page.waitForTimeout(400);
      await expect(page.locator('#win-notes')).toHaveClass(/maximized/);
    });

    test('dragging a window marks it user-arranged, so opening a 3rd stops re-tiling it', async ({ page }) => {
      const bar = await page.locator('#win-notes .win-titlebar').boundingBox();
      await page.mouse.move(bar.x + 70, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + 70 + 90, bar.y + bar.height / 2 + 110, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const placed = await geom(page, 'notes');
      await openUtility(page, 'monitor');
      await page.waitForTimeout(500);
      const after = await geom(page, 'notes');
      expect(Math.abs(after.left - placed.left)).toBeLessThanOrEqual(2);   // untouched
      expect(Math.abs(after.top - placed.top)).toBeLessThanOrEqual(2);
    });
  });

  // The v1.19.51 lesson: the palette drag was completely broken on the deployed
  // build while the then-existing "drag" e2e passed — its synthetic burst
  // slipped through a momentarily quiet churn window that a human hand never
  // does. These two tests drive the REAL gesture shape (press, arm inside the
  // source zone, travel, drop) and pin the root cause class itself (a repaint
  // feedback loop: mouseenter -> unconditional innerHTML -> node under the
  // cursor detached -> hover re-evaluated -> mouseenter again), on the engine
  // where it manifests. Chromium only: the churn loop is a Chromium hover
  // re-evaluation behavior; WebKit lanes passed even while it was broken.
  test.describe('palette drag, for real', () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-chromium', 'chromium-only: see above');
      await useWindowMode(page);
      await page.goto('/');
      await openApp(page, 'notes');
      await openApp(page, 'upload');
      await openApp(page, 'files');
      await page.waitForTimeout(600);
    });

    // Open the palette and return the tile locator for the first offered layout,
    // plus its px zones and the frame offset.
    async function openTile(page) {
      const offered = await page.evaluate(() => {
        const f = document.getElementById('frames').getBoundingClientRect();
        return window.VibeWin.layoutsFor({ w: Math.round(f.width), h: Math.round(f.height) }, 3)
          .map((l) => l.key);
      });
      test.skip(!offered.length, 'no 3-window layout fits this lane');
      await page.mouse.move(10, 10);
      await page.locator('#wm-btn').hover();
      await expect(page.locator('#win-layouts')).toHaveClass(/open/, { timeout: 3000 });
      const zones = await page.evaluate((key) => {
        const f = document.getElementById('frames').getBoundingClientRect();
        return window.VibeWin.layoutGeoms(key, { w: Math.round(f.width), h: Math.round(f.height) });
      }, offered[0]);
      const fr = await page.evaluate(() => {
        const r = document.getElementById('frames').getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
      });
      return { grid: page.locator('#win-layouts .wl-opt').first().locator('.wl-grid'),
               key: offered[0], zones, fr };
    }

    test('press, arm, travel, drop — the last zone IS swappable', async ({ page }) => {
      // Apply the layout first so the reopened tile previews reality (occupancy),
      // then drag zone 0's occupant onto the LAST zone — for 1 + 2 that is
      // exactly "the bottom right one", the reported-unswappable slot.
      let t = await openTile(page);
      await t.grid.click();
      await page.waitForTimeout(600);
      t = await openTile(page);
      const last = t.zones.length - 1;
      // Occupants by icon markup (works on any build — data-app only exists on
      // the fixed one, and this proof must fail at the DRAG, not on an attribute).
      const occ = (j) => t.grid.locator(`.wl-zone[data-zone="${j}"]`).evaluate((el) => {
        const btns = [...document.querySelectorAll('#task-apps .task-app')];
        const hit = btns.find((x) => x.querySelector('.icon').innerHTML === el.innerHTML);
        return hit && hit.dataset.id;
      });
      const a = await occ(0), b = await occ(last);
      expect(a).toBeTruthy(); expect(b).toBeTruthy(); expect(a).not.toBe(b);

      const z0 = await t.grid.locator('.wl-zone[data-zone="0"]').boundingBox();
      const zl = await t.grid.locator(`.wl-zone[data-zone="${last}"]`).boundingBox();
      await page.mouse.move(z0.x + z0.width / 2, z0.y + z0.height / 2);
      await page.waitForTimeout(120);                    // a human hovers before pressing
      await page.mouse.down();
      // Arm INSIDE the source zone (>4px threshold) — this is what dies when a
      // repaint loop detaches the node mid-dispatch: pointerdown never lands.
      await page.mouse.move(z0.x + z0.width / 2 + 7, z0.y + z0.height / 2, { steps: 3 });
      await page.waitForTimeout(120);
      await expect(page.locator('.wl-drag-src'), 'the drag must arm').toHaveCount(1);
      await page.mouse.move(zl.x + zl.width / 2, zl.y + zl.height / 2, { steps: 12 });
      await page.waitForTimeout(150);
      await expect(page.locator('.wl-drag-over'), 'the drop target must light').toHaveCount(1);
      await page.mouse.up();
      await page.waitForTimeout(500);

      // The two occupants really traded places on the desktop.
      const g = (id) => page.locator(`#win-${id}`).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
      });
      const ga = await g(a), gb = await g(b);
      expect(Math.abs(ga.left - (t.fr.left + t.zones[last].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(ga.top - (t.fr.top + t.zones[last].top))).toBeLessThanOrEqual(2);
      expect(Math.abs(gb.left - (t.fr.left + t.zones[0].left))).toBeLessThanOrEqual(2);
      expect(Math.abs(gb.top - (t.fr.top + t.zones[0].top))).toBeLessThanOrEqual(2);
    });

    test('hovering a zone leaves the palette DOM quiet (no repaint loop)', async ({ page }) => {
      const t = await openTile(page);
      const zl = await t.grid.locator(`.wl-zone[data-zone="${t.zones.length - 1}"]`).boundingBox();
      await page.mouse.move(zl.x + zl.width / 2, zl.y + zl.height / 2);
      await page.waitForTimeout(250);                    // the one legitimate repaint settles
      const churn = await page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const mo = new MutationObserver((muts) => { n += muts.length; });
        mo.observe(document.getElementById('win-layouts'),
                   { childList: true, subtree: true, characterData: true });
        setTimeout(() => { mo.disconnect(); resolve(n); }, 400);
      }));
      // Broken build measured 33 mutations in this window; idempotent paint = 0.
      expect(churn, 'palette DOM must be quiet under a stationary pointer').toBe(0);
    });
  });

});
