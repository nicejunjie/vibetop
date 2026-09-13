// @ts-check
// The Files app (apps/everyday/files/filesx.html) — vibetop's own file manager,
// and since phase 4b the only one (docs/files-native.md).
//
// This coverage exists because every one of these behaviors was reported by the
// user rather than caught by a test: the listing looking like a toy on a phone
// (emoji instead of thumbnails, names truncated while the right half sat empty),
// a tap opening a file so that Rename/Share/Info/Delete were reachable only via
// an undiscoverable long-press, a bottom action pill on a mouse-driven desktop
// where the right-click menu belongs, and the Layout (List/Grid/Gallery) and
// Select verbs simply missing against the classic app it replaced.
//
// The page is driven DIRECTLY (not through the desktop shell + wrapper iframes):
// these are its own interaction contracts, and the nesting only adds flake.
// Phone lanes exercise the touch contracts, desktop-chromium the mouse ones.

const { test, expect } = require('@playwright/test');

const PHONES = ['iphone-13-mini', 'iphone-15', 'iphone-17', 'iphone-17-pro-max', 'mobile-chrome'];
const DESKTOP = 'desktop-chromium';

// A folder of our own making, so the assertions do not depend on whatever the
// host happens to have in ~/Pictures.
const DIR = '/tmp/vibetop-e2e-filesx';

function onPhones(test) {
  test.beforeEach(({}, info) => {
    test.skip(!PHONES.includes(info.project.name), 'touch contract — phone lanes only');
  });
}
function onDesktop(test) {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== DESKTOP, `mouse contract — ${DESKTOP} only`);
  });
}

// 1x1 PNG, so a real image exists for the thumbnail path without shipping a fixture.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seed(page) {
  // Build the fixture folder through the app's own API as the logged-in user.
  await page.evaluate(async ({ dir, b64 }) => {
    await fetch('/api/fs/op', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'mkdir', path: dir })
    });
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const put = (name, body) => fetch('/api/fs/upload?path=' + encodeURIComponent(dir + '/' + name), {
      method: 'POST', body
    });
    await put('a-picture.png', bin);
    await put('notes.txt', 'hello from the e2e fixture\n');
    await put('a name with spaces.txt', 'x\n');
    await fetch('/api/fs/op', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'mkdir', path: dir + '/subfolder' })
    });
  }, { dir: DIR, b64: PNG_B64 });
}

// VIBETOP_FILESX_HTML=<file> serves a working-tree filesx.html at the live URL,
// so a change is judged before it is deployed (the stamped core script's
// query string is only a cache key).
test.beforeEach(async ({ context }) => {
  if (process.env.VIBETOP_FILESX_HTML) {
    await context.route('**/filesx.html*', (r) => r.fulfill({ path: process.env.VIBETOP_FILESX_HTML, contentType: 'text/html' }));
  }
});
async function openFiles(page) {
  await page.goto('/filesx.html');
  await page.waitForFunction(() => !!document.querySelector('.row, .state'), null, { timeout: 20_000 });
  await seed(page);
  await page.goto('/filesx.html#' + encodeURIComponent(DIR));
  await page.waitForSelector('.row', { timeout: 20_000 });
  await page.waitForTimeout(300);
}

const rowNamed = (page, name) => page.locator('.row').filter({ hasText: name }).first();

