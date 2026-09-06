# Lightweight remote-desktop usability plan: connection status, clipboard, sharing, and workspaces

*Status: plan only; nothing in this document has been implemented. Written
2026-09-04 against `main` @ `cf8ea8fde9b2` plus the current working tree. The
tree already contains unrelated in-progress changes, so implementation should
re-check the named anchors and preserve those changes rather than relying on
line numbers.*

---

## 0. Outcome and design constraints

Implement the selected usability features as four small additions to the
existing shell rather than as a new desktop subsystem:

1. A connection-quality indicator with useful diagnostics and a per-device
   Data Saver mode.
2. An explicit, per-user clipboard shelf that follows the user between devices.
3. Web Share Target support so an installed Vibetop PWA can receive files, URLs,
   and text from the host device.
4. Named workspaces that open a chosen app set and apply a portable layout.

The features should preserve Vibetop's lightweight character:

- no new daemon, database, npm dependency, or build step;
- no extra always-on polling loop;
- bounded JSON state written atomically under the current user's home;
- stream uploaded files rather than buffering them in memory;
- progressively enhance browsers that support PWA Share Target;
- keep desktop geometry local to each device; and
- never capture the system clipboard without an explicit user gesture.

The recommended order is connection status, clipboard, workspaces, then Share
Target. Share Target deliberately comes last because its text path consumes the
clipboard shelf and its file path should reuse the existing upload implementation.

---

## 1. Existing seams to reuse

| Need | Existing implementation to extend |
|---|---|
| API health and liveness | The five-second `/api/desktop` heartbeat in `shell/desktop.html` |
| Near-live browser events | `/api/events` SSE and `subscribeUpdates()` |
| Remote graphical transport | `apps/everyday/browser/xpra-patches.js` and the Xpra iframe |
| Per-user persistence | Helpers around `~/.local/share/desktop-state.json` in `server/terminal-manager.py` |
| Receiving files | Streaming multipart upload handler for `/api/upload` |
| Opening a URL remotely | Existing browser-open endpoint and `open-browser` SSE event |
| App definitions | `window.VibeApps.APPS` from `shell/appreg.js` |
| Portable layouts | Layout keys and geometry functions in `shell/winmgr.js` |
| Per-device window state | `localStorage['vibetop:wins']` and `INSTANCE_ID` |
| Offline shell | `shell/sw.js` precache and network-bypass rules |

New browser modules should follow the current classic-IIFE plus CommonJS-test
pattern. `shell/install.sh` already deploys unique JS basenames under `shell/`,
but every new module must be added to the service-worker precache and every shell
change must bump the service-worker cache version.

---

## 2. Feature 3 — connection-quality indicator and Data Saver

### 2.1 User experience

Add a small status control to the taskbar. Its label, icon, and accessible name
have three top-level states:

- **Connected:** the browser is online, a recent desktop heartbeat succeeded,
  and SSE is open.
- **Reconnecting:** the browser reports online but SSE is reconnecting, the API
  is slow/stale, or the active Xpra session is reconnecting.
- **Offline:** `navigator.onLine` is false or no API response has succeeded for
  30 seconds.

Xpra is a substatus, not the source of the whole-shell status: a disconnected
Browser window must not label Files or Notes as offline when the manager API is
healthy.

The status popover should show:

- API latency as a rolling median of the most recent bounded sample set;
- last successful response age;
- event-stream state and reconnect count;
- active graphical-session state when relevant;
- a **Retry now** action;
- a **Copy diagnostics** action; and
- a **Data Saver** toggle.

On narrow screens the same control opens as a bottom sheet. It must remain
keyboard reachable and must not make the taskbar overflow.

### 2.2 State model

Create `shell/connectivity.js` with a DOM-free reducer/state machine and time
threshold helpers. Keep all timestamps monotonic where possible. Export it as
both `window.VibeConnectivity` and CommonJS for the Node tests.

Inputs:

- `online` / `offline` browser events;
- start, success, failure, and duration of the existing `/api/desktop` request;
- EventSource `onopen` and `onerror` transitions;
- Xpra status messages from the active iframe; and
- visibility changes, so returning to a stale tab triggers a fresh heartbeat.

Do not add another interval. Instrument the existing desktop heartbeat and SSE
connection, and let EventSource perform its native reconnect behavior. Protect
against an older request completing after a newer request by assigning a local
sequence number to each health sample.

Suggested thresholds, kept as named constants and covered by tests:

