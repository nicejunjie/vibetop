# VibeTop mobile functional test plan

This is an **execution plan**, not a claim that the cases have passed. The primary sign-off target is a real iPhone on iOS 27, in Safari and as an installed Home Screen app. Android Chrome is a compatibility lane. The iOS simulator and Playwright mobile WebKit make runs repeatable, but cannot sign off physical-device keyboard, IME, camera/photo picker, standalone-PWA or status-bar behavior. Follow the correctness **and** experience criteria in [the QA charter](qa-charter.md).

## Run contract

| Lane | Where | Purpose |
|---|---|---|
| **V** | Disposable full-stack KVM VM; Playwright mobile WebKit at 375/393/402/440 CSS px and Pixel 7 Chrome | Broad, repeatable functional and API checks. Use `VIBETOP_E2E_FULL=1 tests/e2e/run-vm.sh` for Browser/X11; Office cases require a separately available OnlyOffice service. |
| **S** | iOS 27 iPhone simulator, real Safari driven by XCTest touch | Repeatable native keyboard, rotation, viewport, Safari chrome and app-switch sequences. |
| **R** | Real iPhone, iOS 27, Safari and installed PWA | Final sign-off for keyboard/IME, native pickers, status bar, background/resume and actual touch ergonomics. |
| **A** | Real Android phone, Chrome/PWA where supported | Touch, keyboard, pickers, downloads, layout and reconnect compatibility. |

Run applicable P0 cases on **R Safari + R PWA**, and on **V** where automatable. Run the full P1 set on R Safari, then the PWA-specific P1 set in standalone mode. Run the Android lane for shared features. Exercise login, shell, Terminal, Browser and Upload over both LAN and the HTTPS tunnel. Rotate the standard phone; use V's four widths plus one small real phone if available. Pairwise coverage is enough for secondary combinations, but every P0 keyboard case must be repeated in portrait, landscape, and after a background/resume. Use a dedicated test Linux user and a unique `~/VibetopMobileQA-<run-id>` folder. A second user/device is required for sync and isolation. Test Update, Reset, destructive Config actions, and cross-user privilege boundaries only in the disposable VM. Do not run canvas-driving e2e against a shared live xpra display.

Case notation: **P0** blocks release; **P1** is major functionality; **P2** is polish or optional. `V/S/R/A` names the required lane(s); an unavailable optional service is `N/A`, never `PASS`. A case passes only when its *effect* is observed. Log the active app, network response and visual state where relevant; a successful tap or a matching accessibility label is not enough.

### Seed data and baseline

Create two test users. In the primary user's QA folder prepare: empty and 3,000-entry directories; plain UTF-8 and large text files; a Unicode/space/long-name file; an image, audio, video, PDF and DOCX; a hidden file, symlink and read-only file; two same-named upload candidates with different bytes. Record sizes and SHA-256 hashes before testing. Prepare one short note and one note with a URL containing parentheses. Keep a second phone/browser signed in as the same user and a third session as the other user. Capture build version, commit, device/model, OS, Safari/PWA mode, viewport, network path (LAN/tunnel), timezone and service availability before the run.

## Access, shell and mobile viewport