test.describe('native Files — touch', () => {
  onPhones(test);

  test('a tap SELECTS a file (it must not open it) and raises the action bar', async ({ page }) => {
    await openFiles(page);
    const row = rowNamed(page, 'notes.txt');
    await row.tap();
    await expect(row).toHaveClass(/\bsel\b/);
    await expect(page.locator('.actbar.on')).toBeVisible();
  });

  test('the action bar shows every verb, in at most two rows, fully on screen', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'notes.txt').tap();
    const bar = page.locator('.actbar.on');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const vw = page.viewportSize().width;
    expect(box.height).toBeLessThanOrEqual(110);          // two rows, not a wall
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 1); // nothing clipped off-screen
    // No overflow menu and no explicit dismiss button: every verb is inline and
    // tapping the listing clears the selection.
    await expect(page.locator('#a-more')).toHaveCount(0);
    await expect(page.locator('#a-clear')).toHaveCount(0);
    for (const id of ['a-open', 'a-info', 'a-share', 'a-rename', 'a-copy', 'a-cut', 'a-download', 'a-delete']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
  });

  test('tapping empty space clears the selection and leaves select mode', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'notes.txt').tap();
    await expect(page.locator('.actbar.on')).toBeVisible();
    const vw = page.viewportSize().width;
    const below = await page.locator('.row').last().boundingBox();
    await page.touchscreen.tap(vw / 2, below.y + below.height + 40);
    await expect(page.locator('.actbar.on')).toHaveCount(0);

    await page.locator('#selectbtn').tap();
    await expect(page.locator('#main.selmode')).toHaveCount(1);
    await page.touchscreen.tap(vw / 2, below.y + below.height + 40);
    await expect(page.locator('#main.selmode')).toHaveCount(0);
  });

  // One rule for every row: tap selects, a second tap opens. A folder used to
  // be the exception (it entered on the first tap), which made the touch rule
  // unpredictable and hid a folder's own verbs behind the long-press.
  test('a folder SELECTS on the first tap and enters on the second', async ({ page }) => {
    await openFiles(page);
    const row = rowNamed(page, 'subfolder');
    await row.tap();
    await expect(row).toHaveClass(/\bsel\b/);
    await expect(page.locator('.actbar.on')).toBeVisible();
    await expect(page.locator('.crumb.cur')).not.toHaveText(/subfolder/);
    await row.tap();
    await expect(page.locator('.crumb.cur')).toHaveText(/subfolder/, { timeout: 10_000 });
  });

  test('the Select button is a VISIBLE way into multi-select', async ({ page }) => {
    await openFiles(page);
    await expect(page.locator('#selectbtn')).toBeVisible();
    await page.locator('#selectbtn').tap();
    await expect(page.locator('#main.selmode')).toHaveCount(1);
    await expect(page.locator('.row .ck').first()).toBeVisible();
    await rowNamed(page, 'notes.txt').tap();
    await rowNamed(page, 'a-picture.png').tap();
    await expect(page.locator('#selcnt')).toHaveText('2 selected');
  });

  // ---- Grid / Gallery tile layout on a phone ----
  // The tile views laid out FIXED-width tiles packed from the left, which on a
  // 440px phone measured 2 gallery columns with 88px of dead right margin and 3
  // grid columns with 94px — a fifth of the screen thrown away ("what a waste of
  // space to show only two col of files"). The columns are fluid now, so they
  // divide whatever width the device has with nothing left over.
  for (const view of ['grid', 'gallery']) {
    test(`${view} tiles fill the phone's width and stay whole`, async ({ page }) => {
      await page.addInitScript((v) => {
        try { localStorage.setItem('fsx.view', v); } catch (e) {}
      }, view);
      await openFiles(page);
      await expect(page.locator('.main.gv .row').first()).toBeVisible();

      const m = await page.evaluate(() => {
        const main = document.querySelector('.main.gv');
        const cs = getComputedStyle(main);
        const rows = [...main.querySelectorAll('.row')];
        const b = rows.map((r) => r.getBoundingClientRect());
        const top0 = Math.round(Math.min(...b.map((r) => r.top)));
        const first = b.filter((r) => Math.round(r.top) === top0);
        const mb = main.getBoundingClientRect();
        // a tile whose label hangs below its own box means the grid compressed
        // the row below its content (auto rows get divided across a
        // definite-height scroller unless they are sized max-content)
        const clipped = rows.filter((r) => {
          const mid = r.querySelector('.mid');
          return mid && mid.getBoundingClientRect().bottom > r.getBoundingClientRect().bottom + 1;
        }).length;
        return {
          cols: first.length,
          tileW: first[0].width,
          gap: parseFloat(cs.columnGap) || 0,
          // space left over after the last tile in the row, padding excluded
          dead: mb.right - parseFloat(cs.paddingRight) - Math.max(...first.map((r) => r.right)),
          overflowX: main.scrollWidth - main.clientWidth,
          clipped,
        };
      });

      // More than the two columns that prompted this, at every phone width.
      expect(m.cols).toBeGreaterThanOrEqual(3);
      // The row is fully used: what is left over is at most the inter-tile gap.
      expect(m.dead).toBeLessThanOrEqual(m.gap + 1);
      // ...and it is used without spilling sideways.
      expect(m.overflowX).toBeLessThanOrEqual(1);
      // Every tile is tall enough for its own name.
      expect(m.clipped).toBe(0);
    });
  }

  test('rows are two-line: the full name is not truncated by size/date columns', async ({ page }) => {
    await openFiles(page);
    const row = rowNamed(page, 'a name with spaces.txt');
    await expect(row.locator('.meta')).toBeVisible();     // "date · size" subtitle
    await expect(row.locator('.sz')).toBeHidden();        // desktop columns are gone
    await expect(row.locator('.mt')).toBeHidden();
  });
});

