# Vibetop Codebase Audit Report

**Date:** 2026-09-04  
**Revision reviewed:** `cf8ea8f` (`main`), plus the working-tree version/service-worker bumps present during the audit  
**Scope:** application code, privileged manager/API, installers and lifecycle tools, browser UI, tests, CI, and project documentation

## Executive summary

The repository has unusually broad hermetic coverage for a dependency-light project: **1,143 tests passed and 10 intentionally skipped**. The code contains many explicit security boundaries and regression comments, and no test or syntax failure was found.

The green suite does not cover several important operational and adversarial paths. The most important findings are:

1. The documented top-level uninstall does not uninstall the current `/opt/vibetop` multi-user deployment and leaves per-user transient services running.
2. The backup utility gives incomplete recovery coverage on the current architecture, omitting other users and host-global state that it claims to protect.
3. A holder of a public folder-share URL can force repeated, concurrent ZIP creation—including on `HEAD`—with no aggregate resource limit.
4. The public login path has a targeted account-lockout weakness and an unbounded username-spray state/CPU path.

No source fixes were made as part of this diagnosis. Only this report was added.

## Resolution (2026-09-04)

Every finding was verified against the source before being acted on — the
citations all check out, and the report's hit rate was high. Thirteen of the
fourteen are fixed across three commits; each fix was proved by reverting it and
watching its own tests fail first.

| ID | Status | Commit |
|---|---|---|
| VT-01 uninstall | **fixed** — web root read from nginx, `vt_is_web_root` guards the delete, transient units stopped, unit files globbed | `e4230fb` |
| VT-02 backup | **fixed** — all users + global state, versioned MANIFEST, timer runs as root | `e4230fb` |
| VT-03 share ZIP | **fixed** — HEAD builds nothing; global + per-token slot, 503 + Retry-After; nginx `limit_req`/`limit_conn` on `/s/` | `f92c67f` |
| VT-04 login | **fixed** — validate before recording, per-account saturating *delay* (never a lock), per-source refusal, hard-capped LRU books | `f92c67f` |
| VT-05 headers | **fixed** — one `_content_disposition()`; a test asserts none is hand-built | `f92c67f` |
| VT-06 matrix logs | **fixed** — split `local`; the tree is clean at `shellcheck -S warning` and gated there | `e4230fb` |
| VT-07 upload | **fixed** — `rel_to_home` measured against the request user's home | `e4230fb` |
| VT-08 office | **fixed** — `_stream_file()` in 64 KiB chunks | `f92c67f` |
| VT-09 dialogs | **fixed** — aria-modal + names, `inert` background, focus trap + restoration, reduced-motion; Config's own prompt too | `33600c9` |
| VT-10 read limit | **fixed** — both bounds clamped before the open | `f92c67f` |
| VT-11 symlink repair | **fixed** — `lexists`/`lstat`, explicit unlink, `fchmod`/`fchown` via `O_NOFOLLOW` | `f92c67f` |
| VT-12 polling | **fixed** — shell is the only embedded poller; standalone pauses when hidden | `33600c9` |
| VT-13 dead code | **fixed** — all eight removed | `e4230fb` |
| VT-14 tool pinning | **not done** — deliberate. On a repo this size, pinning action SHAs and an E2E lockfile costs more in update churn than the reproducibility is worth. Revisit if CI starts breaking without a repository change. |

Two problems the audit did not find, caught while fixing VT-01:

- `vibetop-backup.timer` and `vibetop-claude-proxy.socket` survived every
  uninstall — the removal list was hand-written and neither was ever added to
  it. The fix is to glob the unit files, not to lengthen the list.
- `test_login_lockout_after_repeated_failures` **asserted** the VT-04 weakness by
  name: that after N failures the correct password was refused with 429. A test
  can certify a bug; see "Five tests certified the bugs they guarded" in
  `design-decisions.md`.

Severity note: VT-03 and VT-04 are framed for mutually untrusted local tenants,
which this deployment is not — the users are a household behind Cloudflare
Access. Both are real and both are fixed, but neither is High here. VT-07 was
arguably *under*-rated: it was the only finding visibly broken on every install
at the time of writing.

## Findings at a glance

