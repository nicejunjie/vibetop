const { test, expect } = require('@playwright/test');

// Exercise the actual shell CSS and renderer on every desktop/mobile engine.
// Synthetic hardware makes one/two-card transitions repeatable in a lean VM.
test('GPU rows adapt without growing the taskbar or overflowing the tray', async ({ page }) => {
  let system = { cpu_percent: 24, cpu_temp: 61, memory_used_gb: 32, memory_total_gb: 64,
    gpus: [
      { id: '0000:03:00.0', name: 'GPU A', integrated: false, percent: 82, temp: 74, vram_used_gb: 18, vram_total_gb: 24 },
      { id: '0000:07:00.0', name: 'GPU B', integrated: false, percent: 36, temp: 58, vram_used_gb: 9, vram_total_gb: 24 },
    ] };
  const all = system.gpus;
  // Preserve the real session/layout response, changing only read-only metrics.
  await page.route('**/api/desktop*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const data = await response.json();
    return route.fulfill({ response, json: { ...data, system } });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.VibeSystemTray);
  let singleWidth;
  for (const count of [1, 2, 1]) {
    system = { ...system, gpus: all.slice(0, count) };
    await page.evaluate(data => {
      document.querySelector('.tb-stats').style.display = '';
      window.VibeSystemTray.render(data, document);
    }, system);
    const geometry = await page.locator('.tb-stats').evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return {
        height: bounds.height, width: bounds.width, font: getComputedStyle(el).fontSize,
        taskbar: document.querySelector('.taskbar').getBoundingClientRect().height,
        children: [...el.children].map(child => {
          const b = child.getBoundingClientRect();
          return { top: b.top - bounds.top, bottom: b.bottom - bounds.top };
        }),
      };
    });
    expect(geometry.height).toBe(38);
    expect(geometry.taskbar).toBe(54);
    expect(geometry.font).toBe('11px');
    expect(geometry.children).toHaveLength((count + 1) * 8);
    for (const child of geometry.children) {
      expect(child.top).toBeGreaterThanOrEqual(0);
      expect(child.bottom).toBeLessThanOrEqual(38);
    }
    if (count === 1) singleWidth = geometry.width;
    else expect(geometry.width).toBeLessThanOrEqual(singleWidth + 8);
    await expect(page.locator('#tray-gpu-0-label')).toHaveText(count === 1 ? 'GPU' : 'GPU1');
    if (count === 2) {
      await expect(page.locator('#tray-gpu-1-label')).toHaveText('GPU2');
      await expect(page.locator('#tray-gpu-1-vram')).toHaveText('9/24');
    } else await expect(page.locator('#tray-gpu-1-label')).toHaveCount(0);
  }
});