| ID | Priority/lane | Action | Pass condition |
|---|---|---|---|
| AU-01 | P0 · V R | Open without a session, then sign in as the test user. | Protected shell/API do not expose user data before login; successful login reaches the desktop as the correct Linux user. |
| AU-02 | P0 · V R | Submit wrong password, retry, then use correct credentials. | Error is clear; no partial desktop appears; rate limiting does not permanently lock a valid user. |
| AU-03 | P0 · V R | Expire/revoke a session while the desktop is open, including after PWA resume. | A visible sign-in-again path recovers without a reload loop or lost unsaved data; a network outage is not mislabeled as expiry. |
| AU-04 | P0 · V R | Log out, use Back/reload, and open a bookmarked protected URL. | Session is gone and protected data cannot be revisited. |
| AU-05 | P0 · R | Install from Safari, first-launch through the tunnel/Access flow, quit and relaunch. | PWA signs in independently when needed, loads the same user's desktop, uses the correct icon and remains standalone. |
| SH-01 | P0 · V S R A | Cold-load desktop, open Start, Games and Utilities flyouts, launch an app, switch via taskbar, close it. | Correct app appears; taskbar active state and close action agree; flyouts/controls remain fully reachable. |
| SH-02 | P0 · V S R A | Open enough apps to overflow the taskbar, scroll it both ways, then switch to the first and last app. | No app or clock is stranded; taps activate the intended app, not a neighbor. |
| SH-03 | P1 · V S R | Rotate with Start/flyout and a modal open, then rotate back. | No horizontal page overflow, clipped action, trapped modal or wrong hit target; focus remains sensible. |
| SH-04 | P0 · V S R | Focus an input, open/close the keyboard, switch apps and dismiss it. | Only the active app owns input; no phantom keyboard/keybar or covered primary action remains. |
| SH-05 | P0 · R | In Safari and PWA, inspect the status-bar/top edge and taskbar after login, background/resume and reload. | No blurred top strip, wasted band, black bottom band or inaccessible taskbar; safe-area spacing is intentional. |
| SH-06 | P1 · V S R | Open warning/coach banners, tap their controls, then navigate below them. | Banners never cover the tab bar, input or action buttons; dismissing one never closes an app tab. |
| SH-07 | P1 · V S R | Try the floating-window toggle on a phone in both orientations. | Phone remains in the supported single-app layout; no hidden windows or stranded controls. |

## Keyboard and terminal (highest-risk area)

For every `KB` case, record `innerHeight`, `visualViewport.height/offsetTop`, active app, focused element, keyboard frame, keybar rect, last nonblank terminal row and cursor rect. A keyboard counts as **visible** only when its frame intersects the screen substantially **and** the visual viewport reflects the occlusion. A terminal line passes only if its bottom is above the keybar/keyboard top with clearance. Capture a screenshot *while* the asserted state exists. This prevents the false positives seen when XCTest exposed an off-screen Keyboard object.

| ID | Priority/lane | Action | Pass condition |
|---|---|---|---|
| KB-01 | P0 · S R | Open Terminal without tapping its content; then tap the terminal once. | No auto-keyboard on launch/switch; one intentional tap raises the real soft keyboard and focuses terminal input. |
| KB-02 | P0 · S R | Raise/dismiss the keyboard 10 times using the native Done control and by app switching. | Every cycle reaches the intended state; no stuck bar, double tap, first-character loss or stale viewport. |
| KB-03 | P0 · S R | At a short prompt, then after 200+ lines of output, raise the keyboard and type at the live bottom. | Prompt remains visible above the keybar; scrolling to history and back does not snap unexpectedly or cover the active line. |
| KB-04 | P0 · S R | Run a full-screen TUI (Codex or Claude Code), repaint menus and stream output while typing. | Full-screen content and active line remain visible; keybar never overlays the active menu/input; keys reach the TUI once. |
| KB-05 | P0 · S R | With keyboard open, rotate portrait→landscape→portrait, including during a long prompt. | Visible keyboard, bar and cursor settle in the right positions in both orientations without stale lift. |
| KB-06 | P0 · S R | Switch Terminal tabs with keyboard up; add/close a tab; switch away and back. | Keyboard ownership follows the active tab/app; each tab's input and scrollback remain distinct; no off-screen caret. |
| KB-07 | P0 · S R | Type a long wrapped command, press Backspace/Enter, use esc/tab/^C and each keybar arrow. | Text edits and PTY bytes are correct; no duplicate characters, missing Enter or unintended menu/history moves. |
| KB-08 | P0 · R | Use Chinese pinyin, choose 手机 from candidates, then dictate and paste text into Terminal. | Only committed Chinese text reaches the shell; raw pinyin and duplicate dictated/pasted text do not appear. Candidate row changes do not cover the prompt. |
| KB-09 | P0 · R | Long-press to select/copy terminal text, drag handles, scroll history; use two-finger resize and arrow-key slide. | Selection and scrolling remain usable; native loupe/keyboard do not fight the gesture; no stray PTY input. |
| KB-10 | P0 · S R | Refresh Safari with keyboard down/up; background PWA with keyboard up, resume after minutes and overnight. | Session recovers, keyboard can be raised again, active bottom line remains reachable; real reload is confirmed by a new page request. |
| KB-11 | P1 · R A | Repeat KB-01/03/05/08 with hardware keyboard disconnected/connected and each available IME. | Software-keyboard behavior is classified correctly; a hidden/off-screen keyboard is never counted as a pass. |
| TE-01 | P0 · V S R | Create, rename/reorder and close several Terminal tabs; open the same user on another device. | Correct tab is active, order/names synchronize, a closed tab stops its process without affecting neighbors. |
| TE-02 | P0 · V R | Start a command with output, suspend app/network, reconnect and switch devices. | Terminal reconnects in place; process and scrollback survive; no duplicate execution or reload loop. |
| TE-03 | P0 · V R | Open an HTTP URL printed in Terminal in the embedded Browser, then return. | Correct URL loads; Terminal state and focus recover. |
| TE-04 | P1 · V R | Create/edit/cancel scheduled terminal messages from the clock control. | Message arrives once in the intended tab/timezone; cancel prevents delivery. |