| ID | Severity | Area | Finding |
|---|---|---|---|
| VT-01 | High | Operations | Uninstall scripts are stale after the `/opt` and per-user-service migration |
| VT-02 | High | Data protection | Backups omit multi-user and host-global state |
| VT-03 | High | Availability | Public folder shares allow unbounded concurrent ZIP work; `HEAD` builds the whole ZIP |
| VT-04 | Medium | Authentication | Login throttling permits victim lockout and unbounded username-spray bookkeeping |
| VT-05 | Medium | HTTP security | Some download filenames can inject response-header lines |
| VT-06 | Medium | Test infrastructure | Every distro-matrix row writes to the same `.log` file |
| VT-07 | Medium | Multi-user UX | Upload's “Open in Files” action is disabled for normal multi-user sessions |
| VT-08 | Medium | Availability | Office downloads buffer entire files in the privileged shared manager |
| VT-09 | Medium | Accessibility | Shared and Config dialogs are not fully modal or screen-reader-labelled |
| VT-10 | Low | Input bounds | A negative native-file read limit bypasses the intended 1 MiB cap |
| VT-11 | Low | Filesystem hardening | File-agent directory repair follows a symlink it says it will replace |
| VT-12 | Low | Performance | Services discovery is polled twice while active and continues while backgrounded |
| VT-13 | Low | Maintainability | Verified dead code and an obsolete nginx terminal map remain |
| VT-14 | Low | Reproducibility | E2E/CI tool versions are not locked |

## Detailed findings

### VT-01 — High — Uninstall scripts do not remove the current deployment

**Evidence**

- The canonical system layout defines the web root as `/opt/vibetop/vibetop-www` (`tools/lib/layout.sh:19-24`), and `docs/deploy.md:38-41,77-83` documents `sudo ./uninstall.sh` as removing the whole runtime and web root.
- The top-level uninstaller instead derives `APP_USER` from `SUDO_USER` and removes `$APP_HOME/vibetop-www` (`uninstall.sh:13-18,56-62`). A normal `sudo ./uninstall.sh` therefore targets the invoking human's legacy home, not `/opt/vibetop/vibetop-www`.
- It stops only legacy/static units (`uninstall.sh:25-37`). Current units are transient and named `vibetop-uterm-*`, `vibetop-uttyd-*`, `vibetop-fileagent-*`, `vibetop-ufiles-*`, `vibetop-ubrowser-*`, `vibetop-ux11-*`, and `vibetop-ux11dbus-*` (`server/terminal-manager.py:1704-1710,1951-1952,2103-2104,2225-2227,2330-2331`).
- `server/uninstall.sh:11-12,33-44,57-62` and `apps/everyday/browser/uninstall.sh:18-49` have the same legacy-layout assumptions.
- The current services are independent `systemd-run --collect` units, with no `PartOf=vibetop-manager` relationship. Stopping the manager does not stop them.

**Impact**

The command reports success while the active web tree remains on disk and user ttyd, shell, FileBrowser, Xpra, Chromium, X11, D-Bus, and file-agent processes may continue running. That can leave ports, memory, user processes, and runtime sockets behind after an operator believes the service is gone.

**Recommendation**

- Make the top-level uninstaller use `tools/lib/layout.sh` and explicitly detect system-layout versus supported legacy-layout targets.
- Enumerate loaded units by the exact current prefixes, stop them before removing the manager/nginx configuration, and clean the relevant `/run/vibetop` and terminal socket state.
- Validate the resolved deletion target before recursive removal; do not infer a production web root from `SUDO_USER`.
- Make sub-uninstallers either multi-user aware or explicitly reject the system layout and direct operators to the top-level tool.
- Add a dry-run/static integration test whose fixture contains both a human home and `/opt/vibetop`, plus representative transient-unit names.

### VT-02 — High — Backup/restore omits current multi-user and global state

**Evidence**

- `tools/backup.sh:3-8` says it archives the “irreplaceable, host-local user data/state,” while `docs/operations.md:51-56` says this is the state a disk loss would take.
- The script selects exactly one home from `APP_USER`/`SUDO_USER` (`tools/backup.sh:33-36`) and archives a fixed list beneath that home (`tools/backup.sh:54-66`). It cannot capture other Vibetop users.
- Current user state is intentionally stored under each request user's home (`server/terminal-manager.py:276-302,353-376`).
- Important host-global state is elsewhere and absent from the archive:
  - user slot allocation and session-revocation epochs: `/var/lib/vibetop/users.json` (`server/terminal-manager.py:1039`);
  - resource, idle, and hints policies: `/var/lib/vibetop/{resources,idle,hints}.json` (`server/terminal-manager.py:1071,1262,1305`);
  - scheduled terminal messages: `/var/lib/vibetop/schedules.json` (`server/terminal-manager.py:2771`);
  - production OnlyOffice/session secrets under `/opt/vibetop/etc` via `/etc/vibetop/manager.env` (`tools/lib/layout.sh:23-25,64-71`);
  - public-share registry and update history under the no-login service account's home (`server/terminal-manager.py:412,428`).
