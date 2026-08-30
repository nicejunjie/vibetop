// @ts-check
// Layout audit for the native Files app: NOTHING may overflow its container or
// the viewport, on any surface, at any supported width.
//
// This exists because a Settings card shipped whose rows and hint text ran off
// the side of the card — content had a `min-width` larger than the card's own
// `max-width`, so the container could never contain it. The behavioural checks
// all passed: they asserted what the controls DID, never where they were. A
// geometry assertion is the only kind that catches this class of defect, and it
// catches it everywhere at once.

const { test, expect } = require('@playwright/test');

const DIR = '/tmp/vibetop-e2e-layout';
const LANES = ['desktop-chromium', 'iphone-13-mini', 'iphone-15', 'iphone-17-pro-max', 'ipad-pro-11'];

function onLanes(test) {
  test.beforeEach(({}, info) => {
    test.skip(!LANES.includes(info.project.name), 'layout audit lane');
  });
}

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seed(page) {
  await page.evaluate(async ({ dir, b64 }) => {
    const mk = (p) => fetch('/api/fs/op', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'mkdir', path: p }) });
    await mk(dir); await mk(dir + '/destination');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const put = (n, b) => fetch('/api/fs/upload?path=' + encodeURIComponent(dir + '/' + n), { method: 'POST', body: b });
    await put('picture.png', bin);
    await put('notes.txt', 'one\ntwo\nthree\n');
    // a name long enough to expose any element that sizes itself to content
    await put('a-really-quite-long-file-name-that-keeps-going-and-going.txt', 'x');
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

/**
 * Every visible element must sit inside the viewport horizontally, and inside
 * whichever ancestor is supposed to clip it. Returns a list of offenders with
 * the numbers, so a failure says WHAT stuck out and by how much.
 */
async function overflows(page, label) {
  return page.evaluate((ctx) => {
    const bad = [];
    const vw = document.documentElement.clientWidth;
    const desc = (n) => n.tagName.toLowerCase() +
      (n.id ? '#' + n.id : '') +
      (n.className && typeof n.className === 'string' && n.className.trim()
        ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

    for (const n of document.querySelectorAll('body *')) {
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Deliberately-scrolling containers own their overflow.
      const scroller = st.overflowX === 'auto' || st.overflowX === 'scroll';
      if (!scroller && (r.left < -1 || r.right > vw + 1)) {
        bad.push(`${ctx}: ${desc(n)} spans ${Math.round(r.left)}..${Math.round(r.right)} of 0..${vw}`);
        continue;
      }
      // Inside a modal card, nothing may stick out of the card either.
      const card = n.closest('.mcard');
      if (card && card !== n) {
        const cr = card.getBoundingClientRect();
        if (r.right > cr.right + 1 || r.left < cr.left - 1) {
          bad.push(`${ctx}: ${desc(n)} escapes its card (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(cr.left)}..${Math.round(cr.right)})`);
        }
      }
    }
    // The page itself must never scroll sideways.
    if (document.documentElement.scrollWidth > vw + 1) {
      bad.push(`${ctx}: the page scrolls horizontally (${document.documentElement.scrollWidth} > ${vw})`);
    }
    return bad;
  }, label);
}

test.describe('native Files — layout', () => {
  onLanes(test);

  test('no surface overflows its container or the viewport', async ({ page }, info) => {
    // The toolbar carries the same nine controls at every width, so only the
    // POINTER matters here: tap vs click, and whether the action pill exists
    // (it hides under hover+fine).
    const touch = info.project.name !== 'desktop-chromium';
    await openFiles(page);
    const found = [];
    const check = async (label) => { found.push(...await overflows(page, label)); };

    await check('listing');

    // grid and gallery
    for (const v of ['Grid', 'Gallery', 'List']) {
      await page.locator('#layoutbtn').click();
      await page.locator('.morepop button', { hasText: v }).click();
      await page.waitForTimeout(400);
      await check('layout:' + v);
    }

    // Select the row — but only if it is not already selected: on touch a
    // second tap on a SELECTED row opens it (that is the documented gesture),
    // which would put the editor over whatever we meant to click next.
    const row = page.locator('.row').filter({ hasText: 'notes.txt' }).first();
    const select = async () => {
      if (await row.evaluate((n) => n.classList.contains('sel'))) return;
      if (touch) await row.tap(); else await row.click();
      await page.waitForTimeout(300);
    };
    await select();
    await check('selection');

    // Settings — the card that shipped broken
    if (touch) await page.locator('#manage').tap();
    else await page.locator('#manage').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.sett')).toBeVisible();
    await check('settings');
    await page.locator('.mbtns button', { hasText: 'Done' }).click();
    await page.waitForTimeout(300);

    // Info
    await select();
    if (touch) await page.locator('#a-info').tap();
    else await page.keyboard.press('Control+i');
    await page.waitForTimeout(700);
    await check('info');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Move to… picker
    await select();
    if (touch) await page.locator('#a-move').tap();
    else {
      await row.click({ button: 'right' });
      await page.waitForTimeout(300);
      await page.locator('.morepop.ctx button', { hasText: 'Move to' }).click();
    }
    await page.waitForTimeout(600);
    await expect(page.locator('.pick-list')).toBeVisible();
    await check('move-picker');
    await page.locator('.mbtns button', { hasText: 'Cancel' }).click();
    await page.waitForTimeout(300);

    // search bar
    await page.locator('#searchbtn').click();
    await page.waitForTimeout(300);
    await check('search');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // editor + its find bar
    await select();
    if (touch) await page.locator('#a-open').tap();
    else await row.dblclick();
    await page.waitForSelector('#ed.open', { timeout: 10_000 });
    await page.waitForTimeout(400);
    await check('editor');
    await page.evaluate(() => document.getElementById('ed-find').hidden = false);
    await page.waitForTimeout(300);
    await check('editor-find');
    await page.evaluate(() => document.getElementById('ed-find').hidden = true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Delete does NOT raise a confirm dialog — it moves the item to Trash and
    // offers Undo in a toast. This step asserted the old dialog, so it had been
    // failing (and silently trashing its own fixture) ever since Trash landed.
    // Check the toast's geometry instead, then Undo, so the run leaves nothing
    // behind and the undo path gets exercised too.
    await select();
    if (touch) await page.locator('#a-delete').tap();
    else await page.keyboard.press('Delete');
    await page.waitForSelector('.toast', { timeout: 8000 });
    await page.waitForTimeout(300);
    await check('delete-toast');
    const undo = page.locator('.toast .toast-act', { hasText: /Undo/ }).first();
    if (await undo.count()) {
      if (touch) await undo.tap(); else await undo.click();
      await page.waitForTimeout(600);
    }

    expect(found, '\n' + found.join('\n')).toEqual([]);
  });
});