## P0/P1: Browser, Files, Notes and transfer

| ID | Priority/lane | Action | Pass condition |
|---|---|---|---|
| BR-01 | P0 · V R | Cold-open embedded Browser, enter a known URL, tap links, Back/Forward, reload and return to desktop. | Correct remote page and navigation state; tap coordinates match the visible canvas; no blank or endlessly reconnecting frame. |
| BR-02 | P0 · V R | Focus a field in embedded Browser and type, paste and dismiss the mobile keyboard. | Every character arrives once in the remote field; keyboard button/relay and Safari accessory do not trap focus or cover the field. |
| BR-03 | P1 · V R | Scroll, pinch/zoom and tap small controls in a long remote page in both orientations. | Gestures act on the intended page, not shell/taskbar; image stays aligned with hit targets after resize. |
| BR-04 | P0 · V R | Connect a desktop and phone as the same user; background/resume the phone and reopen Browser. | Clients share one browser without evicting each other or entering a reconnect loop; visible state is current. |
| BR-05 | P1 · V R | Send a URL from Notes, Files, Services and a terminal `xdg-open`/OAuth-style command. | Each reaches the user's embedded Browser exactly once; desktop hand-off and return path work. |
| XL-01 | P1 · V R | Launch a test GUI app from X11 Launcher and from a fresh Terminal, switch its tab, then close it. | Usable window appears promptly, canvas responds to touch, and closing the window releases any waiting terminal process. |
| XL-02 | P1 · V R | Launch two X11 windows; switch/close one, then explicitly close the whole Launcher. | Correct window activates; explicit close removes its windows; ordinary shell refresh does not. |
| FI-01 | P0 · V R A | Open Files at Home, navigate by row, breadcrumb, Back/Forward and editable path (`~`, relative, `..`). | Location and tab label match the real directory; Back/Forward are consistent; no two-tap focus wake-up. |
| FI-02 | P0 · V R A | Tap a file to select, open the touch action pill, select multiple, clear selection; try all toolbar rows. | Tap selects rather than unexpectedly opens; every action is visible, reachable and operates on the intended selection. |
| FI-03 | P1 · V R | Switch List/Grid/Gallery; sort by name/size/date; toggle hidden files and thumbnails. | Same files and order are represented correctly; layout preference survives reload and no item/action goes off-screen. |
| FI-04 | P0 · V R | New folder/file; rename; copy, cut/paste and move among folders; refresh/reopen. | Exact bytes, names and destinations are correct; no silent loss or duplicate; undo/conflict feedback is understandable. |
| FI-05 | P0 · V R | Delete a seeded file, then use the app's trash/recovery path if enabled. | Confirmation names the target; only that target changes; recovery/disabled-trash behavior matches Settings. |
| FI-06 | P1 · V R | Search by filename/content, including Unicode and no-result cases; inspect Get Info/hash. | Results point to correct files; empty state is clear; size/hash agrees with fixture. |
| FI-07 | P0 · V R | Edit a text file, find/replace, save and reopen; change the same file on another device before saving. | Saved bytes match input; conflict is shown rather than silently overwriting the newer version. |
| FI-08 | P1 · V R A | Quick Look image/PDF/audio/video; move through selections and close preview. | Viewer loads without flashing wrong content; controls fit screen; return preserves Files location/selection. |
| FI-09 | P0 · V R A | Download one file, a folder ZIP and multi-selection ZIP; upload via Files picker with same-name conflict. | Downloaded bytes/hash and ZIP members match source; conflict action is explicit; uploads land in selected folder. |
| FI-10 | P1 · V R | Open Files on two devices; add/navigate/close tabs from each side. | Folder tabs synchronize without jumping the locally active view or replacing a folder with `/`. |
| FI-11 | P0 · V | As another user and anonymously, attempt to read/mutate the first user's QA files via UI and `/api/fs/*`. | No cross-user listing or mutation; anonymous/forged access is denied. |
| FI-12 | P1 · V R | Select the read-only file, hidden file and symlink; try allowed and denied actions. | Permission errors are actionable; no operation escapes the user's filesystem permissions. |
| NO-01 | P0 · V R A | Create several Notes tabs, type Unicode/multiline text, wait for autosave, reload/reopen. | Exact content, order and active note survive; no lost last keystrokes. |
| NO-02 | P1 · V R | Rename, reorder and close an empty/non-empty note. | Correct note changes; non-empty delete confirms; cancel preserves content. |
| NO-03 | P0 · V R | Edit the same note on two devices, including one device with a pending unsaved edit. | Incoming sync does not clobber local typing; final server content follows the documented last-writer behavior, with caret still usable. |
| NO-04 | P1 · V R | Tap detected URL chips, including parentheses/semicolon; switch back. | Exact URL opens in the right embedded Browser and Notes text is unchanged. |
| NO-05 | P1 · R A | Edit a long note around the bottom of the screen with keyboard and IME; rotate and resume. | Active line and Save/status remain visible; no caret jump or input loss. |
| UP-01 | P0 · R A | From Upload, choose photo and Files document through native pickers; try camera capture if the OS offers it. | Picker opens from one tap; correct file, name, MIME/size and bytes reach the test user's Uploads folder. Record camera as N/A if the picker offers no camera action. |
| UP-02 | P0 · V R | Queue several files, including duplicate names; watch individual and total progress, then open in Files. | Each item advances 0→100→Done/Failed accurately; destination and conflict behavior are correct. |
| UP-03 | P1 · V R | Interrupt network during a large upload, reconnect and retry. | Failure is visible and recoverable; no corrupted partial file is presented as complete. |
| UP-04 | P1 · V R | Refresh folder listing, clear it after explicit confirmation, and reopen Upload. | List reflects on-disk state; Clear affects only intended upload items and has understandable feedback. |

