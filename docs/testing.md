# Tests

> Every tier, from `./run-tests.sh` to the e2e VM and the install matrix.
> The binding QA scope is `docs/qa-charter.md`.


> **QA scope is TWO pillars — read `docs/qa-charter.md` before any QA / review /
> e2e pass.** Correctness is necessary but NOT sufficient: every review also
> evaluates **experience** — ease of use, discoverability, feedback, consistency,
> error states, mobile ergonomics, visual polish, accessibility — from the
> perspective of a *very picky, experienced user*. A review that reports only
> correctness findings is incomplete. Automated tests + a real-app walkthrough
> (desktop **and** mobile WebKit, via the host-safe VM — `tests/e2e/`) both apply.

**One command — `./run-tests.sh`** runs the whole hermetic regression suite (no
root/systemd/nginx/Docker; external processes are stubbed): the two Python roots
(`terminal/tests/` + `claude-usage/tests/`) and every JS unit (`node --test`).
`--live` additionally runs the live-host smoke test (below). It's a **dev-only
tool** — no installer runs it and it deploys nothing; CI (`.github/workflows/
tests.yml`) and the pre-commit hook both call it, so the suites can't drift.

```bash
./run-tests.sh                 # all hermetic tiers (what CI + pre-commit run)
./run-tests.sh --live          # + tools/smoke-test.sh against 127.0.0.1
./run-tests.sh --live --base http://192.168.1.10
```

The tiers (each independently runnable, ~5s total):
- **Endpoint contracts** (`terminal/tests/test_api_*.py`) — a hermetic in-process
  HTTP harness (`conftest.py`'s `client` fixture boots `mgr.Handler` on an
  ephemeral socket with a tmp HOME + stubbed systemctl/su/git/wmctrl/libreoffice)
  asserts every `/api/*` endpoint's request→response **and** on-disk side effect:
  notes, files-tabs, desktop registry, upload, terminals, office (JWT/HMAC),
  browser/x11, claude usage+stats, update (all git branches), reset, CSRF, SSE.
- **Static/integrity** (`test_static.py`) — `py_compile` every `.py`, `bash -n` +
  `shellcheck -S error` every `.sh`, the `@PLACEHOLDER@`-stamping invariant, sw.js
  PRECACHE-source existence, and HTML asset-ref resolution.
- **claude-usage proxy** (`claude-usage/tests/`) — header capture (`_record`),
  fail-open relay, atomic write; importlib-loads the hyphenated proxy.
- **JavaScript** (`node --test`) — service-worker routing (`sw.test.js`), tab-set
  reconcile (`tab-sync.test.js`), coach-tip state machine (`coach.test.js`), the
  terminal-kbd key-byte map (`terminal-kbd.test.js`), window-mode geometry
  (`winmgr.test.js` — clamp/resize/cascade/snap/`tileGrid`), the Iron Frontier
  rules + balance audit (`rts.test.js`), and a syntax guard that
  `vm.Script`-compiles every injected/deployed script (`js-syntax.test.js`).

  **`rts.test.js` has an opt-in slow tier.** Its five match-playing tests (seed
  determinism, economy growth, decisiveness, the difficulty ladder, stuck-unit
  sampling) each run a full headless AI-vs-AI game and are skipped unless
  `RTS_SLOW=1` is set — they took the default run to 4m40s, which every commit
  in the repo would have paid for (see `docs/design-decisions.md`). Run them
  before shipping a change to the AI, the pathing or the unit tables:

  ```bash
  RTS_SLOW=1 node --test landing/games/rts/rts.test.js       # the full tier, minutes
  ```

**Live-host smoke test** — `tools/smoke-test.sh` is the ONE tier needing the
running stack; it turns the Health-check curls below into asserting checks with a
pass/fail summary + non-zero exit (systemd units active, `/`/`/tN/`/`/browser/`/
`/files/` 200, `/api/ping`, SSE `retry:`, OnlyOffice). Run it post-deploy; **not**
in CI. `--no-office` / `--base URL` / `--cookie` / `--user`.