test.describe('native Files — mouse', () => {
  onDesktop(test);

  test('left click selects and does NOT raise the bottom bar', async ({ page }) => {
    await openFiles(page);
    const row = rowNamed(page, 'notes.txt');
    await row.click();
    await expect(row).toHaveClass(/\bsel\b/);
    await expect(page.locator('.actbar')).toBeHidden();   // the menu is the mouse surface
  });

  test('right click opens a context menu carrying the verbs', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'notes.txt').click({ button: 'right' });
    const menu = page.locator('.morepop.ctx');
    await expect(menu).toBeVisible();
    // exact:true — a loose /Open/ also matches "Open in Browser".
    for (const label of ['Open', 'Open in Browser', 'Get Info', 'Share…',
                         'Download', 'Rename', 'Copy', 'Cut', 'Delete']) {
      await expect(menu.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('right click outside the selection retargets it (Explorer/Finder rule)', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'notes.txt').click();
    await rowNamed(page, 'a-picture.png').click({ button: 'right' });
    await expect(rowNamed(page, 'a-picture.png')).toHaveClass(/\bsel\b/);
    await expect(rowNamed(page, 'notes.txt')).not.toHaveClass(/\bsel\b/);
  });

  test('right click on empty space offers the folder verbs', async ({ page }) => {
    await openFiles(page);
    const last = await page.locator('.row').last().boundingBox();
    const box = await page.locator('#main').boundingBox();
    await page.mouse.click(box.x + box.width / 2, last.y + last.height + 60, { button: 'right' });
    const menu = page.locator('.morepop.ctx');
    await expect(menu.getByRole('button', { name: /New Folder/ })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Upload Files/ })).toBeVisible();
  });
});

test.describe('native Files — layout and thumbnails', () => {
  onDesktop(test);

  test('images get a real thumbnail, not an emoji placeholder', async ({ page }) => {
    await openFiles(page);
    const img = rowNamed(page, 'a-picture.png').locator('img.th');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', /thumb=\d+/);
    // and it actually decoded (a broken <img> has naturalWidth 0)
    await expect.poll(() => img.evaluate((n) => n.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('Layout switches List / Grid / Gallery and the choice persists', async ({ page }) => {
    await openFiles(page);
    await expect(page.locator('#main.gv')).toHaveCount(0);       // List by default

    await page.locator('#layoutbtn').click();
    await page.locator('.morepop button', { hasText: 'Grid' }).click();
    await expect(page.locator('#main.gv')).toHaveCount(1);
    const grid = await page.locator('.row').first().boundingBox();
    expect(grid.width).toBeLessThan(260);                        // a tile, not a full-width row

    await page.locator('#layoutbtn').click();
    await page.locator('.morepop button', { hasText: 'Gallery' }).click();
    await expect(page.locator('#main.gv.gallery')).toHaveCount(1);
    const gallery = await page.locator('.row').first().boundingBox();
    expect(gallery.width).toBeGreaterThan(grid.width);

    await page.reload();
    await page.waitForSelector('.row', { timeout: 20_000 });
    await expect(page.locator('#main.gv.gallery')).toHaveCount(1);

    // Selection and the context menu keep working on tiles.
    await page.locator('.row').first().click();
    await expect(page.locator('.row').first()).toHaveClass(/\bsel\b/);
    await page.locator('.row').first().click({ button: 'right' });
    await expect(page.locator('.morepop.ctx')).toBeVisible();
    await page.keyboard.press('Escape');

    // Search results carry a parent path and snippets: always a flat list.
    await page.locator('#searchbtn').click();
    await page.locator('#sq').fill('notes');
    await page.keyboard.press('Enter');
    await expect(page.locator('.row')).not.toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#main.gv')).toHaveCount(0);
  });

  // Finder's spacebar. Space on a selection opens a preview PANEL (not the
  // editor, not a folder change); the arrows keep walking the folder with the
  // panel open and the selection follows; Space again closes, leaving the
  // selection where the walk ended.
  test('Space quick-looks the selection; arrows walk the folder while it stays open', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'notes.txt').click();
    await page.keyboard.press('Space');
    await expect(page.locator('#ql.open')).toBeVisible();
    await expect(page.locator('#ql-name')).toHaveText('notes.txt');
    await expect(page.locator('#ql-body')).toContainText('hello from the e2e fixture');
    await expect(page.locator('#ed.open')).toHaveCount(0);            // a preview, not the editor

    // notes.txt sorts last (folders first), so walk UP to its neighbour and back.
    const idx = +(await rowNamed(page, 'notes.txt').getAttribute('data-i'));
    expect(idx).toBeGreaterThan(0);
    const prevName = (await page.locator('.row').nth(idx - 1).locator('.nm').textContent()).trim();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#ql-name')).toHaveText(prevName);
    await expect(rowNamed(page, prevName)).toHaveClass(/\bsel\b/);
    await expect(rowNamed(page, 'notes.txt')).not.toHaveClass(/\bsel\b/);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#ql-name')).toHaveText('notes.txt');

    await page.keyboard.press('Space');
    await expect(page.locator('#ql.open')).toHaveCount(0);
    await expect(rowNamed(page, 'notes.txt')).toHaveClass(/\bsel\b/);
    expect(page.url()).toContain(encodeURIComponent(DIR));           // still in the same folder
  });

  test('Quick Look: the wheel zooms an image under the cursor, drag pans it, double-click resets', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'a-picture.png').click();
    await page.keyboard.press('Space');
    const img = page.locator('#ql-body img');
    await expect(img).toBeVisible();
    const box = await page.locator('#ql-body').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);
    await expect(img).toHaveClass(/\bzoomed\b/);
    const t1 = await img.evaluate((i) => i.style.transform);
    expect(t1).toMatch(/scale\(1\.2\)/);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 }); await page.mouse.up();
    const t2 = await img.evaluate((i) => i.style.transform);
    const m = t2.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);         // dragged by the pointer delta (sub-pixel centring aside)
    expect(m).not.toBeNull();
    expect(Math.abs(+m[1] - 40)).toBeLessThan(1); expect(Math.abs(+m[2] - 30)).toBeLessThan(1);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(img).not.toHaveClass(/\bzoomed\b/);                 // double-click from zoomed = back to fit
    await page.keyboard.press('Space');
    await expect(page.locator('#ql.open')).toHaveCount(0);
  });

  test('Grid: Left/Right step one tile, Up/Down move a whole line', async ({ page }) => {
    await openFiles(page);
    // Enough tiles to wrap into at least two lines at any desktop width.
    await page.evaluate(async (dir) => {
      await fetch('/api/fs/op', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'mkdir', path: dir }) });
      for (let i = 0; i < 24; i++) {
        await fetch('/api/fs/upload?path=' + encodeURIComponent(dir + '/tile-' + String(i).padStart(2, '0') + '.txt'),
          { method: 'POST', body: 'x\n' });
      }
    }, DIR + '/grid');
    await page.goto('/filesx.html#' + encodeURIComponent(DIR + '/grid'));
    await page.waitForSelector('.row', { timeout: 20_000 });
    await page.locator('#layoutbtn').click();
    await page.locator('.morepop button', { hasText: 'Grid' }).click();
    await expect(page.locator('#main.gv')).toHaveCount(1);

    // Columns as the layout actually wrapped them.
    const cols = await page.evaluate(() => {
      const els = document.querySelectorAll('.row[data-i]');
      let c = 0; for (const r of els) { if (r.offsetTop !== els[0].offsetTop) break; c++; }
      return c;
    });
    expect(cols).toBeGreaterThan(1);
    expect(cols).toBeLessThan(24);
    const selIdx = () => page.locator('.row.sel').getAttribute('data-i');

    await page.locator('.row[data-i="0"]').click();
    await page.keyboard.press('ArrowRight');
    expect(await selIdx()).toBe('1');
    await page.keyboard.press('ArrowLeft');
    expect(await selIdx()).toBe('0');
    await page.keyboard.press('ArrowUp');                              // top line holds
    expect(await selIdx()).toBe('0');
    await page.keyboard.press('ArrowDown');                            // a whole line down
    expect(await selIdx()).toBe(String(cols));
    await page.keyboard.press('ArrowUp');
    expect(await selIdx()).toBe('0');
  });
});