- degraded after 12 seconds without an API success;
- offline after 30 seconds without an API success;
- API latency warning above a 1,500 ms rolling median; and
- recover only after a new successful request, not merely an `online` event.

`Copy diagnostics` must contain only the build identifier, connection states,
rounded timings, reconnect count, current app ID, Data Saver state, and user-agent
family. Do not copy cookies, auth headers, clipboard contents, complete URLs,
query strings, user names, or file paths.

### 2.3 Xpra bridge

Extend `apps/everyday/browser/xpra-patches.js` to report a small allowlisted
message to its parent, for example:

```text
{ type: "vibetop:xpra-status", state: "connected|reconnecting|closed", rttMs: 42 }
```

Before implementation, confirm the connection-state and RTT hooks exposed by
the installed Xpra HTML client version. The shell must validate both
`event.origin === location.origin` and `event.source === activeFrame.contentWindow`
before accepting a message. Clamp/round all numeric data.

If a stable Xpra RTT hook is unavailable, omit its RTT rather than scraping UI
text or depending on private internals. API latency remains sufficient for the
top-level indicator.

### 2.4 Data Saver

Data Saver is a per-device preference in local storage, not synchronized user
state. It should:

- keep auth, `/api/desktop`, and SSE liveness frequencies unchanged;
- use the existing `vibetop:active` iframe signal to suspend nonessential
  background refresh in first-party apps, starting with Services and Token Stats;
- request a conservative per-client Xpra bandwidth/quality profile; and
- avoid background previews or animations that continuously repaint.

Retain Xpra's server-side bandwidth detection. Verify the exact supported Xpra
6.4 HTML client setting names before wiring the per-client profile. If they can
only be applied at client startup, show **Applies when the graphical app
reconnects** and use an explicit reconnect action; do not silently reload an
iframe that may contain unsaved work.

### 2.5 Acceptance criteria

- Normal operation remains green without increasing request frequency.
- Browser offline/online, SSE interruption, slow API, and recovery produce the
  expected state within the documented thresholds.
- Xpra failure only degrades the graphical-app substatus.
- Retry starts one immediate heartbeat and safely recreates SSE only if it is
  closed; repeated clicks cannot create parallel streams.
- Diagnostics contain no credentials, personal content, or full URLs.
- Data Saver survives a reload on that device and does not change another
  device's setting.

---

## 3. Feature 4 — cross-device clipboard shelf

### 3.1 Product behavior

Add a global clipboard button near the taskbar utilities. It opens a compact
drawer containing the user's most recent text snippets. The MVP supports plain
text only.

Actions:

- **Add from system clipboard**, which calls `navigator.clipboard.readText()`
  only from that button's user gesture;
- a text-area fallback for browsers that deny clipboard read permission;
- **Copy** on each item, calling `navigator.clipboard.writeText()` from the
  click/tap gesture;
- delete one item; and
- clear all items after confirmation.

Never poll or auto-read the device clipboard. Never capture terminal selections,
password fields, or copied text automatically. Render item contents with
`textContent`, never `innerHTML`.

### 3.2 Storage contract

Use a separate per-user file, not desktop instance state:

```text
~/.local/share/vibetop-clipboard.json
```

Suggested versioned shape:

```json
{
  "version": 1,
  "revision": 8,
  "items": [
    {
      "id": "unguessable-id",
      "text": "plain text",
      "created": "2026-09-04T18:00:00Z",
      "source": "manual"
    }
  ]
}
```

Server-enforced limits:

- 10 items, newest first;
- 64 KiB UTF-8 per item;
- 256 KiB total serialized text;
- seven-day expiry, pruned on every read and write;
- source enum `manual` or `share-target`; and
- newline and tab preserved, NUL rejected.

Write through a per-user lock and atomic replace, then restore the same ownership
and restrictive permissions used by the existing user-state helpers. A corrupt
file should be quarantined or ignored safely and return an empty versioned state,
not a 500 loop.

Register this file in backup/restore coverage in the same change that introduces
it. Do not leave new user content outside the backup manifest.

### 3.3 API and live updates

Add authenticated, CSRF-protected manager routes:

```text
GET  /api/clipboard
POST /api/clipboard          { "text": "...", "source": "manual" }
POST /api/clipboard/delete   { "id": "..." }
POST /api/clipboard/clear    {}
```

The server chooses item IDs and timestamps. Ignore any client-supplied owner,
path, or creation time. Use the current request user for every filesystem access.