- The restore completion message still recommends restarting the removed shared `vibetop-filebrowser` unit (`tools/backup.sh:78-88`).

**Impact**

An operator can have successful daily archives yet lose other users' notes, desktop state, documents, FileBrowser state, scheduled messages, share registry, policies, and production secrets during recovery. This is a false-confidence/data-loss issue rather than a cosmetic documentation mismatch.

**Recommendation**

- Define a versioned backup manifest for system layout: selected/all real user homes, `/var/lib/vibetop`, required `/opt/vibetop/etc` secrets, and service-account global state.
- Run the system-wide backup with enough privilege to read all selected state while preserving ownership and restrictive modes in the archive.
- Make single-user versus all-user behavior explicit in the CLI and filename/manifest.
- Test a fixture containing two user homes plus global state, then perform a restore into a clean tree and compare content, ownership, and permissions.

### VT-03 — High — Public folder ZIP generation has no aggregate work limit

**Evidence**

- `/s/<token>` is deliberately unauthenticated (`server/install.sh:477-490`; `server/terminal-manager.py:6795-6801`). Possession of the capability URL is the only prerequisite.
- Every directory request calls `_serve_share_zip` (`server/terminal-manager.py:6819-6827`). That function creates a new temporary ZIP, walks the tree, and compresses every accepted file before sending headers (`server/terminal-manager.py:6884-6933`).
- A `HEAD` request follows the same expensive path and checks `self.command` only after ZIP creation is complete (`server/terminal-manager.py:6933-6935,6952-6955`).
- Per-request limits allow up to 50,000 files and 10 GiB of input (`server/terminal-manager.py:438-442,6916-6919`), but there is no per-token or global concurrency limit/cache.
- The manager uses `ThreadingHTTPServer` with no general connection limit (`server/terminal-manager.py:7456-7457`). The code already recognizes that property and separately caps SSE clients (`server/terminal-manager.py:7228-7248`), but the ZIP path has no equivalent guard. The generated nginx configuration has no `limit_req` or `limit_conn` policy.

**Impact**

Any recipient of a legitimate folder-share link can issue concurrent `GET` or cheap-looking `HEAD` requests that multiply compression CPU, temporary-disk use, filesystem traversal, and manager threads. Since the privileged manager is shared by all users, one shared link can degrade or exhaust the whole service.

**Recommendation**

- Do not build an archive for `HEAD`; either reject it, return metadata without a computed length, or use a previously cached artifact.
- Bound folder-archive work with a global and per-token semaphore, a short-lived cache keyed by token/tree version, and a clear `429/503 Retry-After` response.
- Add nginx request/connection limits for `/s/` and consider substantially lower configurable defaults.
- Add concurrent-request tests that assert one build, bounded rejection, prompt `HEAD`, and cleanup after failures/client disconnects.

### VT-04 — Medium — Login throttling is vulnerable to lockout and username spray

**Evidence**

- The login endpoint is public by design (`server/tests/test_auth.py:222-228`; `server/install.sh:454-467`).
- Failures are tracked only by the submitted username (`server/terminal-manager.py:3355-3385`). Ten failed attempts lock that name for five minutes, including a later correct password (`server/terminal-manager.py:4107-4123`). This permits targeted denial of login for any known account.
- `_login_locked(user)` runs before username validation and inserts an empty entry for every submitted string (`server/terminal-manager.py:3369-3374,4103-4114`). The body is bounded, but the username itself has no early length/format limit.
- The apparent 10,000-entry bound only removes expired entries (`server/terminal-manager.py:3383-3385`). During a sustained spray where all entries are recent, the map continues growing; every request after the threshold scans the whole map.
- The 0.5-second delay occupies one unbounded HTTP handler thread. Parallel requests defeat it as a rate limit and can consume threads.

**Impact**

A LAN peer or already-authorized tunnel user can lock another user out. A sufficiently parallel spray of unique invalid names can grow memory, introduce repeated O(n) cleanup scans, occupy PAM/handler threads, and reduce availability. The trusted-LAN/Cloudflare deployment model narrows exposure but does not protect mutually untrusted local tenants.

**Recommendation**