## P1: Office, media, utilities and optional services

| ID | Priority/lane | Action | Pass condition |
|---|---|---|---|
| OF-01 | P1 · V R | From Files open DOCX/PDF in preview and launch Edit in Office on DOCX. | Correct document opens; mobile controls remain usable and no sibling file is altered. |
| OF-02 | P1 · V R | Edit/save an Office document, reload/reopen it; test a concurrent edit where supported. | Saved content survives and conflicts/lock behavior are explicit. |
| ME-01 | P1 · V R A | Open image/video/audio from Files, play/pause/seek/rotate, then return. | Media controls respond to touch; playback and viewer state are sane; no hidden close button. |
| UT-01 | P1 · V R | Open Utilities flyout on a narrow phone; launch Monitor and Token Stats, toggle usage/system strips. | Every row is reachable; values load or show a clear unavailable state; toggles persist and do not overlap shell controls. |
| UT-02 | P1 · V R | Open Services, refresh discovery, tap a card and its embedded-Browser action. | Cards name reachable services; destination opens in the intended browser; unavailable services show useful feedback. |
| UT-03 | P1 · V R | Inspect Monitor over different time ranges and rotate while charts load. | Legends, values, units and scroll/zoom fit the screen; no misleading stale data or layout overflow. |
| SY-01 | P0 · V | Compare standard and admin users in Start, Update and Config. | Operator-only actions are absent/denied to a standard user, including direct URL/API access. |
| SY-02 | P1 · V | In a disposable deployment, exercise Update no-op, update, failure/history and dirty-tree recovery. | Installed version, history and error paths match actual deployment; no silent destructive reset. |
| SY-03 | P1 · V | In Config, change one reversible setting, save/reload, restore it; try validation errors. | Only the intended setting changes, error is clear, and original value can be restored. |
| GM-01 | P1 · V R A | From Games flyout, open Minesweeper, Solitaire and 2048; perform a short legal game in each. | Touch controls work without hover/right-click; state and score respond correctly, including rotation/reopen. |
| GM-02 | P1 · V R A | Play Circuit Runner using touch pad: tap, hold, release, rotate and background/resume. | Buttons stay hittable; released direction never sticks; game remains playable on the smaller screen. |