After a mutation, increment `revision` and signal a per-user `clipboard` SSE
event containing the revision only. Other open devices then refetch the shelf.
Also refetch when the drawer opens and when a hidden page becomes visible, so a
manager restart or missed SSE event cannot leave it permanently stale. The
existing two-second SSE loop gives a practical cross-device update target of
three seconds without another poller.

Create `shell/clipboard-shelf.js` for validation, bounded client state, clipboard
permission fallbacks, and rendering glue. It must expose pure helpers for tests.

### 3.4 Acceptance criteria

- Text added on device A appears on device B within three seconds while both are
  connected, and always appears after reopening the drawer.
- Users cannot read, mutate, or receive revision notifications for one another's
  shelf.
- Ten-item, per-item, total-size, and expiry limits are enforced server-side.
- HTML-like content is displayed literally and cannot execute.
- Clipboard permission denial leaves the manual text-area flow usable.
- Concurrent additions cannot corrupt or silently truncate the state file.
- Clipboard state is included in backup and restore tests.

---

## 4. Feature 6 — named workspaces

### 4.1 Definition and behavior

A workspace is a named, portable app-and-layout preset. It is not a snapshot of
iframe contents and does not store device-specific pixel coordinates.

Selecting a workspace should be non-destructive:

- open missing listed apps;
- raise the workspace's active app;
- in window mode, arrange the listed apps with the saved layout key;
- minimize or leave unrelated open apps alone rather than closing them; and
- affect only the current desktop instance, never force a switch on another
  signed-in device.

On a small screen or when window mode is unavailable, open the same app set and
show the chosen active app full-screen. If the saved layout does not fit the
current viewport, fall back to the existing Tidy behavior.

Offer two built-in suggestions without persisting them:

- **Coding:** Terminal, Files, and Browser.
- **Observe:** Monitor, Services, and Terminal.

Users can save the current desktop, rename it, overwrite it, or delete it. Saving
captures normal registered apps only; exclude transient viewers, hidden helper
apps, toggles, and privileged Config unless explicitly added through an
allowlisted UI.

### 4.2 Portable schema

Store definitions per user in:

```text
~/.local/share/vibetop-workspaces.json
```

Suggested shape:

```json
{
  "version": 1,
  "revision": 3,
  "items": [
    {
      "id": "unguessable-id",
      "name": "Coding",
      "apps": ["terminal", "files", "browser"],
      "active": "terminal",
      "windowMode": true,
      "layout": {
        "key": "main2",
        "assignment": ["terminal", "browser", "files"]
      },
      "created": "2026-09-04T18:00:00Z",
      "updated": "2026-09-04T18:05:00Z"
    }
  ]
}
```

Limits and validation:

- at most 12 workspaces and 8 apps per workspace;
- names are 1–40 normalized Unicode characters with control characters removed;
- app IDs match a strict short identifier pattern and are filtered through the
  shell's current `VibeApps.APPS` registry before use;
- `active` must be one of `apps`;
- layout keys must exist in `VibeWin.LAYOUTS` at application time;
- assignments may contain each listed app at most once; and
- store no app URLs, shell commands, iframe sources, secrets, or absolute paths.

As with clipboard state, use per-user locking, atomic writes, ownership repair,
corruption recovery, and backup/restore coverage.

### 4.3 API and shell integration

Add authenticated routes:

```text
GET  /api/workspaces
POST /api/workspaces/save     { id?, name, apps, active, windowMode, layout }
POST /api/workspaces/delete   { id }
```

The server owns IDs and timestamps and applies the structural bounds. The shell
performs the final app-registry and available-layout filtering because it owns
those catalogs.

Create `shell/workspaces.js` with pure functions for schema normalization,
capturing the current app set, selecting a viable layout for the viewport, and
building an application plan. Reuse `VibeWin.layoutGeoms`, `layoutsFor`, and
zone-assignment helpers; do not duplicate geometry math.

Expose workspaces in two discoverable places:

- a compact **Workspaces** row near the top of the Start menu on all devices;
  and
- saved workspace chips plus **Save current workspace** in the existing layout
  palette in window mode.

If freeform current positions cannot be matched to an existing layout, save the
app set and active app with no layout key and explain that other screen sizes will
use Tidy. Do not serialize the current `wins` pixel rectangles to the server.

### 4.4 Acceptance criteria

- One action opens and arranges a saved workspace on the current device.
- Applying it never closes an unrelated window or changes another device.
- The same definition produces a sensible arrangement on desktop and a usable
  active-app view on mobile.
