# Files-native: replacing FileBrowser with a vibetop-owned Files app

> Status: **phases 0–4a shipped; Native is OPT-IN, Classic is still the
> default** (`localStorage['vibetop:filesx'] === '1'`, toggled from the tab
> bar). Phase 4b — physically removing the FileBrowser units, ports and patch
> layer — has not started and is gated on the user judging the native app good
> enough to make default, then a soak period.
>
> Since v1.19.100 the app has moved well past the original parity checklist:
> thumbnails, three layouts, a desktop context menu, touch tap-to-select, a
> Settings card, a Move picker, editor find/replace, the classic address bar,
> and one unified toolbar. Two security defects in the backend were found and
> fixed along the way (v1.19.106) — see design-decisions.

## Why (the case, with receipts)

FileBrowser (pinned v2.63.3, one Go process per logged-in user) provides only
four things we still use: the listing UI, mutations, previews/editor, and
search. Everything else in the Classic Files app is already ours, injected over
its DOM by ~1,200 lines of `filebrowser-patches.js` + nginx `sub_filter`: tabs,
Share, Office/video/image handoff, toolbar/address bar/breadcrumb, the mobile
layout, the info dialog.

That patch layer is where a disproportionate share of this project's bugs have
lived (design-decisions: the login flash, the NFS empty-listing heal, the
preview-flash misfire, the invisible HD label, the white mobile previewer
toolbar that triggered this project). Upstream drift bites silently — v2.63
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

FileBrowser runs AS the user; Unix permissions are the isolation boundary
(a Files session ≡ a shell as that user). Native preserves exactly that:

- **Reads through the manager** may use the `_resolve_user_file` pattern (root
  serves bytes only after an as-the-user read check — the video/office/image
  precedent).
- **Everything else — listing, stat, mutations, zip, search, hash — runs AS THE
  USER** in a per-user **file agent** (`files/fileagent.py`): a Python daemon
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

- `landing/filesx.html` — the whole app, one file, inline JS. Hosted inside the
  tab wrapper `landing/files.html`, which owns the tab bar, the Native/Classic
  toggle and the in-app viewer overlay.
- `files/fileagent.py` — the per-user agent. Ops: `home`, `list`, `stat`,
  `usage`, `read`, `mkdir`, `rename`, `move`, `copy`, `delete`, `search`,
  `hash`, plus the streaming `upload` / `download` / `zip`. Idle-exits after
  `FILEAGENT_IDLE` (900 s) and is restarted on demand; `files/install.sh` stops
  running agents on deploy so a release takes effect immediately.
- Manager (`terminal/terminal-manager.py`): `/api/fs/*` proxies to the agent;
  `/api/file/image` serves image bytes and, with `&thumb=N`, a PIL-downscaled
  thumbnail with a strong mtime ETag.
- Viewers: images → `landing/imageview.html`, video → `landing/video.html`,
  office → `/api/office/preview`, all opened as an overlay by the wrapper.

## What the app does today

Listing with real image thumbnails; List / Grid / Gallery layouts (persisted);
clickable sortable column headers plus a Sort menu; hidden-files toggle;
symlink markers. Navigation: a home button, the full clickable breadcrumb, an
editable path (accepting `~`, relative and `..`), Back/Forward, copy-path, and
`Backspace` to go up. Selection: click / ctrl / shift on a mouse, tap-to-select
plus a Select mode on touch, Select all. Verbs: Open, Get Info (with volume
usage and lazy checksums), Share, Open in Browser, Edit in Office, Rename,
Move to… (destination picker), Copy / Cut / Paste (with progress), Download
(file, folder→zip, multi→zip), Delete, New Folder, New File. Upload by button,
folder picker or OS drag-drop, with a conflict dialog. Search by name and by
content. A text editor with a line-number gutter, find/replace, mtime-conflict
handling and save-on-close. Audio plays in place. A Settings card
(single-click-to-open, exact dates, thumbnails, hidden files, share links, and
the classic app as an escape hatch).

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
- `terminal/tests/test_api_fs.py` — the HTTP layer: 401 without a session for
  every verb, the authenticated user is the one proxied, impostor sockets get
  zero bytes. This suite exists because the fs endpoints had NO http-level
  coverage, which is exactly how the missing auth gate shipped.
- `terminal/tests/test_api_image.py`, `terminal/tests/test_fileagent.py`.

Every one of these was first run against the code that predates it and observed
to FAIL; a test that is only ever green proves nothing.

## Phase 4b — retiring FileBrowser (not started)

Blocked on: the user making Native the default and living on it. When that
holds, the removal covers the per-user FileBrowser units and port allocations,
`filebrowser-patches.js` and its nginx `sub_filter`, the `/files/` location,
the uninstall path, the Native/Classic toggle in the wrapper, the Settings row
that links to the classic app, and a docs sweep (`docs/apps.md`, `CLAUDE.md`).

## Risks

- The agent is new attack surface. Its ops validate paths only lightly (it runs
  as the user — Unix fences it), so the whole weight sits on the manager→agent
  binding: the right user, the right socket, an authenticated caller. Both
  halves of that have already failed once; treat changes there as security
  changes.
- Feature blind spots surface only by living on it — hence the toggle rather
  than a cutover. Every audit so far has found things no test would have.