## Cross-cutting recovery, security and experience

| ID | Priority/lane | Action | Pass condition |
|---|---|---|---|
| RC-01 | P0 · V R A | Turn Wi-Fi off during Terminal, Files save, Notes autosave, Browser load and Upload; restore it. | Each action shows an honest offline/pending state, does not silently claim success, and recovers without duplication or lost committed data. |
| RC-02 | P0 · V R | Background the app for 1 minute, 30 minutes and overnight; resume from locked phone and from another app. | Session/auth state is accurate, live apps reconnect, active line and controls are reachable; no black band or frozen canvas. |
| RC-03 | P0 · V R | Use two devices as one user: edit Notes, navigate Files, open/close apps/tabs, use Browser concurrently. | Documented shared state synchronizes; local active view is not unexpectedly stolen; Browser clients do not evict each other. |
| RC-04 | P0 · V | Repeat representative Files/Notes/Terminal/API actions as user B and anonymously. | User A's state and processes remain inaccessible; wrong-user or anonymous requests never fall back to the service account. |
| RC-05 | P1 · V R | Load a PWA, deploy a newer shell in the disposable environment, then reload/reopen the old client. | Service worker moves to the new version without stale mixed assets, endless reload or lost user state. |
| RC-06 | P1 · V R A | Double-tap actions, tap while loading, switch rapidly among three apps, rotate mid-request. | No duplicate create/delete/upload/command; visible state converges; controls never become permanently inert. |
| RC-07 | P1 · V R A | Open a full taskbar, many file entries and long note/terminal history; keep the app open for 30 minutes. | Scrolling remains responsive, no growing lag or crash, and backend memory/CPU return near idle after activity. Record timings and memory against the baseline rather than guessing from one run. |
| UX-01 | P1 · R A | Complete common journeys with one hand and without prior instructions. | Actions are discoverable, touch targets meet the QA charter's ~44px aim, feedback is immediate, errors say how to recover. |
| UX-02 | P1 · V R A | Inspect every modal, menu, picker, banner and form at small width, keyboard open and landscape. | No overlap, sideways page scroll, clipped label or off-screen confirmation button; text remains legible. |
| UX-03 | P1 · R A | Navigate core flows with VoiceOver/TalkBack and an external keyboard where available. | Controls have names and focus order, active state is not color-only, focus is visible and not trapped; reduced motion remains usable. |
| UX-04 | P2 · R A | Check light/dark appearance, large text, translated/Unicode filenames and long service names. | Content remains readable; truncation preserves meaning; no missing icons or alignment jitter. |

The optional Iron Frontier/RTS game lives in a separate sibling project and is outside this plan. If it is installed, test it under its own project's suite rather than silently treating it as covered here.

### State-transition matrix

Use this matrix to select combinations after each app's basic journey passes. `●` is required; `○` is a secondary pairwise sample. “Resume” means leave the browser/PWA for another app and return; “two clients” means concurrent sessions as the same user. Record the app and tab that was active before each transition.

| App | Rotate | Reload | Resume | Network loss | Two clients |
|---|---:|---:|---:|---:|---:|
| Terminal / TUI | ● | ● | ● | ● | ● |
| Browser / xpra | ● | ● | ● | ● | ● |
| Files | ● | ● | ● | ● | ● |
| Notes | ● | ● | ● | ● | ● |
| Upload | ○ | ● | ● | ● | ○ |
| X11 Launcher | ● | ○ | ● | ○ | ○ |
| Office / media viewers | ● | ● | ○ | ○ | ○ |
| Utilities / System / Games | ● | ○ | ○ | ○ | ○ |

For each `●`, verify the saved data or live process after the transition; returning to a visually similar screen is insufficient. For `○`, choose at least one app and one error path in that row rather than multiplying every combination.

## How to execute and record a run