- Deleted/renamed apps and unknown layout keys degrade safely.
- Invalid IDs, excessive arrays, duplicate assignments, and malformed JSON are
  rejected or normalized without code execution.
- Workspace state is isolated per user and covered by backup/restore tests.

---

## 5. Feature 5 — “Share to Vibetop” PWA integration

### 5.1 Manifest contract

Extend `shell/manifest.json` with a Web Share Target using a navigation POST:

```json
{
  "share_target": {
    "action": "/api/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [{ "name": "file", "accept": ["*/*"] }]
    }
  }
}
```

This is progressive enhancement. Browsers that do not support Share Target keep
the existing PWA behavior. Document that the installed PWA must still have a
valid Vibetop session; if authentication has expired, the reverse proxy can
reject the navigation before the manager receives the body and the sender may
need to share again after signing in.

### 5.2 Server routing and precedence

Add an authenticated `/api/share-target` handler. It must not be placed on a
public-route allowlist. Retain the existing same-origin/CSRF protections used for
state-changing API requests, accounting for the browser's standards-defined
Share Target form navigation.

Routing is deterministic:

1. If one or more files are present, stream them through the existing sanitized,
   collision-safe upload path into the current user's `~/Uploads`; preserve
   accompanying non-empty text in the clipboard shelf; then redirect to the
   desktop with an `upload` launch hint.
2. Otherwise, if the explicit URL field or shared text contains a valid
   `http://` or `https://` URL, pass it through the existing browser URL
   normalization/open path, signal `open-browser`, and redirect with a `browser`
   hint.
3. Otherwise, store non-empty plain text in the clipboard shelf with source
   `share-target` and redirect with a `clipboard` hint.
4. If the payload has none of those, redirect with a short, non-sensitive error
   code that the shell renders as a toast.

Use `303 See Other` after the POST so reload does not resubmit the shared body.
The desktop should consume the launch hint exactly once, preserve unrelated
query parameters, call `history.replaceState()` to remove it, and then open the
relevant Upload, Browser, or clipboard UI.

The current multipart iterator yields files and drains ordinary fields. Refactor
it into a shared streaming parser that can expose bounded text fields while
continuing to stream file bodies. Do not call a general form parser that buffers
large uploads. Apply the same request/file limits, filename sanitization,
collision behavior, ownership, and partial-upload cleanup as `/api/upload`.

Only `http` and `https` URLs may reach the browser-open path. Reject schemes such
as `javascript:`, `file:`, and `data:`. Treat all other text as inert clipboard
content.

### 5.3 Service-worker behavior

Keep non-GET requests network-only. `/api/share-target` payloads and responses
must never enter Cache Storage. Do not add an IndexedDB/offline queue in the MVP:
large shared blobs, authentication expiry, quotas, and replay semantics would
make it neither small nor reliably safe.

The manifest and any new shell modules still need the ordinary service-worker
precache/version update. Add a regression test proving a Share Target POST is not
intercepted or cached.

### 5.4 Acceptance criteria

- Sharing a file from a supported Android browser creates one collision-safe
  file in that user's Uploads and opens Upload.
- Sharing a web URL opens the remote Browser; unsafe schemes do not.
- Sharing plain text adds one item to the clipboard shelf and opens the drawer.
- A mixed file-plus-caption payload saves the file and the caption without
  buffering the file in manager memory.
- Missing auth, malformed multipart input, oversize fields, disconnects, and disk
  errors fail without cross-user writes or orphaned partial files.
- Reload after the redirect does not duplicate the share action.
- Unsupported desktop/iOS browsers retain the normal installable PWA experience.

---

## 6. Ordered implementation slices

Each slice should be reviewable and releasable on its own. Bump `shell/sw.js` in
every slice that changes served shell assets; bump the root product `VERSION`
only according to the repository's normal release procedure.

### Slice 1 — connection core

- Add `shell/connectivity.js` and unit tests.
- Instrument the existing heartbeat and EventSource lifecycle.
- Add the taskbar control, popover, Retry, and redacted diagnostics.
- Add offline/online and mobile-layout end-to-end coverage.

### Slice 2 — graphical status and Data Saver

- Add the validated Xpra-to-shell status bridge.
- Add the per-device Data Saver preference and clear apply/reconnect behavior.
- Make Services and Token Stats honor the existing active/inactive signal.
- Verify ordinary and low-bandwidth Xpra sessions manually.

### Slice 3 — clipboard persistence and API