- Validate and tightly bound the username before any state insertion.
- Use a hard-bounded TTL/LRU structure and combine per-account, per-source, and global token buckets.
- Bound concurrent PAM calls and add nginx `limit_req`/`limit_conn` protection for `/api/login`.
- Prefer source-based backoff/challenges over an account-only hard lock that any attacker can trigger.
- Add parallel spray, map-bound, eviction, and victim-login regression tests.

### VT-05 — Medium — Raw filenames can split response headers

**Evidence**

- Office download responses interpolate the filesystem basename into a quoted `filename=` value after removing only double quotes (`server/terminal-manager.py:6039-6050`).
- Public file and folder shares do the same with a name derived directly from the target basename (`server/terminal-manager.py:6717-6726,6863-6866,6925-6931`). Linux filenames may contain carriage returns and newlines.
- Python's `BaseHTTPRequestHandler.send_header` does not reject control characters; a local reproduction produced:

  ```text
  b'Content-Disposition: attachment; filename="report\r\nX-Audit: injected"\r\n'
  ```

- Other native download paths already avoid this problem by emitting only a percent-encoded `filename*=` value (`server/terminal-manager.py:5654-5656,5782-5784`).

**Impact**

A crafted filename can make the manager emit additional response-header lines. On the public-share path an authenticated user can mint a capability URL that exposes the malformed response to other clients. Nginx may reject the upstream response or may parse the injected line as a header; either outcome is attacker-controlled response corruption, with behavior dependent on proxy/version.

**Recommendation**

- Centralize `Content-Disposition` construction.
- Use an ASCII fallback with all control/separator characters removed or replaced, plus a correctly percent-encoded RFC 5987 `filename*` value. The safest existing pattern is to omit the raw fallback entirely where compatibility permits.
- Add CR, LF, quote, semicolon, Unicode, and very-long-name tests for office, public file share, and public folder share responses.

### VT-06 — Medium — Distro-matrix logs collide

**Evidence**

- `tests/matrix/run.sh:89` declares `name` and `log="$LOGDIR/$name.log"` in the same `local` command. Bash expands the right-hand sides before the new local `name` assignment takes effect.
- A direct semantics check returned `name=ubuntu-24.04 log=/tmp/.log`.
- Therefore every row truncates and appends to `tests/matrix/logs/.log` (`tests/matrix/run.sh:94,104`). Serial runs retain only the last row's diagnostic log. Parallel `-j` runs interleave and truncate one shared file, while each row also greps that shared file to determine its result.
- ShellCheck reports this as `SC2318`, but the repository gate runs ShellCheck at `-S error` only (`server/tests/test_static.py:132-143`), so the warning is not actionable in CI.

**Impact**

The advertised parallel matrix can misattribute another distro's PASS/FAIL lines, and all modes lose per-distro diagnostics. This undermines the project's primary proof that installation works across six supported distributions.

**Recommendation**

- Split the declarations: assign `name`, `box`, and `tier` first; then assign `log` in a second command.
- Add a fast harness test that invokes the naming/result logic without Vagrant and asserts unique paths under `-j`.
- Promote correctness-oriented ShellCheck warnings such as `SC2318` to failures while continuing to allow explicitly reviewed style warnings.

### VT-07 — Medium — Upload cannot open the default folder in Files on multi-user installs

**Evidence**

- The default upload directory correctly follows the authenticated request user's home (`server/terminal-manager.py:416-419`).
- `/api/upload/list` computes `rel_to_home` against `~APP_USER`, the no-login service account's `/opt/vibetop` home, instead of `_ctx_home()` (`server/terminal-manager.py:7164-7183`). For a user such as Alice, `/home/alice/Uploads` is not under `/opt/vibetop`, so the response is `null`.
- The Upload UI disables “Open in Files” whenever `rel_to_home` is absent (`apps/everyday/upload/upload.html:380-397`).
- The multi-user test verifies file isolation but never asserts `rel_to_home` (`server/tests/test_multiuser.py:79-97`).

**Impact**

The button is disabled for every normal user on the documented production layout, even though the default upload directory is valid and visible in that user's Files app.

**Recommendation**

Compute the path against the request user's canonical home using `realpath`/`commonpath`, returning a relative path only when the upload directory is inside that home. Preserve `null` for an intentionally external `UPLOAD_DIR`. Add Alice/Bob API tests and one UI test for the button/message.

### VT-08 — Medium — Office downloads buffer entire files in manager memory

**Evidence**