1. **Establish a clean baseline.** Record build commit, device/OS, connection, available services, fixture hashes and a screenshot of the empty state. Run `./run-tests.sh`, then the VM mobile WebKit/Chrome suite. A green unit or Playwright result is evidence for its stated contract only.
2. **Run the P0 journeys on a real phone.** Start with access/shell, then KB/TE, Files/Notes/Upload, and recovery. Repeat Safari and installed PWA; keep a second client open for sync cases. Use the iOS simulator to repeat failures with XCTest and viewport telemetry. Run Android for shared P0 cases.
3. **Run P1 and experience passes.** Exercise every app and error path, then perform a free-form “picky user” walkthrough: try to discover actions without instructions, look for misleading feedback and notice any rough edge. Do not let a functional PASS hide a usability FAIL.
4. **Reproduce and triage.** For each failure, save a screen recording/screenshot at the failure, steps from a fresh state, app/terminal/tab identity, device and mode, expected vs actual, response/status or server log where relevant, and reproduction count (for an intermittent issue, at least 20 attempts or a stated time window). Separate **product defect**, **test harness defect**, **environment/service unavailable**, and **unverified**.
5. **Verify fixes and clean up.** Re-run the exact failing case on the same device/mode, its adjacent cases and the relevant automation; compare fixture hashes; remove only the dedicated QA data. Keep the test evidence/report, not a live test account's clutter.

Suggested run-sheet row (one per case and lane):

| Run ID | Case | Lane/device/mode | Build | Result `PASS/FAIL/BLOCKED/N/A` | Observed evidence | Defect link |
|---|---|---|---|---|---|---|
| `2026-…` | `KB-03` | `R · iPhone · PWA · portrait` | commit SHA | `…` | screenshot/video + viewport/line geometry | `…` |

For visual/keyboard assertions, the screenshot must show the asserted state at that moment. Check an accessibility element's **frame and hitability**, the actual active app, and a network/page request when the case says “reloaded.” Do not classify a keyboard object below the screen as an open keyboard. Distinguish `FAIL` from `BLOCKED` (e.g. the full Browser stack was not installed in the VM). A test that can pass without the intended action occurring is invalid and must be fixed before its result counts.

## Automation map and sign-off

The existing VM suite already covers pieces of SH, FI, NO, UP, auth/isolation, layout, Games and window-mode behavior (`tests/e2e/tests/{smoke,layout,files-native,files-native-layout,upload,multiuser,games,window-mode,cross-app-focus,terminal-tabs}.spec.js`). `shell/keybar.test.js` guards viewport math, and `apps/everyday/terminal/lib/kbd-input.test.js` guards forwarding logic. These are **not** real Safari keyboard tests.

| Next implementation | Cases | Required assertion |
|---|---|---|
| VM mobile journeys: auth/shell/Notes/Files/Upload | AU-01–04, SH-01–04, FI-01–10, NO-01–04, UP-02–04 | Check resulting server/user state and bytes, as well as visible UI. Seed and clean a dedicated test account. |
| VM failure and two-client journeys | AU-03, BR-04, FI-10–11, NO-03, RC-01–06 | Control network/auth transitions; check no duplicate side effect, cross-user leak or stale client. |
| iOS XCTest touch/keyboard suite | SH-01–06, KB-01–07/10, TE-01, BR-01–03 | Assert active app, hittable control frame, visible keyboard/screen intersection, viewport shrink and cursor–keybar clearance. Confirm reload by a request. |
| Real-device guided cards | AU-05, SH-05, KB-08–11, UP-01, RC-02, UX-01–04 | Capture device video and observations for IME, picker, PWA, overnight resume and human usability. |

Keep R-only guided checks for IME, native picker, PWA status bar, overnight resume, VoiceOver and human UX judgment. Make each new automated test fail against the corresponding broken behavior before counting it as a regression guard; a test that passes when its intended action never occurred does not protect the product.

Release sign-off requires: every applicable P0 case executed on the primary real iPhone in both Safari and PWA; no unresolved P0 defect; P1 failures explicitly triaged; no BLOCKED/UNVERIFIED case reported as PASS; fixture integrity checked; and a concise report that states what was *not* covered. The iOS simulator is a diagnostic aid, not a substitute for this real-phone gate.