- Add bounded per-user storage helpers, routes, locks, and tests.
- Add revision-only SSE notification and multi-user isolation coverage.
- Add the new state file to backup/restore behavior and tests.

### Slice 4 — clipboard UI

- Add `shell/clipboard-shelf.js`, drawer/bottom sheet, explicit read/copy actions,
  and permission fallbacks.
- Refresh on SSE, drawer open, and page visibility.
- Test hostile text rendering, bounds, accessibility, and two-device refresh.

### Slice 5 — workspace persistence and planning

- Add server schema/routes, atomic per-user storage, and backup coverage.
- Add `shell/workspaces.js` and unit tests for normalization and responsive
  layout selection.

### Slice 6 — workspace UI and application

- Add Start-menu and layout-palette surfaces.
- Implement capture, save, rename, delete, and non-destructive application.
- Add desktop/mobile end-to-end tests and unknown-app/layout regression cases.

### Slice 7 — Share Target

- Refactor multipart handling with regression tests for ordinary `/api/upload`.
- Add `/api/share-target`, redirect hints, manifest entry, and launch handling.
- Add file/URL/text/mixed/security tests and Android manual verification.

---

## 7. Test and review matrix

### Browser unit tests

- connectivity reducer thresholds, slow samples, request reordering, retries,
  EventSource recovery, and diagnostics redaction;
- clipboard limits, escaping, revision ordering, and permission fallbacks;
- workspace schema normalization, registry filtering, viewport fallback, and
  zone assignment; and
- service-worker non-GET behavior and precache uniqueness.

### Python/API tests

- authentication and CSRF rejection for every new route;
- two-user state isolation, ownership, and SSE isolation;
- concurrent writes, atomicity, corrupt-state recovery, expiry, and all bounds;
- backup/restore round trips for both new JSON files;
- streaming multipart files, bounded text fields, filename collisions, early
  disconnect cleanup, and unsafe URL schemes; and
- existing upload and browser-open behavior after handler reuse/refactoring.

### End-to-end tests

- connected → reconnecting → offline → recovered state;
- taskbar and bottom-sheet behavior at phone, tablet, and desktop widths;
- clipboard update between two independent browser contexts;
- workspace application across at least two viewport sizes; and
- redirect-hint one-shot behavior for Upload, Browser, and clipboard.

### Manual device checks

- current Chrome/Edge Android installed-PWA file, URL, and text share;
- an unsupported/iOS browser to confirm graceful absence of Share Target;
- system clipboard permission denied and permitted paths;
- touch-only workspace and connection controls; and
- Xpra reconnect plus Data Saver over a throttled network.

Run the repository's focused shell and server suites after each slice, then the
full `run-tests.sh` and relevant e2e/matrix lanes before release. Do not normalize
unrelated failures away; record any pre-existing failure separately.

---

## 8. Documentation and rollout

Update in the same slices, rather than after all features land:

- `README.md` feature list and screenshots/usage summary;
- `docs/desktop.md` for the indicator, clipboard, and workspaces;
- `docs/apps.md` for Share Target routing into Upload/Browser;
- `docs/design-decisions.md` for explicit clipboard capture, portable workspace
  metadata, network-only shares, and per-device Data Saver; and
- backup/restore documentation for the two new per-user files.

Roll out behind no server-side feature flag unless deployment experience shows a
need. The unsupported Share Target path is already progressive. If additional
control is desired, gate only the manifest entry at render/install time; do not
ship a manifest that advertises a handler the server lacks.

Suggested success measures that require no analytics service:

- no increase in steady-state request frequency or SSE client count per tab;
- connection state recovers without reload after a short outage;
- clipboard/workspace JSON remains within its hard bounds;
- Share Target and ordinary Upload have equivalent file correctness; and
- the complete added uncompressed client code stays small enough to review as
  plain source (target: under roughly 30 KiB across the three new shell modules,
  excluding tests).

---

## 9. Explicitly deferred

These are attractive follow-ups but would undermine a focused first release:

- binary/image clipboard synchronization;
- automatic clipboard watching;
- clipboard end-to-end encryption separate from the existing transport/storage
  security model;
- offline queued PWA shares and background upload replay;
- live collaboration or broadcasting a workspace switch to other devices;
- saving arbitrary iframe state, terminal processes, or pixel geometry inside a
  workspace;
- globally lowering Xpra server quality for every user; and
- automatic iframe reloads when Data Saver changes.

Those decisions keep the four features useful, predictable, bounded, and aligned
with a lightweight remote desktop.
