# Files-native: replacing FileBrowser with a vibetop-owned Files app

> Status: **phase 1 shipped** (v1.19.87/88 — per-user file agent + `/api/fs/*`
> + the native listing `landing/filesx.html` behind the per-device **Native**
> toggle in the Files tab bar; phase 0 = native image viewer, v1.19.80/81).
> Phases 2-4 below are the plan of record; each is independently shippable and
> FileBrowser stays alongside until the end.

## Why (the case, with receipts)

FileBrowser (pinned v2.63.3, one Go process per logged-in user) today provides
only four things we still use: the listing UI, mutations (rename/move/copy/
delete/upload/zip), previews/editor, and search. Everything else in the Files
app is already ours, injected over its DOM by ~1,200 lines of
`filebrowser-patches.js` + nginx `sub_filter`: tabs, Share, Office/video/image
handoff, toolbar/address bar/breadcrumb, the mobile layout, the info dialog.

That patch layer is where a disproportionate share of this project's bugs have
lived (see design-decisions: the login flash, the NFS empty-listing heal, the
preview-flash misfire, the invisible HD label, the white mobile previewer
toolbar that triggered this project). Upstream drift bites silently — v2.63
removed `/api/raw` and our dimensions fallback 404'd without anyone noticing.
Operationally: ~40MB per user, the per-user port scheme (the stale-port 502
class), version pinning.

## The security invariant (non-negotiable)

FileBrowser runs AS the user; Unix permissions are the isolation boundary
(a Files session ≡ a shell as that user). Native must preserve exactly that:

- **Reads through the manager** may use the existing `_resolve_user_file`
  pattern (root serves bytes only after an as-the-user `test -r` fence —
  the video/office/image precedent, already security-reviewed).
- **Everything else — listing, stat, mutations, zip, search — runs AS THE
  USER** in a per-user **file agent**: a small Python daemon (target ≤400
  lines), spawned like the other per-user units (`systemd-run` transient,
  `User=<user>`), speaking JSON over a per-user unix socket that the manager
  proxies (`/api/fs/*` → agent). The manager never performs a mutation with
  root's authority on a user's behalf. The agent reuses the `vibetop-session`
  unit conventions (socket path scheme, idle-reaper participation).

## Phases

1. **Native listing (read-only).** `landing/filesx.html` view inside the
   existing tab wrapper behind a per-device toggle; file agent serves
   `list`/`stat`. Open handoffs reuse today's viewers (image/video/office);
   text preview via a `read` op capped at ~1MB. FileBrowser reachable via a
   "manage" button for mutations.
2. **Mutations.** Upload with progress (reuse the Upload app's XHR machinery),
   rename/move/copy/delete with our OS-style clipboard UX, zip download
   (agent-side `zip -r` streamed). Multi-select, drag-to-folder on desktop.
3. **Editor & search.** Plain editor (textarea + save + dirty guard) first;
   agent-side bounded `rg`/`find` search.
4. **Retire FileBrowser.** Flip the default, migration release removes the
   per-user FileBrowser units + port allocations + `filebrowser-patches.js`
   (and its nginx sub_filter), uninstall path, docs sweep. The Share flow is
   already manager-native and unaffected.

## Parity checklist (gates phase 4)

listing (name/size/mtime, sort, hidden toggle) · breadcrumb + address bar ·
tabs (already ours) · previews: image ✅(v1.19.80) / video ✅ / office ✅ /
PDF / text · editor · upload (files + folders) with progress · new file/folder ·
rename · move/copy (cross-folder w/ progress) · delete (confirm) · zip download ·
share ✅ (already ours) · search · mobile layout ≤736px per docs (sticky toolbar
→ breadcrumb → address row) · permissions errors legible (the "stranded on an
unreadable folder" trap in design-decisions).

## Risks

- The file agent is new attack surface: its ops must validate paths only
  lightly (it runs as the user — Unix already fences it), but the MANAGER→agent
  proxy must bind the request user to the right socket (the `APP_USER` vs
  request-user traps in CLAUDE.md).
- Feature blind spots surface only by living on it — hence the phased toggle,
  not a cutover.
- The e2e files specs assert FileBrowser DOM today; each phase updates them to
  the native DOM it replaces.
