// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// The target is a RUNNING vibetop instance (the disposable Docker instance built
// by ./docker, or any reachable host). Everything is driven over its real origin,
// so nginx + the manager + ttyd + FileBrowser are all in the loop.
const BASE_URL = process.env.VIBETOP_BASE_URL || 'http://localhost:8080';

module.exports = defineConfig({
  testDir: './tests',
  // global-setup mints a vt_session cookie once and writes storageState so every
  // test starts already logged in (past PAM/Access). Tests that need to be
  // anonymous opt out with `test.use({ storageState: { cookies: [], origins: [] } })`.
  globalSetup: require.resolve('./global-setup'),
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // The suite runs against ONE instance with ONE shared user (e2e), and vibetop
  // state (notes, desktop layout) is server-side + shared. Run serially so tests
  // don't clobber each other's shared state (parallel projects were all writing
  // the same note and reading back the last writer's value).
  fullyParallel: false,
  workers: 1,
  // Real-stack e2e against a live VM is mildly flake-prone (render jank under
  // sustained load) — one retry locally, more in CI. A genuine failure fails all
  // retries; a render-race passes on the retry.
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    storageState: '.auth/state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The desktop shell pins user-scalable=no and uses cross-iframe clipboard.
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    // iPhone lineup on the REAL WebKit engine — the iOS-fidelity lane. Chromium
    // mobile emulation misrepresents iOS (svh freeze, visualViewport keyboard, PWA
    // cookie jar), so iOS coverage rides on these WebKit profiles. Widths span the
    // range that flexes the mobile CSS: 375 (narrowest, where cramped-layout bugs
    // surface first) → 393 → 402 (new base) → 440 (largest). Descriptors are
    // Playwright built-ins, so viewport/DPR/UA track the real devices.
    { name: 'iphone-13-mini',    use: { ...devices['iPhone 13 Mini'] } },   // 375w — narrow edge
    { name: 'iphone-15',         use: { ...devices['iPhone 15'] } },        // 393w
    { name: 'iphone-17',         use: { ...devices['iPhone 17'] } },        // 402w — current base
    { name: 'iphone-17-pro-max', use: { ...devices['iPhone 17 Pro Max'] } }, // 440w — largest
    { name: 'mobile-chrome',     use: { ...devices['Pixel 7'] } },          // Android/Chromium
  ],
});