- `_handle_office_doc` reads the entire requested file into `body` before writing it (`server/terminal-manager.py:6001-6024`).
- `_handle_office_download` does the same (`server/terminal-manager.py:6026-6055`).
- The file needs only an accepted office extension; there is no file-size bound. A user with a terminal can create an arbitrarily large file with that extension.
- The manager is a single privileged, multi-user service. Several concurrent requests multiply memory use. The share and media implementations already contain chunked streaming patterns that can be reused.

**Impact**

A large document or concurrent downloads can consume enough manager memory to trigger swapping or termination, interrupting every user's API. Authentication limits who can exercise the normal download route, but that user otherwise has no need for root-manager memory to hold their whole file.

**Recommendation**

`stat` the validated file, send `Content-Length`, and stream bounded chunks (or use a carefully gated internal redirect). Add a large sparse/file-like test that fails if an unbounded `read()` is requested and a client-disconnect cleanup test.

### VT-09 — Medium — Custom dialogs are not fully accessible modals

**Evidence**

- The shared modal used by eleven pages sets `role=dialog`/`alertdialog`, but has no `aria-modal`, `aria-labelledby`/accessible name, `aria-describedby`, focus trap, background inerting, or focus restoration (`shared/vibe-modal.js:41-86`). Tab can leave the visible overlay and move into background controls.
- Config's separate password/delete prompt has no dialog role or ARIA relationship at all (`apps/system/config/config.html:245-255`) and likewise neither traps nor restores focus (`apps/system/config/config.html:281-327`).
- The project QA charter explicitly requires keyboard navigation, visible focus, meaningful labels, screen-reader comprehension, and reduced-motion support (`docs/qa-charter.md:51-53`). There is no automated accessibility scan in the current suite.

**Impact**

Keyboard and screen-reader users can lose context, operate background controls while a destructive confirmation is visible, or land at an unexpected location after dismissal. Config includes account deletion and password-reset flows, making this more than a styling issue.

**Recommendation**

Give each dialog generated IDs and explicit name/description relationships, set `aria-modal=true`, trap Tab/Shift+Tab, make the background inert while open, and restore the triggering element's focus. Honor `prefers-reduced-motion`. Add keyboard-focused Playwright coverage and an automated accessibility check for representative app pages.

### VT-10 — Low — Negative file-read limits bypass the cap

`apps/everyday/files/fileagent.py:174-192` clamps only the upper bound:

```python
limit = min(int(req.get("max") or MAX_READ), MAX_READ)
data = f.read(limit + 1)
```

For `max=-2`, `read(-1)` reads the whole file before the later slice. `max=0` also silently becomes the default because of `or`. The UI sends a valid positive value, but a direct authenticated API request violates the documented 1 MiB memory/payload guard and can inflate the per-user agent before the manager's response cap intervenes.

Reject non-positive values or clamp both bounds before opening the file, and test negative, zero, Boolean, huge, and malformed inputs.

### VT-11 — Low — File-agent directory “repair” follows symlinks

`server/terminal-manager.py:1896-1921` says any non-real/private directory will be replaced. For a symlink to a directory, however:

1. `os.path.isdir(d)` is true;
2. `lstat` correctly detects the symlink;
3. `shutil.rmtree(d, ignore_errors=True)` refuses to remove a symlink and the error is discarded;
4. the second `os.path.isdir(d)` is still true;
5. `chmod` and `chown` follow the symlink and modify its target.

The root-owned `0755` parent prevents an ordinary tenant from creating this today, so exploitability requires pre-existing bad state or a mispermission. It still defeats a security repair routine and can change ownership/mode on an unintended directory. Use `lexists`/`lstat`; unlink symlinks and non-directories explicitly; then create with no-follow checks. Add symlink and wrong-type tests.

### VT-12 — Low — Services discovery performs redundant background polling

- The Services iframe fetches `/api/services/discover` immediately and every five seconds forever (`apps/utilities/services/index.html:132-144`). It does not listen for `vibetop:active`.
- The shell separately fetches the same endpoint every five seconds while Services is active and relays the result because the iframe fetch may lack a Cloudflare Access cookie (`shell/desktop.html:3778-3793`).

When active, two independent timers request the same data; when backgrounded, the iframe continues polling. The server's five-second cache reduces—but does not eliminate—duplicate host socket/process scans when timers straddle cache expiry. Make the shell the sole embedded poller, retain direct polling only in standalone mode, and pause on background/visibility changes.

### VT-13 — Low — Dead code and obsolete generated configuration remain