// The listing follows the disk while Files is the app on screen, stops behind
// another app, and catches up the moment it is back (user, 2026-09-11).
test.describe('native Files — auto-refresh', () => {
  onDesktop(test);
  test('a file that appears on disk shows up in front, waits while another app is up, and appears on return', async ({ page }) => {
    await openFiles(page);
    const put = (name) => page.evaluate(async ({ dir, name }) => {
      await fetch('/api/fs/upload?path=' + encodeURIComponent(dir + '/' + name), { method: 'POST', body: 'x\n' });
    }, { dir: DIR, name });
    // The fixture folder outlives a run, so the names are unique per run — a
    // file left by the previous run made "behind: not yet listed" fail for ever.
    const tag = Date.now().toString(36);
    const front = 'auto-front-' + tag + '.txt', behind = 'auto-behind-' + tag + '.txt';
    await page.evaluate(() => window.postMessage({ type: 'vibetop:active', active: 'files' }, '*'));
    await put(front);
    await expect(rowNamed(page, front)).toBeVisible({ timeout: 8000 });                 // in front: within a poll
    await page.evaluate(() => window.postMessage({ type: 'vibetop:active', active: 'notes' }, '*'));
    await put(behind);
    await page.waitForTimeout(6000);
    await expect(rowNamed(page, behind)).toHaveCount(0);                                // behind another app: no refresh
    await page.evaluate(() => window.postMessage({ type: 'vibetop:active', active: 'files' }, '*'));
    await expect(rowNamed(page, behind)).toBeVisible({ timeout: 3000 });                // back in front: caught up at once
  });
});