> **Run it with `sudo`.** On a multi-user host every surface is behind
> `auth_request`, so an unauthenticated probe gets 302/401 and *every* check fails
> on a perfectly healthy host. The script detects the gate (unauthenticated `GET /`
> redirects), mints a real `vt_session` via `tools/mint-session-cookie.py` — which
> needs root to read `/etc/vibetop/session.secret` — and **validates it against
> `/api/authcheck` before trusting it**. That validation is not optional paranoia:
> `_session_secret()` falls back to an *ephemeral in-memory key* when it can't read
> the secret file, so a non-root mint returns a well-formed, correctly-prefixed
> token signed with the wrong key (see `docs/design-decisions.md`). With no valid
> cookie the surface/API checks are **skipped** and the script exits **2 =
> INCONCLUSIVE** — never 0, so a deploy gate can't read "couldn't test" as "fine".
> The shared `vibetop-{browser-xpra,x11-xpra,filebrowser}` units are the **legacy
> single-user** services: on a gated host they're reported SKIP (per-user transient
> units replace them, and with nobody signed in zero of those running is also
> correct) — the authenticated HTTP probes are the real per-user health check,
> since they cold-start the service and then assert it serves. **Side effect:**
> because they cold-start, running the script starts the probe user's terminal /
> Browser / X11 / FileBrowser if they're down — it is not read-only on a live host.

**Python** — unit/smoke tests for the manager's security-critical and pure logic
live in `terminal/tests/` (pytest). They run without root or any of the systemd/
nginx/Docker stack — `conftest.py` loads the hyphenated `terminal-manager.py` via
`importlib` and puts `terminal/` on `sys.path` so its `import system_status`
resolves:

```bash
cd terminal && python -m pytest tests/ -q                              # all Python tests
cd terminal && python -m pytest tests/test_auth.py -q                  # one file
cd terminal && python -m pytest tests/test_auth.py::test_session_tamper_rejected -q   # one test
cd terminal && python -m pytest tests/ -q -k tamper                    # by name substring
```