The following identifiers have no reference beyond their definition in the tracked source (framework callbacks and named IIFEs were excluded):

- `server/terminal-manager.py:1533-1541` — `_drop_user_from_registry`; particularly risky dead code because using it would undo the session-revocation tombstone guarantee documented by `_tombstone_user_in_registry` immediately below it.
- `bootstrap.sh:24` — `REPO_RAW`.
- `apps/everyday/imageview/imageview.html:87` — `enc`.
- `apps/games/circuit/circuit.html:3069-3082` — `tryPipeSide`.
- `apps/games/rts/rts.html:10801` — `stackR`.
- `apps/games/rts/rts.html:23903-23909` — `aiInTeam`.
- `apps/games/rts/rts.html:27096` — `noiseBurst`.
- `apps/utilities/monitor/monitor.html:324-329` — `tempColor`.

In addition, `server/install.sh:342-352,493-496` still generates a `$term_port` nginx map explicitly described as unused after identity-based terminal routing. Confirm no rollback path consumes these candidates, then remove them. For `tryPipeSide`, first decide whether the intended side-pipe gameplay was accidentally disconnected; deletion could otherwise hide an unfinished feature.

### VT-14 — Low — Test/toolchain resolution is not reproducible

- `tests/e2e/package.json:12-14` specifies `@playwright/test` as `^1.49.0`.
- No package lockfile is tracked; `.gitignore:13-16` ignores all JSON except `package.json` and selected manifests.
- CI uses mutable action major tags, `ubuntu-latest`, Python `3.x`, and installs the latest pytest/pip on every run (`.github/workflows/tests.yml:18-35`).

The production application itself has very few runtime dependencies, so this is primarily a testing/supply-chain reliability issue. A fresh E2E or CI run can change behavior without a repository change. Track an E2E lockfile (explicitly unignore it), use the lock in install commands, pin the tested Python/pytest policy, and pin GitHub actions to reviewed commit SHAs with automated update tooling.

## Maintainability improvements

These are not classified as bugs, but they raise change risk:

- `server/terminal-manager.py` is 7,471 lines and combines auth, privileged OS actions, storage, media, office, sharing, scheduling, metrics, and HTTP routing. Its tests make an incremental split feasible: extract storage/domain modules first, then replace the long route ladders with explicit dispatch tables carrying auth/body-limit metadata.
- `shell/desktop.html` is 4,212 lines and `apps/everyday/files/filesx.html` is 3,786 lines. Continue extracting dependency-free shared modules where behavior is independently testable. Avoid introducing a build step unless the deployment model changes.
- The shell gate currently ignores all ShellCheck warnings. A small reviewed warning allow/deny policy would have caught VT-06 and several verified unused variables without turning style preferences into CI noise.

## Verification performed

| Check | Result |
|---|---|
| `./run-tests.sh` | PASS: manager pytest 705; Claude proxy pytest 7; Node 431 passed / 10 skipped |
| Total | **1,143 passed, 10 skipped, 0 failed** |
| `git diff --check` | PASS |
| `shellcheck -S warning` over tracked shell scripts | 7 warnings; `SC2318` reproduced VT-06, and unused-variable warnings support VT-13 |
| Bash local-assignment micro-reproduction | Confirmed matrix log resolves to `.log` |
| `BaseHTTPRequestHandler.send_header` micro-reproduction | Confirmed embedded CRLF is emitted unchanged |
| Python negative-read micro-reproduction | Confirmed `read(-1)` reads the complete file |

The 10 skipped Node tests are opt-in RTS slow/art checks, not failures.

## What was not run

- Live-host smoke tests (`./run-tests.sh --live`), because they require and inspect a deployed stack.
- The privileged container/VM E2E suite and six-distribution Vagrant matrix, because they create or mutate system services, VMs, containers, nginx, and users.
- Real-device mobile interaction, visual review, and assistive-technology testing.

Those should be run after fixes to VT-01 through VT-09, with the matrix log collision fixed before relying on matrix results.

## Suggested remediation order

1. Fix VT-01 and VT-02 first; they are operator trust/data-recovery failures.
2. Bound public ZIP and login work (VT-03/VT-04), then centralize safe download headers (VT-05).
3. Repair the matrix harness (VT-06) before using it to validate lifecycle changes across distributions.
4. Fix the visible multi-user upload bug and office streaming (VT-07/VT-08).
5. Address modal accessibility, input bounds, symlink repair, polling, dead code, and dependency locking (VT-09 through VT-14).

