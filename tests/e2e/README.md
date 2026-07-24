# vibetop end-to-end tests (Playwright)

Real click-through of the desktop shell across **desktop + mobile**, on all three
browser engines — including a true **WebKit** lane for iOS fidelity.

## One command — the host-SAFE default (KVM VM)

```bash
tests/e2e/run-vm.sh
```

This boots a **real KVM VM** (libvirt/vagrant), deploys the stack inside it
(`deploy.sh --no-browser --no-office` → nginx + manager + ttyd + FileBrowser),
mints a session cookie **inside** the VM, runs Playwright against
`http://localhost:8091` (the VM's forwarded port 80), then destroys the VM.

**Use this.** A VM has its own kernel and cgroup tree, so it is fully isolated —
it **cannot hang or panic the host**. Requires libvirt/KVM + vagrant +
`vagrant-libvirt`, and the invoking user in the `libvirt` group (no sudo). First
run downloads the Ubuntu box (~1 GB) and the Playwright browsers.

Flags: `--keep` (leave the VM up), `--up-only`, `-- <playwright args>`
(e.g. `tests/e2e/run-vm.sh -- --project=mobile-webkit`).

> ### ⚠️ The container path (`run.sh`) is UNSAFE on a machine you care about
> `run.sh` runs **systemd as PID 1 in a `--privileged` container**, which shares the
> host kernel and can destabilize the host's systemd/cgroup tree and **hang or crash
> the whole machine** (it did once — a privileged container forced a reboot into an
> already-broken auto-upgraded kernel). It now **refuses to start** if it detects a
> running `vibetop-manager`, and drops the `--cgroupns=host` + rw host-cgroup mount
> that caused the crash — but **prefer `run-vm.sh`**. Only reach for `run.sh` on a
> genuinely throwaway host with no real vibetop install (CI runner, scratch VM).

## How it works

- **Target = a real instance.** Everything is driven over the instance's real
  origin, so nginx, the manager, the auth gate, ttyd and FileBrowser are all in the
  loop. `deploy.sh` stamps the shell placeholders (`@VERSION@`, `@APP_HOME@`, …) and
  generates the nginx `sub_filter` config — which is exactly why we test against a
  deployed instance and not a hand-served copy (that would diverge).
- **Past the login without a human.** `tools/mint-session-cookie.py` reuses the
  manager's own `_sign_session`, so it produces a real HS256 `vt_session` cookie the
  server accepts identically to a PAM login. `global-setup.js` writes it into
  Playwright `storageState`, so every test starts authenticated. Tests that need to
  be anonymous opt out with `test.use({ storageState: { cookies: [], origins: [] } })`.
- **Projects** (`playwright.config.js`): `desktop-chromium`, `desktop-firefox`,
  four iPhone profiles on the **real WebKit engine** (the iOS-fidelity lane) —
  `iphone-13-mini` (375w), `iphone-15` (393w), `iphone-17` (402w),
  `iphone-17-pro-max` (440w) — and `mobile-chrome` (Pixel 7, Android). Run just the
  mobile lane with `npm run test:mobile`.

## Running against an existing instance

Point at any reachable vibetop and supply a cookie (mint it where the session
secret lives):

```bash
export VIBETOP_BASE_URL=http://192.168.1.10
export VIBETOP_E2E_COOKIE="$(ssh host sudo python3 /opt/vibetop/app/tools/mint-session-cookie.py e2e --value-only)"
cd tests/e2e && npm install && npx playwright install chromium firefox webkit && npx playwright test
```

⚠️ **Do not** point the suite at a shared production host you care about: some flows
mutate per-user state, and **driving the embedded Browser (xpra) app wedges the
shared display for real users** — so the canvas apps are tested at the API/postMessage
seam only, never by pixel-clicking the remote canvas. Use the disposable container.

## What's covered vs. what still needs a real device

- ✅ **Shell UI** (desktop + mobile layout/gesture logic): Start menu, taskbar
  open/close/**reorder**, Notes create/type/**autosave-through-reload**, the auth
  gate, `/api/me`. This is where regressions kept slipping past unit tests.
- ⚠️ **Canvas apps** (Browser/xpra, terminal rendering): asserted at the
  API/postMessage boundary (did `/api/browser/open` fire, did the frame switch), not
  by pixels.
- ⚠️ **True iOS Safari** (svh freeze, visualViewport keyboard, standalone-PWA cookie
  jar): emulated WebKit gets close but is **not** iOS Safari. Keep a real iPhone on
  the LAN (or BrowserStack) as the final sign-off lane for those specific bugs — the
  class of bug that has bitten this project before.

## Files

| File | Purpose |
|---|---|
| `playwright.config.js` | projects (4), baseURL, storageState wiring |
| `global-setup.js` | obtains the cookie, writes `storageState` |
| `tests/smoke.spec.js` | first suite (shell UI, desktop + mobile) |
| `run.sh` | build container → deploy → mint cookie → run → teardown |
| `docker/` | the disposable systemd instance (Dockerfile + firstboot) |
| `../../tools/mint-session-cookie.py` | signs a real `vt_session` (single source of truth) |
