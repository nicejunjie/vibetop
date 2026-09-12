# The Files app: vibetop's own file manager

> Status: **done — every phase including 4b.** The native app is the ONLY file
> manager; FileBrowser, the Native/Classic toggle, the per-user FileBrowser
> units and ports, the `~1,200`-line patch layer and the `/files/` nginx
> location are all gone (2026-09-11, on the user's call). What remains of that
> world is one nginx fragment holding `/fileview/`, and a one-time cleanup in
> `apps/everyday/files/install.sh`.
>
> The app went well past the original parity checklist before the cutover:
> thumbnails, three layouts, a desktop context menu, touch tap-to-select, a
> Settings card, a Move picker, editor find/replace, an address bar, and one
> unified toolbar. Two security defects in the backend were found and fixed
> along the way (v1.19.106) — see design-decisions.

## Why (the case, with receipts)

FileBrowser (pinned v2.63.3, one Go process per logged-in user) provided only
four things we still used: the listing UI, mutations, previews/editor, and
search. Everything else in the Classic Files app was already ours, injected over
its DOM by ~1,200 lines of `filebrowser-patches.js` + nginx `sub_filter`: tabs,
Share, Office/video/image handoff, toolbar/address bar/breadcrumb, the mobile
layout, the info dialog.

That patch layer was where a disproportionate share of this project's bugs
lived (design-decisions: the login flash, the NFS empty-listing heal, the
preview-flash misfire, the invisible HD label, the white mobile previewer
toolbar that triggered this project). Upstream drift bit silently — v2.63
removed `/api/raw` and our dimensions fallback 404'd without anyone noticing.
Operationally: ~40MB per user, the per-user port scheme (the stale-port 502
class), version pinning.

Measured, once native was complete enough to compare (parity audit, v1.19.108):
native renders `/home/junjie` in **59 ms** against classic's 121 ms, and a
3000-file folder in **111 ms** where classic never finished in 30 s. The audit
also found real defects in classic that native does not have — `Ctrl+X` then
`Ctrl+V` LOSES the file when the URL lacks a trailing slash; `Ctrl+S` is dead;
the previewer's Delete is a no-op; sorting is unreachable in mosaic view.

## The security invariant (non-negotiable)

FileBrowser ran AS the user; Unix permissions are the isolation boundary
(a Files session ≡ a shell as that user). The native app preserves exactly that:

- **Reads through the manager** may use the `_resolve_user_file` pattern (root
  serves bytes only after an as-the-user read check — the video/office/image
  precedent).
- **Everything else — listing, stat, mutations, zip, search, hash — runs AS THE
  USER** in a per-user **file agent** (`apps/everyday/files/fileagent.py`): a Python daemon
  spawned like the other per-user units (`systemd-run` transient, `--uid`),
  speaking JSON over a per-user unix socket the manager proxies. The manager
  never performs a mutation with root's authority on a user's behalf.

Two things this invariant needs that were NOT obvious, both fixed in v1.19.106
after an audit reproduced them live (details in design-decisions):

- **Every `/api/fs/*` endpoint must gate on `_require_authed()`.** They shipped
  resolving the user through `_ctx_user()`, whose cookieless fallback is
  `APP_USER` — and the manager binds loopback, which every local tenant can
  reach. An unauthenticated `curl` acted as the service account.
- **The channel to the agent must be authenticated too.** The socket now lives
  in `/run/vibetop/fileagent/<user>/` (root-created, `0700`, owned by that
  user) and every connection verifies `SO_PEERCRED` *before sending a byte*.
  The old world-writable `/tmp` path could be squatted by another real user
  after the agent's idle exit — reproduced serving a forged listing and
  capturing the victim's upload.

## Architecture

- `apps/everyday/files/filesx.html` — the whole app, one file, inline JS. Hosted inside the
  tab wrapper `apps/everyday/files/files.html`, which owns the tab bar and the
  in-app viewer overlay. Both are ordinary static pages in the flat web root
  (`/files.html`, `/filesx.html`); each tab is one `filesx.html#<absolute path>`
  iframe, and the shared tab set (`/api/files/tabs`) stores absolute folder
  paths — entries written by the old wrapper (`/files/files/<enc>`) are migrated
  on read and write, so nobody's tabs were lost at the cutover.
- `apps/everyday/files/fileagent.py` — the per-user agent. Ops: `home`, `list`, `stat`,
  `usage`, `read`, `mkdir`, `rename`, `move`, `copy`, `delete`, `search`,
  `hash`, plus the streaming `upload` / `download` / `zip`. Idle-exits after
  `FILEAGENT_IDLE` (900 s) and is restarted on demand; `apps/everyday/files/install.sh` stops
  running agents on deploy so a release takes effect immediately.
- Manager (`server/terminal-manager.py`): `/api/fs/*` proxies to the agent;
  `/api/file/image` serves image bytes and, with `&thumb=N`, a PIL-downscaled
  thumbnail with a strong mtime ETag.
- Viewers: images → `apps/everyday/imageview/imageview.html`, video → `apps/everyday/video/video.html`,
  office → `/api/office/preview`, all opened as an overlay by the wrapper.

## What the app does today

Listing with real image thumbnails; List / Grid / Gallery layouts (persisted);
clickable sortable column headers plus a Sort menu; hidden-files toggle;
symlink markers. Navigation: a home button, the full clickable breadcrumb, an
editable path (accepting `~`, relative and `..`), Back/Forward, copy-path, and
`Backspace` to go up. The listing auto-refreshes every few seconds while Files is
the app on screen (re-rendering only when something changed), stops behind
another app or in a hidden tab, and catches up the moment it is back. Also the
arrow keys (a whole line at a time in Grid/Gallery),
and Finder's spacebar: `Space` Quick-Looks the selection in a panel that the
arrows keep walking. Selection: click / ctrl / shift on a mouse, tap-to-select
plus a Select mode on touch, Select all. Verbs: Open, Get Info (with volume
usage and lazy checksums), Share, Open in Browser, Edit in Office, Rename,
Move to… (destination picker), Copy / Cut / Paste (with progress), Download
(file, folder→zip, multi→zip), Delete, New Folder, New File. Upload by button,
folder picker or OS drag-drop, with a conflict dialog. Search by name and by
content. A text editor with a line-number gutter, find/replace, mtime-conflict
handling and save-on-close. Audio plays in place. A Settings card
(exact dates, thumbnails, hidden files, trash and share links).

Surfaces by input device: with a **mouse**, the verbs live in the right-click
menu (on a row, or on empty space for the folder's own verbs) and the bottom
action pill is hidden. On **touch** there is no right-click, so the pill is the
surface and carries every verb over two rows. The toolbar itself is identical
everywhere: the same nine controls, same icons, same order — labels appear when
there is room.

## Testing

- `tests/e2e/tests/files-native.spec.js` — behaviour contracts (touch
  tap-selects, the desktop context menu, layouts, thumbnails, the pill).
- `tests/e2e/tests/files-native-layout.spec.js` — a GEOMETRY audit: walks every
  surface at five widths and fails if any element escapes its card or the
  viewport, or if the page can scroll sideways. It exists because a Settings
  card shipped whose content had a `min-width` larger than the card's
  `max-width`: every behavioural check passed, because they asserted what the
  controls did and never where they were.
- `server/tests/test_api_fs.py` — the HTTP layer: 401 without a session for
  every verb, the authenticated user is the one proxied, impostor sockets get
  zero bytes. This suite exists because the fs endpoints had NO http-level
  coverage, which is exactly how the missing auth gate shipped.
- `server/tests/test_api_image.py`, `server/tests/test_fileagent.py`.

Every one of these was first run against the code that predates it and observed
to FAIL; a test that is only ever green proves nothing.

## Phase 4b — what retiring FileBrowser removed (2026-09-11)

Deleted: `filebrowser-patches.js`; the `/files/` nginx locations and both their
`sub_filter` injections (the fragment survives, renamed
`apps/everyday/files/nginx/fileview.conf`, carrying only `/fileview/`); the
per-user FileBrowser unit (`vibetop-ufiles-<user>.service`) with its port,
provisioning, health check and self-heal; the authcheck `/files/` → `X-App-Port`
branch; the `files` entry in the `/api/health` probe list; the binary download
in `apps/everyday/files/install.sh` (`FB_VERSION` v2.63.3, `FB_PORT` 8085); the
Native/Classic toggle and the Settings escape hatch; `files/` from `sw.js`'s
BYPASS list; the FileBrowser DB from `tools/backup.sh`; and the FileBrowser
checks in `tools/doctor.sh` / `tools/smoke-test.sh` (which now probes
`/files.html`).

Two deliberate leftovers. The per-user port offset `MAX_INSTANCE + 1` is
**retired, not reused**: renumbering the two xpra offsets would strand every
already-running transient unit on its old baked-in port (the stale-port 502
class). And `uninstall.sh` still sweeps `vibetop-ufiles-*` /
`vibetop-filebrowser`, because a host that ran them before the cutover still
has them.

The cleanup of a live host happens in `apps/everyday/files/install.sh` on the
next deploy: stop + `reset-failed` every `vibetop-ufiles-*`, disable and remove
the legacy shared unit, delete `/usr/local/bin/filebrowser` and the stale
`vibetop-extras.d/filebrowser.conf` (reloading nginx only if something changed).
It is idempotent and a no-op on a host that never had FileBrowser. **User data
is never touched** — each user's `~/.config/filebrowser/filebrowser.db` is left
where it is; it is theirs, and deleting files out of a home directory is not an
installer's business.

## Risks

- The agent is new attack surface. Its ops validate paths only lightly (it runs
  as the user — Unix fences it), so the whole weight sits on the manager→agent
  binding: the right user, the right socket, an authenticated caller. Both
  halves of that have already failed once; treat changes there as security
  changes.
- Feature blind spots surface only by living on it — which is why the toggle
  stood for weeks before the cutover. Every audit found things no test would
  have, so keep auditing by USE, not only by suite.