Coverage targets the things where a silent regression is dangerous: the
shell-injection guard (`_valid_browser_url`), path-traversal guard
(`_resolve_under_home`/`OFFICE_RE`), hand-rolled JWT/HMAC (`_jwt_*`,
`_onlyoffice_sig`, incl. an `alg:none` forgery test), the streaming multipart
parser, upload-name sanitization, atomic writes, the **cross-instance desktop
state machine** (`test_desktop.py` — `_desktop_union`/`_desktop_prune_targets`/
`_desktop_cap` TTL + close-target math), the **`/api/ping` + `/api/metrics`**
counters (`test_metrics.py` boots the server in-thread over a real socket), the
**ring-buffer replay sanitization** (`test_claude_session.py` —
`strip_terminal_queries` drops stale DA/CPR/color/mode *probes* from a reconnect
replay so they aren't re-answered into the prompt, while preserving real screen
state), the `system_status` collector, and the **Claude-usage settings surgery**
(`test_claude_usage.py` — `_set_claude_usage_env` preserves the user's other
settings and only removes *our* `ANTHROPIC_BASE_URL` on disable; the toggle never
runs `--now` on disable so a pinned session's proxy isn't stopped), and the
**service-discovery parser** (`test_service_discovery.py` — `parse_ss` non-loopback
extraction, `classify` port/proc denylists, and `_effective_proc` unmasking a
daemon that listens under a generic `python3`), and the **auth/session/PAM gate**
(`test_auth.py` — `_sign_session`/`_verify_session` round-trip + tamper/expiry/junk/
bad-username-claim rejection, `/api/login` cookie issuance incl. `Secure`-on-https and
lockout, and `/api/authcheck` 401-without-cookie / 200-with-`X-Vibetop-User`; PAM is
stubbed at the `_authenticate` seam), the **per-user X11 D-Bus + terminal-bus wiring**
(`test_api_browser_x.py` — `_is_snap_launch` detection, a GNOME `x/launch` uses the
private activation-free bus while a snap keeps the real bus; `test_auth.py` — the
terminal env points `DBUS_SESSION_BUS_ADDRESS` at the private bus, real-bus fallback),
the **stale-port self-heal** (`test_multiuser.py` — an `active` xpra/FileBrowser on the
wrong port is stopped + recreated, a healthy one on the right port is reused), and the
**XML-config integrity** (`test_static.py` — every busconfig-style `.conf` is well-formed,
and the private-bus template renders to valid dbus XML with `<listen>`/`<type>` and no
`<servicedir>` — the two bugs that once made the private bus silently dead). Prefer
adding a test here when touching any. **Real-stack regression guards** (browser/X11,
run in the host-safe VM — `tests/e2e/`): `surface-health.spec.js` (every per-user app
serves 200, the 502 class), `x11-lifecycle.spec.js` (GUI-app launch is fast; closing
the launcher closes its apps), and `layout.spec.js` (every static page at 320/390/430
and in a squat window: nothing outside the viewport whose nearest scrollable ancestor
is *nothing* — the class that produced the Token Stats label running off the page and
Upload's invisible file input dragging a scrollbar behind it).

**JavaScript** — the fragile front-end logic that kept regressing is now DOM-free
and unit-tested with node's built-in runner (no deps):

```bash
node --test landing/*.test.js terminal/lib/*.test.js   # all JS units
node --test landing/shell/coach.test.js                      # one file
```

**Pass FILES, not directories.** `node --test landing/` worked on older Node but
on Node ≥ 22 the directory argument is resolved as a *module* and the run fails
with `Cannot find module …/landing` — which looks like a test failure. `run-tests.sh`
is unaffected (it discovers `*.test.js` itself), so trust it over an ad-hoc invocation.

**The two heavyweight tiers** — neither runs in CI or `run-tests.sh`; both boot
real VMs, so reach for them deliberately (minutes to an hour, not seconds):

```bash
tests/e2e/run-vm.sh                              # real-app click-through in a KVM VM
tests/e2e/run-vm.sh --keep                       # leave the VM up to poke at it
tests/e2e/run-vm.sh -- --project=mobile-webkit   # one Playwright project (iOS fidelity)
VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh        # install matrix, all supported distros
VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh ubuntu-24.04 rocky-9   # selected rows
VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh --all -j3              # 3 rows at a time (~8GB RAM each)
```

Two rules that are not preferences:
- **`tests/e2e/run.sh` is the container path — do NOT use it.** It runs systemd as
  PID 1 in a `--privileged` container sharing the host kernel; it once forced a
  reboot of `z20`. `run-vm.sh` (its own kernel) is the host-safe default.
- **Always run the matrix with `VIBETOP_MATRIX_FULL=1`.** The lean default skips
  the browser/xpra + OnlyOffice stack — i.e. the heavy, most breakage-prone half —
  so a green lean run proves much less than it looks like it does.

`terminal/lib/tab-sync.js` is the pure tab-set reconcile/`nextAvailable` math
lifted out of `terminals.html` (which loads it via `<script src>`, content-hash
cache-busted by `install.sh` like `terminal-kbd.js`) — its tests pin the
open/close/poll-lag race cases behind the v1.9.x churn. `landing/shell/sw.test.js`
parses the **live** `BYPASS` regex + `PRECACHE` out of `sw.js` (so it tracks the
real source, no drift) and asserts every path classifies correctly: bypass vs.
cacheable-shell-nav vs. network-only-nav vs. SWR sub-resource.

A focused **security review** of the manager's auth paths (no vulns found — the
trust model is the takeaway) is in `docs/security-review.md`.

**CI + pre-commit** — `.github/workflows/tests.yml` runs `./run-tests.sh` on every
push/PR (no services/root: the Python tests load the manager/proxy in-process with
external processes stubbed; the JS tests are dep-free; shellcheck is installed for
the static tier). A versioned pre-commit hook (`.githooks/pre-commit`) runs the
**same** `./run-tests.sh` locally — enable it once per clone:

```bash
git config core.hooksPath .githooks      # then commits run ./run-tests.sh
```

Bypass a single commit with `git commit --no-verify` or `SKIP_TESTS=1 git commit`;
each runner self-skips if its tool isn't installed.

## Mobile key-bar / prompt-occlusion repro (`tests/kbd/keybar-occlusion.mjs`)

Not part of `./run-tests.sh` — it needs a **live host** and a session cookie. It
rebuilds the geometry measured off a real iPhone (terminal frame `0..574`,
`#sys-keybar` `521..571`, keyboard from `638`), drives a **throwaway** terminal
(t41, never one of the user's) through it in Playwright WebKit, and asserts the
active line clears the bar *and stays clear through TUI repaints* — the exact
thing that regressed repeatedly.

```bash
VT_COOKIE=$(sudo tools/mint-session-cookie.py junjie) node tests/kbd/keybar-occlusion.mjs
curl -X POST -H "Cookie: vt_session=$VT_COOKIE" http://127.0.0.1/api/terminals/41/stop
```

It injects `terminal/terminal-kbd.js` from the **working tree** via `page.route`,
so you can iterate without deploying. Drop that route to watch it fail the way the
bug did.
