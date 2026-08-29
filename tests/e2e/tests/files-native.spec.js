// @ts-check
// Native Files app (landing/filesx.html) — the replacement for the FileBrowser
// front end (docs/files-native.md).
//
// This coverage exists because every one of these behaviors was reported by the
// user rather than caught by a test: the listing looking like a toy on a phone
// (emoji instead of thumbnails, names truncated while the right half sat empty),
// a tap opening a file so that Rename/Share/Info/Delete were reachable only via
// an undiscoverable long-press, a bottom action pill on a mouse-driven desktop
// where the right-click menu belongs, and the Layout (List/Grid/Gallery) and
// Select verbs simply missing against the classic app.
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

  test('a folder still enters on the first tap', async ({ page }) => {
    await openFiles(page);
    await rowNamed(page, 'subfolder').tap();
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
});
