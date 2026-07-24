// @ts-check
// Shared helpers that absorb the shell's real-world timing so tests assert
// behavior, not races.
const { expect } = require('@playwright/test');

// On a FRESH desktop with nothing open, the shell auto-opens the Start menu (after
// its desktop-state fetch resolves). A naive `#start-btn`.click() therefore races
// that auto-open and can TOGGLE the menu shut — the item you then click is hidden.
// This ensures the menu ends up open regardless of the auto-open timing.
async function isMenuOpen(page) {
  return page.locator('#startmenu').evaluate((el) => el.classList.contains('open')).catch(() => false);
}

async function openStartMenu(page) {
  await page.locator('#start-btn').waitFor({ state: 'visible' });
  await expect
    .poll(async () => {
      if (!(await isMenuOpen(page))) await page.locator('#start-btn').click().catch(() => {});
      return isMenuOpen(page);
    }, { timeout: 8000, intervals: [150, 250, 400, 600] })
    .toBe(true);
  await expect(page.locator('#startmenu')).toBeVisible();
}

// Open an app from any Start-menu section and wait until its taskbar button exists.
async function openApp(page, id) {
  await openStartMenu(page);
  await page.locator(`#startmenu .sm-item[data-id="${id}"]`).first().click();
  await expect(page.locator(`#task-apps .task-app[data-id="${id}"]`)).toBeVisible();
}

// Open an app AND wait for its iframe (and content) to be visible/active.
async function openAppFrame(page, id) {
  await openApp(page, id);
  const frame = page.locator(`#frame-${id}`);
  await expect(frame).toBeVisible({ timeout: 10_000 });
  return frame;
}

// Playwright's locator.dragTo() drives real mouse move/down/up, which does NOT
// reliably trigger HTML5 native drag-and-drop (draggable + dragstart/dragover/drop)
// in Chromium/Firefox. Dispatch the drag events explicitly with a shared
// DataTransfer and a clientX past the target's midpoint (the taskbar's dragover
// decides before/after from clientX) so the reorder actually fires.
async function html5DragReorder(page, srcSel, dstSel) {
  await page.evaluate(({ srcSel, dstSel }) => {
    const src = document.querySelector(srcSel);
    const dst = document.querySelector(dstSel);
    if (!src || !dst) throw new Error('drag src/dst not found');
    const r = dst.getBoundingClientRect();
    const x = r.left + r.width * 0.75;   // past midpoint -> insert AFTER the target
    const y = r.top + r.height / 2;
    const dt = new DataTransfer();
    const fire = (type, el, cx) => el.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: y }));
    fire('dragstart', src, r.left);
    fire('dragenter', dst, x);
    fire('dragover', dst, x);
    fire('drop', dst, x);
    fire('dragend', src, x);
  }, { srcSel, dstSel });
}

// Restrict a spec to one browser (backend/API behavior isn't a cross-browser
// rendering concern, and running it 7× wastes time + risks shared-state races).
// MUST use a beforeEach: the function-form `test.skip(fn)` is only valid inside a
// test/hook — calling it at describe scope throws (testInfo is undefined there).
function backendOnly(test, project = 'desktop-chromium') {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== project, `backend behavior — runs on ${project} only`);
  });
}

module.exports = { isMenuOpen, openStartMenu, openApp, openAppFrame, html5DragReorder, backendOnly };
