# Design decisions & hard-won fixes

A running log of non-obvious problems this project has hit and how they were
solved — the *why* behind choices that aren't self-evident from the code, and
the dead ends that were ruled out. Read this before re-litigating a design or
"simplifying" something that looks odd; it's probably odd on purpose.

> **Maintenance rule:** whenever you solve a new non-obvious problem (a bug whose
> cause was surprising, a workaround for an external tool, a design fork with a
> rejected alternative), **add an entry here** in the same Problem → Cause →
> Fix → Alternatives-rejected shape. Keep the canonical architecture in
> [`../CLAUDE.md`](../CLAUDE.md); this file is the *reasoning* and *history*.

Each entry: **Symptom** (what you'd observe), **Cause** (root cause, ideally
with evidence), **Fix** (what we did), **Rejected** (what we tried or considered
and why it lost).

---

## The Claude-usage strip froze for a day: a config value with two resolvers

**Symptom:** the desktop's Claude-usage strip read `updated 955m ago` and never
advanced. The proxy was **running**, listening on `:7690`, `ANTHROPIC_BASE_URL`
was set in `~/.claude/settings.json`, and it was demonstrably relaying traffic
(9.6s of CPU). Nothing looked broken. The only evidence was in a journal nobody
tails:

```
[claude-proxy] usage write failed: [Errno 13] Permission denied:
    /opt/vibetop/.local/share/.cu-rnv6wbkn
```

**Cause:** the proxy's unit said `User=vibetop` — the **service account** — so it
resolved `~/.local/share` to `/opt/vibetop/...` and every capture died with
EACCES, while the manager kept reading the **operator's** copy under
`/home/junjie/...`, untouched since the `/opt` migration. A *stale but plausible*
number, which is far worse than an error: the surface looked alive.

The unit template already guards this with `User=@OPERATOR@`. The stamping is
where it went wrong, and it took **two scripts each doing something reasonable**:

- `claude-usage/install.sh` resolved `OPERATOR` from `$VIBETOP_ADMINS` **in its
  environment**, falling back to `APP_USER`. But that value lives in
  `/etc/vibetop/manager.env`, which it never read.
- `tools/lib/layout.sh`'s `vt_installer_env_array` — the one shared "install into
  the /opt layout" env handed to every sub-installer — passed `APP_USER`,
  `APP_HOME`, `LANDING_DIR` and the secret paths, but **not `VIBETOP_ADMINS`**.
- `tools/migrate-to-opt.sh` *does* pass `VIBETOP_ADMINS`… and deliberately skips
  the claude-usage installer, so as not to disrupt a pinned Claude Code session.

So the script that knew the operator never ran the installer, and the installer
that ran never knew the operator. `deploy.sh` then rendered `User=vibetop`, and
every subsequent deploy re-rendered it the same way.

**Fix (four layers, because any one alone just moves the trap):**
1. **One authority.** `vt_installer_env_array` now reads `VIBETOP_ADMINS` from
   the manager env file it itself writes, and passes it to *every* installer —
   not just the one that happened to need it today.
2. **Belt.** `claude-usage/install.sh` also reads the env file directly when the
   variable isn't in its environment (the lookup `tools/smoke-test.sh` already
   used), validates the resolved operator exists, and prints it in the banner —
   the banner previously showed only `APP_USER`, which is *why* a wrong operator
   was invisible at install time.
3. **The producer checks its own output.** After rendering, the installer probes
   that the operator can actually write their `~/.local/share`, and warns loudly
   with the exact cause if not. This runs on every deploy, unprompted.
4. **A detector.** `tools/doctor.sh` gained an *Operator identity* section: it
   compares the deployed unit's `User=` against `VIBETOP_ADMINS`, refuses an
   operator that is the service account, and scans the proxy's journal **since
   the unit last started** (not a flat 24h window — a check that stays red after
   you fix it stops being read).

Locked by two static tests: one drives the real installer in `--dry-run` against
a fake env file and asserts the rendered identity; one asserts
`vt_installer_env_array` carries `VIBETOP_ADMINS`. Both fail against the pre-fix
code (`User=root`).

**The generalizable lesson:** when a producer and a consumer resolve the same
identity or path *independently*, they will eventually disagree, and the failure
is silent because each side is individually correct. This is the same shape as
`xpra-patches.js` 404ing after the `/opt` move (`www` vs `vibetop-www`). The
durable countermeasure is a single authority plus an automated agreement check —
not a more careful default.

**The web-root instance of the same class**, now covered by a second doctor
section (*Web root*). nginx's `root` is rendered by `terminal/install.sh` from
`LANDING_DIR`; the files are put there by `landing/install.sh` from `DST_DIR`.
Two resolvers, one path — and an in-app Update passes **neither**, so both fall
back to `$APP_HOME/vibetop-www`. A deploy that once used a different value leaves
a fully-populated directory nginx never serves, and the only symptom is a 404 on
an injected asset. The checks:
- every `?v=`-busted script the nginx config **injects by sub_filter** must exist
  at the served root (the exact check the `xpra-patches.js` 404 needed);
- every local `<script src="/…">` in the **deployed** pages must resolve there,
  skipping proxied prefixes (`/onlyoffice/…/api.js` is served by the container,
  not from disk);
- a sibling `*www*` directory holding an `index.html`/`sw.js` is reported —
  **FAIL if it is newer** than the served root (the last deploy went to the wrong
  place and you are staring at old files), WARN if merely orphaned;
- the deployed `sw.js` VERSION vs the checkout's — "bumped but never deployed"
  means no client auto-refreshes, the documented release-checklist trap.

Writing that skip-list duplicated `sw.js`'s `BYPASS` into `doctor.sh` — the very
divergence this entry is about — so
`test_static.py::test_doctor_proxied_prefixes_cover_the_sw_bypass_list` pins the
two together (allowing the two deliberate differences: `services.json` is a real
file in the web root, and `/s/` share links never reach the service worker).

**Postscript: the detector had the same disease.** With both sections added,
`doctor.sh` printed **5 FAILs on a healthy `/opt` host** — four for the shared
`vibetop-{browser-xpra,x11-xpra,x11-dbus,filebrowser}` units being "inactive"
(they are the LEGACY single-user services; a multi-user host runs one transient
unit per user, so inactive is *correct* — `smoke-test.sh` had known this for a
while and reported SKIP), and one for the OnlyOffice JWT secret being "missing"
at `$APP_HOME/.config/vibetop/onlyoffice.secret` — which doctor resolved
**independently** while the authority, `ONLYOFFICE_SECRET_FILE` in
`/etc/vibetop/manager.env`, points at `/opt/vibetop/etc/`. The tool built to
catch two-resolver drift contained an instance of it.

Fixed by giving doctor a `MULTIUSER` flag (read from the deployed site's
`auth_request /internal/authcheck` — doctor is offline, so it reads config where
smoke-test probes HTTP), a `shared_unit` helper mirroring smoke-test's, and a
single `vt_env_get` accessor for the manager env file. Also: a `0700` secret
directory now reports SKIP for a non-root run rather than "missing" — **"I can't
look" must never be reported as "it isn't there"**, the same rule that makes
`smoke-test.sh` exit 2 = INCONCLUSIVE instead of 0. Verified in both directions:
a simulated single-user site still FAILs on those inactive units, so the checks
kept their teeth.

The rule this leaves behind: **a check that is red on a healthy host is worse
than no check**, because it trains everyone to ignore the output — the same reason
the proxy journal scan is scoped to the current run of the unit rather than a flat
24h window.

**Rejected:**
- **Making the usage strip raise a red system-health banner when data is stale.**
  Staleness is ambiguous: it also means "you simply haven't used Claude in 16h",
  so it would cry wolf. The config comparison has no false positives.
- **Having the proxy expose a `/health` endpoint** with relayed/captured counts
  for the manager to poll. Genuinely diagnostic, but it adds an endpoint to an
  auth-free loopback proxy to detect something a config assertion already catches
  before it can happen.
- **Defaulting `OPERATOR` to "the first non-system user with a `~/.claude`".**
  Guessing an identity is how you get a *different* silent misattribution.

---

## Scheduled terminal messages ("resume when the token limit resets")

**Symptom (need, not bug):** a Claude Code session stops at its 5-hour token limit
and prints the reset time. Resuming meant being at the keyboard at that moment —
so an overnight limit cost the whole night.

**Cause:** nothing was wrong; the missing capability was "type this into terminal N
at 07:00". The obvious place to put a timer — the browser — is the one place it
can't live: a `setTimeout` in `terminals.html` dies with the tab, with the device
sleeping, and with the reload the SSE deploy-push triggers. The unattended case is
the *only* case that matters here.

**Fix:** a server-side sweeper thread (`_schedule_loop`, 15s tick) over a registry
at `/var/lib/vibetop/schedules.json`, plus a `⏱` control on the Terminal tab bar
(`GET/POST /api/terminals/schedules`, `POST /api/terminals/schedules/cancel`; the
list rides the existing 2.5s `/api/terminals/status` poll rather than adding a
second loop). Firing needed **no new mechanism**: `vibetop-session`'s Unix socket
is a raw bidirectional byte stream, and every byte a client sends is written
straight into the PTY master, so `_inject_terminal` connects, sends the text and
the `\r`, and closes. (Originally one `sendall(text + b"\r")`; the Enter is now a
separate delayed write — see *The Enter a paste-detecting TUI swallows* below.)
Three details are load-bearing:
- **`\r`, not `\n`** — the attach client clears `ICRNL`, so `\r` is what a real
  Enter delivers.
- **Drain and discard for 0.75s before closing** (`INJECT_DRAIN`). The first cut
  wrote and closed immediately, reasoning that the replay ring the daemon queues
  at every new client (up to 2 MB) was ours to ignore. On a live terminal that
  silently lost every message while still reporting `sent`: closing with the
  replay unread makes the **daemon's own** `recv()` fail with ECONNRESET, so it
  takes the `if not data: remove_client(fd)` branch and drops the client *before*
  writing our bytes to the PTY. Holding the socket briefly — draining and
  throwing the replay away — fixes it. Empirically: close-immediately never
  executed the command, a 0.5s hold always did. Guarded by
  `test_inject_survives_the_replay_the_daemon_queues_on_connect`.
- **Injection happens outside `_schedules_lock`** — a wedged session daemon would
  otherwise block every schedules request behind the sweeper's 5s socket timeout.

**Security — the registry is root-owned `0600` inside a `0700` directory.** The
sweeper runs as root and writes into whichever user's PTY an entry names, so a
tenant-writable registry would be code execution as another user. That is why
`_write_schedules` passes `owner="root"` to `_atomic_write` (whose default chowns
to the *request* user — correct for per-user state in a home, wrong here) and why
`_var_lib_dir()` locks the directory down: `os.makedirs` leaves it `0755`, and the
sibling registries (`users.json`, `idle.json`, `resources.json`) live in it too.
Ownership always comes from the session, never from a body field.

A missed window is **not** silently dropped: an entry fires up to `SCHED_LATE_GRACE`
(2h) late, so a manager restart or brief outage still delivers, and only past that
is it marked `missed` and shown as such. The idle reaper also stops reaping a
user's *terminals* while they hold a pending schedule — otherwise the feature would
fail with "terminal N is not running" at exactly the unattended moment it exists for.

**Rejected:**
- **A client-side timer.** Dies with the tab/device/reload — see above.
- **Cold-starting a stopped terminal at fire time.** A fresh bash has none of the
  session the message was written for, so "continue" would land as
  `command not found`. Failing loudly with "terminal N is not running" is honest;
  typing into the wrong context is not.
- **`TIOCSTI`** to fake terminal input from outside — disabled on modern kernels.
- **One `systemd-run --on-calendar` transient timer per schedule.** Works, but
  scatters the state across systemd units instead of one inspectable registry, and
  can't be listed, cancelled, or shown with an outcome coherently.
- **Auto-reading the Claude reset time** from the usage proxy to schedule "at next
  reset". Deferred: it would couple this to the opt-in Claude-usage feature, and
  the reset time is already on screen — an absolute picker with `+30m/+1h/+5h`
  quick-fill covers it without the coupling.
- **Multi-line messages.** Rejected: we append the Enter ourselves, and allowing
  `\r`/`\n` would let one entry chain commands past what was reviewed in the form.

---

## A terminal loops "loading / disconnect / reconnect" forever on a thin link (in-flight WiFi)

**Symptom:** On a very low-bandwidth, high-latency connection (airplane WiFi, a
weak tether), **one** terminal — always the busiest one — never finishes loading:
it connects, disconnects, and reconnects on a tight cycle indefinitely, while
quieter terminals are fine. On the same host over LAN or cellular it's perfect. A
secondary symptom on touch clients: the soft keyboard **keeps dropping** while you
type (each reconnect steals focus and iOS collapses the keyboard).

**Cause:** On every (re)connect, `vibetop-session` replays its **entire ring
buffer** — up to 2 MB (`CLAUDE_SESSION_BUFSIZE`) — as one burst to rebuild
scrollback (`terminal/vibetop-session`, `ring.read_all()` on accept). WebSocket
ping/pong are control frames but ride the **same ordered TCP stream** as that data,
so on a thin link the keepalive ping sits behind the whole 2 MB burst and reaches
the client tens of seconds late; ttyd declares the socket dead and its
`reconnect=3` reconnects, re-replaying the full burst → a permanent loop. It hits
the busiest terminal because its ring is fullest (or it's actively streaming
output, which keeps the pipe saturated). The keyboard-drop is the *same* churn:
every reconnect re-inits the terminal / fires the reconnect guard's synthesized
Enter, blurring the overlay input.

**Fix:** **Paced replay** (opt-in, default off). Setting `CLAUDE_SESSION_REPLAY_RATE`
(bytes/sec) meters ALL output to a client to that rate with a one-chunk burst
(`CLAUDE_SESSION_REPLAY_CHUNK`, default 32 KB), so no more than one chunk sits
ahead of a ping at any moment and the keepalive survives. Implemented as a
per-client gate on the existing `client_outq` drain: a `pace_next[fd]` deadline;
while inside the gap the fd requests **no** write event (so a writable socket can't
spin the loop) and the select timeout is shortened to the gap's end. Live output is
routed through the same queue so it can't jump ahead of a draining replay.
`rate<=0` (the default) is byte-for-byte the old path — flush drains the whole
queue at socket speed — so **LAN is unaffected** (smoke-measured: 196 KB replays in
0.01 s unpaced vs a metered ~30 KB/s when set). The manager forwards
`CLAUDE_SESSION_REPLAY_RATE`/`_CHUNK`/`CLAUDE_SESSION_BUFSIZE` from its own env into
each `systemd-run` session (`_user_terminal_setenvs`) — systemd-run does **not**
inherit the manager's env, so without this the knob would silently never arrive.
Set the low-bandwidth profile once in `/etc/vibetop/manager.env` (e.g.
`CLAUDE_SESSION_REPLAY_RATE=131072`, and optionally a smaller
`CLAUDE_SESSION_BUFSIZE`) + restart the manager; it applies to sessions started
after. Immediate relief with no deploy: restart the offending terminal (× then +)
to clear its 2 MB ring, or stop whatever is streaming in it.

**Rejected:** (1) *Just lower the ring cap* — helps (less to replay) but doesn't
stop the loop; a smaller burst can still outlast the keepalive on a bad enough
link, and you lose scrollback for everyone. Kept as a complementary knob, not the
fix. (2) *An always-on pace rate* — any rate low enough to help a plane (~256 KB/s)
adds ~8 s to a 2 MB reconnect-repaint on LAN, a regression for everyone to fix one
trip. Made it opt-in instead. (3) *Adaptive rate from backpressure detection* — a
short-write on the unix socket happens on LAN too (SO_SNDBUF ~208 KB < 2 MB), so
"backpressure seen" doesn't distinguish a fast link that drains in 1 ms from a slow
one that takes seconds; measuring drain-rate reliably is fiddly and untested, so a
plain configurable rate won over a clever heuristic. (4) *Chunk without pacing* —
the daemon already queues non-blocking (`client_outq`); splitting the write without
a wall-clock gap changes nothing, because the bytes still enter the pipeline as
fast as it drains. (5) *Delta/resume replay (send only what the client lacks)* —
the right long-term design (sequence-tag the stream, client reports its high-water
mark like SSE `Last-Event-ID`/mosh), but the client is ttyd+xterm, whose reconnect
hands the daemon an **anonymous** fresh connection with no channel to say "I have
up to N"; doing it properly needs a vibetop-owned replay side-channel, deferred.

**Follow-up — adaptive replay (`CLAUDE_SESSION_REPLAY_ADAPTIVE`, opt-in).** The
fixed rate above works but has to be guessed. The adaptive mode auto-fits the
connection with two mechanisms and **no rate to set**: (1) it **shrinks the
accepted socket's `SO_SNDBUF`** (default 32 KB) so the existing `EVENT_WRITE`
drain meters output to whatever the link actually takes, and only ~one small
buffer ever sits ahead of the keepalive — a fast client still gets the whole ring
at full speed (the buffer drains instantly), a slow one is throttled to its real
rate. This directly *overcomes* rejected-alternative (3): the reason backpressure
"couldn't distinguish fast from slow" was the ~200 KB default `SO_SNDBUF` swallowing
the burst before any short-write; shrinking it makes the short-write track real
delivery. (2) A **budget truncation**: send the ring oldest→newest, and if after
`REPLAY_BUDGET` (2.5 s) a client still has a large backlog, replace it with a clear +
the current screen (`screen_replay_bytes` = `max(16 KB, rows*cols*4)`, so a big
colored desktop screen isn't clipped) via `truncate_replay` — in-order (only the OLD
middle is dropped, never reordered, so xterm can't be corrupted), landing a very slow
client on a usable prompt in ~budget instead of tens of seconds of scrollback. Smoke-
validated: a 4 KB/150 ms reader gets truncated to ~one screen (keeps the newest bytes),
a fast reader gets the whole ring untouched. **Caveat:** both mechanisms need the
downstream chain (pipe→ttyd→libwebsockets→WS) to actually backpressure; if lws buffers
unboundedly the mode degrades to ~unpaced, so the real-link behavior — and the exact
`SO_SNDBUF`/budget — should still be validated on an actual thin link. **Shipped
default ON** (`CLAUDE_SESSION_REPLAY_ADAPTIVE` defaults to `1`): it strictly improves
the fast-link case (no fixed-rate throttle on a good connection) and auto-handles the
slow one, and the degradation floor is "no worse than unpaced." Escape hatch:
`CLAUDE_SESSION_REPLAY_ADAPTIVE=0` disables it and falls back to the fixed
`CLAUDE_SESSION_REPLAY_RATE` (if set) as a static floor — the one line to pull if the
full ttyd→lws→WS chain turns out not to backpressure and the reconnect loop returns.
The pure pieces (`screen_replay_bytes`, `truncate_replay`) are unit-tested; the loop
path is smoke-tested (`tests/` guards the helpers).

## Video/office viewers couldn't open a user's files OUTSIDE their home

**Symptom:** After dotfiles became reachable in the file browser, the **video player**
(and the **office** viewer) still failed on files under `/tnas/…`, `/mnt/…`, anywhere
outside `~` — e.g. a video at `/tnas/junjie/.av/x.mp4` that the user's Terminal plays
fine. Looked like the dotfile fix was incomplete; actually it was unrelated to dotfiles.

**Cause:** The **file browser** (FileBrowser) runs **as the user**, rooted at `/`, so
Unix perms are its fence — it reaches anything the user can. But the **video/office
viewers are served by the manager, which runs as ROOT**. To stop root from handing a
user *any* file on the box (`/etc/shadow`, other users' data), `_resolve_media_path` /
`_resolve_under_home` **fenced to the user's home** (`realpath` must start with
`$HOME`). So every file outside home — dot or not — was refused by those two viewers,
while the browser showed it. A deliberate, security-*tested* fence that was simply too
coarse.

**Fix — authorize as the user instead of fencing to home.** Replace the home fence
with an **as-the-user read check** (`_user_can_read`): resolve the path (`realpath`,
absolute-first since FileBrowser sends absolute paths, home-relative fallback), then
verify the *user* can read it before root serves it. Since root's own `access(2)`
bypasses permissions, the check runs a `test -r` child launched with the user's
**uid + primary gid + full supplementary group set** (`os.getgrouplist` →
`subprocess(..., user=, group=, extra_groups=)`). Verified on the host: `/tnas/you/.av`
(reachable only via the `adm` supplementary group over NFS `sec=sys`) → allowed;
`/etc/shadow` → refused; `/etc/passwd` (world-readable) → allowed. The read check
**subsumes** path-traversal / symlink / absolute escapes — any of them can only ever
land on a file the user could already read — so the old `../`, symlink-escape, and
absolute-outside guards (and their tests) become an authorization test instead: "serve
iff the user can read it." Non-root (dev/tests) can't `setuid`, so the check falls back
to a plain `os.access` with the current creds; a conftest autouse pins it to `os.access`
so resolution is deterministic regardless of the test runner's uid.

**Rejected:** (1) *Keep the home fence, symlink the NAS into `~`* — per-user manual
setup, breaks for arbitrary mounts, and doesn't generalize. (2) *Run ffmpeg/LibreOffice
as the user (systemd-run/su) so no root read happens* — the correct end state, but a
much larger change to the whole prep/cache pipeline, and the direct-serve path
(`.mp4`/`.webm` streamed by the manager) would STILL need an as-user gate, so the gate
is required regardless; do the gate first. (3) *Widen the fence to a hardcoded allowlist
of mounts* — brittle and still coarser than the user's real perms.

## Files app 403'd a user's own dotfiles ("You don't have permissions to access this")

**Symptom:** Navigating to a dotted path in the Files app — e.g. `/tnas/junjie/.av`
(a dir the user owns/reaches) — returned FileBrowser's **"You don't have permissions
to access this"** (HTTP 403), even though the same user's **Terminal** (running as
them) `ls`'d it fine. Looked like a permissions/NFS/multi-user bug.

**Cause:** *Not* Unix permissions and *not* our nginx (the dotfile 403 there is only
on `/fileview/`, not `/files/`). The per-user FileBrowser was provisioned with
**`--hideDotfiles`** (`_provision_user_filebrowser`: `config set --hideDotfiles` +
`users update admin --hideDotfiles`). FileBrowser's `hideDotfiles` **conflates two
things**: it hides dotfiles from listings AND its access checker (`data.Check`)
returns **403 for any path starting with `.`**. So direct access to a dotfile was
blocked purely by that flag. Verified the OS was innocent: a shell with the *same*
uid + supplementary groups as the FileBrowser process (incl. `adm`, which `.av`'s
`drwxrwx--- 2000 adm` grants via group) read it without issue. This contradicted the
app's own model — "runs as you; Unix perms are the fence, SSH-equivalent" — by hiding
the user's own reachable data behind a hard block.

**Fix — decouple hide from block:** turn `hideDotfiles` **off** server-side
(`--hideDotfiles=false` on both the `config set` and `users update admin` lines, so
existing users flip on their next FileBrowser restart), which stops the 403 and lets
a **typed path** navigate straight into a dotfile. Then keep listings clean
**client-side** in `filebrowser-patches.js` with one CSS rule —
`#listing [aria-label^='.'] { display:none !important; }` (FileBrowser labels each
item `aria-label=<filename>`, so this hides dotfile rows in list *and* mosaic views).
Net: dotfiles stay hidden in listings but are reachable by typing the path — exactly
the "hidden but accessible" behavior a file-manager-as-you should have.

**Rejected:** (1) *Remove `--hideDotfiles` entirely and show dotfiles* — simplest, but
clutters every home listing with `.bashrc`/`.cache`/`.config` and loses the clean
default the user wanted. (2) *Keep the flag, tell the user to toggle "Hide dotfiles"
off in FileBrowser Settings* — that toggle re-blocks access when re-enabled (same
conflation) and our re-provision would stomp it on restart; also buried. (3) *A
toolbar "Show hidden" toggle wired to the user's `hideDotfiles`* — more UI for a
default the user explicitly wanted to keep (hidden), and still all-or-nothing per the
conflation. The server-off + client-CSS split is the only option that keeps listings
hidden **and** access open without a per-file mechanism FileBrowser doesn't offer.

## The streamed Browser is device-SHAPED (mobile browser on a phone, desktop on a computer)

**Symptom / framing:** The Browser felt bad on mobile — couldn't zoom out, awkward
touch, a long keyboard saga. The instinct to "use the phone's native Safari" is WRONG
and misses the product's whole point: **the Browser's value is that it runs on the
host** — it browses from the *host's* network/location, so it bypasses the *user's*
local firewall / content filters / geo-blocks / censorship, inside the mini-OS desktop.
A native client browser would browse from the user's restricted local network and
defeat that entirely. So streaming a host browser is mandatory; the job is to make the
*host-streamed* browser device-appropriate.

**Cause:** the host ran ONE desktop-shaped Chromium (desktop UA, desktop layout) and
streamed it to phones too — so a phone got a desktop page crammed onto a phone screen
(too wide, wrong layout, needs a zoom-out that a pixel stream fundamentally can't do
without a re-render). Nearly all the mobile friction traces to shaping the browser for
the wrong device, not to streaming itself. (Proven on z20: a Chromium launched with a
mobile UA renders sites' real mobile layouts at phone width — Wikipedia served its
Minerva mobile skin instead of the squeezed desktop Vector skin.)

**Fix — "shape-claim":** ONE per-user Chromium that **reshapes to the device viewing
it**. `browser/browser-loop.sh` reads `$PROFILE/vibetop-shape` (`mobile`|`desktop`) each
(re)spawn and picks the flag set (mobile: mobile UA + `--touch-events` + overlay
scrollbars; desktop: as before). On connect, `xpra-patches.js` patch 11 POSTs
`/api/browser/shape` with `mobile` on touch / `desktop` otherwise; the manager writes
the shape file and SIGTERMs that user's chromium so the loop respawns it in the new
shape — **same profile + `--restore-last-session`, so tabs/logins follow you across
devices** (continuity is free, not a feature to build). Idempotent (no-op when already
that shape); the double-tap size-reclaim gesture re-asserts shape too. Desktop is
unchanged (it claims `desktop`). Still 100% host-streamed — the anti-restriction value
is intact.

**Rejected:** native client browser (defeats the anti-restriction value — the whole
point). Two Chromium instances per user (a desktop + a mobile display): Chromium
hard-locks a profile, so logins/cookies wouldn't roam → no continuity; 2× resources;
`/api/browser/open` becomes ambiguous. Per-tab CDP `Emulation` device metrics (elegant
on paper): `--load-extension`/debugger friction under snap confinement, DevTools-version
fragility. Client-side fit-width/zoom-out or `Ctrl+-`: a pixel stream can't reflow, and
`Ctrl+-` breaks layouts. Deferred: 2×-DPI crispness (`--force-device-scale-factor=2`)
needs a paired client display-upscale (xpra `client.scale=2`) or the CSS viewport
halves — shipped mobile *layout* first (the experience win), DPI as a follow-up.

---

## Mobile Browser typing: dropped/reordered letters, and Chinese typed nothing

**Symptom:** On iPhone, typing into the Browser (xpra) via the ⌨ button: fast typing
lost letters; `hpc` came out `hc` or `pc` (a spurious backspace of a middle/first
char); and **Chinese via pinyin typed nothing at all** while English worked.

**Cause — two independent bugs in the same relay:**
1. *Dropped/reordered (the diff):* the desktop shell's `#kbd-input` forwarded keys by
   a **debounced value-diff** — compare `input.value` to `lastVal`, emit Backspaces +
   chars. That assumes `input.value` only ever grows by append between flushes, which
   **WebKit violates**: marked-text/QuickType/dictation rewrite the field
   *non-monotonically* (delete-then-reinsert across separate input tasks). An 80 ms
   flush timer sampling the field mid-rewrite saw a half-state (e.g. `"h"` while `"hp"`
   was being rewritten) → computed a spurious Backspace → `hpc` rendered `hc`. Fast
   typing is the same failure continuously.
2. *CJK dropped (the server):* a Chinese character has **no X11 keysym**, and the
   whole path (synthetic KeyboardEvent → xpra `_keyb_process` → `key-action` with a
   keyval) dies at the server: xpra 6.4.4 `keyboard.py` `_process_key_action` does
   `if keycode >= 0` and **silently drops** anything `find_matching_keycode` can't
   resolve, and that only resolves keysyms present in the live X keymap (no hanzi). The
   client's own tablet-input path (`#pasteboard`) sends the raw codepoint (not even
   X's `0x1000000|cp` Unicode-keysym convention), so it dies too — **routing CJK
   through `#pasteboard` does not work** (a dead end we verified before shipping).

**Fix:**
- *Diff → read-and-clear* (`landing/desktop.html setupKbd`): mirror xpra's own
  `#pasteboard` handler — empty the field on every commit, so there's no stored value
  to mis-diff and no debounce window to sample mid-rewrite. Forward committed text as
  one `kbd-text` run; IME is gated by `compositionstart/end` (forward nothing until the
  commit); dictation is committed once on an idle timer (`inputType ===
  'insertDictationText'`); Enter/Backspace are suppressed mid-composition (`keyCode
  229`).
- *CJK via SERVER-SIDE injection* (`terminal/terminal-manager.py` + `landing/desktop.html`):
  the shell's committed text is delivered to a manager endpoint **`POST /api/browser/type
  {text}`**, which runs **`xdotool type --file -`** (text on stdin) as the user on their
  xpra display; nav keys go via **`POST /api/browser/key`** (allowlisted xdotool keysym).
  `xdotool` uses X's Unicode-keysym mechanism (temporarily remaps a spare keycode via
  XTEST), so **any** codepoint — hanzi, emoji, accents — lands in Chromium. This sidesteps
  BOTH the keysym-drop AND iOS's clipboard restrictions, and deletes the fragile
  client-side key relay for mobile text. **Proven on z20 without an iOS device**: POSTing
  `你好世界🎉café` through the real nginx→auth→manager path and reading it back from
  Chromium's X clipboard returned it verbatim. ASCII rides the same endpoint (text
  coalesced ~40 ms; POSTs serialized so text can't race a following key).

**Rejected (the CJK dead-ends, in order tried):** (1) key events / xpra `#pasteboard`
`keyval=codepoint` — the server drops unmapped keysyms (cause 2). (2) The client clipboard
channel (`send_clipboard_token` + synthetic Ctrl+V) — the token *does* carry data
server-side, but a leftover paste target makes xpra's client answer from
`navigator.clipboard.read()`, which **iOS gates behind a user-gesture/permission prompt**
outside a tap — dead on iOS. (3) Patching WebKit rewrite *shapes* on the diff — whack-a-mole.
**Lesson: never type non-ASCII into xpra from the client; inject it server-side with
`xdotool`** (which is what xpra itself could do with keysym remapping but doesn't). A 15-year-
old tool doing its one job beat three rounds of client-side cleverness.

---

## The mobile Browser lost ALL its patches — `/xpra-patches.js` 404'd after the `/opt` move

**Symptom:** On iPhone, the Browser app showed **two stacked keyboards** — xpra's own
drawn on-screen keyboard (`.simple-keyboard`, a desktop layout with `tab`/brackets)
appeared by default and stacked above iOS's native keyboard; typing via the ⌨ button
was dead, taps stole focus (closing the iOS keyboard), paste/reconnect/size-reclaim all
gone. It *looked* like a keyboard-logic regression.

**Cause:** `browser/xpra-patches.js` (all 10 patches — the `.simple-keyboard{display:none}`
hide, touch routing, keystroke forwarding, paste, auto-reconnect, keymap-force) was
**404ing** on the live host, so the Browser page ran completely unpatched. The web root
had forked: `tools/migrate-to-opt.sh` set it up at `/opt/vibetop/www`, but every
installer **defaults** `LANDING_DIR`/`DST_DIR` to `<APP_HOME>/vibetop-www` =
`/opt/vibetop/vibetop-www`. The first in-app Update after migration that touched
`landing/` + `terminal/` (but not `browser/`) re-rendered the nginx root to
`vibetop-www` and re-deployed the landing files there — but `browser/install.sh`
didn't run (its dir was unchanged), so `xpra-patches.js` stayed orphaned in the old
`/opt/vibetop/www`. nginx's `location = /xpra-patches.js` used `add_header … always`,
so the **404 itself was cached for 24 h** on the phone. The `.simple-keyboard` OSK is
ON by default for mobile UAs (`getboolparam("keyboard", Utilities.isMobile())`), so
with the hide missing it showed. (A red herring: the desktop's own key-bar had *also*
been overlapping there and was hidden in the Browser just before — but that only
uncovered the real 404-driven double-keyboard.)

**Fix (defense in depth, since the single point of failure was one 404):**
1. **Deploy the file to the right root** — any `browser/` change makes the Update run
   `browser/install.sh`, which installs `xpra-patches.js` into `vibetop-www` and
   recomputes its `?v=` md5 (auto-busting the cached 404 via a new URL).
2. **nginx sub_filter now also hides `.simple-keyboard`** (both `/browser/` and
   `/x11-display/`) — the OSK can't appear even if the JS 404s again.
3. **`keyboard = false` in `browser/default-settings.txt`** — disables the drawn OSK at
   the xpra source (only gates the OSK; `capture_keyboard`/typing is independent).
4. **Dropped `always`** from the `/xpra-patches.js` cache header so a 404 is never cached.
5. **`tools/migrate-to-opt.sh` WWW → `$OPT/vibetop-www`** so migration and installers
   agree — the fork can't recur.

**Rejected:** chasing the CSS specificity (`!important` vs inline `display:block`) — a
dead end; the rule was never served. Bumping a hand version — `xpra-patches.js` is
content-hash busted, so editing it is enough. Lesson: the Update's "only redeploy
sub-projects whose dir changed" optimization can't self-heal a shared-web-root move
that an *unchanged* sub-project owns files in; keep migration paths == installer
defaults, and prefer nginx/source-level suppression over a JS-only guard for anything
that must not fail open.

---

## Uploads over ~1 MB failed with a 500 (the `auth_request` body-size trap)

**Symptom:** From the phone, some photos uploaded fine while a specific one always
"Failed" — reproducibly. Bigger tell: the progress bar climbed to ~82% then
stalled and failed. The manager log showed *no* upload error at all; the nginx
error log did: `client intended to send too large body: 1433503 bytes,
subrequest: "/internal/authcheck"` followed by `auth request unexpected status:
413`, and the access log showed `POST /api/upload → 500`. It was **size-gated,
not content-gated**: files < 1 MB (a 257 KB screenshot) always worked, files
> 1 MB (a 1.4 MB photo) always failed — regardless of the file, across retries
with fresh multipart boundaries.

**Cause:** `/api/upload` had `client_max_body_size 5G`, but that's not the only
location the body is size-checked against. Every protected request first runs the
`auth_request` subrequest to `location = /internal/authcheck`, and **nginx
enforces the *main* request body's size against the subrequest location's
`client_max_body_size`** — which was unset there, so it inherited nginx's **1 MB
default**. So the auth subrequest 413'd on any body > 1 MB, and `auth_request`
turns a non-200/401/403 subrequest status into a **500** for the main request.
The body is never even forwarded to the auth endpoint (`proxy_pass_request_body
off`) — nginx still runs the size check. The "82% then fail" is the browser
buffering most of the small body into the socket before nginx resets the
connection after the early rejection (progress counts bytes *written*, not
*accepted*).

**Fix:** add `client_max_body_size 5G;` inside the `location = /internal/authcheck`
block (in `terminal/install.sh`, which generates the site). Every protected
location shares this one auth subrequest, so the single line fixes uploads through
all of them; `/api/` already allowed 5G, and the body isn't sent to the manager
regardless, so raising it here is free of security cost. Verified: a 2 MB POST
through the gate now returns `401` (auth reached, missing cookie) instead of the
old `500` (size-gate before auth). Also hardened the **Upload app** UX so a
genuine failure is legible: each failed file shows a reason line (mapped from the
HTTP status → too-large / session-expired / server-error / the manager's `{error}`
/ network-dropped / cancelled) and a **↻ Retry** button that re-uploads just that
file — mobile-network drops are now recoverable in place instead of an opaque
"Failed".

**Rejected:** setting `client_max_body_size` at the `server`/`http` level — would
work, but it also lifts the 1 MB safety cap on every non-upload JSON endpoint
(`/api/desktop`, etc.); the surgical per-location fix keeps those protected while
only the auth subrequest (which never touches the body) is widened. Also
considered raising it only on `/api/` (already done — that wasn't the location
doing the 413; the *subrequest* was, which is easy to miss because the main
location looks correctly configured).

---

## Porting the installers off apt (and the bug Debian's packaging had been hiding)

- **Context:** the installers were apt-only, and the claim "Debian/Ubuntu" was
  never tested. Standing up `tests/matrix/` (one disposable VM per distro,
  installing as root and asserting seven things inside the guest) turned that
  into evidence: **Debian 12 did not install at all**, and the RPM distros died
  at the first `apt-get`.
- **Every fact below was OBSERVED in a VM, not read in a manual.** That matters
  because the guesses would have been wrong in both directions — e.g. ttyd turns
  out to be packaged on Fedora and in EPEL, but *not* in Debian, which is the
  opposite of the intuition that "RPM is the awkward one".
- **The blockers, in the order a run hits them:**
  1. **No `apt-get`.** Now dispatched through `tools/lib/osdeps.sh`
     (`vt_pkg_install`), which also maps the names that differ:
     `xserver-xorg-video-dummy`→`xorg-x11-drv-dummy`,
     `fonts-liberation`→`liberation-fonts`, `x11-xserver-utils`→
     `xorg-x11-server-utils` on EL but `xhost` on Fedora (the umbrella package
     doesn't exist there), and `docker.io`→*nothing* (podman only).
  2. **EPEL.** On EL, `ttyd`/`wmctrl`/`xdotool`/`xpra` are EPEL-only, so four
     core packages are unresolvable without `epel-release`.
  3. **nginx layout.** RHEL/Fedora have `conf.d/` and **no `sites-enabled`
     include at all**, so writing to `sites-available` is silently never loaded.
     They also ship an in-file `server { listen 80; server_name _; }` inside
     `nginx.conf` that collides with our `listen 80 default_server` — it can't be
     removed by dropping a file, so the installer comments it out idempotently
     (marker: `vibetop-disabled-default`).
  4. **`www-data` does not exist** on RHEL (nginx runs as `nginx`), so the
     hardcoded traversal ACL died with `setfacl: Option -m: Invalid argument
     near character 3`. Now resolved from `nginx.conf`.
  5. **SELinux.** The one that is invisible until everything else is right: with
     SELinux enforcing, nginx may not open a TCP connection to a loopback
     upstream, so *every* route 502s while the config is perfect —
     `avc: denied { name_connect } for comm="nginx" dest=7680`. Fixed with
     `setsebool -P httpd_can_network_connect 1`, before the reload.
  6. **PAM stack names.** Debian has `common-auth`/`common-account`; RHEL/Fedora
     have `system-auth`/`password-auth` and neither `common-*`. Writing the
     Debian names made every login 401 with `_pam_load_conf_file: unable to open
     config for common-auth`.
- **The bug Debian had been hiding:** after all six, RHEL still aborted with
  `nginx.service is not active, cannot reload.` **Nothing in this repo has ever
  started nginx.** On Debian/Ubuntu the package postinst starts *and* enables it,
  so our `reload` had been succeeding by accident for the project's whole life.
  `dnf install nginx` leaves it stopped and `disabled` — so not only did the
  install fail, nginx would not have survived a reboot. The installer now
  enables it and starts it when inactive (and skips the redundant reload, since a
  fresh start already loads the new config). This is the recurring shape of a
  portability bug: not "the new platform is broken" but "the old platform was
  papering over something we never did ourselves".
- **Rejected:** *pinning EPEL's xpra* (5.0.2 against prod's 6.4.4, and Ubuntu's
  3.1.5 was already rejected as too old for the HTML5 client) — the Browser stack
  stays Debian-only until xpra.org's RPM repo is wired up deliberately;
  *substituting podman for docker* in the Office installer without testing it;
  *creating `sites-available`/`sites-enabled` on RHEL* — the directories are not
  the problem, the missing `include` is.
- **Also fixed in passing, and NOT RPM-specific:** `files/install.sh` installed
  ffmpeg as `run apt-get update && run apt-get install -y ffmpeg`. As a
  non-final element of an `&&` list it was exempt from `set -e`, so on any distro
  lacking the package the failure was **silent** and the installer reported
  success while the in-Files video player quietly degraded.

---

## The live smoke test reported 12 failures on a healthy multi-user host — and a non-root cookie mint made it look worse

- **Symptom:** `tools/smoke-test.sh` on a fully working host: `3 passed, 12
  failed`. Every surface (`/`, `/tN/`, `/browser/`, `/x11-display/`, `/files/`)
  "returned 302, want 200", the manager API bodies were all "missing", and
  `vibetop-x11-xpra` / `vibetop-filebrowser` were reported inactive. Nothing was
  actually wrong: the same paths returned **200 with a session cookie**, and the
  per-user services (`vibetop-ubrowser-junjie`, `vibetop-ufiles-junjie`,
  `vibetop-ux11-junjie`, three terminals) were all running.
- **Cause, two independent ones:**
  1. The script predates multi-user auth. Every protected location is behind
     nginx `auth_request`, so an **unauthenticated** probe is redirected (302) or
     401s. The test asserted 200 unconditionally.
  2. The shared `vibetop-{browser-xpra,x11-xpra,filebrowser}` units are the
     **legacy single-user** services. A multi-user host runs one transient unit
     **per user**, started on demand — so an inactive shared unit is correct, and
     so is *zero* per-user units when nobody is signed in.
- **The trap that made the fix subtle:** the obvious repair — mint a cookie with
  `tools/mint-session-cookie.py` — appears to work as a normal user. It prints a
  perfectly well-formed `vt_session=eyJ…` token. But `_session_secret()`
  **falls back to an ephemeral in-memory key** (`secrets.token_hex(32)`) when it
  can't read the root-owned `0600` `/etc/vibetop/session.secret`. So a non-root
  mint yields a token signed with the *wrong key* — indistinguishable by shape,
  rejected by the server. A `case "$COOKIE" in vt_session=*)` shape check happily
  accepts it, and every surface check goes red again, now for an invisible reason.
- **Fix:** detect the gate (unauthenticated `GET /` redirects), mint a cookie, and
  then **validate it against `/api/authcheck` before trusting it** — 200 or
  discard. Validating against the server is robust to *why* the token is bad
  (wrong key, expired, wrong user, rotated secret) instead of enumerating causes.
  With no valid cookie the surface/API checks are skipped and the script exits
  **2 = INCONCLUSIVE**; `run-tests.sh` surfaces that distinctly. Shared units
  report SKIP on a gated host, since the authenticated HTTP probe — which
  cold-starts the per-user service and then asserts it serves — is the real check.
- **Rejected:** *asserting 302 instead of 200* (tests the login redirect, not the
  app); *dropping the surface checks* (throws away the only end-to-end coverage);
  *exiting 0 when checks are skipped* (a deploy gate would read "couldn't test" as
  "tested and fine" — the inverse of the original bug); *shape-checking the minted
  cookie* (the trap above).

---

## "Remove" was account deletion sitting next to "Reset password" — and there was no way to just sign someone out

- **Symptom:** The Config app's Users card gave every account two equally-weighted
  buttons: `[Reset password]` and `[Remove]`. "Remove" reads like it revokes
  access; it actually runs `userdel -r` — the Linux account **and** the home
  directory. Worse, the destructive option was the *default*: the confirm's "Keep
  their home directory" checkbox started **unchecked**. Meanwhile an admin who
  merely wanted to boot a user had no lever at all — `/api/logout-all` only acts
  on the caller (`_session_user()`, deliberately, so an anonymous request can't
  invalidate the operator), so the only workaround was resetting their password
  as a side effect.
- **Cause:** The two actions were never separated by *blast radius*. The Users
  card is OS-account administration (create/delete an account); "who is using
  vibetop right now, kick them" is a vibetop-runtime concern that had no home in
  the UI, so it silently collapsed into the nearest destructive button.
- **Fix, three parts:**
  1. **A new `Active sessions` card on the Vibetop tab**, separate from System ▸
     Users. Sessions are stateless signed cookies and **cannot be enumerated**, so
     presence is inferred from the 5s desktop heartbeat each open browser already
     writes: `_user_presence(user)` reads that user's `desktop-state.json` once and
     returns `(newest ts, live-device count)` (live = within `DESKTOP_TTL`).
     `_user_last_heartbeat` became a wrapper on it so the parse guards can't drift.
     A user with a heartbeat but zero live devices is still listed — they're signed
     in somewhere and therefore still worth revoking.
  2. **`POST /api/config/sessions/signout`** bumps the user's token epoch, so every
     device fails its next `_verify_session` within ~5s. It is **non-destructive by
     default**: terminals/Browser/X11 keep running and restore on next login, the
     same philosophy as the idle reaper. `stopApps:true` opts into a reap as well,
     wrapped in try/except — the revocation already succeeded, so a systemctl
     failure must not surface as a 500.
  3. **Deletion demoted, not removed.** The button is relabelled `Delete account`
     and only renders when an `Advanced: allow deleting accounts` checkbox is
     ticked; that flag is deliberately **not persisted**, so every reload re-locks
     it. The confirm now defaults to **keeping** the home directory and names Sign
     out as the thing you probably wanted.
- **Rejected:** *Renaming "Remove" to "Logout"* — it would have made the label
  match the user's mental model while the code still deleted the account: the
  worst possible outcome. *Making sign-out reap services* — an admin signing out a
  user who merely closed a laptop lid would kill their running jobs; resource
  reclamation is the idle reaper's job, and the checkbox covers the deliberate
  case. *Moving deletion behind a `⋯` overflow menu* — still one tap from the safe
  action, and it needs popup/outside-click machinery for no safety gain over a
  card-level unlock. *Putting the active list inside the Users card* — mixes "who
  is online now" with "which OS accounts exist", which is exactly the conflation
  that caused the original problem.

---

## Config admin app: sudo gate, and an idle reaper that spares terminals by default

- **Context:** Making vibetop a real shared-host product surfaced two gaps: idle
  per-user services (each idle user leaves ttyd + FileBrowser + **two** xpra
  displays = Xorg+Chromium resident forever, only ever stopped by explicit
  Logout), and no way to manage accounts without SSH. Both now live in a
  sudo-gated **Config** app (`landing/config.html` + `/api/config/*`).
- **Why gate on OS sudo, not `VIBETOP_ADMINS`:** the existing admin gate
  (`_is_admin`) is the app's operator list, used for features that act *as*
  `APP_USER` (Update, Claude-usage). Config instead does **OS-level** things
  (create/delete Linux users, reset OS passwords), so the right authority is real
  membership in a sudoers group (`_can_sudo` → `sudo`/`admin`/`wheel`, supplementary
  or primary GID). The two gates coexist by design — a sudoer who isn't in
  `VIBETOP_ADMINS` sees Config but not Update. Client hiding (`.sm-sudo` +
  `/api/me can_sudo`) is cosmetic; the real gate is a `_require_sudo` 403 on every
  endpoint. `can_sudo` rides `/api/me` (static per session), **not** the 5s
  heartbeat — a group lookup every 5s would be pure waste.
- **Reaper spares terminals by default (the real fork):** "idle" means *no web
  heartbeat*, but a vibetop terminal can hold a long-running build with the tab
  merely closed — so a blanket reap would SIGKILL someone's job. The big RAM hog
  is the xpra displays (Xorg+Chromium), not a bash PTY. So `_reap_user` stops
  **Browser xpra + X11 xpra + FileBrowser always**, and terminals **only** when an
  explicit `reapTerminals` sub-flag is set. Reaping is **non-destructive** (only
  `systemctl stop`, no file ops) so desktop-state/notes/office survive and windows
  restore next login — which is what makes reaping *any* idle user (including the
  operator) safe and un-surprising.
- **Rejected:** (1) *Reap on stop / on logout only* — that's the status quo that
  leaks; a walk-away user never triggers it. The reaper keys off the heartbeat, not
  client cooperation. (2) *Reap everything including terminals by default* — nukes
  long jobs; made it an opt-in flag instead. (3) *Enumerate reap candidates by
  scanning `systemctl list-units` every tick* — the users registry already lists
  everyone who opened a per-user app, so a per-tick subprocess is avoidable. (4)
  *Default on* — a reaper that silently kills your apps is hostile; it ships **off**.
- **User-mgmt hardening (from the fable QA pass):** password to `chpasswd` via
  **STDIN, never argv** (argv is world-readable in `/proc`); reject CR/LF **and NUL**
  in passwords; strict `_USERNAME_RE` before any shell-out (blocks `-r`-style flag
  injection since a name can't start with `-`); refuse root/`APP_USER`/named-admins
  and system accounts (`_is_real_login_user`) and self-removal; **roll back**
  (`userdel -r`) a just-created account if its password step fails, so a retry isn't
  blocked by a 409 and no password-locked account is left behind.

---

## A stale terminal tab name reappears on a new terminal after an abnormal close

- **Symptom:** You rename terminal N (say "build"), then vibetop closes
  abnormally — the browser/PWA is killed, the host reboots, or the manager
  restarts (a self-update). Later you open a **new** terminal that reuses number N
  and it comes up already labelled "build" instead of the default `TN`.
- **Cause:** Tab names are server-side (`terminal-tab-names.json`, keyed by
  instance number) and were only ever cleared in two places: the **client's**
  tab-close handler (`POST /api/terminals/names {n,name:null}`) and `/api/reset`.
  Both depend on the browser cooperating on a clean close. An abnormal close runs
  neither, so the name outlives its session; when number N is later reused for a
  brand-new session, the name is still on file and the fresh tab inherits it. The
  name's lifetime was tied to *the browser closing the tab*, not to *the session*.
- **Fix:** Tie the name to the session. The manager now **forgets the stored name
  whenever a genuinely fresh session starts** for that number —
  `_forget_tab_name(user, n)` in `_start_user_terminal`, gated on
  `was_running = n in _list_running_terminals(user)` (read through the ~2s
  running-set cache, so no extra `systemctl` fork on the hot path) so it only fires
  on a *fresh* start, never on a live-session reconnect (which must keep its
  label). This covers every abnormal-close path because it keys off the actual
  session lifecycle, not client cooperation. The client mirrors it locally
  (`forgetLocalName` in `terminals.html`) for the explicit `+` / cold-start
  gestures — but **not** in the reconcile path, where a number opened on another
  device legitimately keeps its shared name — so the new tab shows `TN`
  immediately, ahead of the next names poll. The tab-names file/read/write are
  now `user`-parameterized so the off-request-path clear scopes to the right home.
- **Rejected:** (1) *Clear on stop* (`_stop_user_terminal`) — doesn't cover the
  cases that actually leak: a reboot/crash kills the session **without** a stop,
  so the name still survives. Clear-on-fresh-start is the only point that sees
  every path. (2) *Always clear on any start* — would wipe a valid label when a
  reconnect issues an idempotent re-start against a live session; hence the
  `was_running` gate. (3) *Client-only fix* (refresh names harder) — the root
  state is server-side and shared across devices; a client patch can't forget what
  the server still remembers.

---

## Notes tabs didn't live-sync across devices

- **Symptom:** Adding / renaming / closing / reordering a Notes tab on one device
  didn't show up on another until a manual reload. Terminal and Files tabs sync
  live; Notes didn't.
- **Cause:** `notes.html` fetched `/api/notes` **once** at init and never polled —
  it had no reconcile loop at all (unlike `files.html`'s ~2s `tick`).
- **Fix:** A ~2s `tick()` (plus focus / visibility triggers): if our tab set
  changed we push (`persistTabs`), else we pull `/api/notes` and `reconcile()` the
  shared set. The shared signature is ids + names + order only. Guarded against
  clobbering an in-progress rename (`contenteditable` tab) or drag.
- **Rejected:** Syncing the **active** tab too (as `files.html` does). Notes is a
  live text editor — adopting a remote active would yank the editor to a different
  note mid-type. So active stays **device-local**; we only jump if our active tab
  was *closed* on another device (like the Terminal tabs' "set membership syncs,
  active stays local").
- **Follow-up — content sync:** tabs synced but the note *body* didn't. Added
  `syncContent()` to the same `tick()`: poll the **active** note's content and
  apply a remote change into the editor — but **only while we're not mid-edit**
  (`saveTimer !== null || savingInFlight`), so local typing always wins (same
  last-writer-wins model as the autosave; no OT/CRDT). Programmatic `editor.value
  = …` doesn't fire `input`, so there's no save loop; caret offset is preserved
  best-effort so a background refresh doesn't jump the cursor. Only the *open*
  note is polled (bounded cost); non-active notes refresh on switch.

---

## Mobile key bar stuck visible on iPad (but fine on iPhone)

- **Symptom:** The on-screen `esc / tab / ^C / arrows` bar (`#sys-keybar`) is
  stuck at the bottom of the desktop on iPad with **no keyboard up**, never
  auto-hides, and overlaps the taskbar so the status bar looks "boxed." iPhone is
  fine. (Reported via screenshot in `~/Uploads`.)
- **Cause:** The keyboard detector in `desktop.html`'s `syncBar` decides "keyboard
  up" by `curH() < baseH - 150`, where `baseH` is the no-keyboard baseline. But
  `baseH` was **monotonic — it only ever grew** (`if (h > baseH) baseH = h`).
  iPad gets rotated constantly: visit in portrait → `baseH` = tall portrait
  height; rotate to landscape → height drops ~300px (> the 150 threshold) but
  `baseH` stays stuck at the portrait value, so `kbUp` is **permanently true** in
  landscape. iPhone escapes it because it's used in one orientation, so `baseH`
  never inflates.
- **Fix:** Re-baseline on a **viewport width change** — the soft keyboard shrinks
  height but never width, while rotation / Split View change width. On `w !==
  baseW`, reset `baseH = 0` so it re-climbs from the new orientation's no-keyboard
  height. Also bound to `orientationchange`. (`landing/desktop.html`, sw v145->v146.)
- **Rejected:** A timed re-measure after `orientationchange` (racy if the keyboard
  opens within the delay; could wedge `baseH` too low → bar never shows). Using
  `window.innerHeight - visualViewport.height` as the inset — dead on iOS, where
  the keyboard shrinks **both** (see the keybar-detection commit `aa145ea`).

---

## Black band below the taskbar after a Cloudflare Access login (installed PWA only, iOS)

- **Symptom:** In the **installed (Add-to-Home-Screen) PWA** on iOS, the **first**
  desktop load *after being made to re-authenticate with Cloudflare Access* renders
  the whole shell (Claude strip, app area, taskbar) in the **top ~80%** of the screen
  with a dead **black band** filling the bottom ~20%. It does **not** self-heal;
  closing the PWA and reopening fixes it. It happens **only in the standalone PWA**
  (the same site in the normal Safari browser is fine) and **only on the auth
  navigation** (a normal open with a valid session is fine). (Reported via screenshot
  in `~/Uploads`.)
- **Cause:** A known, still-open **WebKit standalone-PWA bug**, not our code and not
  Cloudflare's. In an installed web app WebKit resolves `100svh` (and
  `-webkit-fill-available`, and even `visualViewport.height`) **too short** — WebKit
  [bug 254868](https://bugs.webkit.org/show_bug.cgi?id=254868) (open, reproduced on
  iOS 18.3.1). Cloudflare Access sends the shell through a **cross-origin redirect**
  (`service…` → `*.cloudflareaccess.com` login → back); iOS shows in-app browser
  chrome for that out-of-scope page, and on the return the **short "small viewport"
  gets frozen with no corrective `resize` ever fired** (the `innerHeight`/`resize`
  half of WebKit [bug 170595](https://bugs.webkit.org/show_bug.cgi?id=170595) — stale
  in app web views but not MobileSafari; the exact OAuth-return band is reported at
  [discussions.apple.com/thread/251535534](https://discussions.apple.com/thread/251535534)).
  So `body{height:100svh}` fills the frozen-short viewport → band. Regular Safari has
  no scope boundary / no chrome transition, so it's unaffected.
- **What an on-device diagnostic actually showed (overturning the research):** an
  on-screen readout in the frozen state (screen 956px, dpr 3) reported `svh=753`,
  `bodyH=753` (the band) — but `visualViewport.height=894`, `clientHeight=894`,
  `innerHeight=894`, `dvh=894` (= 956 − ~62px status bar = the TRUE usable height), and
  `lvh=vh=956` (full screen). So on this device **only `svh` is frozen-short**;
  `visualViewport.height`/`clientHeight`/`dvh` are all correct (the WebKit-bug write-ups
  claiming those are *also* poisoned did not hold here). A **reload did NOT unfreeze `svh`**
  (`reload=tried`, still 753). `vh`/`lvh` = 956 is why an earlier `100vh` swap overshot and
  cut off the taskbar (they include the opaque status-bar strip).
- **Fix — `landing/apph.js` drives the height from the CORRECT metric (`svh` is the
  only broken one):** `body`/`html` default to `100svh` (`height: var(--app-h, 100svh)`) —
  correct in Safari and untouched there. In **standalone only**, `apph.js` sets `--app-h`
  to `max(visualViewport.height, documentElement.clientHeight)`, clamped to `screen.height`.
  Those two both measure the content area **below** the opaque status bar, so the value can
  only ever equal the true usable height — it can **never overshoot** into the status-bar
  strip the way `100vh`/`lvh` (956) did, and it's **not frozen** the way `svh` is. It keeps
  the running **max** (reset on an `innerWidth` change = rotation), so the soft keyboard —
  which only shrinks the *visual* viewport — can never shrink the shell. `--app-h` is set on
  both `html` and `body` so `html`'s `overflow:hidden` doesn't clip a taller body (no
  `position:fixed` needed — the band was purely `body` being too short, not mis-positioned).
  Ships with a `#vhdbg` / `localStorage.vhdbg='1'` diagnostic overlay (metrics + a colored
  line at each candidate height) — the tool that produced the numbers above. (sw v209→v214.)
- **Dead ends (each shipped, observed to fail, reverted):**
  - `@media (display-mode: standalone){ height:100vh }` — **overshot**, cutting the taskbar
    off the bottom (`vh`=956 includes the opaque status bar; the true usable area is 894).
  - A "learned known-good height + engage-only-when-suspect" adaptive module — over-built on
    the false premise that `visualViewport`/`clientHeight` were also poisoned; a variant of
    it produced a *bigger* band. The diagnostic showed those metrics are fine, so the simple
    "use them directly" fix above is right.
  - `location.reload()` on detecting the short viewport (to automate "reopen") — the reload
    does **not** unfreeze `svh` (diagnostic: `reload=tried`, still 753); reopening works only
    because it's a brand-new web view. Removed.
  - Naive `--app-h = innerHeight`/`visualViewport.height` *without* a keyboard guard — both
    shrink when the soft keyboard opens (iOS: 796→476), which would collapse the shell mid-
    type; the running-max (reset on width change) is what makes it keyboard-safe.

---

## GNOME apps (eog, evince) take ~33s to start in the X11 Launcher

- **Symptom:** Launching a GTK/GNOME app (eog, evince) from the X11 Launcher on
  the X11 display showed a blank canvas for ~33s before the window appeared;
  Firefox/Chromium/native apps (xterm) were instant.
- **Cause:** The X11 display (`:98`) is a bare `xpra start-desktop` + matchbox
  session — **no GNOME session**. GNOME services like `xdg-desktop-portal` are
  *activatable but hang* there (their backends wait for a session that doesn't
  exist). GTK apps query the portal on startup and block the **25-second D-Bus
  method-call timeout**. Evidence: `strace` showed eog threads each blocking in
  `poll()` for exactly ~25.0s on D-Bus fds; a direct probe of
  `org.freedesktop.portal.Desktop` activation timed at exactly 25.0s while
  gvfs/dconf/a11y returned in 0.0s.
- **Fix:** Run launcher apps against a **private D-Bus session with no service
  activation** (`vibetop-x11-dbus`, a `dbus-daemon` with no `<servicedir>`,
  socket `/run/user/<uid>/vibetop-x11-bus`). On it, those service calls fail
  fast (ServiceUnknown) instead of hanging → eog starts in ~0.2s. The bus is
  chosen **per app**: snap apps (Firefox/Chromium, detected via `/snap/bin/<prog>`)
  get the **real user bus** instead, because they *exit* on a bare bus (snap
  confinement needs the session bus) and never block on the portal anyway.
- **Rejected:**
  - `GTK_USE_PORTAL=0` (per-app env): it *did* stop portal activation, but eog
    was still ~33s — there was a second hanging service too. Whack-a-mole.
  - ~~Pointing **terminal** shells at the private bus as well: breaks
    `systemctl --user`/`gsettings`.~~ **This turned out to be false — see the
    terminal-launch section below.** `systemctl --user`/`gsettings` reach the user
    manager via `$XDG_RUNTIME_DIR`, *not* `DBUS_SESSION_BUS_ADDRESS`, so they work
    identically on the private bus (verified). Terminals now DO use the private bus;
    only snap browsers are special-cased back to the real bus.
  - Masking `xdg-desktop-portal` globally: would affect a physical GNOME login
    on the host (if any). The private bus is isolated to launcher apps.

## The private X11 D-Bus bus was silently 100%-broken (two config bugs) + a measurement trap

- **Symptom (reported):** "evince opens really slowly again; long after the terminal
  command the X11 window appears — it was solved before, and I remember something had
  to stay pinned running in the background." The multi-user migration moved the fix
  from the shared `:98` display to a per-user `_ensure_user_x11_dbus` bus.
- **What was actually broken:** `_ensure_user_x11_dbus` could **never start the bus** —
  every launch silently fell back to the real user bus. Two independent config bugs:
  1. **`--` inside an XML comment.** `browser/dbus/x11-dbus.conf`'s comment described
     the flags as `--config-file … --nofork …`. XML forbids `--` in comments, so
     **expat rejected the entire file** → `dbus[…]: Failed to start message bus: Error
     in file …x11-dbus.conf, line 4: not well-formed (invalid token)`. The whole config
     is dead over two literal hyphens in a *comment*.
  2. **`--address` is ignored when `--config-file` is given (dbus 1.16).** Even with the
     XML fixed, dbus-daemon errors `Configuration file needs one or more <listen>
     elements giving addresses`. dbus 1.16 does **not** honor the `--address=…` CLI flag
     alongside `--config-file`; the listen address must be a `<listen>` element **inside**
     the config. Since the socket path is per-user, the manager now **renders a per-user
     config** (`/run/user/<uid>/vibetop-x11-dbus.conf` = the shared policy template with
     `<listen>unix:path=…/vibetop-x11-bus</listen>` injected after `<busconfig>`) and
     starts `dbus-daemon --config-file=<that>` with **no** `--address`. Also
     `systemctl reset-failed` before `systemd-run` so a prior failed unit can be reused.
- **The measurement trap (why the panic was overstated):** the whole time, evince/eog
  actually mapped in **~0.5s** on *both* buses — I could not reproduce a 25–33s hang.
  The "31s" readings were a **broken test harness**: `wmctrl -l | grep -qi evince` in a
  poll loop **never matches**, because evince's window *title* is the document name
  (`t.pdf`), not "evince" — so the loop always ran to its ~30s cap and reported a
  phantom hang. A single `wmctrl` is 0.005s and `xterm` maps in 0.5s; the display was
  never slow. **Lesson: measure GUI-app launch with `xdotool search --sync --class …`
  (blocks until the window truly maps), never by grepping `wmctrl` titles.** This is
  now in the QA charter.
- **Net:** the private-bus mechanism is repaired so it genuinely fast-fails portal/a11y
  (verified: eog logs `org.a11y.Bus … ServiceUnknown` in 0.0s on it) — the guard for if
  the portal-hang condition recurs — but on the current host neither bus is slow. Two
  static tests now lock both bugs shut: `test_xml_config_files_are_well_formed` (the
  `--`-comment class) and `test_x11_dbus_template_ready_for_listen_injection` (the
  rendered per-user config parses, has `<listen>` + `<type>`, and no `<servicedir>`).
- **Also seen (latent, cleaned):** two `ibus-daemon --xim --replace` were running at once
  for the user (a broken half-replaced state) plus hundreds of stale `~/.cache/ibus/dbus-*`
  sockets. Not the cause (evince is 0.5s with ibus alive *and* dead), but unhealthy —
  worth watching if intermittent slowness ever returns.

## The REAL evince-slowness: terminal-launched GUI apps were on the real (hanging) bus

- **Symptom:** "evince from the **terminal** is still slow — long after I type it, the X11
  Launcher finally shows the window." The X11 Launcher's own launches (`/api/x/launch`)
  were fast (they pick the private bus), but typing `evince` in a terminal was ~40s.
- **A second measurement trap (worse than the first):** I first "verified" terminal evince
  at 0.5s with `xdotool search --sync --class '[Ee]vince'` and wrongly concluded it was
  fine. **`xdotool --class` finds a *premature/transient* evince window that exists at
  ~0.5s**, but the real, usable, WM-managed document window (the one `wmctrl -l` lists and
  the desktop's auto-surface + the human both see) doesn't appear until the portal/a11y
  activation finally times out. Measured correctly (**time until `wmctrl -l` lists it**):
  real user bus = **42s (timeout)**, private bus = **0.11s**. Lesson updated in the QA
  charter: for GUI-launch timing use **`wmctrl -l` listing** (or the app's own "ready"),
  because `xdotool --class` matches a window that isn't yet the usable top-level.
- **Cause:** the terminal exported `DBUS_SESSION_BUS_ADDRESS=…/run/user/<uid>/bus` (the real
  session bus), so GUI apps launched from it hit the same portal/at-spi hang the launcher
  was fixed for. Env-var workarounds don't help — `GTK_USE_PORTAL=0`, `GTK_A11Y=none`, and
  `NO_AT_BRIDGE=1` (alone *and* combined) all still timed out at ~40s on the real bus (a
  third hanging service; the whack-a-mole the launcher fix already warned about).
- **Fix:** the terminal now points D-Bus at the **private activation-free bus** too
  (`_user_terminal_setenvs` calls `_ensure_user_x11_dbus` and exports its socket; falls
  back to the real bus if it can't start). This is the earlier-"rejected" option, and the
  rejection reason was **wrong**: `systemctl --user`, `gsettings`, and `loginctl` reach the
  user manager through `$XDG_RUNTIME_DIR` (the systemd private socket / dconf DB), **not**
  `DBUS_SESSION_BUS_ADDRESS` — verified all three behave identically on the private bus.
- **The one real exception — snap browsers:** `firefox`/`chromium` (snap) **exit** on the
  private bus: snap-confine creates a transient systemd scope via `org.freedesktop.systemd1`
  which the activation-free bus doesn't provide (`cannot create transient scope: …
  ServiceUnknown`). So `terminal/realbus-shim.sh` is installed as `/usr/local/bin/firefox`
  and `/usr/local/bin/chromium` (ahead of `/snap/bin` on PATH); it puts the real user bus
  back and hands off to the snap. Only names that are *actually* snaps here get shadowed
  (the installer removes a stale shim otherwise), so a non-snap firefox/chromium is
  untouched. This inverts the maintenance burden: one short, stable list (the GUI snaps)
  instead of an ever-growing list of hang-prone GNOME apps.
- **Note:** the env is baked at terminal start, so the fix only reaches **new** terminals —
  open a fresh one after deploying. Guarded by
  `test_terminal_env_uses_private_dbus_bus_when_available` +
  `test_terminal_env_falls_back_to_real_bus_if_private_unavailable`.

## Snap apps (Firefox/Chromium) won't open the X11 display

- **Symptom:** `firefox` from the launcher did nothing; log showed
  `Authorization required, but no authorization protocol specified` /
  `cannot open display :98`. Native apps (xterm) and `wmctrl` worked fine.
- **Cause:** Snap confinement — a confined snap launched *outside* xpra's own
  process can't read the X authority cookie, so the X server rejects it. Native
  same-user clients connect fine.
- **Fix:** `xhost +local:` at Apps-display startup (a `--start` in
  `vibetop-x11-xpra.service`) disables X access control for local clients. Safe:
  the display is loopback-only and the host is single-user behind Access.
  `x11-xserver-utils` (provides `xhost`) is an apt dep.

## Browser must stay its own app, but Apps needs its own canvas

- **Symptom:** Wanting a tabbed "launch GUI apps" experience *and* keeping the
  Browser (Chromium) as a separate app.
- **Cause:** One xpra display can only present **one canvas**. Chromium and any
  launched app share a single display, so two canvas iframes of the same display
  fight over size (a hidden iframe measures 0×0 and shrinks the display) — the
  same reason multi-device window mirroring was dropped.
- **Fix:** A **second xpra display** (`:98`, `vibetop-x11-xpra`, matchbox, no
  Chromium) dedicated to launched apps, proxied at `/x11-display/`. The Browser
  keeps `:99`. The X11 Launcher (`x11launcher.html`) embeds the `:98` canvas with a tab
  bar; the two displays never conflict.
- **Rejected:** Merging Chromium into one tabbed "Desktop" (user wanted Browser
  separate); embedding a second canvas of `:99` in the launcher (size conflict).

## X11 apps launched from a Terminal should appear in the launcher

- **Symptom:** Running `gnuplot` (or any GUI app) in a Terminal had nowhere to
  render.
- **Fix:** `vibetop-session@.service` exports `DISPLAY=:98` +
  `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR`, so terminal-started GUI apps
  render on the X11 desktop and show up as tabs. The desktop also polls
  `/api/x/windows` and auto-opens the X11 Launcher when a new window appears.
  (`XDG_RUNTIME_DIR` silences/fixes Qt apps like gnuplot's qt terminal.)
  Note: this is a systemd-unit change — it only lands on a full deploy /
  `terminal/install.sh`, and only for **newly started** sessions.

## eog/evince single-instance hand-off

- **Symptom:** Launching eog a second time opened no new window; A/B timing
  tests gave nonsense ("NONE") results.
- **Cause:** GNOME apps are **GApplication single-instance** — a second launch
  hands off to the running primary (and with no file, opens nothing). It also
  made repeated benchmarking unreliable until the `org.gnome.eog` bus name was
  confirmed released between runs.
- **Fix / note:** Not "fixed" (it's expected GNOME behavior) — documented so the
  launcher's "nothing happened" isn't mistaken for a bug, and so future
  measurements force a clean primary instance.

## `@BASE_PORT@` left unsubstituted in the ttyd unit (latent install bug)

- **Symptom:** A *fresh* install would render `Environment=BASE_PORT=@BASE_PORT@`
  in `vibetop-ttyd@.service`; `ttyd-run.sh`'s `$(( @BASE_PORT@ + N ))` is a
  syntax error → ttyd never binds → terminals fail.
- **Cause:** The unit-render loop in `terminal/install.sh` only substituted
  `@APP_USER@`/`@APP_DIR@`, not `@BASE_PORT@`. Masked on existing hosts because
  the in-app Update runs `install.sh` with `INSTALL_SYSTEMD=0` (doesn't re-render
  units), so they keep their old correctly-rendered files.
- **Fix:** Added `@BASE_PORT@` (and the new `@X11_DISPLAY@`/`@APP_UID@`) to the
  loop's `sed`.

## Tabs in the Files app (multiple folders)

- **Goal:** view several folders at once, switching tabs instead of navigating
  back and forth.
- **Approach:** FileBrowser is a single-folder SPA, so the Files app is now a
  wrapper (`files.html`) hosting **one FileBrowser iframe per tab** (like the
  Terminal tabs), kept alive so switching is instant and preserves each folder's
  state. Tab labels are the live folder name, read from each iframe's
  `contentWindow.location` (same-origin). Open paths persist in `localStorage`.
- **Gotcha — the location-memory patch fought the tabs:** `filebrowser-patches.js`
  has a single-key "restore last folder" that `location.replace`s any `/files/`
  root load to the saved path — which would yank *every* tab to one folder. Fix:
  the wrapper names each iframe `fbtab` (survives the SPA's in-iframe nav), and
  the patch skips its location-memory when `window.name === "fbtab"` (the wrapper
  owns path memory). The SW BYPASS token was tightened from `files` to `files/`
  so the wrapper page `/files.html` is cacheable while the live SPA at `/files/*`
  stays network-only.
- **Deep links:** the Upload app's "Open in Files" used to overwrite the Files
  iframe `src` (would destroy the tabs); now the desktop posts a `files-open-tab`
  message (a few times, to beat the first-load race; the wrapper dedupes) and the
  wrapper opens a tab at that path.

## Auto-refresh every client on deploy (SSE push)

- **Goal:** after a deploy, every connected client should land on the new shell
  on its own — so fixes/features (e.g. the cross-device close) aren't defeated by
  a device sitting on a stale cached shell, with no per-app refresh logic.
- **Mechanism:** the manager serves an **SSE stream `GET /api/events`** that
  watches the deployed `sw.js` VERSION and pushes a `reload` event when it changes.
  The client (EventSource) responds by calling `registration.update()`; the new
  service worker takes control → `controllerchange` → a **full
  `window.location.reload()`** of the whole desktop (one reload re-loads every app
  iframe too — thorough, no per-app code). Guarded by `hadController` so the first
  install doesn't reload mid-load.
- **Why SSE, not polling:** first built as `registration.update()` polling
  (~90s + on focus). The user (rightly) wanted push to avoid wasted polling. SSE
  fits the threaded `http.server` (one held thread per client), needs **no nginx
  change** (`X-Accel-Buffering: no` disables response buffering; ~18s pings keep
  nginx/Cloudflare from idling the stream out and detect a dead client), and one
  server-side version-check replaces N client polls.
- **The reliability gap (and fix) — learned the hard way:** the naïve SSE only
  notices a version change *while a connection is live*. A tab that's
  disconnected at deploy time (manager restart, network blip, or a **backgrounded
  tab whose stream the browser suspended**) reconnects, baselines to the
  now-current version, and **never learns it should reload** → stale forever. This
  is exactly the case where stateless polling is more reliable. Fix that keeps the
  push: the client remembers the version from its **first `hello`**, and on every
  reconnect compares — if the server's version differs, it **self-heals** (reloads)
  the moment it reconnects or is brought to the foreground. Plus a second client
  bug: the reload was driven by `controllerchange`, which an **uncontrolled** page
  (after a hard reload, `hadController=false`) never fires — so on an explicit
  `reload`/version-mismatch the client now reloads **directly** (`doSwReload`), not
  via `controllerchange`. A tab-focus `registration.update()` remains as a last
  fallback. (`/api/events` logs `[events] pushed reload v…->v…` so a deploy
  propagating is visible in the journal.)
- **Why a full reload (not gentle/deferred):** a thorough refresh is intended —
  persistent state survives the reload (terminals/Browser reconnect, notes
  autosave, Files/Notes tabs are server-side), so the brief blip is acceptable and
  guarantees consistency.
- **Bootstrap:** a client must already run the auto-refresh build for this to
  fire; pre-existing open tabs need one manual reload to get onto it.

## Close an app on all devices

- **Problem:** windows are per-instance (opening on one device doesn't open on
  another — deliberate), and closing was local-only, so an app left open on
  device A couldn't be closed from device B; its Start-menu union dot stayed green.
- **Mechanism:** `POST /api/desktop/close {app}` records the **live instances that
  currently have the app open** in `close_targets` (`{appId:[instanceId,…]}`).
  Each instance closes the app when it sees its own id in a heartbeat reply, then
  reports an open-set without it and the server prunes it (also pruned when stale).
  - *First tried* a per-app counter (`close_ops`) with clients baselining the seen
    value on load. **Rejected after hitting it live:** a device that held the app
    on a *stale shell* during the close didn't act, and after reloading it
    *baselined* the existing counter and still wouldn't close — so the app stayed
    stuck. Targeting by instance id fixes both: reloading the holder (same
    `INSTANCE_ID`) still closes it, and a stuck holder can't poison the app for
    other devices (a global flag would).
- **UX (why a visible Start-menu button, not the alternatives):** the close
  affordance lives as a **✕ button on the Start-menu row, shown only when the app
  is running**, with a **confirm**. Rejected: a window-corner overlay button
  (apps fill the pane with their own top toolbars → it'd cover their controls, and
  it can't reach an app open only on another device); a tiny inline ✕ (hard to hit
  / easy to mis-tap); a hidden long-press/right-click (invisible and finicky on
  touch). A real tap-target + confirm addresses both "hard to click" and "easy to
  mis-click," and the Start menu is the one surface that lists apps open on *other*
  devices. The taskbar × stays local ("close here").

## Tabs in the Notes app (multiple, renameable notes)

- **Goal:** multiple notes with tabs, renameable like the Terminal tabs.
- **Approach:** Notes went from a single file + single-doc API to **multi-document,
  server-side**: each note is `~/.local/share/desktop-notes/<id>.md`, the tab index
  (`{tabs:[{id,name}], active}`) is `index.json` in that dir — server-side so
  names/order/active propagate across devices (like terminal tab names). API:
  `GET /api/notes` (index), `GET /api/notes?id=` (content), `POST /api/notes
  {id,content}` (save), `POST /api/notes/tabs {tabs,active}` (the client owns the
  tab list; the manager stores it and deletes files for closed tabs).
- **Data safety:** note ids are sanitized (`_safe_note_id`, `[A-Za-z0-9_-]{1,64}`)
  so an id can only ever be a plain filename inside the notes dir (no `../`
  traversal). The **legacy single-note file** (`desktop-notes.md`) is migrated into
  tab `"1"` on first use and **left intact** (not deleted) as a safety net.
  Closing a tab deletes its note file, so the frontend **confirms** before closing
  a non-empty note. Verified end-to-end (migration, create/save/read, close-deletes,
  traversal-id rejection).
- **Rejected:** keeping closed-note files as orphans (avoids accidental loss but
  accumulates dead files) — chose delete-on-close + a frontend confirm instead.

## Launcher "spins forever" on a not-installed / mistyped command

- **Symptom:** Typing a command that isn't installed (e.g. `gimp` when it's not
  on the host) left the progress bar spinning indefinitely — looked like a slow
  load, but nothing was ever going to appear.
- **Cause:** `/api/x/launch` returned `{ok:true}` the instant it spawned the
  `su -c` shell; it had no idea the command then failed (`command not found`,
  exit 127), so the window-poll never cleared the bar.
- **Fix:** After spawning, the manager does a short `proc.wait(timeout=3)`. A
  missing/mistyped command exits fast with non-zero (127 = not found) → return a
  `400` with "‘<prog>’ didn't start (exit 127) — not found / not installed?"; a
  real GUI app is still running at 3s → return ok and reap it in the background.
  The launcher shows it as a friendly message ("‘gimp’ isn't installed (or not
  in PATH).") with a Dismiss, not a spinning bar.
  The 3s only delays the *response* on the rare failure path — success still
  shows its window via the poll, independent of the response.
- **Note:** No precheck (`command -v`) — that risked false negatives (aliases,
  custom PATH) blocking valid launches. Watching the actual exit is accurate.

## Slow app launch looked broken (blank canvas)

- **Symptom:** After hitting Run, the canvas was blank for seconds (esp. cold
  GNOME apps) and looked frozen.
- **Fix:** An indeterminate **progress bar** overlay in `x11launcher.html` ("Launching
  `<cmd>`…") shown until the window appears, with a "still starting / may have
  failed" hint after 25s and a Dismiss. (Largely moot now that the portal fix
  makes GNOME apps fast, but it still covers genuinely slow first launches.)

## No server-side logs made debugging slow ("limited logs on the server side")

- **Symptom:** Several hard bugs this cycle (eog portal hang, snap firefox not
  launching, an instance stuck not auto-refreshing) were diagnosed almost blind —
  `terminal-manager.py` did its work silently. `log_message` was a bare `pass`
  (HTTP access lines suppressed) and the only prints were a handful of `[office]`
  stderr lines, so the journal carried almost nothing about what the manager did
  or why a request failed.
- **Fix:** A single `logging` logger (`vibetop`) set up at import
  (`_setup_logging`): a `StreamHandler` to stderr (→ journald, which stamps the
  time) **and** a `RotatingFileHandler` at `/var/log/vibetop/manager.log`. Level
  is `INFO` by default, `LOG_LEVEL` env overrides. Selective, not chatty — INFO
  on the actions that matter (terminal start/stop, `x/launch` with which bus,
  cross-device close, reset summary, update outcome, SSE reload push) and WARNING
  on failures (office callback/forcesave/save-back, launch fast-fail, status
  collection error, update pull failure). The noisy per-request HTTP access log is
  routed to `log.debug`, so it's off at INFO but available via `LOG_LEVEL=DEBUG`.
- **Self-cleaning:** `RotatingFileHandler(maxBytes=2_000_000, backupCount=5)` caps
  the on-disk log at ~12 MB total (1 active + 5 rotated) and rotates in place — no
  cron/logrotate needed, so it can't grow unbounded. journald applies its own
  retention to the stderr copy. The dir is created on first run; if `/var/log`
  isn't writable the handler is skipped (journal-only) rather than crashing.
- **Shadowing gotcha:** `_handle_update` had a local `log = []` (its step list)
  that shadowed the module logger; renamed to `steps` so `log.*` in that method
  reaches the logger.
- **Rejected:** print-to-stderr only (no file, no levels — can't dial verbosity,
  and journald-only loses the easy `tail -f` a file gives); a verbose access log
  at INFO (drowns the signal — kept at DEBUG); external logrotate (the rotating
  handler is self-contained and needs no host config).

## Killing the terminal "shake" silently broke the double-click/tap re-claim

- **Symptom:** Double-click (desktop) / double-tap (touch) on a terminal used to
  re-claim the shared PTY's shape for this device. After the fix that stopped the
  content from "shaking" on double-click, the gesture stopped reshaping anything —
  no shake, but no re-claim either.
- **Cause:** The shake came from `claimSize()` resizing the *visible xterm grid*
  (`term.resize(c, r-1); term.resize(c, r)`) — the rows jump. The shake-fix sent
  the resize straight to ttyd's WebSocket instead (no grid resize), but sent the
  **current** dims `{columns:c, rows:r}` — exactly the size this client's ttyd PTY
  was **already** at. ttyd dutifully calls `TIOCSWINSZ(c,r)`, but the **kernel
  raises SIGWINCH only when the winsize actually changes**, so no SIGWINCH fired —
  and SIGWINCH is the whole propagation chain: `vibetop-session attach`'s SIGWINCH
  handler (`send_resize`, line ~439) writes the size + SIGUSR1s the serve daemon,
  which `TIOCSWINSZ`es the *shared* bash PTY and SIGWINCHes the shell. No SIGWINCH
  ⇒ nothing propagates ⇒ silent no-op. The old visible nudge worked precisely
  because `r-1 ≠ r` forced two real size changes (two SIGWINCHes).
- **Fix:** Keep sending straight to the socket (so the visible grid never resizes
  → no shake), but **nudge over the socket**: send a neighbour size and back. Two
  genuine size changes → two SIGWINCHes → the shared PTY ends up at this device's
  shape, all without touching the visible xterm grid. Same trick as the original,
  one layer lower.
- **Residual shake (the nudge's intermediate frame), fixed in two parts:** the
  nudge's *first* size still streams a redraw back to this device. (1) **Nudge the
  COLUMN, not the row** (`{c-1,r}` then `{c,r}`): a row nudge makes a bottom-anchored
  TUI (prompt/input box) bounce up a row and back — very visible; a column nudge
  keeps every row in place, so the blip is one column of width for one frame. (2)
  **Debounce the resize in the `vibetop-session` serve daemon** (`RESIZE_DEBOUNCE`
  ~35ms): SIGUSR1 no longer applies the resize inline — it arms a deadline and the
  main loop applies the *latest* saved size once the burst settles, collapsing the
  nudge's two rapid resizes into a single `TIOCSWINSZ` + SIGWINCH. So the shell
  redraws **once, at the final size** — the intermediate frame never reaches it.
  This is what made the shake intermittent ("once every few double-clicks"): the
  two SIGWINCHes sometimes coalesced in the shell and sometimes didn't; the
  debounce makes the single-redraw outcome deterministic. (Daemon change ⇒ only
  **new** sessions get it — the serve daemons are never restarted, since that would
  kill live shells; existing terminals get the column-nudge mitigation until
  reopened.)
- **Rejected:** sending `c×r` once (the regression — same size, no SIGWINCH);
  a row nudge (visible vertical bounce — switched to a column nudge); a magic
  input-escape to re-assert size without a nudge (could collide with real
  input/paste). The column nudge + daemon debounce together cover both the
  re-claim correctness and the residual shake with minimal surface area.

## "Random characters" appear at the prompt (`2RR0;276;0c10;rgb:…$y`)

- **Symptom:** An idle terminal periodically shows bursts of garbage the user
  never typed, e.g. `…$ 2RR0;276;0c10;rgb:d2d2/d2d2/d2d211;rgb:2b2b/2b2b/2b2b12;2$y`
  repeated several times after the prompt. Harmless (Enter clears it) but noisy.
- **Cause:** These are terminal **query *responses***, not random bytes — decode
  to a Cursor-Position Report, Secondary Device Attributes (`…;276;…c`), OSC 10/11
  foreground/background color replies, and a DECRPM mode report. Some program
  (a prompt hook, a bg-color-sniffing tool, a TUI — often re-firing on `SIGWINCH`,
  which vibetop generates a lot via the resize/reshape machinery) writes a
  capability **probe** to the PTY. That probe is PTY *output*, so it lands in
  `vibetop-session`'s ring buffer. Two shared-session mechanisms then turn one
  probe into repeated garbage: (1) **broadcast** — the live PTY stream fans out to
  *every* attached xterm.js client, so each connected browser/tab/device answers
  the same probe, and all answers are written back into the *one* shared PTY and
  echoed at the prompt; (2) **replay** — `vibetop-session` replays its ring buffer
  to each freshly (re)connected client to restore the screen, and vibetop
  reconnects often (mobile suspend/resume, the reconnect guard). A probe sitting in
  the ring gets **re-sent to every reconnecting xterm, which re-answers it** — so
  one stale probe produces a fresh burst on every reconnect. (1) adds one copy per
  extra live client; (2) is what makes it *recurring*.
- **Fix:** Strip terminal query-**request** sequences (DA `…c`, DSR/CPR `…n`,
  DECRQM `…$p`, OSC color/palette `…;?…`) from the ring-buffer **replay only**
  (`strip_terminal_queries` in `vibetop-session`, applied where a new client is
  sent `ring.read_all()`). The **live** broadcast path is untouched — a real probe
  still reaches clients and is answered once, which is correct; only *replayed*
  (stale) probes are dropped, so a reconnect never re-answers. Color/cursor *set*
  sequences (real screen state, e.g. `OSC 11;rgb:…` with no `?`, and a window
  title that merely *contains* a `?`) are deliberately preserved. Pure function,
  unit-tested in `terminal/tests/test_claude_session.py` (strip-vs-preserve table).
- **Rejected:** stripping queries from what's *stored* in the ring (a probe split
  across two `os.read()` chunks could be written non-contiguously — strip at replay
  time instead, where `read_all()` is one contiguous snapshot); de-duplicating the
  near-simultaneous responses from multiple **live** clients in the serve daemon
  (timing-fragile, and the per-extra-client duplication is minor and non-recurring
  — usually 1–2 clients); fixing it shell-side (can't, the emitter is arbitrary
  user software). Daemon change ⇒ only **new** sessions get it (serve daemons are
  never restarted — that would kill live shells); existing terminals stop on the
  next fresh session.

## macOS "error beep" when copying in a terminal (Cmd+C)

- **Symptom:** On macOS, pressing Cmd+C in a terminal plays the system error
  sound (NSBeep) — even when the copy itself works.
- **Cause:** Two things compounded. (1) xterm.js's selection is **not** a DOM
  selection (it paints to a canvas), so when the native Cmd+C key-equivalent
  reaches the browser it finds nothing selected to copy and macOS beeps. (2) The
  copy handler (the `attachCustomKeyEventHandler` injected via the `/tN/`
  `sub_filter`) returned `false` to "consume" Cmd+C — but **returning `false`
  from an xterm custom key handler does NOT call `preventDefault()`**: xterm's
  `_keyDown` returns early *before* its internal `_cancel()` (which is what
  preventDefaults). So the native Cmd+C still fired → beep. The no-selection case
  was worse: the handler fell through to `return true`, never even trying to
  consume it.
- **Fix:** Call `e.preventDefault()` **explicitly** on the copy chord (don't rely
  on `return false`). The handler now: with a selection → `copySelection()` +
  `preventDefault()` + `return false` (no native copy to clobber it or beep);
  Cmd+C with no selection on macOS → `preventDefault()` + `return false` (swallow
  it — Cmd never means SIGINT). The **non-Mac `Ctrl+C` with no selection still
  returns `true`** so it passes through as SIGINT (the interrupt must survive).
- **Rejected:** relying on `return false` alone (the original bug — doesn't
  preventDefault); mirroring the xterm selection into a hidden DOM selection so
  the native copy has something to grab (more moving parts than just
  preventDefaulting and doing our own `execCommand('copy')`). Lives in the
  `sub_filter` (inline, no-store on `/tN/`), so it ships on the next
  `terminal/install.sh` / in-app Update + nginx reload — no cache-bust needed.

## Closing a tab killed detached processes (ssh ControlPersist, tmux, nohup)

- **Symptom:** With `ControlMaster auto` / `ControlPersist`, an ssh connection
  re-authenticated every time — closing the terminal you'd `ssh`'d from dropped
  the persistent master, so the next connection re-prompted. Same for `tmux`,
  `nohup`, and disowned jobs: things that survive closing a *normal* terminal got
  killed when a vibetop tab closed.
- **Cause:** A vibetop terminal is a systemd unit (`vibetop-session@N`). Closing
  a tab does `systemctl stop`, and the default **`KillMode=control-group`** SIGKILLs
  *every* process in the unit's cgroup. A normal terminal close only sends SIGHUP
  to the foreground session — daemonized processes (ssh's `ControlPersist` master
  `setsid`s itself, as do tmux servers and `nohup`/disowned jobs) escape that and
  live on. vibetop's cgroup-kill was strictly more aggressive, so it killed the
  very processes the user detached *on purpose*.
- **Fix:** Set **`KillMode=process`** on `vibetop-session@.service`, so a tab-close
  `stop` signals only the serve daemon (the unit's main process). When it exits it
  closes the PTY master; the kernel hangs up the foreground shell (SIGHUP), bash
  forwards SIGHUP to its jobs and exits, and `setsid`'d daemons survive — exactly
  like closing a real terminal. The serve daemon's SIGTERM handler also now sends
  the shell **SIGHUP** (not SIGTERM, which interactive bash ignores) for an
  immediate, explicit hangup. **Logout/reset still wipes everything:** `_handle_reset`
  now `systemctl kill --kill-whom=all --signal=SIGKILL`s the cgroups *before*
  stopping (that hits every process regardless of `KillMode`), so "clean slate on
  logout" is preserved — only single-tab-close is gentle.
- **Tradeoff (accepted):** closing a tab no longer guarantees zero leftover
  processes — a stuck/SIGHUP-trapping background process now lingers until logout
  or reboot, the same way it would on any real terminal. This is the cost of
  matching normal-terminal semantics; logout/reboot remain the hard reset.
- **Rejected:** a `~/.bashrc` `ssh` wrapper that runs the master in a transient
  `systemd-run --user` scope (works, but pushes the fix onto every user and only
  covers interactive ssh — should be solved once, server-side); `KillMode=mixed`
  (still SIGKILLs the whole cgroup at the end — no better than control-group for
  this); leaving it and documenting the wrapper (the platform should behave like a
  terminal, not require per-user setup). **Deploy:** unit change ⇒ needs a full
  `terminal/install.sh` (systemd) + `daemon-reload`, *not* the in-app Updater (it
  skips units); after daemon-reload even existing terminals stop gently. The
  serve-daemon SIGHUP tweak only affects *new* sessions (daemons aren't restarted),
  but `KillMode=process` alone already does the job via the kernel PTY hangup.

## Root manager service is only *partially* sandboxed (on purpose)

- **Symptom:** A code review flagged that `vibetop-manager.service` runs as root
  with **zero** systemd hardening while the unprivileged child units (session,
  browser-xpra) carry `ProtectKernel*`/`ProtectControlGroups` — backwards on its
  face.
- **Cause:** The manager genuinely needs broad power: it drives `systemctl`,
  drops to `APP_USER` via `su`/`sudo` (both **setuid**), reads sysfs/debugfs, and
  during an in-app Update it rewrites `/etc/nginx`, `/etc/systemd`, and the web
  root, then runs the per-project `install.sh` scripts. Almost every heavyweight
  directive breaks one of those.
- **Fix:** Add only the directives that harden without touching that surface:
  `ProtectKernelTunables/Modules/Logs`, `ProtectClock`, `ProtectHostname`,
  `RestrictNamespaces`, `RestrictRealtime`, `LockPersonality`. Plus an
  application-layer `_csrf_ok()` Origin/Host check on state-changing POSTs (see
  below), since the real exposure is a browser-driven request, not a local FS
  escape.
- **Rejected:** `NoNewPrivileges=yes` / `RestrictSUIDSGID=yes` — both break
  `su`/`sudo`, which the manager uses for every git op and app launch (symptom
  would be "sudo: a password is required" / EPERM). `ProtectSystem=strict` +
  `ReadWritePaths` — the Updater writes `/etc` and `/usr/local`; the allow-list
  would be large, fragile, and silently break a redeploy. `ProtectHome` — it
  writes the user's web root and `~/.config`. `PrivateTmp` — would hide the
  `/tmp/vibetop-session-*.sock` world the session children live in. `ProtectControlGroups` —
  left off because the manager spawns transient units via `systemd-run`.

## CSRF on the no-auth manager API (Origin check, not tokens)

- **Symptom:** Every `/api/*` endpoint trusts whatever reaches `127.0.0.1` — and
  some are destructive or RCE-shaped (`/api/x/launch` runs a shell command as
  `APP_USER`, `/api/reset`, `/api/update`). The trust model is "Cloudflare Access
  at the edge + a trusted LAN," so there's no app-layer auth. That leaves a CSRF
  hole: a malicious web page the user visits can `fetch()` the LAN/origin manager
  (a `text/plain` POST whose body is `json.loads`-parsed needs no CORS preflight,
  and the browser still attaches the user's Access cookie over the tunnel).
- **Fix:** `_csrf_ok()` rejects a POST whose `Origin` header is present but
  doesn't match `Host`. That blocks the cross-site browser case while leaving the
  legitimate non-browser callers untouched — `curl`/the operational CLI and the
  **OnlyOffice container's** server-side callback send *no* `Origin`, so they pass.
- **Rejected:** A CSRF token / session — there's no login or session to hang it
  on (auth is entirely at the Cloudflare edge), so a token would need its own
  bootstrap and storage for marginal gain over the Origin check. Blanket-blocking
  no-Origin requests — would break `curl`, health probes, and the OnlyOffice
  callback (the one server-to-server caller).

## `vibetop-session` shell-respawn needs backoff

- **Symptom:** Review flagged that the serve daemon's main loop respawns the shell
  the instant the child dies (`if reap_child(): ring.clear(); spawn_shell()`).
- **Cause:** If `/bin/bash` can't `exec` (missing, not executable, bad mount), the
  forked child `_exit(127)`s immediately, the PTY master goes readable with `EIO`
  so `select` returns at once, `reap_child()` is true next iteration, and it forks
  again — a **tight fork loop** pinning a CPU, with nothing throttling it.
- **Fix:** Track `last_spawn`; if a shell lived <1s, count it and `sleep` with
  capped exponential backoff + jitter (0.1s→8s) before respawning, resetting the
  counter once a shell survives. Normal `exit`-respawn (the shell lived a while)
  is unaffected — it respawns instantly as before.
- **Rejected:** A hard "give up after N" that leaves the terminal dead — a
  transient cause (a deploy mid-swap of `/bin/bash`) should self-heal; backoff
  recovers without a permanent dead tab.

## Mobile on-screen key bar (arrows/Esc/^C) lives at the TOP, not above the keyboard

- **Symptom:** The iOS soft keyboard has no arrows/Esc/Tab/Ctrl, so TUIs you
  navigate with ↑/↓ (Claude Code's picker, `git rebase -i`, `vim`) were unusable
  on a phone. Many attempts to put an accessory bar in the strip *just above the
  keyboard* failed: it either showed under iOS's own AutoFill/`^v Done` rows, or
  covered the terminal's prompt, or didn't show at all.
- **Cause:** The bottom strip is hostile on iOS and unfixable by tuning. (1) When
  the keyboard is raised by an input inside a *nested iframe* (the terminal is 2
  frames down), the **top frame's `visualViewport` doesn't shrink**, so the
  desktop can't even measure the keyboard to position a bar there. (2) iOS paints
  its **own accessory rows** (AutoFill/domain pill, form `^ v Done`) in that strip,
  over our content, at heights we can't measure or suppress (`autocomplete=off`
  doesn't stop the domain pill). Offsets became a per-device guessing game; a
  content-shift transform broke layout.
- **Fix:** Render ONE system-wide bar at the **desktop level, pinned to the TOP**
  of the screen (`#sys-keybar`, below the status-bar safe-area), shown while a
  keyboard is up. It never collides with the keyboard, the prompt (which the
  existing caret-park keeps just above the keyboard), or iOS keyboard chrome.
  Each tap routes `{type:'kbd-key', key}` to the active app's frame — the Browser
  (xpra-patches) already understood it; the Terminal relays it desktop →
  terminals.html → `/tN/`, where `terminal-kbd.js` maps it to PTY bytes (arrows =
  `ESC[A/B/C/D`). The terminal reports keyboard up/down so the desktop shows/hides.
- **Rejected:** Bottom placement with a per-context offset (`IOS_ACCESSORY`
  guess) — unverifiable and wrong on some devices. A CSS-transform "shift the
  terminal up" — fought iOS auto-scroll and broke layout. Relying on iOS to
  auto-scroll a focused textarea above the bar — doesn't work 3 iframes deep.
- **Testing lesson:** This was verified in **Playwright WebKit** (Safari's
  engine) driving the live stack with a `visualViewport`-mocked keyboard +
  screenshots, against a **throwaway terminal** (never the user's sessions).
  Chromium emulation passed a test the real iPhone failed — see
  [[mobile-ui-needs-webkit-or-device]] in memory: don't ship iOS UI blind.

## Mobile terminal typing: dropped keystrokes, dropped first letter, input lag

- **Symptom:** After the mobile keyboard work landed, typing in the **terminal
  only** (every other app was fine) would intermittently **drop the first
  letter**, **drop keystrokes entirely**, or feel **laggy** — "I have to type it
  a few times." None of this reproduced in the Browser/Notes overlays.
- **Cause:** Three independent bugs in the touch input path (the transparent
  overlay `terminal-kbd.js` + the `focusin` guard injected by
  `terminal/install.sh`), root-caused with an ultracode multi-agent workflow:
  1. **Blur-to-nothing.** The guard's job is to stop xterm's hidden
     `.xterm-helper-textarea` from raising the keyboard on load, so it blurred
     the helper whenever it took focus. But it blurred to **`document.body`** —
     not a text field. xterm re-focuses that helper constantly (WS-connect, every
     render), so mid-typing a steal → blur → **focus on `<body>` → the keystroke
     went nowhere.** Terminal-only because no other app fights xterm for focus.
  2. **Stale value-diff baseline.** Input is sent by diffing the overlay's value
     against `lastSent`, which was reset **only on Enter**. A typing session that
     began with leftover state (keyboard dismissed/re-summoned, an un-Entered
     line) mis-computed the **first** char's diff — swallowing it or emitting
     spurious backspaces.
  3. **Artificial 80 ms debounce.** Every keystroke sat in a `setTimeout(…, 80)`
     before reaching the PTY — batching meant for dictation, but pure latency for
     normal typing (Notes is a native field with none).
- **Fix:**
  1. The guard **bounces the stolen focus back to the overlay** instead of
     blurring to `<body>` — gated by `window.__termArmed` (set on the overlay's
     first genuine focus, so the keyboard still doesn't pop up on load) and
     `window.__termBouncing` (set around the guard's `focus()` call so the
     genuine-focus baseline reset below can tell a bounce from a real refocus and
     **never wipes in-flight input**). Focus can no longer land on `<body>`.
  2. **Reset the diff baseline (`ov.value`/`lastSent`) on a genuine refocus**
     (skipped when `__termBouncing`), so the first char of every session is sent
     as-is. The empty-value guard is also scoped to `composing` so a real line
     clear isn't swallowed.
  3. **Flush normal typing immediately** (synchronously in the `input` handler);
     only `composing` (dictation/IME) keeps the 400 ms debounce. The remaining
     gap from Notes is the **unavoidable PTY-echo round-trip** — the shell, not
     the browser, renders the char; small on LAN, = network RTT over the tunnel.
- **Rejected:** Lowering/removing the debounce alone (didn't address the focus
  drops). Resetting the baseline on **every** focus (the guard's bounce re-focus
  fires mid-typing, so this wiped in-flight chars — hence the `__termBouncing`
  gate). Letting the helper keep focus (xterm's native input streams half-formed
  dictation to the PTY — the very pile-up the overlay exists to prevent).
- **Testing lesson:** Same WebKit-on-throwaway-terminal harness as above. The
  focus-steal/bounce and the synchronous-vs-debounced flush are deterministic DOM
  behavior WebKit reproduces faithfully (unlike the keyboard-viewport quirks),
  so the harness caught all three before deploy. Don't touch the 80 ms→0 flush
  without re-checking the `composing` path still batches dictation.

---

## OnlyOffice "Download failed" over the Cloudflare tunnel (but fine on the LAN)

- **Symptom:** Opening/creating a doc in the Office app showed OnlyOffice's
  native **"Error: Download failed"** dialog — but **only over the tunnel**
  (`https://service…`), on *both* phone and desktop. The **LAN**
  (`http://z20.local`) worked. First mis-reported as phone-only (the phone was
  just the tunnel client), which echoes — but is **not** — the older mobile-editor
  "Download failed" (that one was the Community mobile web editor; fixed by
  forcing `cfg.type='desktop'`, still in place). Here the desktop editor loads
  fully, then the document never appears.
- **Cause:** **Mixed content.** The editor UI loads, then the browser fetches the
  converted document at `…/onlyoffice/cache/files/data/<key>/Editor.bin`. Over
  the tunnel that request **never reached the origin** (0 hits in nginx; a
  browser-side block, not an edge block — a request killed *before* it's sent).
  Why: OnlyOffice builds that as an **absolute** URL whose scheme comes from
  `X-Forwarded-Proto`. Our `onlyoffice.conf` sent `X-Forwarded-Proto $scheme`,
  but over the tunnel the `cloudflared → nginx` hop is plain **http**, so
  `$scheme=http` even though the client is on **https**. So the DS handed the
  browser an `http://service…/…/Editor.bin` link; on an **https** page that's
  active mixed content → blocked → "Download failed." On the **http** LAN page the
  http link is same-scheme, so it always worked. (Two red herrings ruled out
  first: the container *does* download the original doc fine — `GET /api/office/doc
  → 200` over the tunnel — and OnlyOffice's own `document_editor_service_worker.js`
  only registers in a secure context, but its scope is `/onlyoffice/<version>/`,
  so it never touches the `/onlyoffice/cache/` path.)
- **Fix:** Forward the **external** scheme: `proxy_set_header X-Forwarded-Proto
  $http_x_forwarded_proto;` in `office/nginx/onlyoffice.conf`. `cloudflared` sends
  `X-Forwarded-Proto: https`, so the DS now builds `https://` URLs over the
  tunnel; on a direct LAN request the header is absent → nginx omits it → the DS's
  own nginx (`http-common.conf`'s `$the_scheme` map) falls back to its `http`
  `$scheme`. Verified with `tcpdump` on loopback `:8087`: `X-Forwarded-Proto:
  https` now reaches the container and the `Editor.bin` GETs hit the origin.
- **Rejected:** Hardcoding `https` (breaks the http LAN — the reverse mixed-content
  problem). Patching the container's nginx (its `$the_scheme` map already honors
  the incoming header — the only broken hop was ours). An Access bypass for
  `/onlyoffice/*` (wrong layer — the request never reached Cloudflare; and it'd
  needlessly expose the editor/cache publicly). Chasing the server-side download
  path (the *container's* download was always 200; the failing fetch was the
  *browser's*).
- **Note:** purely an nginx-snippet change — no `sw.js`/shell bump (the PWA SW
  bypasses `/onlyoffice` and `office-editor.html` is network-only). Deploy gap
  found + closed alongside this: the in-app Updater redeployed
  `landing/`/`browser/`/`terminal/` but **not** `office/`, so this fix wouldn't
  have reached a host that updates via the app. The Updater now runs
  `office/install.sh` on an `office/` change — with the new `INSTALL_CONTAINER=0`
  knob so it only re-renders the nginx snippet and **leaves the live OnlyOffice
  container running** (tearing it down would drop open editors + cost ~1-2 min);
  container arg/image changes still need a full `deploy.sh`, exactly like
  systemd-unit changes for `browser/`/`terminal/`.

---

## Browser clicks land ~one line low after an xpra restart (xpra 6.5 regression)

- **Symptom:** In the Browser app, clicks registered ~one character/line **below**
  the cursor. Appeared with no Browser code change — it started right after an
  unrelated `systemctl restart vibetop-browser-xpra` (done while fixing other
  things). A second, **older deployment (`legion`, v1.9.10) did NOT have it**.
- **Cause:** **A server-side regression in xpra 6.5.** `apt` had upgraded
  `xpra 6.4.4 → 6.5` (here: 2026-06-27) but the *running* `vibetop-browser-xpra`
  process kept executing the old 6.4.4 binaries — and was fine. The restart loaded
  the new **6.5** binaries, which mis-place the click. Proof it's the server, not
  our code: the xpra **HTML5 client JS is byte-identical** between 6.4.4 and 6.5
  (`getMouse`, cursor `xhot/yhot` handling all the same), and `legion` (xpra 6.4)
  is immune. The 6.5 changelog documents **no** pointer/cursor change, so it's an
  unintended side effect (xpra has a long history of HTML5 mouse-offset bugs).
- **Fix:** Downgrade to the known-good version and pin it:
  `apt-get install --allow-downgrades xpra*=6.4.4-r0-1` (all 9 xpra packages) then
  `apt-mark hold` them, then restart `vibetop-browser-xpra` + `vibetop-x11-xpra`.
  Verify with `xpra info :99 | grep build.version` → `6.4`. Revisit (unhold +
  test) when a fixed xpra ships (6.5.x/6.6) or report it upstream.
- **Rejected (wasted ~2h):** Patching the click mapping in `xpra-patches.js`
  (`getMouse` canvas-rect math, then a native-cursor override). All no-ops/worse —
  the client coordinates were already correct (a debug overlay showed `getMouse`
  mapping 1:1 at top/middle/bottom). The bug was never in the JS.
- **Diagnostic lessons (the fast path next time):** (1) **Trust a known-good peer
  host** — `legion` running an older build immediately localized it to *something
  that changed on z20*, not the app. (2) For a "was-fine-now-broken with no code
  change" service bug, **check running-binary vs installed-package version**
  (`xpra info :99` build.version vs `dpkg -l xpra`): an `apt` upgrade doesn't
  restart the daemon, so a restart can silently swap in new, regressed binaries
  long after the upgrade. (3) A green on-screen debug overlay reporting
  `client→remote` coords (temporary, in `xpra-patches.js`) proved the client math
  was right and stopped the guess-and-deploy loop. See [[bisect-against-known-good-first]].

## Browser "loading" spinner every few seconds with TWO devices (stale xpra client state — NOT a code/version bug)

- **Symptom:** The Browser app reloads to the connecting/"loading" spinner every
  few seconds — **only the Browser** (Terminal is rock-solid), and **only when it's
  open on 2+ clients at once** (desktop + phone, or two tabs). A **single** client
  is always stable. Reported as version-specific (works on the older `legion` host,
  broken on `z20`).
- **Cause (validated):** **Accumulated stale runtime state, not code.** The session
  ended back on the *exact* stock build it started on (v1.11.6) and the Browser was
  fixed — so no code change cured it. What did: a full teardown+redeploy (1)
  **restarted `vibetop-browser-xpra` from zero** (`clients=0`), dropping accumulated
  **stale/zombie xpra clients** (backgrounded tabs, suspended-phone connections that
  hadn't hit `XPRA_PING_TIMEOUT` yet) all contending for the single shared session;
  and (2) made **both devices reload onto one consistent shell**, ending a
  cache-mismatch fight. The reload itself is `xpra-patches.js` patch 6 firing on
  each `connection-lost`, which turns the contention into a visible loop.
- **Cure (no redeploy/downgrade needed):** `sudo systemctl restart
  vibetop-browser-xpra` (or the desktop **Logout/reset** button, which does the
  same), then reload both devices. Clears the stale clients and resyncs the shells.
- **Why Terminal is immune:** ttyd + `vibetop-session` let many viewers share one
  PTY with no steal/session-ownership semantics; xpra has a single shared session
  that stale clients can wedge.
- **Rejected / dead ends (do NOT re-chase — each cost real time):**
  - **xpra 6.5** — the running binary was 6.4.4; 6.5 is the *click-offset* bug
    (separate entry above), unrelated to this loop.
  - **A vibetop version regression** — `git diff 689bb6e(v1.9.10=legion) HEAD --
    browser/` shows the Browser stack is byte-identical to legion (same xpra flags,
    same `/browser/` iframe); downgrading the code changes nothing for the Browser.
  - **Forcing client sharing via the iframe URL** (`/browser/?sharing=true&steal=false`):
    made it **worse** — a non-sharing/steal mismatch across mixed cached shells
    caused `Disconnecting … session busy (this session is already active)`
    reject-loops. Reverted.
  - **`--clipboard-direction=to-server`** to kill the clipboard-storm
    (`Warning: more than 30 clipboard requests per second!`): the storm is a
    *symptom* of two clients syncing, not the disconnect cause; didn't fix the loop.
  - **A full v1.9.10 redeploy** as the apples-to-apples legion test: tripped a
    **separate** xpra failure on z20 — `authentication failed: missing remote
    username` (the HTML5 login window) despite `--ws-auth=none`, which v1.11.6 does
    NOT exhibit. Left uninvestigated; it broke the Browser entirely, so the legion
    comparison never actually ran.
- **Operational gotchas hit along the way (worth caution):**
  - **`deploy.sh` must run as the user, NOT `sudo`.** `sudo ./deploy.sh` runs the
    no-sudo `landing/install.sh` as root → web root deploys to `/root/...www`
    instead of `~/...www`, and `/browser/` 404s/ERRs. Run `./deploy.sh` (it `sudo`s
    per-step internally).
  - **Don't deploy mismatched shells to a multi-client xpra.** Flip-flopping the
    deployed shell while two devices are connected leaves them on different cached
    builds that can't agree to share — it manufactures the very loop you're chasing.
    If you must change the iframe/shell, bump `sw.js` VERSION and reload **all**
    devices before judging the result.
- **Diagnostic fast-path:** `xpra info :99 | grep clients=` — **one client = stable**
  immediately localizes it to multi-client stale state. Then read the live journal
  disconnect **reason** (`journalctl -u vibetop-browser-xpra -f`) *before* changing
  anything — `same uuid` = a client reconnecting, `session busy` = a sharing/steal
  mismatch, `missing remote username` = an auth/deploy problem. See
  [[bisect-against-known-good-first]], [[fix-root-cause-keep-the-feature]].

## Browser stuck at the phone's tiny size on the desktop (no way to re-claim)

- **Symptom:** Open the Browser on a phone and the shared xpra display shrinks to
  the phone's viewport **for every client**, including the desktop — and unlike the
  Terminal (double-click re-claims the shape) there was **no way** to grow it back
  on the desktop. It stayed the little size.
- **Cause:** The Browser is a **single shared** xpra `start-desktop :99` display, so
  its resolution belongs to whichever client connected/resized last. xpra's HTML5
  client advertises its size via `_screen_resized()` → `send([configure_display,
  {"desktop-size":[container.clientWidth, container.clientHeight], …}])`, and the
  server RANDR-resizes the one display to match. When the phone connects it sends
  its small size and the display shrinks everywhere. The desktop **can't** re-send
  its size on its own: `_screen_resized()` early-returns unless **this client's**
  `container` actually changed (`container.clientWidth !== desktop_width`) — and the
  desktop's window never changed, the *phone* shrank the display. Same "same-size =
  no-op" wall as the Terminal re-claim (SIGWINCH only fires on a real change).
- **Fix:** Patch 10 in `xpra-patches.js` — the Browser analogue of the Terminal's
  double-click/double-tap re-claim. On a **desktop double-click** *or* **mobile
  double-tap**, bust the guard (`client.desktop_width = -1`) and call
  `client._screen_resized()`, which re-sends **this** client's real container size →
  the server resizes the shared display to match. Reuses xpra's own packet-builder
  (monitors/dpi/vrefresh) so it survives xpra API drift. Two guards keep it
  unsurprising: (1) it re-claims **only when the display size DIFFERS from our
  viewport** — measured from the largest mapped window's `w`/`h` (`id_to_window`),
  which tracks the display in start-desktop mode — so an ordinary double-click/tap
  doesn't spam server RANDR resizes. **The mismatch is two-directional on purpose:**
  the desktop needs to GROW the display back (a phone shrank it) while the phone
  needs to SHRINK it (the desktop grew it), so a "smaller than me" test would work
  for the desktop but be a no-op on the phone (the display is *bigger* than the phone
  there) — the first cut shipped that one-directional guard and the phone double-tap
  did nothing; `abs(diff) > tol` fixes both. (2) It **never `preventDefault`s** the
  mouse path, so the double-click still reaches the remote Chromium (word-select etc.
  keep working); on touch the double-tap still fires its taps to the remote exactly
  as before — the re-claim is purely additive. Desktop double-click is detected from
  `pointerdown` timing (two within 400ms / 12px); the touch double-tap is detected in
  the patch-4 touch layer's `touchend` tap branch (two no-movement taps within
  400ms / 28px). Manual, like the Terminal — a shared display can only be one size,
  so the other device sees this one's size until *it* re-claims (symmetric; the
  accepted single-shared-display tradeoff, same reason window mirroring was removed).
- **Rejected:** **auto-reclaim** when the desktop is the active app — stable (the
  phone, whose container is unchanged, doesn't fight back) but it means the phone can
  **never** hold the display small while the desktop tab is open; manual keeps both
  devices in control, matching the Terminal. A dedicated **on-screen "Fit" button** —
  no gesture conflict, but adds chrome the desktop Browser doesn't have and breaks
  the Terminal muscle-memory the user already has. Hijacking double-click
  **unconditionally** (no "smaller than me" guard) — floods the server with a RANDR
  resize on every word-select double-click. See [[fix-root-cause-keep-the-feature]].

## Claude plan-usage strip: capturing the real Max-plan % (there is no query API), and the pinned-session footgun

- **Context:** The desktop wanted a live "session 51% · week 5%" strip showing the
  **real** Claude Max-plan usage. There is **no API to query plan usage** — the
  numbers exist only as `anthropic-ratelimit-unified-*` **response headers** on
  live API calls (`…-5h-utilization` = session 0..1, `…-5h-reset` = unix ts,
  `…-7d-utilization` = weekly, `…-representative-claim` = which limit binds). ccusage
  gives token/cost estimates, not the real plan %. So the only way to the real
  numbers is to **observe Claude Code's own traffic**.
- **Design:** an opt-in pass-through proxy (`claude-usage/vibetop-claude-proxy`,
  stdlib streaming, loopback) forwards every request to `api.anthropic.com` verbatim
  and records the usage headers to `~/.local/share/vibetop-claude-usage.json`. Claude
  Code is pointed at it via `ANTHROPIC_BASE_URL=http://127.0.0.1:7690`, set in
  `~/.claude/settings.json`'s `env` block — **verified** that `env` applies to
  Claude's *own* API base URL, not just the Bash tool, so it's the whole toggle (add
  the key = on, remove = off). The manager serves `GET/POST /api/claude/usage`;
  `desktop.html` renders the strip + a Start▸System toggle. Fail-open (a proxy error
  relays 502; capture never affects the relayed stream); the connection is closed
  per-response to delimit the de-chunked body.
- **Symptom (the footgun):** while test-toggling the feature, **this operator's own
  live Claude session started throwing `API Error: Unable to connect to API
  (ConnectionRefused)`** — repeatedly — while *other* Claude sessions on the box were
  fine. It looked like the proxy was crashing/flapping.
- **Cause:** NOT a crash — `NRestarts=0`, no OOM. A Claude Code session reads
  `ANTHROPIC_BASE_URL` **once at startup** and is **pinned** to it for its whole
  life. The operator's session had started while the feature was on, so it was
  routing through `127.0.0.1:7690`. The **disable** path ran `systemctl stop` on the
  proxy — pulling the socket out from under that still-running, pinned session →
  ConnectionRefused on every request until systemd's `Restart=` brought it back.
  Removing the env from settings.json does **not** rescue a process that already
  cached it; only a restart of that session would. Lightweight standalone sessions
  weren't pinned, so they were unaffected — which masked the cause as
  session-specific flakiness.
- **Fix:** **disable must never stop a proxy that live sessions are pinned to.**
  `_set_claude_usage(False)` now removes the env (so NEW sessions stop routing) and
  runs `systemctl disable` **without `--now`** — the boot-time start is removed but
  the running process is **left alive** for pinned sessions. The idle loopback proxy
  is harmless when nothing routes to it and is gone on the next reboot, by when no
  session is still pinned. Enable stays `enable --now` **then** write env (start
  before routing). A unit test (`test_claude_usage.py::test_toggle_ordering_and_proxy_left_running`)
  pins "no `--now` on disable" so this can't regress.
- **Corollary — testing the toggle can knock over the tester.** Because the dev
  session doing the work can itself be pinned to the proxy, exercising the on/off
  toggle from that session is self-endangering. Test proxy/settings changes from an
  **isolated subagent or a nested `claude -p` with its own env**, and **never stop
  the proxy** while any pinned session is live. (The disable-doesn't-stop fix makes
  the common case safe, but a hard stop/reboot/uninstall still breaks pinned
  sessions — that's inherent to routing a long-lived client through a local proxy.)
- **Rejected:** **OTEL / ccusage for the real %** — ccusage is tokens/cost only (an
  estimate, not the plan %); OTEL (if it even exports the unified gauge) is more
  moving parts than a header tap. **A TLS-intercepting forward proxy** (mitmproxy +
  a trusted CA) — captures HTTPS headers too but needs cert trust; pointing
  `ANTHROPIC_BASE_URL` at a plain-HTTP local proxy that does its own upstream TLS
  avoids all of that. **Scoping the env to vibetop terminals only** (instead of the
  global settings.json that also catches the operator's dev session) would avoid
  pinning the dev session at all — a cleaner future design, but it needs per-terminal
  env injection; the global toggle is simpler and, with disable-doesn't-stop, safe
  enough. See [[fix-root-cause-keep-the-feature]].
- **Second bug — the toggle "did nothing" in the UI (silent swallowed error).**
  *Symptom:* clicking Start ▸ System ▸ Claude Usage flipped the **server** state
  (POST succeeded) but the desktop never showed the strip or updated the row — on
  load *or* after clicking — with **zero console errors**. *Cause:* the usage
  `(function claudeUsage(){…})()` IIFE was appended **outside** desktop.html's main
  script wrapper (the same wrapper whose local `var`s make `window.APPS`
  `undefined`), so `updateToggleRow()`'s reference to the outer `menuEl` closure var
  was a `ReferenceError`. `render()` calls `updateToggleRow()` **first**, so it threw
  before touching the strip — and `poll()`'s `.then(render).catch(function(){})`
  **swallowed** the throw, so every render silently died with no log. `toggleClaudeUsage`
  itself only touches IIFE-local vars, which is why the POST still worked and masked
  it as a "server didn't react" bug. *Fix:* the IIFE is now self-contained — it looks
  the row up with `document.querySelector('.sm-item[data-id="claudeusage"]')` instead
  of the outer `menuEl` — plus an **optimistic** update (reflect the new state
  instantly, since the POST runs `systemctl` and isn't immediate, then reconcile on
  the next `poll()`). *Lesson:* a blanket `.catch(()=>{})` on a fetch chain hides
  render-time exceptions; when a handler's network side-effect works but the DOM never
  changes, suspect a **swallowed throw in the render path**, and verify by driving the
  real page headlessly (CDP) rather than by reading the code — static review kept
  reporting the logic as "correct." Same family as the "clickable chrome next to an
  app iframe" runtime traps that only a real browser catches.

## Terminal/Files link → embedded Browser silently stopped opening (RestrictNamespaces vs snap-confine)

*Symptom:* clicking a URL in a terminal (or a Services card's "⧉ Browser", or a
Files "Open in Browser") **switched to the Browser app but the page never
loaded** — the embedded Chromium stayed on its previous tab. `POST
/api/browser/open` returned `{"ok":true}`, and running the *exact same*
`su - <user> -c '… /snap/bin/chromium --user-data-dir=… "<url>"'` command by hand
(or via `systemd-run`, or a root `subprocess.Popen`) opened + foregrounded the tab
correctly. Only the invocation **from the running `vibetop-manager` service**
failed — deterministically. "It worked 20 minutes ago" was the tell: it broke the
moment the manager was **restarted** (for an unrelated feature), not on any code
change to the browser path.

*Cause:* the manager unit carried **`RestrictNamespaces=yes`** (added in v1.11.0's
security hardening). Snap Chromium launches through **`snap-confine`, which creates
a mount namespace** — `RestrictNamespaces=yes` blocks that syscall for the service
*and all its children*, so the hand-off `chromium <url>` couldn't start its confined
sandbox and died before reaching the already-running instance's singleton socket.
`Popen` still succeeded (it forked `su`), so the handler reported success and the
failure was invisible. It stayed dormant for months because the *running* manager
process predated the directive being loaded; restarting it activated the
restriction for the first time. (The same directive silently breaks the X11
Launcher's snap-app launches — Firefox/Chromium on `:98`.)

*Fix:* remove `RestrictNamespaces` from `terminal/systemd/vibetop-manager.service`.
The manager already turns OFF `NoNewPrivileges`/`ProtectHome`/`PrivateTmp`
on purpose (they'd break `su`/home/session-sockets); `RestrictNamespaces` belongs
in that same "incompatible with what this service must do" bucket, because the
service's job includes launching confined **snap** apps. A unit change needs
`daemon-reload` + manager restart (the in-app Update runs with `INSTALL_SYSTEMD=0`,
so it will NOT pick this up — a full `deploy.sh`/`terminal/install.sh` or manual
unit edit is required).

*How it was found:* isolate manager-vs-manual by handing the URL off directly and
watching the xpra window title flip (`DISPLAY=:99 wmctrl -l`) — title change =
hand-off + foreground both worked. Every context (manual `su -`, `systemd-run`,
root `Popen`) foregrounded; only the live service didn't, and adding
`-p RestrictNamespaces=yes` to a `systemd-run` reproduced the failure exactly.

*Rejected:* allowlisting namespace types (`RestrictNamespaces=mnt user …`) — snap
-confine's exact set is fiddly and version-dependent; launching the hand-off via
`systemd-run --scope` to escape the sandbox — extra moving parts for a service
that's already root-with-`su` (so the directive bought little real isolation
anyway).

## Mobile haptics for the arrow-key trackpad — no usable iOS web path (Android only)

*Goal:* a small buzz when a slide on the on-screen arrow keys locks into
"trackpad" mode, so there's tactile confirmation the pad engaged.

*What works:* `navigator.vibrate(12)` on the axis-lock. Fires on **Android
Chrome**. On **iOS Safari (incl. standalone PWA) the Vibration API doesn't
exist**, so it's a silent no-op there.

*The iOS dead-end:* iOS 17.4+ plays a subtle system haptic when an
`<input type="checkbox" switch>` toggles, and the community trick is to click a
hidden one from within a user gesture. It does **not** work here, for two
compounding reasons found by testing on-device:
- **Off-screen (`top:-9999px`) → no haptic at all.** iOS only plays the toggle
  haptic when the switch is actually **rendered in the viewport**. (Confirmed the
  device's system haptics were on — the terminal's native long-press *text
  selection* buzzed fine the whole time; only our synthetic toggle was silent.)
- **In-viewport → it steals focus and drops the keyboard.** Rendered at 1×1
  opacity:0 so it *can* buzz, clicking the `<label>`/switch moves focus to the
  checkbox, which blurs the terminal's input (2 iframes down) → iOS hides the
  on-screen keyboard → **the arrow keybar itself disappears** (it only shows
  while a keyboard is up). Blurring the switch + refocusing afterward doesn't
  help: from the top document `activeElement` is the *iframe element*, not the
  inner input, so the keyboard's already gone. `preventScroll`/`pointer-events`
  don't stop the focus move.

So on iOS the switch hack is strictly lose-lose: off-screen = no buzz,
on-screen = broken keyboard. Reverted to `navigator.vibrate`-only.

*Rejected:*
- `<input switch>` toggle hack (both placements — see above).
- Reaching cross-frame to refocus the terminal input after the toggle — fragile,
  and the keyboard has already begun animating down by then; not worth it for a
  buzz.

*If revisited:* the only real iOS haptic path is native (a WKWebView host app
bridging `UIImpactFeedbackGenerator`, or a Capacitor/Cordova wrapper) — out of
scope for a pure PWA. Don't re-try the `<input switch>` route; it was tested
on-device (iOS PWA) and fails as documented.

## Mobile terminal goes fully blank after `clear` (stale iOS reveal-scroll)

*Symptom:* On the phone, running `clear` (or anything that redraws from the top —
`Ctrl-L`, a TUI repaint) turns the terminal into an **all-black screen**. The
prompt is gone; it comes back only once you type a key or drag to scroll. Desktop
is unaffected.

*Cause:* The mobile input overlay (`terminal-kbd.js`) parks its transparent
textarea caret at `cursorY × rowHeight + KBD_BAR_RESERVE` (`positionCaret`), and
relies on **iOS to reveal-scroll the document** so that caret sits above the
keyboard. iOS only reveal-scrolls on *user* caret events — it never scrolls when
*we* move the caret. So when `clear` yanks the cursor from a deep row to row 0,
`paddingTop` drops but the document stays scrolled down (iOS left it where the
deep caret was), now over the **cleared/empty** region — the prompt is at the top,
scrolled off the top of the screen. Verified with Playwright/WebKit: after `clear`
the xterm **buffer is correct** (prompt at row 0, `viewportY 0`, scrollback
cleared), but `document.scrollingElement.scrollTop` stayed non-zero and the
`.xterm-screen` top measured **above** the viewport (negative `top`). It self-heals
on the next keystroke/scroll because that re-triggers an iOS reveal.

*Fix:* In `positionCaret`, after updating `paddingTop`, if the caret is high
enough that everything above it already fits in the visible band
(`y <= visualViewport.height - rowHeight`), pin the document back to the top
ourselves (`document.scrollingElement.scrollTop = 0`). This runs on `onCursorMove`
(which `clear` fires), so the reset lands exactly when the cursor jumps up. The
guard is deliberately one-sided:
- **Deep caret** (`y > visible height`, i.e. typing at the bottom of a full screen
  with the keyboard up) → **left alone**, so the working bottom-reveal is untouched.
- **Manual scrollback** fires no cursor-move, so `positionCaret` doesn't run and
  the reset never fights a user drag.
- **Keyboard down** → `visualViewport.height` is full, so the caret always "fits"
  and any residual reveal-scroll is cleared — which is correct, since the document
  should never be scrolled when the keyboard is down (xterm's own viewport picks
  the visible rows).

*Rejected:*
- Detecting the `ED 2`/`ED 3` (`\E[2J`/`\E[3J`) escape specifically to scroll to
  top — narrower and more fragile than keying off the caret position, which also
  covers `Ctrl-L` and any TUI that redraws from the top.
- Resetting scroll on overlay `blur` — would fight a user who scrolled back through
  history and then dismissed the keyboard.

## Mobile terminal: the trackpad slide / a device switch corrupts typing (stale value-diff mirror)

*Symptom:* On the phone, "occasionally the touch slide interferes with the
keyboard — it can't type, types in the wrong place, or even dumps a bundle of
characters. Happens most during device switching."

*Cause:* The touch overlay (`terminal-kbd.js`) mirrors the current input line in a
hidden `<textarea>` and forwards a **value-diff** (`ov.value` vs `lastSent`) to the
PTY. That mirror silently desyncs whenever the shell line changes **out-of-band**
from the overlay — and then the next diff is computed against a stale baseline,
emitting spurious backspaces or dumping the whole delta as a bundle. Two triggers,
matching the report exactly:
- **The arrow-key trackpad slide.** It sends `Ctrl+F`/`Ctrl+B`/arrows straight to
  the PTY (`kbd-key` → `sendRaw`), moving the **shell** cursor — but the overlay
  still assumes edits append at its textarea's end. The next backspace/keystroke is
  diffed against a line whose cursor has moved → wrong place / bundle.
- **Device switching.** Returning from the background reconnects the WS and redraws
  the shell line, but the refocus arrives as a **bounce** (xterm steals focus on
  reconnect → the `focusin` guard bounces it back with `__termBouncing=1`). The
  focus handler deliberately **skips** the baseline reset during a bounce (to protect
  a char in flight during *active* typing) — so the stale mirror survives into the
  new session and the first keystroke corrupts the line.

*Fix (`terminal-kbd.js`):* re-ground the mirror whenever the line may have changed
out-of-band. `resetBaseline()` (`ov.value=''`, `lastSent=''`, drop any pending
flush) is now called: (1) in the `kbd-key` handler after every trackpad/arrow/^C/
Esc/Tab byte; (2) on `visibilitychange`→visible (the device-switch path); and (3)
the bounce-skip in the focus handler is **time-gated** — it only preserves the
baseline for a bounce within 1.5 s of the last real keystroke (genuinely mid-typing);
a bounce after any idle gap (reconnect / background return) resets. After a reset the
next keystroke is sent as a clean delta from the shell's real cursor: append → the
char; backspace on an empty overlay → a single DEL. Verified with Playwright/WebKit
by capturing the PTY byte stream: `hello` + `ArrowLeft` + `hi` now sends
`h,e,l,l,o,\e[D,h,i` (was `…,\x7f\x7f\x7f\x7f,i`); a hidden→visible cycle then `x`
sends just `x`; normal typing + backspace is unchanged (`a,b,c,\x7f`).

*Rejected:*
- Teaching the mirror to track the shell cursor position (so mid-line edits map
  correctly) — the overlay can't observe the shell's cursor without parsing the
  output stream; re-grounding to empty is simpler and robust, at the cost of losing
  textarea-native mid-line editing (rare on a terminal, and already unsupported once
  the shell cursor moves).
- Resetting on the overlay's `blur` — would fight a user who scrolled back and then
  dismissed the keyboard, and misses the trackpad case (no blur happens there).

## Mobile terminal resize: two-finger tap, not single-finger double-tap (iOS keyboard conflict)

*Goal:* a touch gesture to re-claim the shared PTY's shape for this device
(`claimSize()`), the mobile analogue of the desktop's double-click.

*Symptom (the dead end):* a single-finger **double-tap** on the terminal was tried
first. With the keyboard **hidden** it was unusable: the first tap raises the iOS
keyboard (native focus of the input overlay), which slides up **under the finger**,
so the **second tap lands on a keyboard key and types a stray character** — and iOS
delivers that tap to the system keyboard, not to our overlay, so there's *also* no
resize. Even with the keyboard already up, a double-tap on the editable overlay pops
iOS's native **Paste** bubble / word-select. Tuning the double-tap detection
(duration vs. `didScroll`, window/px tolerances) improved *registration* but could
never fix the stray-key problem — that tap is physically on the system keyboard.

*Root cause:* iOS only raises the keyboard when an input is focused **inside the tap
gesture itself**. So the first tap *must* raise the keyboard for single-tap-to-type
to work, and a delayed/deferred `focus()` (to "wait and see" if a second tap is
coming) does **not** raise the keyboard on iOS. There is no way to have "single tap
raises the keyboard" and "double tap raises no keyboard" from the same finger.

*Fix:* make the resize a **two-finger tap**. Two fingers never focus the overlay
textarea, so **no keyboard ever rises** — safe regardless of keyboard state.
`preventDefault` on every touchend of the two-finger gesture blocks stray focus;
`claimSize()` fires once all fingers lift within 600ms. Single-finger double-tap is
left entirely to iOS (native selection / Paste). A versioned-key coach hint
("two-finger tap to resize…") teaches it. Verified in Playwright/WebKit with the
legacy `document.createTouch`/`createTouchList` API (Playwright's `touchscreen` is
single-finger only): two-finger dispatch fires the resize and leaves the overlay
unfocused (keyboard down); real-device confirmation from the operator.

*Rejected:*
- **Single-finger double-tap, any variant** — stray key from the risen keyboard
  (hidden) or the Paste bubble (up); unfixable, it's how iOS routes the 2nd tap.
- **Gating single-finger double-tap to keyboard-up only** (an interim step, on
  `ovFocused`) — removed: still popped the Paste menu, and split the gesture
  confusingly across keyboard states.
- **Deferring the keyboard to disambiguate** — a `setTimeout`'d `focus()` won't
  raise the iOS keyboard (must be in-gesture), so single-tap-to-type would break.

## Coach banners: show every time until ×, with a persisted max-showings cap

*Context:* the two blue coach tips (terminal two-finger-resize; desktop arrow-key
trackpad) started as "nudge a few times per session, then auto-hide, and retire the
moment the user does the gesture." The operator wanted them **more discoverable**:
show **every time** and only disappear when the user explicitly taps the **×**.

*Design:* no auto-hide, no per-session cap, and doing the gesture does **not**
dismiss the banner — only the × persists `done` (localStorage). Safety net so it
can't nag forever if the × is never tapped: a **persisted show-count** capped at
`TF_MAX`/`HINT_MAX` (10); the count is stored under the same key (an integer) until
the × writes the `done` sentinel. The banner text states the cap ("shows up to 10
times — tap × to dismiss") with the number interpolated from the constant so copy
and behavior can't drift.

*Gotcha — resetting dismissed state:* changing a tip's behavior doesn't re-show it
to anyone who already dismissed the old one (their `done` flag suppresses it). The
fix is to **version the localStorage key** (`…:v2`); bumping the `:vN` suffix
re-runs the "campaign" for everyone. This is why the operator "didn't see the tip"
after the behavior change — their old `vibetop:2fingerhint` was still `done`.

## Mobile terminal: can't scroll back through a *live* Claude/TUI response (desktop was fine)

**Symptom.** On the phone, scrolling up to read earlier output *while Claude Code
(or any full-screen TUI) is mid-response* snapped the view straight back to the
bottom on every frame — you could only scroll once the turn finished. On the
**desktop the exact same session scrolled fine.** The desktop-vs-mobile split is
the whole clue.

**Cause.** *Not* the scroll buffer. xterm's `viewportY` holds its scrolled-up
position through streaming output on both platforms — verified once the test
stopped sending a stray `\r` (an Enter counts as user input and triggers xterm's
own `scrollOnUserInput` snap-to-bottom, which faked a "yank" in every early
repro). The real culprit is the **mobile-only input overlay** (`terminal-kbd.js`):
on touch it parks a transparent textarea's caret on the cursor row via a dynamic
`padding-top` (`positionCaret`) so iOS reveal-scrolls the *prompt* above the
keyboard. `positionCaret` is bound to `onCursorMove` — and a TUI repaints its
region **in place**, moving the cursor on every frame (Claude Code doesn't even
grow scrollback mid-turn: `baseY` stays put while it rewrites the live screen). So
each repaint re-parked the caret at the bottom and iOS re-revealed it, dragging
the *visible* view down even though `viewportY` never moved. Desktop has no
overlay/caret/reveal, so its scroll just held.

**Fix.** Gate `positionCaret`: when the user has scrolled up into scrollback
(`baseY - viewportY > 1`) it early-returns and does nothing. Its only job is
revealing the prompt while you type *at the bottom*; up in history it was purely
fighting the user. Normal cases are unaffected (at the bottom the gate is off, so
caret-park + the `clear` scroll-reset still run). Verified on WebKit: scrolled-up
view HELD + `padding-top` frozen during a TUI animation, while typing at the
bottom still tracked the cursor row.

**Rejected.** A terminal-side "scroll lock" (buffer output while scrolled up, catch
up on release) — Claude Code (Ink) emits cursor **queries** mid-render and waits
for replies, so intercepting/buffering its byte stream risks stalling it. Not
worth the fragility when the actual bug was our own overlay, not xterm.

## Snap GUI apps fail on the X11 display with "Authorization required" (xhost +local: is not enough)

**Symptom.** Launching a **snap** GUI app (Firefox, Chromium) from a Terminal or
`/api/x/launch` onto the X11 display `:98` prints snapd mount-namespace warnings
(harmless) and then dies with **`Authorization required, but no authorization
protocol specified`** — even though the unit already runs `xhost +local:` and the
`:98` ACL shows `LOCAL:`. Native apps (`eog`, `xterm`, `xeyes`) work fine.

**Cause.** Two things compound:
1. A confined snap **can't read `~/.Xauthority`** — the snap `home` interface
   grants non-hidden files in the real home but **excludes dotfiles**, and that's
   exactly where the `:98` cookie lives (Xorg was started `-auth ~/.Xauthority`).
   So the snap sends **no auth cookie** and must fall back to the host ACL.
2. `xhost +local:` (`FamilyLocalHost`) is **not honored for the Unix-socket
   connection** by this X server. Proven directly: a no-cookie client
   (`env XAUTHORITY=/dev/null xdpyinfo`) got `Authorization required` under the
   `LOCAL:` ACL, but connected (`name of display: :98`) the moment
   `xhost +si:localuser:<user>` was added.

**Fix.** Use the **server-interpreted local-user** grant, not `local:`:
`--start="xhost +si:localuser:@APP_USER@"` in `vibetop-x11-xpra.service`
(`browser/install.sh` renders `@APP_USER@`). `si:localuser:` uses the socket peer's
credentials (`getpeereid`) and reliably grants that user with no cookie. Tighter
than `+local:` too (one user, not any local user) and safe here (loopback-only,
single-user, behind Access). Native apps are unaffected — they read the cookie.
NB: a unit change only lands on a full deploy / `browser/install.sh`
(`INSTALL_SYSTEMD=1`), **not** the in-app Update (`INSTALL_SYSTEMD=0`); patch the
installed unit + `daemon-reload` (no restart needed — a live `xhost` on the
running display holds until it restarts) to fix an existing host in place.

**Rejected.** `xhost +` (disable access control entirely) — works, but broader than
needed; `+si:localuser:` grants exactly the one user. Relocating the xauth cookie
to a non-dotfile the snap can read — more moving parts than a one-line ACL grant.

---

## Public file-share links (Files app) — punching a hole through Access, safely

- **Symptom / need:** the Files app can browse the host as `APP_USER`, but there was
  no way to hand a file to someone who isn't a vibetop user — every URL is behind
  Cloudflare Access (tunnel) or the LAN boundary. Ask: a **passwordless, read-only
  public link** to a file (and, later, a folder), secured by an unguessable token.
- **Cause:** a public link is deliberately reachable **without** auth, so the whole
  existing trust model ("anyone past Access is `APP_USER`") doesn't apply to it — the
  token has to be the *only* gate, and the serving path has to be locked down.
- **Fix — capability token + tightly-fenced serving** (`terminal-manager.py` +
  `/s/` nginx location + `filebrowser-patches.js`):
  - **Token = `secrets.token_urlsafe(16)`** (128-bit random), stored in a server-side
    registry (`~/.local/share/vibetop-shares.json`). Random > "hash of the path" (a
    path hash is guessable if the path is known). Stateful (not a self-signed JWT) so
    links can be **listed and revoked** — revocation is a safety feature, and a
    stateless token can't be revoked.
  - **Read-only, GET/HEAD only**, on a dedicated top-level path `/s/<token>` (not under
    `/api/`) so the Cloudflare Access **Bypass** app is cleanly scoped (manual operator
    step — can't be automated in code; see `tunnel/README.md` §8). On the LAN nginx is
    the only gate, so it just works.
  - **Fenced to `SHARE_ROOT` (default = home) + no dotfiles** via `_safe_share_target`
    — stricter than `_resolve_under_home`: rejects any dot-segment (`~/.ssh`,
    `~/.config/*`) and anything outside home, so a public link can never publish
    `/etc/*` or a secret even though FileBrowser's root is `/`. Re-validated on **every**
    fetch (symlink-resolved) so a moved/replaced/now-dotfile target 404s.
  - **Same-origin XSS guard** (the subtle one — the file is served from the app's own
    origin): every `/s/` response sets `X-Content-Type-Options: nosniff` +
    `Content-Security-Policy: default-src 'none'; sandbox`, and only a safe allowlist
    (images / PDF / text / audio / video) is served `inline`; **everything else —
    notably `.html`/`.svg` — is forced to an `attachment` download** as
    `application/octet-stream`, so a shared file can't run JS in-origin. `?dl=1` forces
    download for anything. Unit-tested (`test_api_share.py`).
  - **Folders → on-the-fly `.zip`** (`_serve_share_zip`): built to a temp file then
    streamed, skipping dotfiles/dot-dirs and any symlink escaping the fence, capped by
    `SHARE_ZIP_MAX_FILES`/`_BYTES`. Files stream in 64 KB chunks with single-`Range`
    (`206`) support for media seek.
  - **Expiry (default 7 days) + revoke**, both lazily pruned; the Share dialog's
    **Manage links** lists all active shares with per-link copy/revoke.
- **Rejected:** a stateless signed token (`_jwt_sign`) — no revocation/listing; a
  path *hash* as the token — guessable; serving under `/api/share/<token>` — muddies
  the Access-bypass scope with the authed API; allowing the whole FS (FileBrowser's
  root) — unsafe for a public link, so home-only is the default (`SHARE_ROOT` env
  widens it); `X-Accel-Redirect` offload to nginx — better for huge files but splits
  the security-critical serve across two components; kept it in one auditable place
  (noted as a future perf option). A separate `share.example.com` origin would beat
  the same-origin XSS risk outright but needs extra DNS/Access setup — the
  attachment+`nosniff`+sandbox-CSP mitigation covers it for v1.

---

## Multi-user auth (Phase 1): Linux-account login, where the gate lives

- **Context:** Making vibetop multi-user (Option B — a web remote-desktop for the
  host's *real* Linux users; see `docs/multi-user.md`). Identity = the host's Linux
  accounts via **PAM**; login is username+password (LAN direct, tunnel behind
  Cloudflare Access first), remembered 7 days. Isolation is Unix permissions =
  SSH-equivalent (a host-root user is root through vibetop — by design). This entry
  records the non-obvious *where/how* of the auth gate; the per-user runtime
  (services running as each user) is a later phase.
- **PAM via `ctypes`, not a pip module.** The manager is stdlib-only (hand-rolled
  JWT, multipart, sd_notify). `_pam_authenticate` loads `libpam.so.0` via ctypes and
  runs a single-shot conversation (`pam_authenticate` + `pam_acct_mgmt`) against the
  `vibetop` PAM service (`/etc/pam.d/vibetop` → `common-auth`/`common-account`, dropped
  by `terminal/install.sh`). The session cookie **reuses `_jwt_sign`/`_jwt_verify`**
  (one signing primitive) over `{u, exp}`, keyed by a root-owned
  `/etc/vibetop/session.secret`. `_authenticate` is a seam tests monkeypatch, so the
  whole flow is hermetic (no real creds).
- **The gate: nginx `auth_request` → the manager's `/api/authcheck`, with the
  public-path allowlist IN THE MANAGER.** Every protected location
  (`/`, `/api/`, `/tN/`, `/browser/`, `/x11-display/`, `/files/`, `/onlyoffice/`) has
  one line — `auth_request /internal/authcheck` — and `/internal/authcheck` proxies to
  `/api/authcheck`, which allowlists the public paths (login/logout/authcheck,
  ping/health/metrics, `/api/office/{callback,doc}`) via the `X-Original-URI` header.
  - **Why the allowlist lives in Python, not nginx:** it's *one* testable policy
    (`_is_public_path`) instead of a dozen nginx carve-out `location` blocks, and it
    keeps the OnlyOffice **container** callbacks (server-to-server, no browser cookie,
    HMAC-authed) reachable without duplicating their proxy config. Verified end-to-end:
    a cookieless `/api/office/doc` returns **403** (allowlist let it *past the session
    gate*, then the manager's own HMAC rejected the forged path) — exactly the intended
    layering, not a 401.
  - **Loopback admin tooling is unaffected** because it hits `127.0.0.1:7680`
    **directly**, bypassing nginx and therefore the gate — the watchdog's `/api/ping`,
    `doctor.sh`, and `smoke-test.sh` keep working with no cookie. (Browser traffic can
    only reach the manager *through* nginx, where the gate applies.)
- **Rejected: gating `/api/` inside the manager.** Tempting (defense in depth,
  hermetic), but nginx-proxied browser requests and direct loopback-admin requests
  **both** arrive at the manager from `127.0.0.1`, so the manager can't tell "trusted
  local curl" from "hostile LAN client via nginx" by source IP. Gating at nginx (which
  loopback admin bypasses) draws that line cleanly.
- **LAN TLS: redirect http→https only for LAN clients, only on the credential pages.**
  A Linux password is POSTed to `/api/login`, so LAN clients must use https
  (self-signed by default, `TLS_CERT`/`TLS_KEY` to override; `ENABLE_TLS=0` opts out
  with a cleartext warning). The redirect is `set $vt_up "$scheme$vt_is_lan"; if
  ($vt_up = "http1") return 301 https…`, placed **only** in `location = /` and
  `location = /login.html`.
  - **Two carve-outs that a blanket redirect would break:** (1) the **tunnel** — over
    Cloudflare the browser is already https and cloudflared reaches nginx on http from
    **loopback**; `$vt_is_lan` is 0 for `127.0.0.1`/`::1`, so the tunnel hop is never
    redirected (TLS is terminated at Cloudflare's edge). (2) the **OnlyOffice Docker
    callback** — the container reaches the host via `host.docker.internal`, i.e. the
    Docker bridge IP (non-loopback → `$vt_is_lan`=1), so a *server-wide* redirect would
    301 its http callback; scoping the redirect to `/` and `/login.html` (never
    `/api/`) leaves the callback on http. Both verified live: loopback http `/` → 302
    to `/login.html` over **http** (not https); LAN-IP http `/` → **301 to https**;
    LAN-IP http `/api/office/callback` → **not** redirected.
  - **`http2 on;` avoided** — it's nginx ≥1.25 syntax; Ubuntu 24.04 ships 1.24 (fails
    config test). HTTP/2 does nothing for the WebSocket-heavy traffic anyway.
- **Rejected: a separate front "gateway" service** (the Firecracker-era design). For a
  single host with the manager already central and root, extending nginx (`auth_request`)
  + the manager (PAM + session) is far less moving-parts than a new reverse-proxy
  process, and reuses the existing loopback trust boundary.

---

## Multi-user Phase 3: per-user terminals run AS the logged-in user

- **Context:** A Terminal must be a real shell as the *authenticated* Linux user in
  their own `$HOME` (not the single deploy user). Each `(user, N)` runs as a
  `systemd-run --uid=<user>` transient unit — `vibetop-uterm-<user>-<N>` (the
  session daemon) + `vibetop-uttyd-<user>-<N>` (ttyd) — with the `vibetop-session`
  instance id `<user>-<N>` (socket `/tmp/vibetop-session-<user>-<N>.sock`) and a
  **per-user ttyd port** from a small registry-assigned slot
  (`/var/lib/vibetop/users.json`: `port = USER_TERM_BASE + slot*PER_USER_TERMS + N`).
  nginx routes `/tN/` to that port via the `authcheck` subrequest (`X-Term-Port` →
  `auth_request_set` → `proxy_pass`), cold-starting the terminal on first hit.
- **Why `systemd-run` transient units, not the `@N` templates:** a system-unit
  template can't set `User=` from its instance (`%i`), so per-user terminals can't
  reuse `vibetop-ttyd@N`. `systemd-run --uid` runs as the user with no pre-installed
  per-user unit files and cleans up on stop (`--collect`). (The `@N` templates are
  still installed but unused.)
- **The 203/EXEC trap — the per-user helper scripts must live OUTSIDE the operator's
  home.** First live run failed silently: `/api/terminals/1/start` returned 200 but
  the unit died instantly with `Failed to execute …/vibetop-session: Permission
  denied` (status **203/EXEC**). Cause: the checkout lives in the operator's `$HOME`
  (mode **0750**), so *another* Linux user can't traverse in to exec `vibetop-session`
  / `ttyd-run.sh`. Fix: `terminal/install.sh` installs **root-owned 0755 copies** to
  `/usr/local/lib/vibetop/` (matching the existing `browser-loop.sh` precedent) and
  the manager execs them from there (`_term_helper`, falling back to the checkout for
  dev/tests). This is the *minimum* of the `docs/multi-user.md` `/opt/vibetop` move —
  enough to let per-user terminals launch; the full relocation is Phase 4 hardening.
  Only surfaced on a real multi-user host (the deploy user could always exec its own
  files; the hermetic tests don't launch real units).
- **ttyd-run.sh generalized** to `(<instance-id> <port> <base-N>)` — the instance id
  drives `vibetop-session attach` (per-user), while `-b /tN/` + the title use the base
  number the browser reaches; the legacy single-arg numeric form still works.
- **Everything per-user is scoped by identity:** `_list_running_terminals(user)` (its
  `_cached` key is `running_terminals:<user>`), `/api/terminals/status`, and
  `/api/reset` all act on the request user's own terminals only. `vibetop-session`
  already accepted a *string* instance (socket path is `…-{instance}.sock`), so the
  compound `<user>-<N>` id namespaced cleanly with no daemon change.
- **Rejected: `systemd --user` per user.** Cleaner in theory (implicit `User=`) but
  needs a live user manager + linger + `XDG_RUNTIME_DIR` wiring per user before any
  terminal can start; `systemd-run --uid` from the root manager is simpler and has no
  such bootstrap. (Linger is still enabled in `_provision_user` so `/run/user/<uid>`
  D-Bus/XDG exist for GUI apps launched from the shell.)

---

## Multi-user Phase 3b/review: per-user Files + "admin-gate the not-yet-per-user"

- **Per-user Files.** FileBrowser now runs per user (a `systemd-run --uid` transient
  unit `vibetop-ufiles-<user>`, per-user port inside the user's own terminal-port
  block — `USER_TERM_BASE + slot*PER_USER_TERMS + USER_FB_OFFSET` — per-user DB),
  **rooted at the user's home** (`--root/--scope <home>`) so it opens at `~`, can't
  escape it, and its writes have the user's own permissions. The shared single-user
  `vibetop-filebrowser.service` is retired. Rooting at home (not `/`) also let the
  `@APP_HOME@` front-end patches keep working by stamping it **empty** (home = the
  FileBrowser root = `/`), avoiding a runtime `whoami` fetch in the fragile
  `filebrowser-patches.js`. nginx `/files/` routes to the per-user port via
  `authcheck` → `X-App-Port` (the `/tN/` pattern). A `_wait_tcp` after launch stops
  the first hit from 502-ing before the service is listening.
- **The invariant the fable review caught — and the fix pattern.** A model-driven
  adversarial review found the real bug class: **the login gate was widened to every
  Linux user before Browser/X11/Files-raw-view/Claude-usage/Update were made
  per-user, so those still acted as `APP_USER`.** Concretely: `/fileview/` was
  *ungated* (unauthenticated arbitrary file read as the nginx worker — **critical**);
  `/api/x/launch` + `/api/browser/open` gave any user **RCE as the operator**;
  `/api/reset` tore down the shared Browser/X11 for everyone; `/api/claude/usage`
  read/wrote `APP_USER`'s `~/.claude`; `/api/update` let any user redeploy the host.
  - **Fix = `_require_admin()` (`_ctx_user() == APP_USER`) on every subsystem that
    still acts as the operator**, until it is per-user. Cookieless loopback/admin
    tooling is `APP_USER`, so it still passes; a non-admin session gets 403. `/reset`
    keeps the per-user terminal/desktop teardown for everyone but gates the shared
    Browser/X11 reset to the operator. `/fileview/`'s admin check lives in `authcheck`
    (not an nginx `if`, which evaluates in the rewrite phase *before* `auth_request`
    populates the user variable — so an `if ($vt_user != …)` 403s everyone, including
    the admin). **Takeaway: widen the authN gate and lock down authZ in the same pass
    — a per-request identity is not per-user isolation until every subsystem consumes
    it.**
- **Exact-match the public allowlist.** `_is_public_path` (and the CSRF exemption)
  matched `/api/office/{callback,doc}` with `startswith`, so `/api/office/doc-anything`
  was needlessly public. Now exact-match (split off the query, compare `==`). Not
  currently exploitable (the raw URI is forwarded unchanged and those handlers are
  HMAC-gated), but the fragile pattern is gone.
- **Verified live on Legion:** unauth `/fileview/etc/passwd` → login redirect (was a
  raw read); a non-admin session → 403 on `/fileview/` and every shared subsystem;
  per-user Files serves each user their own home; the operator (via an `APP_USER`
  session) still has everything.

---

## Multi-user Phase 3c: per-user Browser + X11 (xpra + snap Chromium as the user)

- **Context:** The last per-user conversion, and the heaviest. Each user gets their
  OWN Browser xpra (a Chromium desktop) and X11 xpra (a bare desktop for GUI apps),
  launched AS them via `systemd-run --uid` (units `vibetop-ubrowser-<user>` /
  `vibetop-ux11-<user>`), on per-user display numbers + HTML5 ports from their slot
  (avoiding the legacy shared `:98`/`:99`). nginx routes `/browser/` + `/x11-display/`
  (and their asset sub-locations) to the user's port via `authcheck` -> `X-App-Port`,
  cold-starting the display on first hit (`_wait_tcp` up to 20s — xpra is slow to
  bind). The shared single-user xpra services are retired; a common `xpra-app.sh`
  launcher (world-executable in `/usr/local/lib/vibetop`, like the terminal helpers)
  runs either kind. `/api/browser/open`, `/api/x/launch`, and the wmctrl handlers are
  no longer admin-gated — they act as the request user on THAT user's display;
  terminals export the user's own `:DISPLAY` so a GUI app run from a shell surfaces on
  their X11 Launcher.
- **snap Chromium per user actually works** — the biggest unknown (the CLAUDE.md
  documents a wall of snap/xpra/linger gotchas for the single `APP_USER`). Validated
  live on Legion: two users each got their own Browser xpra with
  `/snap/chromium/.../chrome` running AS them, on disjoint ports (24500 vs 24501), and
  `x/launch xterm` produced an `xterm` owned by the user (the `root` in `ps` is only
  the `su -` wrapper). The keys were already in place from the terminal work:
  `_provision_user` enables **linger** so `/run/user/<uid>` (and the user's session bus
  + snap tracking scope) exist headless, and the launcher scripts live outside the
  operator's 0750 home (the 203/EXEC lesson).
- **Accepted per-user degradation:** launched GTK/GNOME apps use the user's real
  session bus (the single-user "private apps bus" that dodged the ~25s
  xdg-desktop-portal activation hang was one shared instance). They still work, just
  with the portal pause; a per-user private bus would restore ~0.2s and is a noted
  future refinement. snap apps (which need the real bus) and native apps are fine.

---

## In-Files video: .mkv "opens but doesn't play", and no audio/subtitle track picker

**Symptom:** Double-clicking a video in the Files app opened FileBrowser's built-in
previewer, but `.mkv` files showed nothing (black), while `.mp4` played. And even for
files that played, there was no way to switch **audio track** or **subtitle language**
— which a translation-review workflow (one MKV carrying Japanese+Chinese audio and
Chinese/English/Japanese subs) needs. Fullscreen was also missing inside the app iframe.

**Cause:** FileBrowser's preview is a bare HTML5 `<video>` element. Browsers **cannot
demux the Matroska (.mkv) container at all** — even though the user's MKVs held
browser-friendly H.264+AAC, the container itself is unplayable in `<video>`. A plain
`<video>` also exposes no audio-track picker, and its native CC button is unreliable
inside a nested app iframe.

**Fix:** A dedicated in-Files player (`landing/video.html`, opened via a `video-view`
postMessage like the office viewer) backed by three manager endpoints
(`/api/video/{info,media,subs}`) that use ffmpeg:
- `info` probes tracks (ffprobe → per-type audio/subtitle indices for `-map 0:a:N`/`0:s:N`).
- `media` serves **one browser-playable MP4 per audio track**, cached by
  `sha1(src:mtime:size:audioIndex)`. For the common H.264-in-MKV case this is a
  **lossless container remux** (`-c copy`, ~0.035s); transcode only when the video
  codec isn't browser-compatible. Range-served (206) so seeking works.
- `subs` extracts a subtitle stream to WebVTT (`-f webvtt`), served as `text/vtt`.

The page switches audio by **swapping `<video>.src` and restoring `currentTime`**,
switches subtitles via WebVTT `<track>` + `textTracks[i].mode`, and has an explicit
fullscreen button (`requestFullscreen()` on the wrapper, `webkitEnterFullscreen()`
iOS fallback; the app iframe gains `allow="fullscreen; autoplay"`).

**Rejected:**
- *`HTMLMediaElement.audioTracks` on one multi-audio MP4* — the seamless way to switch
  audio without a src-swap, but `audioTracks` is undefined in Firefox and doesn't
  reliably switch progressive-MP4 output in Chrome. The per-track-file + src-swap
  approach works in every browser (incl. the embedded xpra Chromium and iOS Safari)
  with perfect seeking, at the cost of a brief re-buffer on switch (fine for review).
- *On-the-fly transcode streamed via a pipe* (`frag_keyframe+empty_moov`) — avoids the
  cache but breaks Range/seeking; the cache-then-Range-serve gives real seeking and the
  remux is near-instant for the copy case.
- *Image-based subtitles (PGS/VobSub)* can't become WebVTT — those tracks are omitted
  from the picker (text subs only).

## Mobile Files app: toolbar, clickable breadcrumb, folder-nav recovery (a long iteration)

Related mobile-only (≤736px) fixes to the Files app (`landing/filebrowser-patches.js`),
landed v1.16.31–44 after many wrong turns. Recorded so the dead ends aren't re-explored.
All verified on **WebKit** (the iOS engine) against the live `/files/` page (playwright +
a `_sign_session` cookie + `add_style_tag`/route-override to test without deploying) —
Chromium emulation does not reproduce these; see the WebKit-harness note above.

**Toolbar layout — sticky grid, not a wrapping/scrolling fixed header.**
- Symptom: mobile toolbar buttons clipped / needed horizontal scroll; and, separately,
  the address bar's path input "disappeared."
- Cause: FileBrowser's `<header>` is `position: fixed`. The old `flex-wrap: wrap` let the
  (taller, wrapped) fixed header grow past the content's top offset and *cover* the
  content below it (the buried address bar). A later single-row `overflow-x: auto` hid
  buttons off-screen ("needs scrolling, terrible").
- Fix: header is now an in-flow **`position: sticky` CSS grid** (`repeat(8,1fr)`,
  `#dropdown{display:contents}` so its native buttons join the grid). In-flow ⇒ content
  always flows *below* it (overlap impossible); a grid never scrolls horizontally. Every
  action is a uniform icon-over-label cell, **all buttons always visible** (selection-
  dependent ones greyed, not hidden — the user wanted all buttons). The icon/label size
  rules MUST include the `#dropdown .action` selector or the natives render a different
  size (base `header #dropdown .action` outranks plain `header .action` via the id).
- Rejected: `flex-wrap:wrap` on a fixed header (buries content); single-row horizontal
  scroll (hides buttons); a `…` overflow menu (user wants every button visible).

**Clickable breadcrumb — build your own; never relocate a Vue node.**
- Symptom: the clickable path bar (`Home › a › b`, each an `<a>` that navigates) was gone
  on mobile; after a "fix" it then vanished *intermittently*.
- Cause: (1) it was hidden as a "duplicate" of the editable address box — it is NOT, the
  segments are clickable navigation. (2) The next attempt *relocated* FileBrowser's native
  breadcrumb node in the DOM (it sits before the header and is `position:sticky`, so it's
  hidden under our sticky toolbar) — but it is a **Vue-managed node**, and Vue destroyed
  the orphaned node on its next re-render → flaky "gone again."
- Fix: on mobile, hide FileBrowser's native breadcrumb and build our **own** `#fb-crumbs`
  from `currentFullPath()` — tappable segments injected above the address bar, fully ours
  so nothing can strand it. **One line**: `_fitCrumbs` measures `scrollWidth` and collapses
  the fewest leading segments behind a middle `…` (which links to the deepest hidden
  folder → tap to walk up); Home + current always shown; re-fits on rotation.
- Rejected: moving/reparenting a framework-managed DOM node to reposition it — inherently
  fragile; build your own from the model instead.

**Don't strip nav on a permission-denied folder.**
- Symptom: navigating into a folder you can't read left you stranded — no toolbar, no
  address bar, no way back.
- Cause: the error page ("You don't have permissions to access this", `.message` icon
  `error`) has no `#listing`, so `isListingView()` returned false and the patch removed the
  toolbar + address bar. Its only remaining link (breadcrumb Home) jumps to `/`, not back.
- Fix: `isListingView()` treats an error `.message` like an empty folder, so the nav stays
  and the address bar's **← Back** (history.back → previous folder, verified) is available.
  (The old comment guessed the icon was `gps_off`; the real one is `error`.)

**Video/office open gesture on touch — double-tap, not single-tap.**
- Symptom: a single tap on a video played it immediately.
- Fix: touch now uses the same double-click detection as mouse — first tap falls through so
  FileBrowser *selects* the file (it selects on a single tap on touch, verified), only a
  second tap within the window opens it. Dropped the `IS_TOUCH` single-tap-opens branch.

---

## Code-review hardening pass (auth gate, port blocks, and assorted fixes)

A picky end-to-end review turned up a security hole plus a batch of correctness/
data-loss bugs. The non-obvious ones:

**Loopback trust vs. multi-user tenants — the manager can't treat a cookieless
request as `APP_USER`.**
- Symptom: on a `/opt/vibetop` multi-user host, any local tenant could
  `curl 127.0.0.1:7680/api/x/launch -d '{"cmd":"…"}'` and have it run as `vibetop`
  (→ tamper with the root-run code tree → root). `/api/browser/*`, the X11
  endpoints, and every `_require_admin` surface (`/api/update` = root redeploy!)
  were reachable the same way.
- Cause: the auth gate lived only in nginx's `auth_request`; `do_POST/do_GET` didn't
  re-check it, and `_ctx_user()` **fell back to `APP_USER`** for a cookieless
  request. `_require_admin` then admitted `APP_USER`. The single-operator "loopback
  = trusted" model was never tightened for Option B, where tenants share loopback.
- Key insight: nginx enforces `auth_request` on `/api/`, so a request that reaches
  the manager **without a cookie came directly** (bypassing nginx) — i.e. a tenant.
  Legit cookieless callers are only health probes (safe reads), the OnlyOffice
  container (its own HMAC on `/api/office/callback|doc`), and the `xdg-open` shim
  (which *does* send `VIBETOP_SESSION`).
- Fix: `_require_authed()` (mandatory session, no `APP_USER` fallback) on the six
  command-executing endpoints (`browser/open|type|key|shape`, `x/launch`,
  `x/activate|close`), placed AFTER input validation so bad-input 400s still land
  first; and `_require_admin` now gates on `self._session_user()`, not
  `_ctx_user()`. `Rejected` (Alternative): a broad "require a session for every
  endpoint" — too much test churn and needless for the per-user *data* endpoints
  (a cookieless call there only touches `APP_USER`'s own empty service-account home).

**Per-user port collision at the 11th user.**
- Symptom: once a host had ≥11 users, a terminal and some user's FileBrowser fought
  for the same TCP port (502 / unit fails), order-dependent.
- Cause: separate bands — terminals `17000 + slot*100 + n`, FileBrowser
  `18000 + slot`, xpra `24500/24700 + slot`. The 100-ports-per-user terminal band
  grows into 18000 at slot 10, overrunning the FileBrowser band.
- Fix: put EVERY per-user TCP port inside that user's own 100-port block
  (`USER_TERM_BASE + slot*PER_USER_TERMS + offset`): terminals at offsets
  `1..MAX_INSTANCE`, the three app ports just above them. Two users' blocks are
  disjoint by construction, so no collision at any slot count. (xpra X *display*
  numbers are a separate namespace and stay `200/340 + slot`.)

**User removal didn't revoke the removed user's live web session.**
- Symptom: `userdel` a user and their already-open desktop tab kept passing
  `/api/authcheck` until the 7-day cookie expiry; a re-created same-name account
  even accepted the old cookie.
- Cause: remove bumped the token epoch (0→1, the revocation) then
  `_drop_user_from_registry` deleted the whole entry, so `_user_token_epoch` read
  it back as 0 → `0 < 0` false → token still valid.
- Fix: `_tombstone_user_in_registry` keeps a `{token_epoch}` tombstone (drops the
  slot/heartbeat) so revocation survives removal AND re-creation; the reaper skips
  a heartbeat-less tombstone.

**`/api/reset` wiped every user's OnlyOffice edit sessions.** Reset is per-user
everywhere else, but `_office_sessions.clear()` emptied the process-global dict, so
another user's autosave/forcesave silently no-op'd. Fixed to clear only the
`(user, …)` keys.

**Smaller ones:** login `?next=` open-redirect (resolve against origin, require it
to stay same-origin — `startsWith('/')&&!'//'` was bypassable via `/\\host`); notes
lost unsaved text when a background sync ran after a *failed* autosave (added an
`unsaved` flag cleared only on a confirmed save, plus a retry); notes deleted a
never-opened-this-session tab with no confirm (fetch the body first); a desktop-only
infinite `requestAnimationFrame` in the mobile breadcrumb fitter (cap + bail when
`display:none`); `__allowCopy`/`blockTa` could leak `true` if `execCommand('copy')`
threw (try/finally); the ttyd reconnect-overlay `stuck()` scan bounded to short text
so it can't match terminal content; the `+`-button terminal start got the `.catch`
its siblings already had; `RESIZE_DEBOUNCE` now wakes via `set_wakeup_fd` (PEP-475
made the bare signal a no-op on an idle terminal); a per-user SSE sub-cap; and
`doctor.sh`'s home-traversability check (the octal globs were inverted — `700`
falsely PASSed, `755` falsely WARNed).

---

## iOS standalone PWA: active line hidden BELOW the screen after reopening from idle

- **Symptom (mobile, real device only):** in the installed PWA, "from time to time,
  especially after the app is idle then reopened," the terminal's active bottom line
  (and generally the bottom of the shell) is hidden **below the physical screen
  edge**, unscrollably — with **no keyboard involved**. Rotating the phone fixes it.
- **Cause:** `apph.js` set `--app-h` (the shell height) to a **running MAX** of
  `max(visualViewport.height, clientHeight)`, clamped only to full `screen.height`,
  and re-baselined that max **only on a width change (rotation)**. On reopen-from-
  idle iOS momentarily reports a too-tall height (≈ full screen, incl. the status-bar
  / home-indicator strip) during the app-switcher animation; `apph.js`'s re-sample
  timers catch it, `maxH` **latches** to it, and it can't shrink back until rotation.
  The shell (and the terminal iframe inside it) is then taller than the visible area,
  so the bottom rows render off-screen. The running MAX — meant only to stop the soft
  keyboard from shrinking the shell — was the trap.
- **Fix:** the running MAX now applies **only while the keyboard is actually up**
  (detected by `clientHeight - visualViewport.height > 100`, since the keyboard
  shrinks the visual viewport but not the layout viewport). Keyboard **down** →
  `maxH = current height` (follow DOWN), so a stale too-tall value from a reopen
  transient is discarded within ~1 render instead of sticking until rotation. Keyboard
  up → only grow (original anti-jump behavior preserved).
- **Rejected:** (a) reset `maxH` on `visibilitychange` only — the post-reopen
  transient is caught by the re-sample timers *after* the reset, so it re-latches;
  (b) drop the running MAX entirely and use `clientHeight` alone — correct in theory
  (clientHeight is keyboard-immune) but a bigger behavioral change than needed.
- **Detection gap:** `apph.js` is **inert outside the installed standalone PWA**, so
  neither emulated WebKit nor a normal mobile-Safari tab can reproduce it — it needs
  the home-screen PWA backgrounded and reopened on a real iPhone. This is the exact
  "real-device sign-off" lane the QA charter (`docs/qa-charter.md`) now mandates.

---

## Mobile terminal IME: raw pinyin leaked into the shell — extract + unit-test the input state machine

- **Symptom (recurred more than once):** typing pinyin in the mobile terminal echoed
  the RAW pinyin ("shou ji") into the shell *before* the user picked a candidate
  (手机), then corrupted the line on selection.
- **Cause:** `terminal-kbd.js` forwarded the overlay textarea's value-diff to the PTY
  on a 400 ms debounce **even during IME composition** — a normal pause to look at
  candidates (>400 ms) flushed the intermediate pinyin. The 400 ms was tuned for iOS
  *dictation's* streamed revisions but broke every paused pinyin entry.
- **Fix:** during composition forward **nothing** until `compositionend` (candidate
  selected); keep only a long (6 s) safety flush for iOS *dictation*, which composes
  for many seconds without ending — far beyond any real candidate-selection pause.
- **Durable fix (the real answer to "stop it recurring"):** the whole value-diff +
  IME/dictation state machine is extracted into `terminal/lib/kbd-input.js` (DOM-free),
  which `terminal-kbd.js` loads via the sub_filter `<script src>` and which is pinned
  by `terminal/lib/kbd-input.test.js` (9 cases; the cardinal one: *pinyin must never
  reach the PTY mid-composition*). This is the project's established "extract the
  fragile front-end logic that keeps regressing → DOM-free unit test" pattern (cf.
  `tab-sync.js`). IME can't be driven in emulation/CI at the browser level, so the
  unit test on the extracted pure logic is what makes this class CI-testable with no
  device. `install.sh` deploys `kbd-input.js` and injects it BEFORE `terminal-kbd.js`.

---

## X11 GUI apps (evince/eog) open ~25s slow again — the per-user private D-Bus bus regressed

- **Symptom (recurred):** launching a GNOME/GTK app (evince, eog) onto the X11 display
  is very slow — the window appears ~25s after the terminal command / the X11 Launcher
  reacts long after. "It was fixed before, now it's back."
- **Cause:** the multi-user conversion dropped the single-user optimization. It now
  gives EVERY launched app the user's REAL session bus (`/run/user/<uid>/bus`). A
  GNOME/GTK app on a real bus asks it to activate `org.freedesktop.portal.Desktop` /
  at-spi; in this sessionless desktop nothing answers and the app blocks ~25s on the
  activation timeout. (The manager comment even admitted it as a "known per-user
  degradation".)
- **Fix:** restore the private bus, per-user. `_ensure_user_x11_dbus(user, uid, gid)`
  starts one `dbus-daemon` per user (transient systemd-run unit, on demand — the
  "thing pinned in the background") with a config that has **NO `<servicedir>`**
  (`/etc/vibetop/x11-dbus.conf`), so an activation request fails INSTANTLY instead of
  timing out → ~0.2s startup. `_is_snap_launch` routes snap apps (Firefox/Chromium)
  to the REAL bus (confinement needs it; they don't hang on the portal); everything
  else gets the private bus. Falls back to the real bus if the private one can't
  start (slow but functional).
- **Rejected:** a single shared private bus across users (the old single-user shape) —
  breaks per-user isolation; each user gets their own now.
- **Guarded:** `test_x_launch_gnome_app_uses_private_activation_free_bus` /
  `test_x_launch_snap_app_keeps_the_real_session_bus` pin the bus choice so the
  multi-user path can't silently revert to the real bus again. Added to the QA
  recurring-regression watchlist (`docs/qa-charter.md`).

---

## Window mode: the chrome kept eating the window's own gestures (v1.19.5–.9)

- **Symptom:** five separate-looking bugs in a row, all right after the floating
  window manager shipped. The Start ▸ Utilities flyout wouldn't open on an iPad with
  a trackpad. A window painted **over** the taskbar, hiding the Start button, and the
  Start menu wouldn't pop up. A window's **×** was unclickable (min/max, further from
  the right edge, worked — the tell). Double-tap-to-maximize fired inconsistently on
  touch. After **Tidy**, the single full-frame window couldn't be resized at all.
- **Cause:** one failure mode wearing five hats — **something painted on top of the
  window's own controls won the hit test**, or a second handler undid the first:
  - `#frames` was not a stacking context, so a window's `z-index` (and the drag
    mask's `99998`) escaped to the root and stacked above the taskbar (100) and the
    Start menu (110).
  - The right-edge/corner resize handles (`.win-rz-e` / `.win-rz-ne`, enlarged to
    16/26px on touch) sit at `z-index` 3–4 — **above** the title-bar buttons — and
    the × lives at the window's top-right, i.e. directly underneath them.
  - The window-mode **coach tip** is stacked above the window, and a Tidy'd single
    window's bottom edge lands exactly where that banner is drawn: the hint that
    says "drag edges to resize" was itself eating the taps on those edges.
  - On a non-coarse pointer, tapping "Utilities" fired `mouseenter` (hover-opens the
    flyout) and then `click` (toggles it) — open, then immediately closed.
  - Native `dblclick` is unreliable on iOS *and* the title-bar move-drag swallowed it.
- **Fix:** contain the stacking rather than chase z-indexes — `#frames` gets
  `isolation:isolate` + `overflow:hidden`, so every window stacks **below** the chrome
  and any spill is clipped. Title-bar buttons raised to `z-index:5` (above the resize
  handles). The coach tip made `pointer-events:none` + auto-hiding, so it can never
  block window chrome. Tidy insets each tile by an 8px gutter so grips never sit at
  the extreme frame edge. The Utilities parent **ensures-open** on non-touch (hover
  still manages close) and only tap-toggles on pure touch. Double-tap detected from
  two `pointerdown`s (<400ms, <24px) instead of `dblclick`, before the maximized-bail
  so a maximized bar restores. Plus: a `ResizeObserver` on `#frames` re-clamps windows
  on ANY frame resize (usage strip, warning banner, keyboard, rotation), and drags end
  on `pointercancel` too (iOS) so the drag mask can't stick and swallow later taps.
- **Rejected:** bumping the taskbar/menu z-index above the windows — it fixes the
  symptom for today's numbers and breaks again the next time a window gets raised
  (`z` grows unboundedly via `zTop`); the containment is what makes it structural.
- **Takeaway for new window chrome:** anything drawn over a window — a coach tip, a
  banner, a mask — must be `pointer-events:none` or explicitly stacked below the
  window controls, and any new control near an edge must be tested against the resize
  handle that overlaps it. Verify by **hit-testing in a real browser** (WebKit at iPad
  size caught all five); none of these are visible in a static read of the CSS.

---

## Window mode round 2 (v1.19.10): the banner, the dead buttons, and the gate

A QA pass on real WebKit (iPad Pro 11 + iPad gen 11, both orientations, against a
disposable VM) found four more of these, all verified by measurement rather than
by reading the CSS. Each fix is now pinned by `tests/e2e/tests/window-mode.spec.js`.

**1. The system-warning banner made a window uncontrollable.**
- **Symptom:** with the disk-warning banner showing, pressing ▦ Tidy left the top
  row of windows with no reachable title bar — ×, ▢ and – all did nothing.
- **Cause:** `#sys-warn` was `position: fixed; top:0; z-index:9500`. A fixed
  element overlays `#frames` **without changing its size**, so the v1.19.6
  `ResizeObserver` that re-clamps windows could never see it. Tidy puts the top
  row at y=8; the banner occupies 0–39. Measured: `elementFromPoint` on the title
  bar returned `.sw-row`, and a Playwright click on × timed out.
- **Fix:** make the banner a `flex: 0 0 auto` first child of `<body>` — in the
  flow, exactly like `.cu-strip` already was. It now shrinks `#frames`, the
  existing observer re-clamps, and no window can sit under it.
- **Rejected:** clamping windows to a hardcoded banner height, or raising window
  z-index — both re-break the moment another fixed overlay appears. The rule is:
  **shell chrome above the app area belongs in the flex flow, not on top of it.**
  Still overlay-positioned and still in this class if they grow: `#sys-keybar`
  (+ its hint) and `.kbd-chip`.

**2. `tabindex` on the window buttons silently killed them (WebKit).**
- **Symptom:** after making ×/▢/– keyboard-reachable, they stopped responding to
  taps and clicks on iPad — while the window still focused and raised normally.
- **Cause:** measured — `pointerdown` and `pointerup` both landed on the button,
  but **no `click` was dispatched at all**. `tabindex="0"` makes WebKit focus the
  span on pointerdown; `setActive()` then moves focus into the app's iframe
  (`notifyActiveFrame` → `f.focus()`) mid-gesture, and WebKit suppresses the
  click. A/B proof: removing `tabindex` at runtime made the very same click work.
- **Fix:** drive the buttons from **pointerdown + pointerup** (act only if the
  release lands on the same control), and keep `role`/`tabindex`/`aria-label`
  plus an Enter/Space handler for the keyboard. Do not move them back to `click`.

**3. Double-tap-to-maximize ate the drag that followed a tap.**
- **Symptom:** tap a background window's title bar to focus it, then drag to move
  it → it maximized instead. Reproduced 100%: tap, 120ms, drag 140px → maximized.
- **Cause:** the double-tap was decided on the second `pointerdown`, before it was
  knowable whether that press would become a drag. Since click-to-focus did not
  exist yet (below), tap-then-drag was the *normal* way to move a window.
- **Fix:** arm on pointerdown, decide in `onUp` — maximize only if the gesture
  moved < 10px; a real drag also clears the pairing so the next press is fresh.

**4. Clicking an app's content did not focus or raise its window.**
- **Cause:** pointer events inside an iframe never bubble to the parent, and there
  was no relay — only the title bar, the 5px edges and the taskbar raised a window.
- **Fix:** every app frame is same-origin, so the parent attaches a capture-phase
  `pointerdown` listener to the frame's own `contentDocument` (re-wired on each
  `load`, since navigation replaces the document). No per-app code.
- **Rejected:** watching the top window's `blur` and reading `document.activeElement`.
  It looks equivalent and passes a naive test, but **misses the common case**: when
  focus already sits in ANOTHER app's iframe the top window never had focus, so it
  never fires `blur`. Measured on WebKit — do not "simplify" back to it.

**5. The size gate excluded the current base iPad.**
- **Symptom:** on an iPad (gen 11) window mode worked in landscape and silently
  turned itself off in portrait.
- **Cause:** the gate was `max(w,h) >= 1000 || w >= 900`; that iPad is 656x944, so
  both arms failed in portrait (944x656 landscape passed the second arm).
- **Fix:** gate on the **short** side too — `min >= 600 && max >= 900`, plus a
  fine-pointer arm so a short, wide *desktop* window keeps windows. Checked against
  Playwright's whole device table: every tablet passes in both orientations, and no
  phone does. A long-side-only test cannot work — Pixel 9 Pro landscape is 900x375
  and Galaxy A55 landscape is 1040x480.

**Also in this pass:** opening a 2nd app auto-tiles (it used to cascade 32px and
bury the first, so window mode looked exactly like the full-screen switcher) until
the user arranges a window themselves; the snap zone went 18px → 28 (mouse) / 48
(touch), because at 18 a drop 24px from the edge merely clamped the window flush
to it at its original width, which *looks* snapped — 6px of travel decided it; the
taskbar now marks minimized windows and minimizes the focused one on click; ▢
becomes ❐/"Restore" while maximized; and `closeApp`'s `display:none` reflow kick is
skipped in window mode, where it flashed every open window on each close.

**Process note:** none of this had e2e coverage, because `playwright.config.js` had
no tablet lane at all — window mode's own gate means it only ever runs on tablets
and desktops. Added `ipad-pro-11`, `ipad-pro-11-landscape` and `ipad-gen-11`.
`tests/e2e/run-vm.sh` was also broken (it minted the session cookie from
`/home/$E2E_USER/vibetop`, but the Vagrantfile rsyncs to `/home/vagrant/vibetop`,
so the documented one-command e2e path exited 1 before running anything).

**Round-2 follow-ups found by pushing further (same v1.19.10 pass):**

- **A coach banner made windows unresizable — again.** The banner renders at
  `bottom: 60`, i.e. exactly over the bottom edge and SE grip of any window that
  reaches that far, and it stacks above the window. Measured: `elementFromPoint`
  on an SE grip returned `.vibe-coach`, and the window could not be resized. The
  v1.19.9 patch was **racy and partial** — it set `pointerEvents='none'` from a
  single `querySelector('.vibe-coach')` immediately after `vibeCoach()`, which
  misses the banner whenever it renders a tick later, and it never covered the
  per-app tips `coachForApp` shows for Files/Browser. Fixed declaratively with
  `body.wm .vibe-coach { pointer-events: none }` plus an auto-hide (a
  click-through banner can't be tap-dismissed). **Rule: nothing that overlays the
  app area may be pointer-interactive in window mode.**
- **Click-to-focus has to recurse.** Terminal and Files are wrappers hosting their
  own iframes, so a listener on the wrapper document never sees a click in the
  actual terminal or file list — the two most-used apps were the ones the first
  fix missed. `wireDoc` now walks nested same-origin frames and is re-run from the
  5s heartbeat (new terminal tabs are new iframes). The nested walk must run even
  for an already-wired document, or the sweep returns early and never picks them up.
- **Portrait tiling.** `tileGrid` chose columns from `sqrt(n)` regardless of aspect,
  so two windows on a 656px-wide iPad in portrait became two ~320px slivers sitting
  exactly ON `MINW` — unresizable. Two windows on a portrait box now stack.
- **A security e2e test was vacuous.** `multiuser.spec.js`'s "cookieless request
  cannot execute a command" built its request context with
  `playwright.request.newContext()`, which **inherits `use.storageState`** — so it
  sent the session cookie and was not cookieless at all. It only ever passed
  because a `--no-browser` deploy made an *authenticated* `/api/x/launch` fail too;
  with the X11 stack present it returned 200 and the test failed. The gate itself
  was fine (a genuinely bare context gets 401). Now clears storageState explicitly.
  Lesson: a negative security assertion that has never been seen to fail for the
  RIGHT reason is not evidence.

**Third round (independent adversarial QA agent, judged and verified):** an agent
re-tested the above on a disposable VM and found two more real defects, both
confirmed by reproducing its measurements exactly:

- **▦ Tidy handed back OVERLAPPING windows on a narrow frame.** `tileGrid` chose
  `ceil(sqrt(n))` columns regardless of width; `tidyWindows` then clamps every
  tile up to `MINW`, so on a 656px-wide iPad five windows all landed 320 wide at
  x=8/226/336 — a window's ×/▢/– hit-tested to its *neighbour* and the first tap
  did nothing. Same failure class as the banner and the coach tip, from a third
  direction. Fixed by capping columns at `floor(box.w / MINW)` **and** adding
  `tileCapacity(box)`: above what the frame can hold at minimum size, Tidy tiles
  what fits (keeping the focused window) and **minimizes the rest** — visible in
  the taskbar, one tap to restore, nothing stranded under an identical neighbour.
  Rejected: letting tiles go below MINW (the global `clampGeom` pushes them back
  up, re-creating the overlap), and cascading the overflow (a 32px stagger still
  buries the previous window's × under the next window's body).
- **Double-tap maximize did not mark the window user-arranged**, so the next app
  opened auto-tiled it and silently discarded the maximize — while the ▢ button's
  maximize survived. Two gestures, identical intent, opposite outcome: the `onUp`
  double-tap branch returned before `markUserArranged`.

Also fixed from that pass: the window-mode tip was visible for exactly 800 ms
(`setActive` schedules `coachForApp` at +800 ms, which unconditionally removes the
current banner — so the tip was created and immediately destroyed, burning one of
its three lifetime showings each time); it pointed at "▦ (top-left)" when the
button is in the bottom taskbar (text corrected, key bumped to `:v4`); the
Start-menu Window-mode row went stale below the size gate (`applyWinModeMenu` ran
only on toggle and init — now also on reflow and menu-open); the ▦ button had no
`aria-label` (its accessible name was "▦"); and `minimizeWin` bypassed
`setActive`, leaving `document.title` naming the window that was just minimized.

---

## The shell must FIT the screen, continuously — not measure it once (v1.19.11)

- **Symptom (reported from an iPhone, standalone PWA):** after the first Cloudflare
  Access login the desktop's bottom was cut off — the terminal's last row sliced in
  half; raising the keyboard then added a dead band at the bottom.
- **First hypothesis, WRONG — and worth recording because it cost a VM cycle:** that
  the Claude-usage strip (which arrives late, on the heartbeat) shrank the app area
  while the terminal kept stale rows, since `terminal-kbd.js` gates its whole
  auto-refit self-heal behind `if (!isTouch)` — on touch there is no refit at all.
  Measured on a mobile WebKit lane, A/B against the unfixed build: **both re-fit,
  35 → 28 rows.** Shrinking `#frames` shrinks the *iframe element*, which fires a
  native `resize` inside the terminal page, which runs ttyd's FitAddon. Container
  changes already propagate for free. Do not "fix" that again.
- **Why no test ever caught the real thing:** `apph.js` starts with
  `if (!standalone && !force) return;` — the entire `--app-h` path exists only in an
  installed PWA. Playwright is never standalone and the harness has no Access, so
  the implicated code is unreachable by construction. (Compounding it:
  `terminal.spec.js` is `backendOnly` → desktop-chromium only, so the Terminal had
  never run on a phone lane at all, and its one assertion is
  `expect(.xterm).toBeVisible()` — presence, not geometry. A terminal with its last
  row sliced in half passes that.)
- **Fix — assert the invariant instead of trusting a metric.** Every height source
  iOS offers has been caught lying: `svh` freezes after a cross-origin login, and
  the running max that works around it can only ever GROW, so a single over-read
  leaves the shell too tall for the rest of that orientation. So `apph.js` now runs
  a **fit watchdog on every device** (1s tick + viewport events): the shell's bottom
  edge must equal the visible viewport's bottom edge; drift persisting across two
  checks corrects `--app-h` (and lowers `maxH`, or `apply()` would restore the bad
  height and the two would fight). Self-healing in both directions, no device
  sniffing, no per-device constants.
- **The keyboard is reserved, not corrected.** Its shrink is real but transient, so
  the watchdog skips while `window.__vtKbUp` is set and the shell instead reserves
  the covered strip as `--kb-inset` (measured: everything below the visual
  viewport's bottom, plus the key bar's height), applied as `body { padding-bottom }`
  — border-box, so `#frames` becomes exactly the visible app area and every app
  iframe re-measures natively.
- **It self-reports.** On a correction the shell rides one compact `viewport` object
  along on its existing 5s heartbeat; the manager logs it (whitelisted keys, numeric
  bounds, never stored, never echoed). A phone we cannot drive now tells us what it
  measured and what it changed — no debug build, no user action. This is the answer
  to "make it work on every phone": the fleet reports its own layout bugs.
- **Rejected:** asking the user to enable `#vhdbg` and send screenshots (works, but
  needs a human per device and per occurrence); a bigger one-shot measurement (the
  same class of bug, one metric later); shrinking `--app-h` for the keyboard (it is
  transient — the shell would fight the soft keyboard's open/close animation).
- **Still unverified:** the standalone-PWA-behind-Access path itself. `tests/e2e/
  tests/viewport-fit.spec.js` pins the invariant and the self-correction on all ten
  lanes, but only the telemetry can confirm the real device.

---

## The 24h schedule history never expired — a correct prune with no idle call site (v1.19.13)

- **Symptom:** fired/missed entries stayed in the ⏱ Scheduled-messages panel
  indefinitely, even though `SCHED_KEEP_DONE` has been 24h since the feature
  shipped and `_prune_schedules` implements exactly that window.
- **Cause:** `_prune_schedules` was only ever called from the two paths that
  already rewrite the registry — `_run_due_schedules` *after* it fired something,
  and the create handler. But the sweeper returns early on `if not due: return []`,
  which is what happens on essentially every tick. So once your last message had
  fired, nothing pruned it again unless you happened to queue another one; the 24h
  window could only elapse for someone who kept scheduling.
- **Why the tests missed it:**
  `test_prune_keeps_pending_and_drops_old_history` covers the pure function, which
  was right all along. Nothing asserted it was *reachable*. In a unit suite a
  tested function with a missing call site is indistinguishable from a working
  feature — the assertion has to be at the seam, on an idle pass.
- **Fix:** `_prune_expired_schedules()` runs on every sweeper tick (`SCHED_TICK`
  15s). It takes the lock, prunes, and rewrites **only when the prune actually
  dropped something**, so an idle host stays a small read rather than churning a
  root-owned file 5760 times a day.
- **Rejected:** filtering expired entries at read time in `_user_schedules` — the
  panel would look right while the file grew forever, and this is root-owned state
  the sweeper acts on, so it should be true on disk, not just in the view. Also
  rejected: a separate reaper thread — the sweeper already ticks at the right
  cadence and holds the right lock.

---

## The keyboard reservation ratcheted: a measurement that included its own output (v1.19.14)

- **Symptom (iPad, reported with a screenshot):** hide the soft keyboard and bring
  it back, and the shell collapsed to roughly a third of the screen — terminal,
  taskbar, then a tall black band, then the system key bar and the keyboard. It got
  worse per keyboard cycle, and v1.19.11 had introduced it.
- **Cause — a feedback loop, not a wrong constant.** `syncBar` measured the shell as
  `body.getBoundingClientRect().height + kbInset`, "the current inset added back".
  But `desktop.html` sets `* { box-sizing: border-box }`, so that rect **already is**
  the full shell height with `--kb-inset` inside it. Adding the inset back
  double-counted it, and the result *became* the next `kbInset` — so every event
  grew the reservation by roughly (shell − keyboard top). iOS fires 2-3 visual
  viewport resizes per keyboard raise. Working the reported geometry (shell 1950,
  keyboard top at 1350, key bar 80): pass 1 reserves 680 — correct, content ends
  exactly at the key bar — pass 2 reserves 1360, leaving ~590px of shell. That is
  the screenshot.
- **Fix:** measure the shell alone (`rect.height`, nothing added). The property that
  matters is not the exact number but **idempotence**: no value derived from the
  current inset may feed into computing the next one.
- **Also hardened:** the fit watchdog skipped on `window.__vtKbUp`, a flag another
  file sets — and `apph.js` registers its `visualViewport` listener *before*
  `desktop.html` registers `syncBar`, so on the first resize of a keyboard raise it
  read a stale flag. It now also derives occlusion itself (visual viewport more than
  100px shorter than the layout viewport), so correctness no longer depends on
  script order across two files.
- **How it is now caught without a real keyboard:** a soft keyboard can't be raised
  in Playwright, and shrinking the page shrinks the *layout* viewport too, which
  hides the bug. `viewport-fit.spec.js` instead stubs `window.visualViewport` so
  only the visual viewport shrinks, then fires the resize event repeatedly with
  **nothing else changing** — a correct reservation is identical every time. Run
  against the shipped v1.19.11 build it reports four different values from four
  identical events; against the fix, one.
- **Note for the next person:** the watchdog half of v1.19.11 had logged **zero**
  self-corrections in production when this was diagnosed. Only the `--kb-inset` half
  was ever doing anything — and it was the half that broke.

---

## Reverted: the whole viewport-fit feature (v1.19.15) — the keyboard premise was wrong

The two entries above (v1.19.11, v1.19.14) describe a feature that **no longer
exists**. Keep them: the analysis is correct and the traps are real. This records
why the feature went anyway, so the next attempt starts from the right premise.

- **What was reverted:** `--kb-inset` (reserving the strip the soft keyboard
  covers) *and* the `apph.js` fit watchdog + its manager-side self-report. Back to
  the v1.19.10 shell.
- **Why — measured, on the reporter's own devices.** With the ratchet fixed, the
  layout obeyed its invariant exactly, and the result was still worse than what it
  replaced: on an **iPad in landscape** with the keyboard up, the Claude strip,
  window title bar, terminal tab bar, taskbar and system key bar left the terminal
  **~53 CSS px — two lines of text**. On **iPhone** a ~24px black strip sat between
  the taskbar and the key bar, because the taskbar reserves
  `env(safe-area-inset-bottom)` for the home indicator *and* the keyboard strip was
  reserved on top of it — the same region counted twice.
- **The premise:** "the app area must never extend behind the keyboard." For a
  terminal that is simply false. Content behind the keyboard is not lost — it is
  scrolled, and `terminal-kbd.js` already keeps the cursor row above the keyboard
  (`positionCaret`). Reserving the strip converts "full-height terminal, prompt
  visible, rest scrollable" into "two visible lines". A shell with this much
  vertical chrome cannot afford to subtract the keyboard as well.
- **The watchdog went with it** for a different reason: it had logged **zero**
  self-corrections in production across every device the operator used. It was
  carrying risk and complexity (a 1s interval, a cross-file `__vtKbUp` flag with a
  script-order dependency, a telemetry channel) for no observed benefit.
- **Still open — the bug that started it:** on an installed iOS PWA, right after a
  Cloudflare Access login, `svh` freezes too short and the bottom of the desktop is
  cut off. `apph.js`'s original `--app-h` running-max (v1.16.x, still in place)
  addresses that. If it recurs, fix *that* narrowly — do not re-derive a
  general-purpose layout watchdog for it.
- **If the keyboard strip is ever attempted again:** the reservation must be
  idempotent (nothing derived from the current inset may feed the next one — see
  v1.19.14), it must not double-count the bottom safe-area inset, and it should
  hide the shell chrome (taskbar, usage strip) rather than shrink the app, or
  landscape stays unusable.

---

## "Log out" now ends the Cloudflare session too — but only when there is one (v1.19.18)

- **Symptom:** the operator tapped ⏻ ▸ *Log out (this device)* to force a fresh
  Cloudflare Access login (to reproduce the post-login `svh` freeze) and was
  returned to the vibetop login form still authenticated to Access — "I only
  logged out of Linux".
- **Cause, and it was by design:** the two gates are different layers. Access
  authenticates the *person/device at the perimeter*; the `vt_session` cookie
  authenticates *which Linux user*. Only *Log out all devices* navigated to
  `/cdn-cgi/access/logout`, and that path also runs `/api/reset` — it stops every
  terminal and signs out every device, far too destructive for "sign out here".
- **Why not just always add the Access logout:** `/cdn-cgi/access/logout` is
  handled at **Cloudflare's edge and exists only there**. On the LAN nothing sits
  in front of nginx, so the request falls through to the static `loggedout.html`
  dead end instead of the login form. Unconditionally adding it would fix the
  tunnel and degrade the LAN.
- **Fix:** `GET /api/me` reports **`via_access`** (`_via_cf_access()` — true when
  Access's `Cf-Access-Jwt-Assertion` / `Cf-Access-Authenticated-User-Email` headers
  are present), and the Logout handlers pick their destination from it: through the
  tunnel → `/cdn-cgi/access/logout`, on the LAN → `/login.html`. Same label, no new
  menu row, honest on both paths.
- **The header is presentation-only and must stay that way.** A LAN client can
  forge it trivially. The only thing it decides is which page *your own* logout
  lands on; identity still comes from the session cookie. Pinned by
  `test_cf_access_header_is_presentation_only_and_grants_nothing`. **Never gate
  authorization on a `Cf-*` header** — nginx does not strip client-supplied ones.
- **Rejected:** a third *"Log out of Cloudflare"* menu row. It needs the same
  header detection anyway (or it is a dead row on the LAN), so it costs the same
  server work plus a permanent extra choice in the menu — and it would leave plain
  "Log out" still landing you past the outer gate, which is the actual complaint.

---

## The phone never re-claimed the shared terminal shape on a device switch (v1.19.25)

- **Symptom:** switch from desktop to phone and one terminal renders at the
  *desktop's* shape — a TUI's bottom-anchored prompt sliced in half under the
  taskbar, while other terminals look fine. Intermittent, and switching tabs or
  apps cures it.
- **Reproduced** on a scratch terminal against the live build, reading the real PTY
  with `stty size` while two browsers shared it:

  ```
  1. phone opened        PTY = 141x122
  2. desktop opened      PTY =  59x202   <- desktop owns the shape
  3. phone foregrounded  PTY =  59x202   <- never re-claimed
  ```

- **Cause:** terminal N is ONE `vibetop-session` PTY owned by whichever device
  resized last, and on touch **nothing re-claimed automatically**. The auto-refit
  self-heal at `terminal-kbd.js:158` sits inside `if (!isTouch)`, bundled with two
  things that are genuinely desktop-only — the `dblclick` claim gesture and the
  Windows-Chromium refocus-after-resize fix. The heal was swept in by proximity,
  with no stated reason. Switching tabs/apps worked only because it hides and
  re-shows the iframe, which is a REAL size change.
- **Fix:** claim on foreground (`visibilitychange`/`pageshow`) for touch. It must be
  **`claimSize()`, not `reFit()`** — this device's xterm is already fitted to its own
  container, so a re-fit computes identical cols/rows and ttyd sends nothing (same
  "same-size is a silent no-op" wall `claimSize` documents). Only the nudge raises
  the SIGWINCH that carries the shape to the shared PTY. Verified: step 3 above
  returns to `141x122`.
- **Deliberately narrow**, because this class of fix has regressed before:
  - `clientWidth > 0` — document visibility is page-level, so EVERY loaded `/tN/`
    iframe sees the event, not just the visible tab. Without this a background
    terminal steals the shape for one you are not looking at. Verified: with the
    element hidden, a foreground left the PTY at the desktop's `62x210`.
  - Foreground events only, debounced. **No ResizeObserver on touch** — iOS
    Safari's URL-bar collapse resizes the viewport while scrolling and would
    reshape a shared PTY continuously.
  - `dblclick`, the Windows focus fix and the observer are untouched.
- **Pre-existing, found while testing, NOT fixed here:** on touch the initial fit is
  short — xterm loads at 122 cols and the first `resize` corrects it to 136 (ttyd's
  own FitAddon; the grid itself changes). That is the width drift the desktop
  self-heal exists for, and on touch nothing triggers it. The claim therefore
  asserts whatever the current grid is, which matches what the device renders.
- **Coverage gap, stated plainly:** there is no permanent automated test. Proving it
  needs two browser contexts sharing one terminal *and* `stty` on the host's PTY,
  which the e2e harness (tests run outside the VM) cannot reach. It was verified by
  hand with the sequence above; re-verify that way if this code is touched.

---

## The first load after the Access login bailed out of the height fix (v1.19.29)

- **Symptom:** only the FIRST session after a Cloudflare Access login is short — the
  terminal's active prompt line is cut off at the bottom. Every later launch is fine,
  and a manual refresh clears it.
- **The deduction that found it,** from the on-device data already in `apph.js`'s
  header: `visualViewport.height` and `clientHeight` stay CORRECT while `svh` is
  frozen, and `apph.js` sizes the shell from those. So had `apph.js` run, the shell
  would have been right *despite* the frozen `svh`. It wasn't right — therefore
  `apph.js` never ran. The cause is its own front door: `if (!standalone && !force)
  return;`. Coming back from the cross-origin redirect the standalone probe reports
  **false**, the module bails, and `body` keeps the frozen `100svh`.
- Which also explains the two things that looked mysterious: later launches are fine
  (the probe detects standalone normally), and a refresh fixes it (the reloaded page
  is an ordinary PWA navigation).
- **Fix:** stop trusting the probe as the sole gate. Measure `svh` against the metrics
  known to stay correct; if they disagree by more than a URL bar's worth (>100px),
  the page IS in the frozen state and drives `--app-h` whatever the probe says.
- **Why not the obvious "reload after login":** it works, and was the reported
  instinct, but it pays a full extra page load to re-run code that could simply have
  run the first time — and detecting "just came back from Access" is itself
  unreliable (an installed PWA may present no referrer). Measuring the broken state
  needs no such signal. Kept in reserve: if this does not take, a one-shot
  sessionStorage-guarded `location.reload()` is a two-line fallback.
- **False-positive risk, measured:** the danger is resizing the shell for everyone.
  On five lanes (WebKit iPhone ×2, iPad, Android, desktop) the probe reads `svh`
  EXACTLY equal to `visualViewport` — gap 0 against a 100px threshold — `--app-h`
  stays unset and layout is untouched. In ordinary Safari the two agree at load
  because both include the URL bar.
- **Unverifiable here, as before:** the positive case needs an installed PWA behind
  Access, which Playwright cannot be. This one is confirmed only by the reporter.

---

## The desktop rendered inside itself after a re-login

**Symptom:** after signing in again on the Mac, `z20.local` showed the shell
**twice** — two Claude-usage strips stacked at the top, two taskbars stacked at
the bottom, one desktop wallpaper filling the middle. Not a paint artifact: the
two taskbars showed *different* live CPU (43% vs 48%), so two independent
desktops were polling at once.

**Cause:** the sign-in form had rendered **inside an app iframe**, and signing in
there navigated that iframe to `/`. nginx's access log has the whole chain:

```
GET  /browser/connect.html  302 →   (issued by the Browser app's iframe)
GET  /login.html            200     ← sign-in form, INSIDE the iframe
POST /api/login             200     Referer: /login.html
GET  /                      200 67075  Referer: /login.html   ← desktop into the iframe
GET  /browser/              200     Referer: /                ← the inner desktop restoring
```

The session expired behind an already-open desktop. The top-level page only
probes auth **once, on load** (`vt:reauth`), so it never noticed; the first thing
to actually hit the gate was a request the *iframe* made. nginx's
`error_page 401 = @login` sent that iframe to `/login.html`, which had no idea it
was framed — and `nextUrl()` returned `/` because `@login` dropped the original
URI, so `location.replace('/')` painted a second whole desktop inside the first.

**Fix** — three guards, each independently sufficient for its own entry point:

1. `login.html` refuses to render framed: it hides itself and hands sign-in to
   the **top** window. It drops `?next=` when it does — `next` points at the
   framed sub-resource (`/browser/connect.html`), which must never become the
   top-level page. Landing on `/` is right: the desktop restores its own apps.
2. `desktop.html` refuses to be nested: framed, it promotes itself to the top
   window before it does anything else (no auth probe, no second heartbeat). This
   heals tabs that are *already* nested and closes every other route in.
3. nginx `location = /login.html` now sets `frame-ancestors 'self'` (+ nosniff,
   Referrer-Policy). That exact-match location carries its own `add_header`, so
   nginx was dropping every header inherited from `location /` — the one page
   that takes a **Linux password** was framable by any origin.

`@login` also carries `?next=$request_uri` now, so a top-level deep link
(`/terminals/`, `/files/`) returns there after sign-in instead of dumping
everyone on the desktop.

**Rejected:**

- *Make the desktop poll auth continuously and take over the login itself.* Treats
  the symptom's trigger, not the bug — a framed login page is wrong however it is
  reached — and a re-auth reload driven by a periodic poll is exactly the shape
  that reload-loops on a daily driver. The frame guard makes the expiry path end
  in an ordinary top-level sign-in, which is the desired outcome anyway.
- *Give `nextUrl()` a "don't return `/` when framed" special case.* Same one-line
  effect, but it leaves the password field rendering inside a frame — the
  clickjacking half of the problem — and depends on a redirect target we control
  less than we think.
- *`X-Frame-Options: DENY` on the login page.* Would break it the other way: the
  framed load fails silently and the user is left staring at an app that stopped
  working, with no form and no explanation. `frame-ancestors 'self'` keeps the
  same-origin load alive precisely so guard #1 can bust out of it.

**Regression tests:** `test_static.py::test_login_page_never_renders_framed`,
`::test_desktop_refuses_to_be_nested`, `::test_login_location_sets_frame_ancestors`
— all three verified failing against the pre-fix tree, and the framed/nested
behavior itself was checked in headless Chromium (framed login takes the top
window; framed `/` promotes to exactly one taskbar; top-level login still renders
and still honors `?next=`).

---

## The one dead resize corner (NE), and why the edges felt like they weren't there

**Symptom:** "the window resize button (pattern) only exists in the right lower
corner — I want resizing to be as natural as a regular Windows/Mac window", and
separately, that the cursor doesn't change when you're over a resize area.

**Cause — two independent things, which is why it read as one big "resizing is
broken":**

1. **7 of the 8 handles already worked.** Measured by driving a real drag from
   each: n/s/e/w/nw/se/sw all resized correctly. But the edges were **5px** and
   the only *visible* affordance was the SE hatch (added for touch, which has no
   hover cursor). A 5px edge is a pixel-hunt with a mouse — you brush past it,
   the cursor never settles, and you conclude the corner is the only grab point.
2. **The NE corner was genuinely dead.** Measured: the `×` occupies the outer
   5–31px of the title bar at `z-index:5`; `.win-rz-ne` was 13px at `z-index:4`.
   They shared a 9×9 square and the button won it — so a press in the middle of
   the NE corner hit the ×, not the resize. Only a thin outer L still resized.

   The trap: that `z-index:5` is itself the fix for an earlier bug where the
   resize handles **stole the × tap** on iPad. So the two are one constraint, and
   whoever wins the shared pixels, the other one breaks. Trading them back and
   forth is not a fix.

**Fix:** stop sharing the pixels. **Inset the controls out of the resize ring**,
the way every real window frame insets its buttons from the frame edge —
`.win-titlebar { padding-right: 18px }` (28px on touch) against a 16px corner
zone, so no control can ever sit inside a grab zone at any size. Then widen the
ring to what desktop OSes give you: **8px** edges, **16px** corners. The cursor
declarations were always there and correct; they simply had almost no area to
fire in. **Invariant: `title-bar padding-right > corner grab-zone width`.**

**Verified** by measuring `elementFromPoint` + computed `cursor` at all 8 zones
plus the title bar and ×, and by driving a real drag from each of the 8 handles
on mouse AND touch lanes, with the ×/▢/– re-checked in the same run.

**Rejected:**

- *Give the corner handles a higher z-index than the buttons.* This is just
  trading the bug back — it re-creates "the × can't be tapped", which is a worse
  failure (you can't close a window) than a hard-to-hit corner.
- *Move the window controls to the left, macOS-style, leaving the NE corner
  free.* Would work, and the request did say "like a Mac", but it relocates the
  close button people already have muscle memory for, to fix a 9×9 square.
- *Extend the grab zones OUTSIDE the window box (macOS lets you grab a few px
  outside).* Tempting, but windows overlap and tile with an 8px gutter, so an
  outside ring would hang over the neighbour beneath and steal clicks near its
  edge. Inside-only keeps every zone unambiguous.
- *Make all 8 corners/edges visible like the SE hatch.* Rejected as noise — on a
  desktop the cursor IS the affordance, and the taskbar/window chrome is
  deliberately quiet.

---

## The mobile key bar covered the line you type on (and every fix "worked" once)

**Symptom:** with the keyboard up on an iPhone, the desktop's `#sys-keybar`
(esc/tab/^C/arrows) sat on top of Claude Code's input box. Reported repeatedly
over months; each fix appeared to work when tested and was back within a session.

**Measured** off the reported screenshot (440×956 CSS, @3x), rather than guessed:

| band | CSS y |
|---|---|
| `#sys-keybar` | **521 → 571** (exactly `BAR_H` 50) |
| terminal iframe bottom | **574** |
| taskbar | 574 → 626 (under iOS's accessory bar) |
| iOS accessory bar | ~575 → 638 |
| iOS keyboard | 638 → 956 |

Terminal row pitch 17px, so Claude Code's input box occupied **521–572** — the
bar's span, to the pixel. The bar was NOT mispositioned: it sits exactly at
`vvBottom − BAR_H`, flush above iOS's accessory row. The terminal's last rows
simply ran underneath it. And the last row was flush at the frame bottom with
real text visible in the 571–574 sliver, which means **the document was not
scrolled at all** — `scrollTop = 0`.

**Cause — the design was open-loop, and one line cancelled it.** `positionCaret()`
parked the transparent caret `KBD_BAR_RESERVE = 64px` BELOW the cursor row and
left the actual scrolling to iOS's reveal-the-focused-caret behaviour. Two
independent failures, both reproduced in Playwright WebKit against a real
terminal:

1. **The reveal never survived.** The same function's "undo a stale scroll" branch
   — `if (scrollTop !== 0 && (cy <= 2 || kbDown)) scrollTop = 0` — fires on any
   cursor move near the top. **Claude Code is a TUI: every repaint parks the
   cursor at the top mid-render.** Reproduced exactly:

   ```
   reveal in place                 {"scrollTop":48,"cursorY":36}
   after TUI repaint (cursor home) {"scrollTop":0, "cursorY":0}   ← killed
   cursor back at the prompt       {"scrollTop":0, "cursorY":29}  ← never restored
   ```

   It is never re-established, because iOS only reveals on **user** caret events,
   never when code moves the caret. One repaint and the prompt is under the bar
   for the rest of the session. This is why every fix "worked": at a bash prompt
   nothing parks the cursor at the top, so the reveal survives — it only dies once
   you run a TUI, which is minutes later.
2. **64 was the wrong number regardless.** What must be cleared is
   `frameBottom − barTop` = 574 − 521 = **53**, plus a row to clear it fully = 70.
   And it is not a constant: it moves with `--app-h`, the taskbar height, `BAR_H`
   and iOS's accessory row.

**Fix — close the loop.** Nothing ever measured where the prompt actually landed;
now something does, every time. The desktop measures the real overlap
(`occlusionOver()` = terminal frame's `getBoundingClientRect().bottom` − the bar's
`top`) and posts `{type:'kbd-occlusion', px}`; `terminals.html` relays it to the
active `/tN/` (and re-sends on tab switch); `terminal-kbd.js` scrolls this
document so the terminal's **last row ends exactly at the top of whatever is
covering it**. Only the desktop *can* measure this — a nested iframe's
`visualViewport` does not shrink for the keyboard, so from inside `/tN/` the frame
looks fully visible to its last row.

Why the target is the frame bottom and not the cursor row: **stability**. Deriving
from `cursorY` would move on every repaint and visibly jitter. Deriving from the
frame bottom is constant while the bar is up. Both old undo branches are subsumed
— with nothing covering us the answer is 0, which is what they were forcing — and
the rendered-rows overshoot (rows × rowHeight slightly exceeding the frame, which
clipped the last row) is corrected by the same subtraction. The caret is parked on
the cursor row but **clamped into the visible band**, so iOS never wants to reveal
it and never fights the scroll.

**Verified** with `tests/kbd/keybar-occlusion.mjs`, which rebuilds the measured
geometry and drives a real terminal through it. Run against the DEPLOYED script it
fails every assertion; against the fix:

```
2. bar shown -> prompt lifted       lastRowBottom=521  scrollTop=53  CLEAR
3. after TUI repaint (cursor home)  lastRowBottom=521  scrollTop=53  CLEAR
5. after 12 repaints (jitter check) lastRowBottom=521  scrollTop=53  CLEAR
6. bar hidden -> back to normal     lastRowBottom=574  scrollTop= 0
```

**Rejected:**

- *Tune `KBD_BAR_RESERVE` to 70.* The obvious next move, and it is what the last
  several rounds amounted to. It fixes nothing: the undo branch still zeroes the
  scroll on the first repaint, and the distance still is not a constant.
- *Reserve the bar's height out of the shell / shrink the terminal.* Explicitly
  reverted before (v1.19.15) — it cost an iPad in landscape almost all its rows.
  Content behind the bar should be **scrolled, not lost**, which is what this does.
- *Make the desktop poll auth… er, poll the geometry from inside `/tN/`.* It
  cannot: the nested `visualViewport` does not shrink. This is precisely why the
  measurement has to come from the top frame.
- *Ruled out along the way, with evidence:* the `/tN/` document being unscrollable
  (it has 62–64px of range), and xterm's focus-steal + `focus({preventScroll:true})`
  suppressing the reveal (the bounce is synchronous — `activeElement` never leaves
  the overlay, and a simulated reveal survived it).

**Recurrence (v1.19.63): the figure was push-only, and a reload zeroed the
receiver while the dedupe muted the sender.** The measured-occlusion design
above is correct, but its delivery was one one-way push with a dedupe at every
hop (`lastOcc` in the desktop, `lastOcclusion` relayed only on tab focus). The
daily iOS path breaks that: backgrounding the PWA kills the WS → the reconnect
guard **reloads `/tN/`** → the fresh page's `KBD_OCCLUSION` is 0 — and when the
keyboard comes back up, the desktop computes the SAME figure as before, which
its dedupe swallows. Nothing ever re-sends; the active line sits under the bar
for the rest of the session ("active line covered", reported ~10 times).
Screenshot geometry confirmed: the bar itself was correctly pinned at the
visual-viewport bottom; the terminal simply had `scrollTop 0`. Fix: the flow is
now **pull-capable** — a (re)loaded `/tN/` posts `kbd-occlusion-req` up the
chain (`terminal-kbd.js` → `terminals.html`, which answers from its stored
figure AND forwards the request → the desktop, which re-measures with the
dedupe bypassed via `__repostOcclusion`); additionally `syncBar` busts `lastOcc`
on every keyboard-closed→open transition, so a same-value reopen can never be
deduped into silence again. Lesson: a push-with-dedupe protocol must always
pair with a receiver-initiated pull, or any receiver restart desynchronizes it
permanently.

**The pull fix was necessary but not sufficient (v1.19.65).** Field beacons
(`POST /api/client-debug` → manager log, added v1.19.64 so an on-device repro
reads out server-side with zero user tooling) showed the delivered figure
ALTERNATING 348 → 0 → 348 → … while the keyboard stayed up. Cause: with the
keyboard open, **iOS flips between two viewport modes** — big-window mode
(`innerHeight 894 / vv.offsetTop 0`: the frame runs under the keyboard,
occlusion 348) and scrolled/resized mode (`innerHeight 609 / vv.offsetTop
285`: the frame sits fully above the keyboard, occlusion legitimately 0).
Each instantaneous measurement is CORRECT; posting every flip made `/tN/`'s
scroll follow the race, and whichever state's post landed last won — a final
transient 0 parks the active line under the bar. Fix: **settled posting** —
`postSettled` only forwards a figure after it has held for 260ms, so
transients are never sent and the system converges on whichever state the
device actually settles in. Lesson: on iOS keyboard geometry, a single
instantaneous read is not a state — require readings to HOLD before acting,
and instrument the device (beacons) before theorizing; the two prior fixes
were correct and still insufficient because the real fault only shows in the
time dimension.

**Regression from the quorum itself (v1.19.82):** v1.19.69 gated the ENTIRE
key bar's visibility behind anchor confirmation (`if (!kbAnchor) return`)
while clearing the sample buffer on every keyboard-down flap — on a device
whose resting readings mostly land in the sanity-gate-rejected states, the
anchor never formed and the esc/tab/^C/arrow bar simply never appeared.
Fix: the bar ALWAYS shows (anchored position when known, instantaneous
otherwise); the quorum gates only the occlusion figure it was built to
protect; samples age out via their 4s window instead of being cleared.
Lesson: a robustness gate must fail toward DEGRADED service (a bar at a
slightly-wrong position), never toward NO service — and the field monitor
only watched for wrong values, not for the feature's absence, which is why
this shipped unseen.

**FINAL (v1.19.85): the whole tower is replaced — one reading, one writer.**
Eight fixes (v1.19.63–.84) each patched the delivery of a measured occlusion
figure; the beacons finally showed the figure itself could never be delivered
correctly, because of one fact every heuristic contradicted:

*With the keyboard up, iOS dwells — seconds at a time, flipping indefinitely —
in TWO legitimate coordinate regimes* (all numbers from the manager log):

| | big-window | shell-scrolled |
|---|---|---|
| innerHeight / vvTop / vvH | 894 / 0 / ~480 | 655 / 239 / ~508 (ih+vvTop == 894) |
| terminal frame rect.bottom | 806 | 567 (in-flow rects shift up by vvTop) |
| true occlusion | ~376 | ≤ 0 — the frame sits above the keyboard |
| correct bar top | 430 | 697 (`vvTop+vvH−BAR_H` in BOTH — fixed elements shift with the scroll, so both paint flush above the keyboard) |

Every instantaneous reading is CORRECT *in its regime*. Two consequences
killed every prior design:

1. **A figure relayed across frames is stale the moment the regime flips.**
   `/tN/` scroll applied under big-window (376) persisted into shell-scrolled →
   the active line sat ~370px above the bar (IMG_9292); the reverse parked it
   under the keyboard (IMG_9293). Per-tab copies diverged further. Settling,
   dedupe-busting, pulls, asymmetric holds — all fought the staleness; none
   could remove it.
2. **Any value learned in one regime and applied in the other is garbage.**
   vvBottom is 480 in one regime and ~750 in the other — *not* a device
   constant. v347's "anchor ±60px clamp" learned 753 while shell-scrolled,
   then clamped a correct big-window 480 to 693 → bar mid-screen at 643,
   occlusion 163 (both in the log).

*Fix — `landing/keybar.js` + one writer:* the desktop computes bar top AND a
**lift** from ONE instantaneous reading (`VibeKeybar.compute`, pure,
unit-tested in `keybar.test.js` against the recorded regimes) and applies both
itself in the same turn — the lift as `translateY` on `terminals.html`'s
`.frames`, reached same-origin. `lift = clamp0(min(frameBottom,
lastNonBlankRowBottom + 4) − barTop)`; the last-non-blank row is read
synchronously through the frame chain (desktop → `__activeTermFrame()` →
`window.term`) — stable across TUI repaints (a full screen stays full while
Claude Code parks the cursor at the top), unlike cursorY; a 1.2s decaying max
(kept frame-relative, so it cannot mix regimes) bridges transient blanks; a
failed read falls back to the frame bottom (over-lift = degraded, never
hidden). Refresh: vv events + a 300ms tick while the bar shows + a direct
`parent.__syncKeybar()` nudge from `terminals.html`'s `activate()`.

Why each invariant now holds: the bar shows whenever the height check says
keyboard-up — no gate can reject an event, and both regimes agree on
`vvTop+vvH−BAR_H`. The lift and bar come from the same subtraction, so they
cannot disagree; regime flips recompute both coherently (big-window → 376,
shell-scrolled → 0 with the content fully visible anyway). There is NO
per-tab state (one transform on the shared container), nothing for a `/tN/`
reload to reset, nothing for a PWA resume to poison except the no-keyboard
baseline — which IS a device constant and stays persisted per orientation.
The jump-to-top transient is gone at both sources: `/tN/` documents are now
exactly frame-height (no scroll range at all — `positionCaret` only parks the
caret, clamped inside the box), and the lift lands synchronously on the first
keyboard-animation event, so iOS's reveal-scroll finds the caret already
visible and has nothing to fight (a 120ms transform ease glides the rest).
Bonus fix: a fresh terminal with one prompt line at the TOP is no longer
lifted off-screen (content bottom governs, not frame bottom — a latent bug in
every scroll-based revision).

**Deleted:** postOcclusion/postSettled/ZERO_HOLD/dedupe, quorum samples +
anchor + persisted anchor prior + ±60 clamp, `__repostOcclusion`, the
`kbd-occlusion`/`kbd-occlusion-req`/`kbd-bar` relay protocol, `/tN/`'s
KBD_OCCLUSION/occludedPx/overlay overhang/document scrolling.
`test_keybar_lift_chain_is_intact` pins the new chain AND that the relay
protocol stays deleted; `tests/kbd/keybar-occlusion.mjs` (rewritten) proves
the lift against a real terminal: content clear of the bar through repaint
storms, `/tN/` scrollTop pinned 0, fresh terminals unlifted.

**Accepted degradations, chosen:** a standalone `/tN/` opened outside the
desktop shell loses the lift (unsupported surface; iOS's native caret reveal
still helps until the first TUI repaint); during iOS's own regime-flip
animation the bar/content ride the intermediates for a few hundred ms
(converging — never frozen, never hidden).

*Lesson, and the reason the tower had to die whole:* when a platform reports
multiple self-consistent realities in alternation, the only stable design is
to make every output a pure function of one instantaneous reading and apply
it atomically — any state carried across readings (relayed figures, learned
anchors, settle timers, per-receiver copies) eventually pairs one regime's
number with the other regime's screen.


**One more lens (v1.19.86), then it held.** Build 348 still put the bar on
the typing line in the shell-scrolled regime, and the beacons showed why: iOS
paints `position:fixed` elements against the VISUAL viewport there while
reporting in-flow rects in LAYOUT coordinates — two lenses whose offset is
unobservable from JS, so the math said "nothing covered" (lift 0) while the
painted bar covered the line. Fix: the bar became `position:absolute` (same
layout space as the content rects — whatever iOS warps, it warps both
identically), and the final lift is a plain rect-vs-rect subtraction measured
AFTER the bar is placed, with one measured ROW HEIGHT of clearance (the
user's own suggestion). vv-derived numbers position the bar; only same-space
rects decide the lift. Confirmed working on-device; the field beacons were
then gated behind `localStorage['vibetop:kbdbg']` (v1.19.97) — off by
default, one flag away when this class of bug returns.
---

## "Still cannot resize from left or right" — the tile gutter belonged to nobody

**Symptom:** after the 8-direction resize fix above, left/right resizing still felt
broken while top/bottom felt fine.

**Cause:** all four edges *did* work when aimed inside the border — measured, all
four returned their handle with `ew-resize`. But `tidyWindows()` insets each tile
by `GAP = 8`, so two side-by-side tiles sit with a **16px gutter** between them,
and the gesture a person actually makes is *grab the divider*. Measured across
that gutter, every pixel returned bare `#frames` with `cursor: auto` — it belonged
to neither window. The asymmetry follows directly: a side-by-side split only ever
puts a gutter on the **vertical** edges, so top/bottom (at the frame boundary,
with no neighbour) felt fine.

**Fix:** let the grab ring reach **outside** the window — 10px out / 8px in on
desktop, 12/24 on touch — so the two neighbours' rings meet inside the gutter.
Two things this needed:

- `.win.floating` had `overflow: hidden`, which **clipped its own resize handles**,
  so negative offsets were both invisible and unhittable. The rounded-corner clip
  it provided moved to `.win-titlebar` (`7px 7px 0 0`) and `.win-body`
  (`0 0 7px 7px`), which is where it actually belongs.
- 8px of reach was not enough: the window's 1px border eats one on each side, so
  the two rings left a **one-pixel dead seam** exactly mid-gutter — and the first
  verification drag landed precisely on it and reported DEAD. 10px overlaps.

Grabbing the left half of the gutter resizes the left window, the right half the
right one — which is what a divider should do, without a real splitter widget.

**Two invariants now:** `title-bar padding-right > corner inside-reach (size −
outside)`, and `outside reach > half the tile gutter`.

**Measurement note, for next time:** two runs of this investigation produced
garbage before the real cause showed up — one because the test's own earlier
drags had left the windows overlapping, and one because the **service worker
served the cached deployed shell on reload**, so the edit under test was never
loaded. Pin geometry explicitly via `localStorage['vibetop:wins']` and pass
`serviceWorkers: 'block'` when driving the shell from a harness.

**Rejected:** *dropping `GAP` to 0 so tiles touch* — one line, and the boundary
would be grabbable, but it removes the visual separation between tiles and still
leaves a lone window's edges unreachable from outside. The outside ring fixes both
and is what desktop OSes actually do.

---

## "No black readout" — instrumenting a device you cannot see

**Symptom:** the Safari resize-cursor report (cursor never changes over any
edge/corner, even the gutter, though resizing works) could not be reproduced from
Linux, and the first attempt to get on-device data failed: the user loaded
`/#rzdbg` and saw nothing.

**Cause (two independent ways the readout could fail to appear):**

1. Typing `#rzdbg` onto an **already-open** page is a same-document navigation —
   no reload. The dormant diagnostic checked `location.hash` once at script load,
   so it never re-evaluated. Fixed: it also arms on `hashchange`.
2. The shell itself is cached by the service worker (network-first with a 2.5s
   timeout, cached fallback), so "load the page with the diagnostic" silently
   depends on the very freshness that is in doubt.

**Fix:** a standalone **`/rzdbg.html`** probe page, deliberately **not** in the
service worker's `SHELL_PAGES`/`PRECACHE` set — HTML outside that set is served
network-only, so the probe can never be stale. It stamps the deployed build, dumps
the environment (`userAgent`, `platform`, `maxTouchPoints`, pointer/hover media
queries, PWA mode), renders one labeled tile per cursor keyword, replicates the
real window/grab-ring/gutter geometry (with and without an iframe underneath),
and live-prints the hit-test under the pointer. One screenshot answers build,
device, hit-testing, and per-keyword cursor support at once.

**Leading hypothesis the probe is built to confirm** (unconfirmed until the
screenshot exists): per MDN/caniuse BCD, `ew-resize`/`ns-resize`/`nesw-resize`/
`nwse-resize` are supported in every **desktop** Safari since 3.1 but **not
supported in any iOS/iPadOS Safari**. An iPad with a trackpad runs desktop-mode
Safari that reports a macOS user agent and `pointer: fine` (so the shell's
`IS_TOUCH` check treats it as a desktop), pointer events all work (resizing
works), yet iPadOS never renders CSS resize cursors — exactly "resize works, the
cursor never changes anywhere". The tell that survives desktop masquerade is
`navigator.maxTouchPoints`: 5 on an iPad, 0 on a real Mac; the probe prints a
verdict line when it sees Mac + touch points. If that is the answer, there is no
web-side fix — the pointer is owned by iPadOS.

**Rule reaffirmed:** don't ship blind fixes for device-specific rendering;
instrument first, and make the instrument's delivery path independent of the
system under test.

---

## "Works in Chrome, not in Safari" — a cursor-MAPPING failure, and the two keywords that survive it

**Symptom (new data point, same Mac):** the resize cursors render fine in Chrome
and never in Safari. This killed the iPad-in-desktop-mode hypothesis (every iPadOS
browser is WebKit; Chrome would fail identically there) and reframed the bug: not
keyword *support*, but Safari's keyword→native-cursor *mapping*.

**Cause (read from WebKit's `Source/WebCore/platform/mac/CursorMac.mm`):** every
directional resize keyword — the modern axis four (`ew/ns/nesw/nwse-resize`) AND
the legacy CSS2.1 family (`e-resize` … `sw-resize`), plus `move` — is built as a
`WebCustomCursor` that resolves a PRIVATE core-cursor type
(`kCoreCursorWindowResizeEastWest` …) via `_coreCursorType` SPI, and that path
degrades to the plain **arrow** when the lookup fails. Chrome is immune because it
ships its own cursor bitmaps and never asks AppKit. So a "legacy keyword
fallback" fixes nothing — legacy and modern fail *together*. Exactly three
relevant cursors use PUBLIC AppKit API and keep working: `col-resize`
(`resizeLeftRightCursor`), `row-resize` (`resizeUpDownCursor`), and `pointer`
(`pointingHandCursor`). This matches the independent report in
react-resizable-panels#621 ("swap ew→col, ns→row for Safari").

**Fix (v1.19.39):** a Safari-scoped block in `desktop.html` —
`@supports (background: -webkit-named-image(i))` matches WebKit-family browsers
only (measured: Chromium false, WebKit true) — maps the straight-edge handles to
`col-resize`/`row-resize`. Visually the same ↔/↕ double arrows, so it is a no-op
on an unaffected Safari; Chrome/Firefox keep the canonical keywords. The drag
mask copies the handle's *computed* cursor per gesture, so it stays consistent
per engine automatically. The e2e cursor assertions accept either mapping per
edge (the iPad WebKit lanes run them).

**Known limit:** macOS has NO public diagonal resize NSCursor, so no keyword can
give Safari corner cursors if the private path is broken — the corners keep the
axis keywords (arrow on an affected Safari; resizing works; the SE grip stays
the visible affordance). `/rzdbg.html` now also renders the legacy family and
two data-URI PNG image cursors, so one screenshot says whether image cursors
could cover the corners (and whether the edge fix landed).

**Not verified from Linux:** whether the user's actual Safari renders
`col-resize`/`row-resize` — public-API mapping says it should, but headless
WebKit cannot draw a cursor, so the probe screenshot remains the confirmation.

**Rejected:**
- *Legacy directional keywords (`e-resize` …) as the Safari fix* — plausible
  from folklore, disproved by the WebKit source: same private path, same arrow.
- *`cursor: e-resize; cursor: ew-resize;` fallback pairs* — both parse, so the
  later declaration always wins; a no-op by construction.
- *Data-URI image cursors on the shipped corners now* — would override the
  native cursor in every WebKit browser including healthy ones, for a gain that
  is still unmeasured on the affected machine. The probe measures it first.

---

## Making vibetop's resize cursor deliberately UNLIKE the host window's

**Symptom (a feature request born from a bug):** after the macOS-Safari cursor
mapping fix, the user noticed something better than the fix — *"on mac safari,
the resizing cursor is different for the vibetop window and actual browser window
which is super great as I can distinguish what I'm resizing. But on windows chrome
the two are the same, hard to tell."*

**Cause:** `ew-resize` / `ns-resize` render as a bare ↔ / ↕ — pixel-identical to
what the OS draws on the *host browser window's* own resize edges. A vibetop
window sitting near the edge of the browser window gives you two resize targets a
few px apart with the same cursor. The Safari workaround had accidentally solved
this: `col-resize`/`row-resize` (the only keywords WebKit maps through a public
NSCursor) draw the same arrows **with a bar through them**, so vibetop's edges
stopped looking like the host's.

**Fix:** drop the `@supports` scoping — `col-resize`/`row-resize` on the straight
edges in **every** browser. Same gesture, same meaning, visibly ours. Verified
computed in Chromium, WebKit and Firefox, and the `#win-dragmask` follows (it
copies the handle's computed cursor, so the distinction holds for the whole drag,
not just the hover).

**Still open — the corners.** `nesw-/nwse-resize` collide with the host window's
diagonal cursor exactly the same way, and there is no standard keyword that is
both diagonal and distinct. An image cursor (`cursor: url(data:image/png;…) 12 12,
nwse-resize`) is the only mechanism that could separate them — and the only thing
that could give macOS Safari a diagonal at all, since no public diagonal NSCursor
exists. `/rzdbg.html` carries two data-URI PNG diagonal tiles specifically to test
whether that renders on the affected Safari before anyone builds it.

**Rejected:** *a fully custom branded cursor set for all eight directions.* It
would be maximally distinct, but it needs authored art at 1× and 2×, a keyword
fallback per direction, and it throws away the platform's own well-understood
resize glyphs. The one-word keyword swap gets the distinguishability that was
actually asked for at zero risk.

---

## Retiring the SE grip — but only where the cursor can replace it

Once the edges carried a resize cursor visibly distinct from the host window's
(above), the obvious follow-up was: *"then we don't need the shaded area in the
lower right corner, right?"* Mostly right — the grip is a **fallback affordance**,
and it is only redundant where the cursor actually speaks. Two places it does not:

- **Touch.** Window mode runs on tablets (the gate needs ≥600 short side), and an
  iPad has no hover state at all. An invisible edge is unusable there.
- **macOS Safari.** The corners still get no diagonal cursor — that is the private
  core-cursor path failing to a plain arrow, and no public diagonal NSCursor
  exists to map to. Drop the grip there and the SE corner has neither a cursor nor
  a mark.

So the removal is scoped rather than blanket-"desktop":
`@supports not (background: -webkit-named-image(i))` + `@media (pointer: fine)`.
Measured across five lanes: Chromium+mouse and Firefox+mouse lose the grip;
WebKit+mouse, Chromium+touch and WebKit+touch keep it.

**The trade-off, stated:** without the grip a mouse user must hover an edge to
discover the window is resizable, where before it was visible at rest. That is the
cost of the quieter chrome, and it is only paid where a distinct cursor appears on
hover to pay it back. If macOS Safari ever gains a diagonal cursor (or an image
cursor is proven to render there — `/rzdbg.html` has the tiles), the WebKit arm of
this rule should go too.

---

## A set-once preference does not earn permanent chrome

**Symptom:** *"now there are two window control buttons in the status bar, which
is a bummer"* — followed by the sharper question, *"what is the point of having
two buttons in the first place?"*

**Cause:** mine. When the user said the window-mode toggle was buried (Start ▸
Utilities ▸ a flyout full of other toggles), I fixed it twice over: I renamed it
"Window mode" → **"Floating windows"** *and* gave it a permanent 🗔 taskbar
button. The rename was the real fix — the old name told you nothing, so even
seeing the row you would skip it. The button solved a **one-time findability**
problem with **permanent screen real estate**, which is the wrong currency: the
mode is set once and never touched again.

Sitting next to **▦ Tidy**, it also made the taskbar look like it had two
controls for the same thing, when only one of them is a thing you *do*.

**The distinction worth keeping:**

| control | kind | where it belongs |
|---|---|---|
| ▦ Tidy | repeated action, no other path to it | taskbar |
| Floating windows | set-once preference | menu |

**Fix:** drop the 🗔 button; promote the row from the Utilities flyout to the
Start menu's **top level** (`section: 'view'` → `#sm-view`, rendered above the
Utilities row so it groups with Update as a desktop-level setting). One click from
Start, no flyout, no permanent chrome. The dead `body.wm-capable` class went with
it; `windowModeCapable()` stays, because the row still needs it to say "On (screen
too small — full-screen)".

**Rejected:** *keeping both but grouping them as one segmented control* — cosmetic;
it makes two controls look like one instead of removing one. *Swapping which
button shows with the mode's state* (🗔 when off, ▦ when on) — always exactly one
button, but a control that changes identity under you is worse than a control in a
menu. *Moving ▦ Tidy into the menu instead* — backwards: it buries the frequent
action and surfaces the rare one.

**The general rule, for next time:** ask whether a control is something you *do*
or something you *set*. Things you set live in menus, however hard they were to
find — findability is fixed with naming and depth, not with a permanent button.

---

## Where the Floating-windows switch lives: three tries, and the lesson

Appended to the entry above, which drew the wrong conclusion and should be read
together with this.

The switch has been arranged three ways:

1. **Utilities flyout only** — two levels deep among the Claude-Usage /
   System-Stats toggles. *"藏的太深了…需要额外寻找"* — you had to know it existed.
2. **Flyout + 🗔 taskbar button** — findable, but the same switch now existed in
   two places, and `applyWinModeMenu()` had to keep both in sync. Reported as
   *"two window control buttons in the status bar, which is a bummer"*.
3. **Menu row only** (v1.19.42) — I read (2) as "the taskbar has too many
   buttons", removed the button, and promoted the row to the menu's top level.
   *"hate this."*

**Final: the 🗔 taskbar button, and no menu row at all.** One icon, one place.

**Where I went wrong, precisely:** "two window control buttons" was about the
toggle having **two surfaces**, not about the taskbar holding two different
functions. I had built that duplication deliberately (a button for reach, a row
for explanation) and then read the complaint about it as being about ▦ Tidy
sitting next to it. Both readings fit the sentence; they lead to opposite fixes,
and I picked one without checking. **A complaint that admits two opposite fixes is
exactly when to ask, not to reason harder** — I did ask, got redirected, and still
guessed on the follow-up.

The v1.19.42 rationale ("a set-once preference does not earn permanent chrome")
is not wrong as a principle, but it lost to something that matters more here: the
mode is set once *per device*, the user switches devices constantly, and one icon
that is always exactly where you look beats a correct taxonomy. The explanation
the row carried now lives in the button's `title`.

---

## One icon, finally: tidying folded into the toggle

Third and last move in the saga above. *"still two icons in the status bar, i mean
the functionality can totally be satisfied with one icon"* — the two being the 🗔
on/off toggle and ▦ Tidy.

The knot: while windows are **off** the only useful action is "turn on"; while
**on**, the frequent action is "tidy" and "turn off" is rare. A single tap-only
icon cannot serve both unless one of them moves — so this time I laid out the four
possible shapes and asked, rather than guessing a third time.

**Chosen: the icon is a plain on/off toggle, and turning ON always re-tiles.**
Resetting a messy layout is tap-off, tap-on. Nothing hidden, nothing to learn, one
icon.

Implementation notes that matter:

- `tidyWindows()` runs **after** `renderWindows()` in `toggleWindowMode()`, because
  `VibeWin.tileGrid` measures the live `frameBox()`.
- It deliberately **ignores the user-arranged guard** (`g.user`) that
  `autoTileIfUntouched` respects: an explicit tap on the switch *is* the request to
  re-tile. Verified: drag a window out of place, tap off, tap on → even split
  restored.
- **Accepted cost, chosen knowingly:** a hand-made layout does not survive an
  off/on cycle. That is the same property that makes off/on the reset gesture; you
  cannot have one without the other.
- The first-run coach tip pointed at the ▦ button; its key is bumped to `:v5` so
  anyone who saw the old text gets the corrected one.

**Rejected:** *tap = the useful action for the state (off→on, on→tidy), long-press
= turn off* — keeps one-tap tidy, but buries the rare action in a gesture you must
be told about, against a standing preference for visible/familiar over learned.
*Drop tidying altogether* — `autoTileIfUntouched` only covers layouts you have not
touched, so the "I dragged things around and want them even again" case would have
no answer at all.

---

## Choosing a window layout: snap layouts on the ▢ button

**Symptom:** *"the layout isn't flexible, 3 window gets really ugly with two on
the top, and one span the whole width in the bottom. how to choose layout in a
easy way"*

**Cause of the ugly part:** `tileGrid` used `cols = ceil(sqrt(n))`, so three
windows became a 2×2 grid with the last row stretched — two on top, one
double-width underneath. The odd window out ends up twice the area of its
neighbours. Fixed independently of the chooser: **3 → three even columns**
whenever they fit (landscape, `w >= 3*MINW`), stacked on a portrait frame,
2 columns as the fallback on a frame too narrow for three.

**Fix for the choosing part:** snap layouts hung off the ▢ maximize button —
Windows 11's pattern, picked from four options the user was shown. Hover it
(mouse, 420ms hover-intent so brushing past on the way to × does nothing) or
long-press it (touch, 500ms) and a palette offers **Halves / Thirds / 1 + 2 /
Stacked / Quarters**. Click a zone: the window you opened the palette from takes
**that** zone, the others fill the rest in taskbar order, overflow is minimized.

Why this shape: the desktop had just been argued down to **one** taskbar icon, so
any answer that added permanent chrome was dead on arrival. The ▢ is a button
every window already has, and hovering it is how a Windows user already expects
to find this.

Details that matter:

- Layouts are **fractions** (`VibeWin.LAYOUTS`), so they survive any resize or
  rotation, and `layoutsFor(box, n)` offers only ones that FIT at `MINW`/`MINH`
  and whose zone count suits the open windows.
- **`layoutGeoms` rounds EDGES, not sizes.** Rounding each zone's width
  independently made thirds of a 1400px frame into three 467px zones — 1401px
  total, so zones 1 and 2 overlapped by a pixel. Shared boundaries must round to
  the same integer. Caught by a unit test asserting the zones tile the box
  *exactly*, not by inspection.
- A **plain click on ▢ still maximizes**: the long-press sets `btnDown.held` so
  the release does not also toggle, and `pointercancel` clears the timer.
- Applying a layout marks the windows user-arranged, so `autoTileIfUntouched`
  will not quietly undo a layout you chose.

**Rejected:** *drag-to-corner snapping* (quarters on corner-drag, maximize on
top-drag) — good and familiar, but it is a way to *build* a layout one window at a
time, not to *choose* one, which is what was asked. Worth adding later; it
composes with this rather than competing. *Cycling layouts on each re-tile* — free
to build, but you cycle blind and off/on stops being deterministic.

---

## The layout palette belongs to the desktop, not to a window

**Symptom:** *"the control logic is not intuitive, basically all windows can be
controlled from another window, see the issue?"*

**Cause:** yes — a scope mismatch I introduced one version earlier. The palette
hung off a **window's** ▢ button (Windows 11's placement), but clicking a zone
arranged **every** window: the others were auto-assigned to the remaining zones in
taskbar order. So a control sitting on window A silently moved B and C. Windows 11
does not do this — it snaps only the window you picked from, then *asks* (snap
assist) what should fill the other zones. I copied the trigger and skipped the
asking, which left the action global while its home stayed local.

**Fix:** move the control to match its scope. The palette now hangs off the
**taskbar 🗔** — hover (420ms intent) or long-press on touch — and **▢ is plain
maximize again**. A desktop-level action now lives on the desktop-level control.

Consequences of the move, all deliberate:

- The whole layout tile is **one click target**. Per-zone clicking only made sense
  when the palette belonged to a particular window ("put *this* one here"); a
  global palette picks a *layout*.
- The **focused** window takes zone 0 (the main/largest zone), the rest follow in
  taskbar order, overflow minimized.
- Tapping 🗔 still toggles: a `held` flag set by the long-press stops the release
  from also firing the toggle, and `pointercancel` clears it.
- **Coach banners are removed when the palette opens.** They render at `bottom:60`
  with `z-index 2147483000` — directly over where the palette appears, and far
  above it. They are click-through in window mode so they never ate the
  interaction, but they hid it. A deliberate action beats a passive tip; retiring
  the banner is better than racing its z-index.

**Rejected** (offered to the user, not chosen): *▢ places only its own window* —
the most faithful reading of "a control on a window acts on that window", but it
makes choosing a whole layout an N-step job. *Snap assist* — correct and familiar,
but a 3-step flow to place 3 windows. *Keep it global and just label the zones with
window names* — honest about the scope without fixing it; the control would still
sit on one window while acting on all of them.

**Follow-up (v1.19.47): the zone count must EQUAL the window count.** The first
`layoutsFor` only rejected layouts with too *many* zones
(`if (L.zones.length > Math.max(2, winCount)) continue`), so three open windows
were still offered Halves and Stacked — and choosing one silently minimized the
third. *"I have 3 windows open, it shouldn't show 2-window layouts."* A layout
that cannot hold what you have open is not one you meant to pick. Now an exact
match, which also drops 4-zone layouts for 3 windows (they would leave a hole).
Counts with no matching layout — 1 window, or 5+ — offer nothing and the palette
does not open; tap-off/tap-on for an even split still covers them. If that silence
becomes a nuisance, the fix is more layouts (a 1+3, a 2×3), not a looser filter.

---

## "Which one is the one in 1 + 2?" — the palette previews, pointing steers

**Symptom:** *"for 3 windows, how do I choose which one is the one in 1+2?"* The
rule existed — the focused window takes zone 0, the main zone — but it was
invisible: nothing in the palette said what would happen, and there was no way to
see or steer the assignment before committing. Same question for Thirds
(who ends up left/middle/right) and any future asymmetric layout.

**Fix (v1.19.48):** one rule, made visible and steerable in place.

- **Every zone in a palette tile previews the app icon of the window that will
  land there** (focused → zone 0, rest in taskbar order). The moment the palette
  opens, "who gets the big zone" is answered — before any click.
- **Pointing steers.** Hovering a zone previews the focused window *there*
  instead (the icons repaint, the rest refill in taskbar order); clicking a zone
  commits exactly what is shown. Windows-11 users already know zone-clicking
  from Snap Layouts. A click on the tile's border pixels keeps the default, so
  the pre-existing one-click behavior is the degenerate case, unchanged.
- **Touch** (no hover): the tile shows the default assignment; tapping a zone
  steers the same way. No new gesture — long-press already opens the palette.
- To make a *different* window the big one, focus it first (its taskbar button)
  — the preview then shows it in zone 0. That is the old rule made legible, not
  a new concept.

**Mechanism:** preview and placement share one pure function,
`VibeWin.zoneAssign(ids, focusedId, zoneCount, mainZone)` (unit-tested), called
by both the tile painter and `applyLayout(key, mainZone)` — so the preview
cannot lie. Zones went from `pointer-events: none` decorations to the actual
click targets; the hovered zone gets the full accent while its siblings dim to a
darker shade of it.

**Why the two old objections don't apply:** "label the zones with window names"
and per-zone clicking were both rejected while the palette hung off ONE window's
▢ — the objection was the scope lie (a control on window A silently moving B and
C), not the interaction. On the desktop-level 🗔 the scope is honest, and the
preview + zone-click are exactly the legibility that was missing.

**Rejected now:**
- *Drag a taskbar app button onto a zone* — direct, but collides with the
  taskbar's existing drag-to-reorder and is fiddly on touch.
- *Post-hoc swap (drag one title bar onto another)* — a second concept to learn,
  and it fixes the arrangement after the fact instead of making the choice
  legible before it.
- *A "main window" picker control* — new permanent chrome; dead on arrival after
  the one-icon fight.

---

## Full slot assignment: every steering gesture is a swap, and the preview shows reality

**Symptom:** the palette preview + zone-click shipped in v1.19.48 was loved ("it
is great, love the new UI and interactions") but could not fully assign slots:
*"in 1+2 … the bottom right one can never be swapped."* True by construction —
zone-click steered only the FOCUSED window, the rest were positionally determined
by taskbar order. Worked through, only 5 of 6 three-window arrangements were
reachable at all (never `C B A`), and only by knowing to change focus first.

**Fix (v1.19.51):** three moves that stay inside the praised interaction:

1. **One steering concept — swap two zones' occupants.** Hovering a zone now
   previews the focused window *swapped* into it (exactly one other window
   moves), instead of the old shift-and-refill (which reshuffled everyone —
   visible only when hovering the last zone, but the swap is the model the user
   already described: "switch … replacing"). Click commits what is shown,
   unchanged.
2. **Drag an icon from one zone onto another to swap ANY two** — live-previewed
   during the drag (the preview cannot lie extends to mid-gesture), the drop
   commits, exactly like a zone-click commits. Touch: **long-press a zone picks
   it up** (long-press is already this palette's touch idiom), tapping another
   zone swaps and commits; a moving finger cancels; the arming press's own
   lift-click is recognized by time+zone rather than a swallowed-flag (iOS may
   or may not fire it — a blind swallow ate the NEXT tap).
3. **The base assignment is derived, never stored.** When the open windows
   already sit exactly in a layout's zones, that tile previews who is where NOW
   (`zoneOccupancy`: an exact zone↔window bijection within 4px — tidy's GAP=8
   insets deliberately do NOT match); otherwise the focused rule. So the applied
   layout's tile is a live board of the current arrangement, clicking it is a
   visible no-op, swaps compose across commits, and "does a custom assignment
   survive reopening?" answers itself: yes, because the windows ARE the state.

Any permutation is now reachable (each drag is an arbitrary transposition, and
they compose). Pure parts: `swapZones`, `zoneOccupancy` join `zoneAssign` in
`winmgr.js` (unit-tested); `applyLayout(key, assign)` takes the exact assignment
the tile painted. The new e2e case was **proven against the deployed
pre-fix build first** (fails at the reopened-tile-shows-reality assertion) and
passes against the fix; touch pick-up/drop verified with synthesized
`pointerType:'touch'` events, iOS-style (no click after long-press).

**Rejected:**
- *Tap-tap to swap (click zone A, then B)* — overloads the single most-used
  click gesture with a mode; a mis-tap commits a layout instead of arming.
- *Storing the custom assignment* — a second source of truth that goes stale the
  moment windows move by other means; deriving from geometry keeps one truth.
- *Drag a taskbar button onto a zone* — still collides with taskbar
  drag-to-reorder (rejected last round, unchanged).

---

## The drag that tested green and shipped broken: repaint churn eats pointerdown

**Symptom:** v1.19.51's drag-to-swap did not work on the deployed build — the
user re-reported the original complaint verbatim ("the bottom right one can
never be swapped") — while the e2e drag test that shipped with it passed against
that same deployment.

**Cause (measured, not inferred):** `paint()` rewrote every zone's `innerHTML`
on every call, and it runs on `mouseenter`. An innerHTML write DETACHES the icon
under the cursor; the browser re-evaluates hover, `mouseenter` fires again,
`paint()` again — a repaint feedback loop (33 DOM mutations in 400ms hovering
ONE stationary zone, Chromium). A `pointerdown` dispatched into that churn dies
in a detached subtree: no handler runs, `setPointerCapture` never happens, the
drag never arms. The asymmetry that made it look "half working": a *click* can
land in a momentarily quiet gap, a *press-and-move* never can.

**Why the shipped e2e lied:** its synthetic burst (move once onto the zone
center, press in the same event stream) threaded the quiet gap that a human
hand — hover, settle, press — never finds. And it ran on the WebKit tablet
lanes, where the hover re-evaluation loop does not manifest; the bug is
Chromium-side. A gesture test must (1) drive the real gesture shape with settle
pauses, on (2) the engine where the failure mode lives.

**Fix (v1.19.52):** idempotent repaint — `paint()` tracks each cell's occupant
in `data-app` and skips the `innerHTML` write when unchanged (titles compared
before assignment too). Any re-fired `mouseenter` then paints nothing, and the
loop terminates after at most one legitimate repaint. Verified: 0 mutations in
the same 400ms window, drag arms, swap lands.

**Guards added, both proven failing against the broken deployed build first:**
- an e2e that drives the REAL gesture — hover, settle, press, arm inside the
  source zone (asserted), travel, drop-target lit (asserted), drop, geometry
  swapped — failing at "the drag must arm" on the broken build;
- a churn guard — hover a zone, let the legitimate repaint settle, then assert
  **zero** MutationObserver records in the palette's subtree over 400ms under a
  stationary pointer. The loop was invisible to every existing assertion; this
  pins the failure class, not just the symptom.

**Rule:** a DOM element that receives pointer gestures must never have its
subtree rewritten by its own hover/enter handlers unless the write is
conditional on actual change — hover-driven rendering must be idempotent.

---

## The touch resize grip ate the title bar (v1.19.35 → v1.19.56)

**Found by the KVM VM suite**, after I had written the VM lane off as
environmentally broken. It was not: 42 failures, all on the three iPad lanes, and
a bisect inside the VM (swapping only `landing/`, specs held fixed) put the first
bad commit at **`c7e98a9` v1.19.35 "the gutter between tiled windows is
grabbable"** — mine.

**Cause.** That commit gave the grips an outside reach so the tile gutter could be
grabbed, and on touch it set `.win-rz-n { top: -12px; height: 36px }` — 12px
outside, **24px inside**. The touch title bar is **40px**. So the north grip
covered its top 60%, *including the centre*. Measured on `ipad-pro-11`:

```
title bar   y 56..96   (40px, centre y=76)
.win-rz-n   y 44..80
elementFromPoint(centre) -> "win-rz win-rz-n"
```

Double-tap-to-maximize, tap-to-focus through a nested iframe, and restoring a
minimized window were all dead on tablets for 20 versions. Invisible on desktop,
where the reach is 8px into a 32px bar.

**The miss that let it through:** v1.19.35 wrote down an invariant — *title-bar
`padding-right` must exceed the corner grab zone* — and it is the **horizontal**
half of the rule. Nobody wrote the vertical half. **A grip's INSIDE reach must
stay well under the title-bar height.** Touch now uses 12px inside (30% of 40),
matching desktop's 8/32; corners keep a 30px target with the same limit.

**Why it hid so long.** Three of the specs that should have caught it were
themselves wrong, and *their* failures made the whole lane look like noise:

- `DIRS` had `['n', 0, 30]` — dragging the north edge **down**, which shrinks,
  against an asserted `+30`. Off by 60 on every lane, forever.
- The resize tests start from **tiled** windows filling the frame, so growth along
  a filled axis clamps to 0. This exactly predicts the per-lane pattern (portrait
  `e`/`w` fail, landscape `n`/`s` fail) — which reads like a product bug.
- `expect(body).not.toHaveClass(/\bwm\b/)` can never fail on a window-capable
  screen: `body` carries `wm-capable`, and `\b` matches at the hyphen. Verified:
  `/\bwm\b/.test("is-touch wm-capable") === true`.

**And the reason I dismissed the lane.** I compared VM failures against "the same
specs pass on the live host" — but the live host was *ahead* of the commit under
test (another agent deployed mid-run). That is not a comparison, it is two
different builds. **A live-host cross-check is only evidence when both sides are
pinned to the same commit.**

Also fixed: `deploy.sh` now forwards `--no-office` to `tools/smoke-test.sh`. It
did not, so every `--no-office` deploy ended with a permanent "2 failed"
(OnlyOffice container + healthcheck) for a component that run was told to skip —
the false alarm at every VM boot that made the image look broken.

---

## The palette becomes a staging area: compose freely, one Apply commits

**Ask (user's words):** *"for setting layout, how about adding a button in the
pop up, after drag icons around, user click that button to make layout
effective."*

**What it fixes:** under commit-per-gesture, every drop applied immediately and
closed the palette — composing a specific 3-window arrangement meant reopening
between every swap, and any exploratory drag threw the real windows around.

**Design decision — stage EVERYTHING, one button commits.** The alternative
(only drags stage, a tile click still applies instantly) was considered and
rejected deliberately: mixed commit semantics is the same inconsistency class
that produced the earlier *"the control logic is not intuitive"* complaint.
Named cost, accepted: picking a plain preset is now two clicks (tile, Apply).

**The model:**
- A tile click SELECTS (accent ring; Apply enabled). Nothing moves.
- Dragging an icon onto another zone swaps those two occupants ON THE BOARD;
  touch long-press-then-tap does the same. Swaps compose in one visit.
- **Apply** (palette footer — inside the popup, so no new permanent chrome)
  commits the selected board via the same `applyLayout(key, assign)` path the
  board was painted from: the board cannot lie.
- Dismissing discards with nothing moved — exploration is free, by design.
- The tile whose zones the windows already occupy opens pre-selected
  (`zoneOccupancy`), so the palette opens showing where you are and Apply with
  no edits is a visible no-op. No tile matches → Apply disabled until a click.
- **A dirty palette stops auto-hiding.** The hover-open contract (mouse-leave
  hides after 260ms) would discard a composed arrangement on a stray
  mouse-leave; once anything is selected or staged, only Apply or an explicit
  outside click closes it.

**Retired with reasons:** zone-click steering ("put the focused window here",
committed instantly) and its hover swap-preview. Under staging, zones cover the
whole tile, so a selection click that also staged a swap would mutate the board
by accident with a commit button waiting downstream; and the hover preview
previewed exactly that click. One gesture rearranges (drag / long-press+tap),
one gesture selects (click), one button commits.

**Held invariants:** idempotent `paint()` (the churn loop that once swallowed
`pointerdown` stays dead — the DOM-quiet guard still asserts 0 mutations),
tile sizes (131×85 / 176×112 touch), the SVG taskbar icon, and the
proof-first e2e discipline: the reworked drag test fails on the pre-staging
deployed build at its first staging assertion ("a tile click stages — the
palette stays open"), then passes against the fix, driving the real gesture
(press, arm, travel, drop, Apply). Touch staging verified with synthesized
iOS-style touch events (no click after long-press).

## The Enter a paste-detecting TUI swallows: scheduled messages typed but never ran

**Symptom:** a scheduled terminal message fires on time and is visibly *typed* into
the terminal, but the Enter never happens — the command sits at the prompt
unexecuted. Worst on the feature's flagship use ("type `continue` into Claude Code
at the usage reset"): the text lands in Claude Code's composer and just sits there.
Meanwhile the sweeper reports `sent`, every unit test is green, and the original
live verification (against bash) passed.

**Cause:** delivery *shape*, not delivery. `_inject_terminal` sent
`sendall(text + b"\r")` — one write, so the foreground app receives the text and
the `\r` as **one stdin read** (verified with a raw-mode reader in the real
daemon's PTY: a single `b"continue\r"` chunk). bash doesn't care — readline
processes byte-by-byte, so `\r` still accepts the line — but a paste-detecting
TUI (Claude Code, and Ink-style input handlers generally) treats a rapid
multi-char chunk as a *paste*: the `\r` becomes a newline inside the pasted text
instead of a submit keypress. Nothing in this repo regressed — the trigger is the
target app's input heuristics — which is why `git log` over the delivery path
shows no culprit. It's the same reason driving Claude Code from tmux needs
`send-keys "text"; sleep; send-keys Enter` rather than one call.

**Fix:** send the Enter as **its own write, a beat later** —
`sendall(text)` → drain `INJECT_ENTER_GAP` (0.3s) → `sendall(b"\r")` → drain
`INJECT_DRAIN` as before. Two PTY writes ⇒ two stdin reads ⇒ the app sees a
distinct Enter keypress after the text has settled; bash behaves identically.
The gap doubles as drain time, so the ECONNRESET/replay-ring guard (previous
entry) is preserved. Guarded by
`test_inject_sends_the_enter_as_its_own_later_keypress`, which asserts the wire
shape (first chunk has no `\r`; the `\r` arrives alone, ≥0.1s later) and was
proven to fail against the glued-write code before the fix.

**Rejected:**
- **Bigger hammer: bracketed-paste wrap or per-byte trickle of the whole text.**
  The text *should* land as a paste (fast, atomic in the composer); only the
  Enter needs to be a keypress. Splitting just the `\r` is the minimal shape
  that satisfies both bash and TUIs.
- **Blaming the transport / re-verifying the drain race.** The e2e reproduction
  showed every byte reaching the PTY — the bytes were never lost, only
  misinterpreted. Chasing the transport again would have re-litigated the
  previous entry.

**Lesson:** "the exact bytes reached the socket" is not "the app saw an Enter
keypress". When injecting input for interactive programs, assert the *chunk
shape* (what each `read()` returns, and when), not just the byte total — the
original exact-bytes test stayed green through the whole breakage.

## Files "flashes a few times" on an image — the empty-folder self-heal misread previews

- **Symptom:** Opening an image (or a text file) in Files often makes the view
  reload/"flash" — roughly every 6 seconds, up to three times — before settling.
- **Cause:** The always-on "NFS folder shows empty until you refresh" self-heal
  in `landing/files.html` (v1.16.19–21) declares the active tab *stuck* when its
  document has **no `#listing` items and no `.message`** for ~6s, then reloads it
  (capped at 3 tries per tab until a listing renders). FileBrowser's file
  **preview** (`#previewer` — images/PDF/media) and text **editor**
  (`#editor-container`) share the `/files/files/...` path with listings (the
  path guard assumed they didn't) and contain *neither* marker — so every
  preview older than ~6s was "healed": reloaded up to three times while the
  user was looking at it.
- **Fix:** Bail (and reset the stuck counter) when `#previewer` or
  `#editor-container` is present — those views are rendered, not stuck. The
  heal keeps working on real listings.
- **Rejected:** keying off the URL (file vs folder paths are indistinguishable
  without a stat — FileBrowser uses one route for both); disabling the heal
  (the NFS empty-listing bug it cures is real and recurring).

## Files/Browser come back BLACK after a long idle until clicked

- **Symptom:** After the machine/tab sat idle a long time (screen off, PWA
  backgrounded, system sleep), the Files or Browser window shows black; the
  content only appears once you click inside it. The shell (taskbar/clock)
  looks fine.
- **Cause:** Two stacking mechanisms, neither self-healing. (1) **Browser**: the
  xpra app is a `<canvas>` painted only when the server sends damage. Browsers
  evict the canvas/GPU backing store of long-hidden or occluded pages — DOM
  re-rasterizes on wake, canvas content is *lost* — and an idle remote desktop
  produces no damage, so nothing repaints until the first click reaches the
  server and generates some. Stock xpra does refresh on `visibilitychange`
  (`client.resume()`), but the idle paths vibetop actually goes through miss
  it: monitor sleep usually keeps `visibilityState === 'visible'`, and the
  shell's app switching toggles the iframe `display:none` with **no**
  visibility event. (2) **Files** (plain DOM): WebKit (iOS PWA) can resume a
  long-backgrounded page with a stale/blank *compositing layer* for iframes —
  black until user input forces a recomposite. Both read as "black" because
  the app/shell backgrounds are near-black `#0e1117`.
- **Fix:** Repaint on every wake-ish signal, in three layers. `xpra-patches.js`
  patch 12 calls `client.resume()` (full `buffer-refresh` q100 + redraw) on
  visibility-restore, window `focus`, `pageshow`, the shell's `vibetop:active`
  activation, and a **timer-gap watchdog** (a `setInterval` that notices it
  stalled >30s — system sleep fires no browser event at all, but it always
  stalls timers, so the gap on resume is the wake signal; throttled, a refresh
  is a full-screen encode). `desktop.html` and `files.html` use the same
  visibility + timer-gap triggers to toggle a `transform` nudge on their app
  iframes (forces a recomposite of a stale layer) and re-dispatch `resize` to
  the active frame.
- **Rejected:** reloading frames on wake (destroys app state; reconnects cost
  seconds); polling the server for damage (the server has none to report — an
  idle desktop is genuinely unchanged; the *client-side* backing store is what
  died); fixing only `visibilitychange` (misses monitor-off and display:none
  switches, the two paths users actually idle through).
- **The DOMINANT mechanism turned out to be a third one (v1.19.59)** — found
  from an on-device screenshot after v1.19.58 shipped the two above and the
  user could still reproduce with a plain **refresh**: in **window mode**,
  restored windows were never loaded at all. `loadIfNeeded` (which defers an
  iframe's `src` until the app is shown, so a display:none load can't measure
  a 0×0 viewport) only fired from `setActive` — so after ANY page reload
  (manual refresh, the SSE deploy push, a browser discarding an idle tab —
  which is why it presented as "after long idle") every restored window
  EXCEPT the focused one was a **visible src-less iframe**: solid black, and
  "click to show content" was really "click to activate → first load". Not
  the usual windows behavior — a visible window must render without being
  focused first. Fix: `renderWindows()` now calls `loadIfNeeded` for every
  window it actually shows (window mode, non-minimized). The deferral's
  reason doesn't apply there — a shown window has real dimensions — and the
  full-screen mode keeps deferring hidden apps as before. Lesson: "black
  until clicked" had three causes wearing one symptom; the screenshot (which
  showed the OTHER windows black while the focused one was fine) is what
  separated them.

## Scheduled messages died overnight: the ring outgrew the backpressure kill threshold

- **Symptom:** Five consecutive scheduled terminal messages failed with
  `could not reach terminal 3: [Errno 32] Broken pipe` (02:29–08:29), after the
  same mechanism had worked hours earlier. The target terminal was essentially
  idle (a Claude Code TUI at rest).
- **Cause:** `vibetop-session`'s replay ring cap (`CLAUDE_SESSION_BUFSIZE`,
  2MB) exceeds its per-client backpressure kill threshold (`MAX_OUTQ`, 1MB).
  Every new client starts with the ENTIRE ring queued; once a terminal's ring
  warms past 1MB, the FIRST live byte broadcast after any client connects
  (an idle TUI's spinner frame suffices) trips `len(q) > MAX_OUTQ` and the
  daemon drops that client — often before the client's own bytes are read.
  The injector then hit Broken pipe on its next write (it lingered ~1s
  draining in place). Live-verified: with a warmed 2MB ring, the old
  protocol failed 4/4; connecting as a reader received 0 bytes (killed
  before the adaptive drain delivered anything).
- **Fix (three layers):**
  1. `vibetop-session`: `MAX_OUTQ = buf_cap + 1MB` — the queue's legitimate
     starting state IS a full ring replay; the threshold must sit above it.
     Only NEW daemons get this (they are never restarted — that would kill
     live shells), hence:
  2. `_inject_terminal` rides one SHORT-LIVED connection per write (text,
     then Enter), half-closed (`SHUT_WR`) and read to EOF — the paste-
     detection two-chunk shape is kept, but no connection lingers through
     the kill window; and
  3. each connection PRE-DRAINS the replay to ~100ms of silence BEFORE
     sending. An emptied queue is never length-checked, so the kill cannot
     hit us at all — this is the delivery guarantee on OLD daemons, where a
     kill-before-read is indistinguishable from success on our side (EOF
     either way), so no retry scheme could close the hole. Live-verified on
     a warmed old daemon: both connections drained exactly the 2MB ring and
     the injected command executed.
- **Rejected:** retry-only (the ambiguous kill-after-send case silently
  double- or never-delivers); a protocol magic byte telling the daemon "no
  replay, I'm an injector" (needs new daemon code, which old sessions never
  get); restarting daemons on deploy (kills live shells by design).

## `/api/fs/*` shipped with no authentication (local root escalation)

- **Symptom:** an audit reproduced, from an unprivileged local account with
  **no session cookie**, `POST /api/fs/upload` writing a file into the
  deployed code tree (`/opt/vibetop/app/terminal/`, group-writable by the
  `vibetop` service account) and `POST /api/fs/op {"op":"delete"}` removing
  it again. Overwriting `terminal-manager.py` that way turns the next
  root-run `systemctl restart vibetop-manager` into code execution as root.
- **Cause:** every fs handler resolved its user with `_ctx_user()`, whose
  documented fallback is `APP_USER` for a cookieless loopback request. That
  fallback exists for *trusted local tooling*, but the manager binds
  127.0.0.1, which on a multi-user host EVERY local tenant can reach —
  nginx + Cloudflare Access only front the public path. `_require_authed()`
  already spelled this out for the Browser/X11 command endpoints ("a
  cookieless request reaching this loopback server came directly from a
  local tenant"); the fs family, added later, simply never adopted it.
- **Fix:** `_handle_fs`, `_handle_fs_op`, `_handle_fs_upload` and
  `_fs_stream_out` all gate on `_require_authed()` and use ITS return value
  as the agent user. No APP_USER fallback anywhere in the family.
- **Why it was not caught:** the endpoints had zero HTTP-level tests — all
  the Files-native coverage sat below them, against the agent protocol.
  `terminal/tests/test_api_fs.py` now pins 401-without-a-session for every
  verb, and that the authenticated user (not APP_USER) is the one proxied.
- **Rule this generalizes:** on this host, "loopback" is not a trust
  boundary. Any endpoint that acts on files or runs a command must take its
  user from the session, never from `_ctx_user()`'s fallback.

## The file agent's socket could be squatted by another user

- **Symptom:** reproduced between two real accounts — as `jing`, binding
  `/tmp/vibetop-fileagent-junjie.sock` made the manager (serving junjie's
  authenticated request) connect to *jing's* socket: it returned a forged
  directory listing into junjie's Files app and captured the bytes of
  junjie's next upload.
- **Cause:** the socket lived directly in world-writable, sticky `/tmp`, and
  the manager connected **by path with no identity check**. The window is
  routine rather than exotic: on its 15-minute idle exit the agent unlinks
  its own socket, freeing the exact path for anyone to bind. (A *stale*
  socket file is not the risk — it blocks re-bind; the clean exit is.)
- **Fix, two independent layers:**
  1. Structural: sockets moved to `/run/vibetop/fileagent/<user>/sock`, in a
     root-created directory that is `0700` **owned by that user**, so no
     other tenant can create the path at all. `_prepare_fileagent_dir()`
     re-creates any directory that is not exactly that.
  2. Cryptographic-strength identity: `_fs_peer_is()` checks `SO_PEERCRED`
     (kernel-supplied, unforgeable) immediately after `connect()` and
     **before a single byte is sent** — so a request, and in particular an
     upload body, can never reach an impostor. A mismatch unlinks the bad
     socket and logs `SECURITY:`.
- **Migration:** `files/install.sh` already stops running agent units on
  deploy, and `_ensure_fileagent` now stops-and-recreates a unit that
  "already exists" but whose socket never answers — a transient unit re-runs
  its ORIGINAL argv, so an old agent would otherwise keep serving the old
  path (the same stale-unit trap as the per-user ports).
- **Invariant restated:** "Unix permissions are the entire fence" only holds
  if the channel to the agent is itself authenticated. Path-based IPC in a
  shared directory is not.

## A file named `constructor` joined every selection (Files-native)

- **Symptom:** opening a folder that contains files named `constructor`,
  `toString`, `valueOf`, `hasOwnProperty` or `__proto__` painted them as
  SELECTED with nothing clicked ("5 selected" on load). Ctrl-clicking one
  other file then reported "6 items copied", and a Cut moved four bystander
  files with no confirmation; pressing Delete offered to remove files the
  user had never touched.
- **Cause:** the selection map was a plain `{}`, and membership was tested as
  `selected[name]`. Those names resolve on `Object.prototype`, so they read
  truthy for an empty map. `selCount` and `Object.keys` also disagreed
  (`__proto__` inflates the count but is not an own key).
- **Fix:** every name-keyed map (`selected`, the render `keep` map, the
  clipboard `cutSet`) is built with `Object.create(null)` via `nameMap()`.
- **Rule:** any map keyed by USER-SUPPLIED strings — filenames above all —
  must be prototype-free. `{}` is only safe for developer-chosen keys.

## A `position: fixed` bar anchored at `left: 50%` can only use half the screen

- **Symptom:** the mobile action bar folded ten verbs into a four- to
  six-row wall covering half the phone, and separately the toolbar's
  Search / Refresh / ⋯ buttons sat at x=394..509 on a 390px screen —
  unreachable, with no scroll (`body{overflow:hidden}`).
- **Cause (bar):** shrink-to-fit width for an absolutely-positioned box is
  bounded by the space from its anchor to the containing block's edge. At
  `left: 50%` that is HALF the viewport (195px measured), so `flex-wrap`
  wrapped far earlier than the visible 378px suggested. `transform:
  translateX(-50%)` recenters the painted box but does not restore the
  available width.
- **Fix:** span both edges on mobile (`left: 6px; right: 6px; transform:
  none`) instead of relying on shrink-to-fit; the same row then fits in two.
  For the toolbar: a menu button replaced the ~140px sort `<select>`, hit
  targets went to 36px, and `flex-wrap: wrap` is the safety net so a
  conditional control (Paste) can never be pushed off-screen again.

## The auth fix that stopped one endpoint short

- **Symptom:** a follow-up audit reproduced, with **no cookie**, an arbitrary
  image read as the service account (`/api/file/image`) and — worse — the
  minting of a public share link: `POST /api/share` returned a token whose
  `/s/<token>` URL is served from an nginx location with **no
  `auth_request`**, i.e. a Cloudflare-Access bypass by design. Any local
  process could publish a file under `/opt/vibetop` to the open internet.
- **Cause:** v1.19.106 fixed `/api/fs/*` and only `/api/fs/*`. Every sibling
  the same app calls — image bytes, share create/list/revoke, files-tabs,
  office config/download/preview, video info/media/subs, `/api/me` — still
  resolved its user through `_ctx_user()`, whose cookieless fallback is
  `APP_USER`. The rule was understood; it was applied to the endpoint that
  happened to be under review rather than to the class.
- **Fix:** `_require_authed()` as the FIRST statement of every one of those
  handlers, and moved above the input validation in the three fs handlers so a
  cookieless caller cannot even probe which ops exist. `/api/office/doc` and
  `/api/office/callback` are deliberately excluded: the OnlyOffice container
  calls them server-to-server with no browser cookie and they carry their own
  path HMAC — a test now pins that they must NOT return 401.
- **Why the tests did not catch it — and were part of the problem:** the whole
  endpoint suite called these APIs *without a cookie*, so 45 tests encoded the
  vulnerable behaviour as expected. `terminal/tests/test_api_image.py`, which I
  had written days earlier for the thumbnail work, asserted a cookieless 200
  outright. The harness now sends a valid session by DEFAULT and a test that
  means to be anonymous says `cookie=ANON` — the safe thing is the default and
  the dangerous thing is explicit.
- **Rule this generalizes:** when a security fix names a class of endpoint
  ("everything that acts on a user's files"), fix the class. Grep for the
  vulnerable *pattern* (`_ctx_user()` in a handler), not for the endpoint in
  the ticket.

## Stop fixing authentication one endpoint at a time

- **Symptom:** three consecutive releases each fixed "the" missing auth gate
  and each was followed by a sweep that found another. v1.19.106 gated
  `/api/fs/*`; v1.19.114 gated its siblings (image bytes, share, tabs, office,
  video, `/api/me`) after an audit minted a public share link with no cookie;
  a sweep immediately after that found `POST /api/terminals/{n}/start`
  **starting a shell as the service account** and `/api/notes` reading and
  writing its home — both unauthenticated, both live.
- **Cause:** the vulnerability is a property of the SOCKET, not of any
  endpoint. `_ctx_user()` falls back to `APP_USER`, and the manager binds
  127.0.0.1 where nginx's `auth_request` never runs. Every handler that took
  its user from `_ctx_user()` inherited it. Fixing them individually meant the
  next handler someone wrote inherited it too.
- **Fix:** ONE gate in the `do_GET`/`do_POST` prologue (`_api_gate`): anything
  under `/api/` requires a session unless it is on `_PUBLIC_EXACT` — the same
  allowlist nginx uses, so the two cannot drift. The per-handler gates stay as
  defence in depth. Auth now also runs BEFORE routing, so an unknown `/api`
  path answers 401 rather than 404 and a cookieless caller cannot map the API.
- **The tests were part of the problem, twice.** The endpoint suite called
  everything cookielessly, so 45 tests encoded the vulnerable behaviour as
  expected; the harness now sends a session by default and `cookie=ANON` is the
  explicit, rare case. And the per-endpoint tests could only ever cover
  endpoints someone thought of — so the new ones assert the STRUCTURE (every
  path in two lists, plus "the public allowlist is exactly these"), which
  covers an endpoint added tomorrow.
- **Rule:** when a fix is structural, put the check where the structure is. A
  rule enforced N times will be enforced N-1 times before long.

## A level a player cannot finish looks exactly like a level that works

- **Symptom:** world 1-3 of Super Vibe Bros (v1.19.127) shipped, in
  development, with a **9-tile gap** between the last mushroom tree and the
  ground beyond it. A running jump clears about 7. Every behavioural test
  passed — the game booted, the physics were right, the enemies worked, the
  flagpole ended the level. The level was simply impossible past tile 50.
  In the same build, world 1-1's bonus room was built at x=218..236 of a level
  **216 tiles wide**: `Level.set()` silently drops anything past the width, so
  the warp pipe led into unwritten grid, and arriving there instantly triggered
  the flagpole (the check was `x >= flagX`, unbounded, and the room sat past
  the castle).
- **Cause:** a level is data, and data has no assertions. Reading the builder
  (`L.ground(60, 74); tree(46, 9, 5); L.ground(112, 126)`) tells you nothing
  about whether the distance between two footholds is jumpable — you have to
  *compute* it against the jump arc, which nobody does by eye. Every one of
  these is invisible in a diff and obvious within ten seconds of play.
- **Fix:** a **solvability audit** in `tests/e2e/tests/mario.spec.js`. It reads
  each level's tile grid out of the page (`window.__marioBuild(i)`), derives
  the topmost foothold per column, walks them from the start column to the
  flagpole, and fails if any hop exceeds a running jump (budget: 5 tiles across
  / 3 up, deliberately tighter than the real ~7/~4 so a level is never merely
  *barely* possible). It also checks the flag and start columns have ground,
  that no spawn is buried in a wall, and that every warp target is inside the
  level and lands on something. All four findings above came from its first
  run.
- **Moving platforms needed two numbers, not one.** Modelling a platform by a
  single row made every one either unreachable (if you used its highest
  position) or a dead end (its lowest). The audit records `enter` (lowest — the
  easiest place to board) and `exit` (highest — it carries you up) per column,
  and checks hops from the previous column's `exit` to this column's `enter`.
- **Rule this generalizes:** when correctness is a property of *content* rather
  than of code, the test has to read the content and do the arithmetic. "It
  renders and nothing throws" is not coverage of a level, a layout, or a
  schedule — it is coverage of the renderer. Same lesson as the Files geometry
  audit (`files-native-layout.spec.js`): behavioural tests asserted what the
  controls *did* and never *where they were*.

## `undefined <= 0` is false, and it has now cost two features

- **Symptom:** in Super Vibe Bros, swimming UP never worked — not once, in any
  build, on any platform. Separately, holding Up against a beanstalk never
  grabbed it.
- **Cause, both times, the same shape:** a field read before it was ever
  assigned.
  - `if (jumpBuffer > 0 && p.swimCool <= 0)` — `p.swimCool` was initialised
    only *inside* that branch, so on a fresh player it was `undefined`,
    `undefined <= 0` evaluated to **false**, and the branch that would have set
    it could never run. A self-sealing bug: the gate is the only writer.
  - `IN.up` was read by the vine grab and the climb loop, but the `IN` object
    literal never had an `up` field and `readInput()` never set one.
- **Why nothing caught it:** both features "worked" in the sense that nothing
  threw and the surrounding code ran. The water level rendered, the player
  floated, the vine grew — only the one behaviour that mattered was silently
  absent. A smoke test that asserts "the level loads and no errors appear"
  passes with full marks.
- **Fix:** every field the player object uses is now declared in
  `newPlayer()` (`wet, swimCool, stroke, boost, climbCol`), and `IN`/`GP`
  declare every key they carry. The tests assert the BEHAVIOUR — "one stroke
  lifts you two tiles", "holding Up puts you in climb mode" — not the absence
  of errors.
- **Rule:** in a codebase without types, an object literal IS the type
  declaration. A field that some code path reads must appear in the literal
  that creates the object, even when its initial value is falsy — otherwise
  the first comparison against it is a coin flip whose result is usually
  "quietly do nothing".

## Water is a property of the TILE, not of the level

- **Decision:** swimming is decided by `WET[tileAtChest]`, not by a
  `level.water` flag.
- **Why it mattered immediately:** world 1-3's flagpole. Every other level ends
  by walking into a pole, and a pole underwater looks absurd; with a level-wide
  flag the options were a bespoke "exit pipe finishes the level" path or an odd
  ending. Per-tile water made the answer trivial — the last twenty columns are
  simply not flooded, so you swim to the end, walk out onto the seabed and take
  the flag exactly like every other world.
- **What it costs:** two things had to learn that empty is not nothing. The
  render loop used to `continue` on an empty tile, which left a collected coin
  as an untinted navy hole in the sea; and any tile placed in the water region
  (coins, ? blocks) drew on the raw sky unless the cell was tinted first.
- **Rejected:** a level-wide flag plus a separate "water level" code path. It
  is less code on day one and it forecloses every mixed level afterwards —
  a flooded basement, a lake in the middle of an overworld — for no benefit.

## A dismiss button read as a leaderboard, so dismissing read as "nothing happened"

- **Symptom (reported):** *"minesweeper 里 leaderboard 点了啥也没有,根本没点一样"* —
  the game-over card offers two buttons, `New Game` works, the other one
  appears to do nothing at all.
- **Cause:** the second button was labelled **"View board"**. Minesweeper never
  had a leaderboard; `board` was read as *榜* (ranking), so the button promised
  a ranking and delivered a dismiss. Playwright confirmed the handler was
  fine — `#overlay.show` went 1 → 0 on click, no JS errors — which is exactly
  the trap: the control did its job, and its job was invisible to someone
  expecting a table. **A correct action nobody can see is indistinguishable
  from a dead button.**
- **Fix:** stop implying a leaderboard and show one. `landing/gamescore.js` is a
  shared top-3 table (`window.vibeScores`) on the game-over card of all four
  games — Minesweeper (fastest time, per difficulty), Solitaire (fewest moves),
  2048 and Circuit Runner (highest score). The ghost button is now plainly
  `Close`. Scores are per-browser `localStorage`; the pre-existing single bests
  (`vt-2048-best`, `vibetop:circuit:best`) are imported as row 1 rather than
  discarded.
- **Two traps the implementation hit, both caught by tests, not by review:**
  - `record()` returns the entry it stored, but `render()` re-reads the list
    from `localStorage` — **different objects**, so the `e === highlight`
    identity check could never match and the "just now" highlight would never
    have appeared in any of the four games. Rows are matched by session id now.
  - One played game must own exactly one row. `session()` ids give that: 2048
    reports twice (at the 2048 tile, then at game over) and Circuit Runner's
    *Continue* zeroes the score mid-card — without the id, one run either
    filled the table or overwrote the run it followed.
- **Empty state is mandatory here:** with no scores the table prints
  *"No cleared game yet on easy."* rather than rendering nothing. An empty box
  is the original bug again.
- **Rule:** when a user reports "I clicked and nothing happened", check what the
  label PROMISED before checking whether the handler fired. A working control
  with a misread label is a UX bug, not a phantom.
- **Resolution, in two steps.** A top-3 teaser on the card was still not it —
  *"我是让你给每个游戏专门的加一个 leaderboard，而不是像现在这样草草的"*. v1.19.159
  read the follow-up *"我只需要一个 leaderboard 页面"* as one shared page
  (`landing/leaderboard.html`, a tab per game, registered as its own app). Wrong
  reading: *"each game has separate leaderboard, and it is part of the game, not
  a separate app for all"*. **v1.19.160 is the shipped shape** — each game owns
  its leaderboard and opens it over its own board, styled as that game's
  How-to-play card. The separate page, its `APPS` entry and the generic
  `open-app` shell verb added for it were all removed.
- **Rule that survives it:** "one page" was about not wanting four *places* to
  visit, not about wanting a shared surface. When a correction is ambiguous
  between *fewer artifacts* and *closer to the thing it belongs to*, ask which —
  the two answers build completely different features.
- **Three more traps, all found by running it rather than reading it:**
  - The legacy-best import ran on every read, but 2048 **rewrites**
    `vt-2048-best` on every merge — so at the first game over it imported the
    run in progress and the table listed the same 1376 twice, once dated and
    once not. Invisible while only 3 rows showed. The import is now one-shot,
    persisted, marked with `vibetop:scores:<game>:seeded`, and the games run it
    at STARTUP while the key still means "from before this table existed".
  - `@media (max-height: 340px)` in `minesweeper.html` sat ABOVE the base
    `.card` rules. Equal specificity, so `flex-direction: column` won and the
    short-window row layout had **never** applied — harmless with two buttons,
    a button below the viewport edge with three. `game2048.html` had no such
    rule at all. Both fixed, both now below the base rules with a comment
    saying why.
  - A run that ends counts once, at the END. Counting at game start inflates
    "games played" every time the app is opened; Solitaire has no loss event at
    all, so an unsolved deal is scored when the NEXT one is dealt.

## An overflowing line ignores `text-align`, and it dragged a scrollbar onto the page

- **Symptom (reported, Token Stats):** text out of bounds — the last x-axis
  label on the charts printed past the panel's right border, and the whole page
  gained a horizontal scrollbar (`html.scrollWidth` 413 in a 390px viewport).
- **Cause:** each axis label is a flex slot, one per bar, so a label sits under
  the bar it names. On a phone a slot is ~6px and a date is ~26px. The edge
  labels were positioned with `text-align: left/right` — but **in LTR an
  overflowing line always starts at the content-box left edge and spills
  right**; `text-align` only places lines that FIT. So the *last* label began at
  the right end of the axis and ran outward, past `.chart-main`, `.panel`,
  `.wrap`, and finally the viewport.
- **Fix:** the label is a positioned child (`position: absolute` in a
  `position: relative` slot), anchored `left: 0` on the first, `right: 0` on the
  last, `left: 50%; translateX(-50%)` in between. An anchored end cannot leave
  the axis no matter how much wider the text is than its slot.
- **Second bug the fix exposed:** with the labels no longer escaping, they
  simply overprinted each other — seven hour labels ("Sat 11 AM" … "10 AM
  (now)") need ~500px and a phone axis is ~270. The tick count is now derived
  from the MEASURED axis width and a per-axis `minPx`, recomputed on resize,
  instead of being the constant 7.
- **Rule:** a hardcoded tick/label count is a bug waiting for a narrow screen.
  Derive it from the measured container, and remember that overflow direction
  is a property of the writing mode, not of `text-align`.

## A recycled pointerId orphaned a d-pad button, and the player walked forever

- **Symptom (reported from an iPhone, with a screenshot):** in Circuit Runner
  the ▶ button stayed lit and the player kept walking forward for the rest of
  the run with nothing pressed. No card on screen — plain gameplay.
- **Cause:** the pad's `pointerdown` did `held[e.pointerId] = b; set(b, true)` —
  a plain overwrite. iOS recycles pointerIds, so one missed `pointerup` (a
  system gesture, a notification, the finger leaving the frame) left a stale
  entry in `held`, and the very next touch replaced it **without releasing the
  button it replaced**. The orphaned button kept its `act` class and its key
  stayed `1` forever. Nothing could clear it: `up()` only releases what is
  currently in `held`, and `releaseControls()` iterates the same map.
- **Why the earlier fixes did not cover it:** v1.19.155 added a window-level
  capture `pointerup` for releases that never reach the pad, and `showCard()`
  calls `releaseControls()` because the pad vanishes under a card. Both assume
  the pointer's entry is still *findable*. This bug is the entry being silently
  overwritten, so every existing release path looked at the wrong button.
- **Fix:** release the previous button for that pointerId before overwriting.
  Plus two cheap belts: `lostpointercapture` also releases (capture is what
  keeps a press alive while the finger slides, so losing it means the pointer is
  no longer ours), and `window.blur` releases everything (the game is an iframe
  in the shell — a thumb that lifts over the taskbar releases into the PARENT
  document, where none of the in-frame listeners can see it).
- **Regression test:** `tests/e2e/tests/games.spec.js`, "a d-pad button can never
  be orphaned with its key down" — verified to FAIL on the pre-fix build and
  pass on all ten device profiles after.
- **Rule:** a map keyed by an id the platform is free to reuse must clear the old
  entry on write, not just on delete. `held[id] = x` is a leak wherever the
  matching release is not guaranteed.

## Sweep: every place a pointer could go missing, and every place text could leave the box

- **Why:** the stuck ▶ key and the token-stats label that ran off the page were
  not one-offs — both are shapes that repeat. This is the audit of every other
  instance, run as reproductions rather than readings.
- **Pointer state that outlived its pointer** (same shape as the d-pad: state set
  on `pointerdown`, released only on `pointerup`, with no `pointercancel` and no
  `blur` — and every game is an iframe, so a thumb that lifts over the shell's
  taskbar releases into the PARENT document where no in-frame listener sees it):
  - `game2048.html` — a cancelled touch left the swipe armed with a stale start
    point, and the next unrelated tap anywhere was measured against it. Verified:
    the board made a move nobody swiped. The swipe now belongs to one pointerId.
  - `solitaire.html` — a drag that lost its pointer left `body.drg`, the drag
    layer and the ghosted card in place: the card followed the cursor for the
    rest of the deal. It already had a full `pointercancel` cleanup; it just was
    not wired to `blur` too.
  - `imageview.html` — `drag` survived, so the image kept panning under a pointer
    that was not down, and could still fire a prev/next step.
  - `video.html` — `scrubbing` was cleared on `pointerup` alone, so a pointer
    that ended any other way left the seek bar seeking on every later move.
  - Clean, checked and left alone: `minesweeper.html` (has cancel; its press is
    visual only), `desktop.html` (window drag already binds `pointercancel`),
    `files.html` / `terminals.html` (pointerdown does an immediate action, no
    per-pointer state), `filesx.html`, `xpra-patches.js`.
- **Layout that left the viewport** (scanned every page at 320/390/430/768 with
  real data, separating "reachable by scrolling an ancestor" from stranded — the
  taskbar, tab strips and the model table are all deliberately scrollable):
  - `upload.html` — a file input is ~253px wide by default; `position: absolute`
    with no box kept that width, hung it off the right edge of the drop zone and
    gave the whole page a horizontal scroll at EVERY phone width. An invisible
    control dragging a scrollbar behind it.
  - `desktop.html` — the Claude usage chip is `white-space: nowrap` and could not
    wrap, so at 320px "· resets 2d 22h (Thu 10:00 AM)" ran off the screen with no
    scroll container to bring it back. The chip now wraps a line instead of
    growing wider, and the absolute time drops below 360px.
- **Rule:** treat `pointerup` as the happy path only. Any state a pointer starts
  needs `pointercancel` AND a frame-level `blur` release, and any absolutely
  positioned control needs a box — a default intrinsic width is not one.

## The game-over card is a menu, so a stray tap must not answer it

- **Symptom (reported):** *"after play finished, a menu pops up selecting 'new,
  leaderboard, etc', it should be required to select from that menu. While right
  now, clicking anywhere would dismiss that menu."*
- **What it was:** v1.19.120/125 deliberately made the whole backdrop dismiss the
  card, because a tap that landed *beside* the ghost button did nothing at all
  and read as broken. That fixed the near-miss, but it also meant any stray
  touch anywhere on the screen silently answered "none of these" and took the
  card away before it could be read. Circuit Runner was worse still: a backdrop
  tap fired the PRIMARY button, so a stray touch started a new game and threw
  away the "Continue at sector" offered right beside it.
- **Fix:** the card is answered only by its own buttons. The near-miss problem is
  solved the other way now — every card carries the dismissal as a real menu
  item, so "I just want to look at the board" is a 44px button rather than a
  gesture: Minesweeper `Close`, 2048 `Keep going` on the win card and a new
  `Close` on the loss, Solitaire and Circuit Runner already offered only actions
  that resolve the card.
- **Rejected:** keeping the backdrop dismissal for "just the corners". A rule
  that depends on where you tapped is exactly the ambiguity that made this feel
  broken in both directions.
- **Escape still closes** Minesweeper's and 2048's card, because both menus now
  contain that choice explicitly; it does not invent a dismissal where the menu
  offers none.
- **Rule:** a modal that asks a question gets its answer from its buttons. If a
  reasonable answer is "put this away", that has to BE a button.

## The scanner became a test, and it immediately found what Chromium had hidden

- **Why:** the two layout bugs above were both found by an ad-hoc fifteen-line
  scanner, after they had shipped. `tests/e2e/tests/layout.spec.js` is that
  scanner made permanent: every static page at 320/390/430 plus a squat window,
  flagging only elements whose nearest scrollable ancestor is *nothing*.
- **It paid for itself on the first run.** Circuit Runner's toolbar overflowed on
  WebKit at 375px — an iPhone 13 mini — hiding `?` and `New` off the right edge.
  Chromium measured the same bar at 315px of 320 and reported it fine, which is
  exactly why my own manual sweep missed it: **I had only ever scanned in
  Chromium.** WebKit sizes those stat chips wider. The bar sheds `Coins` below
  400px and `Time` below 344px now, and fits at every width in both engines,
  standalone and embedded.
- **Two things the spec had to get right, both learned by getting them wrong:**
  - `test.skip()`'s condition callback receives fixtures only, no `testInfo`, so
    the "run in one Chromium and one WebKit lane" gate lives in a `beforeEach`.
    Written the obvious way it throws inside every project and reports as a
    failure of the page under test.
  - Layout is sampled twice, 400ms apart, and only what survives both counts. A
    page that fetches and re-renders passes through states where a strip has not
    become scrollable yet; a real strand is still there a moment later.
- **Deliberately not asserted:** page errors. The first draft did, and WebKit's
  `/api/notes` fetch failing under the ad-hoc base URL failed a *layout* test.
  Runtime errors belong to `games.spec.js` and `surface-health.spec.js`.

## A chip is one line; what gives is the text inside it, measured

- **Symptom (reported, with a screenshot):** on a 440px iPhone the Claude usage
  strip's `week` chip broke across two lines — "76%" on one, "· resets 2d 20h
  (Thu 10:00 AM)" on the next — while `session` stayed on one. Two chips of
  different heights, stacked: ragged and ugly.
- **Cause: my own previous fix.** v1.19.163 gave `.cu-seg` `flex-wrap: wrap` so
  the chip would "grow a line instead of growing wider" and stop running off a
  320px screen. That traded one ugly for another — it never asked whether the
  text FIT, it just gave it somewhere to go.
- **Fix:** the chip is `nowrap` again, and `fitSegs()` measures each one after
  render (and on resize) and sheds the least useful part until it fits: first the
  absolute time in brackets — the relative "· resets 2d 20h" beside it already
  says when — then the reset text entirely, leaving label, bar and percentage.
  The full text stays in the chip's `title`.
- **Why a breakpoint could not do this:** "resets 5m (2:00 PM)" and "resets 2d
  20h (Thu 10:00 AM)" differ by ~60px on the same screen. The `max-width: 360px`
  rule v1.19.163 added was a guess about content it could not see. Measured, the
  degradation lands where it should: at 320 both chips drop the absolute time, at
  360 only the longer one does, at 375 and up neither does — identical in WebKit
  and Chromium.
- **Rule (the third time this week):** derive it from the measured box. Same
  lesson as the chart tick count and the leaderboard card's width.

## A stale PWA baselined its version from the server, so it could never notice it was stale

- **Symptom (reported):** "the Claude usage bar is still 3 lines on cellphone",
  hours after the fix for that had deployed. The strip on the live host measured
  two lines in both engines; the phone was simply running an old shell and never
  refreshed itself.
- **Cause:** `/api/events` pushes a `reload` when the deployed `sw.js` VERSION
  changes, and the shell also self-heals on reconnect — but it took its own
  baseline from the FIRST `hello`. That is the version the SERVER has, not the
  version this document was built as. An iOS PWA resumed after hours serves the
  shell from the service-worker cache (old HTML), the SSE reconnects and
  truthfully reports the current version, and because that was the first hello
  the page recorded it as its own and concluded it was up to date. The stale
  shell then never refreshed, for as long as the app stayed installed.
- **Fix:** baseline from `@SW_VERSION@`, the token `landing/install.sh` already
  substitutes into the document — so the page knows what IT is, and the first
  hello is a comparison instead of an initialisation. `triggerRefresh()` is
  one-shot per page load so a persistent mismatch can never become a loop.
- **Read the stamp from a CONSTANT, not from the build-tag element.** The first
  attempt used `#build-sw`, which is rewritten at runtime and renders `429`, not
  `v429`; the guard regex quietly matched nothing and the fix did exactly
  nothing while looking correct.
- **Rule:** "am I current?" needs a fact the artifact carries, not a fact the
  server reports. Anything cacheable that asks the server what version is current
  will always be told it is.

## Shed the duration, keep the clock time — I had it backwards

- **Symptom (reported):** "I'm on v430. All I can see is that you deleted the
  week reset's specific time."
- **Cause, and it was mine.** v1.19.167 widened the identity column (adding
  "as of Nm ago" under Claude) and pinned the chip to a fixed grid template.
  Both cost the reset column ~50px, and `fitSegs()` then shed in the wrong order:
  it dropped the ABSOLUTE time and kept the relative duration. The one piece the
  user reads is the clock time, and it is also the SHORTER of the two —
  "· resets Thu 11 AM" is 70px narrower than "· resets 2d 20h (Thu 11 AM)".
- **Fix — four forms, longest first, clock time last to go:**
  `· resets 2d 20h (Thu 11 AM)` → `· resets Thu 11 AM` → `· Thu 11 AM` → hidden.
  Plus a reset a day or more out prints the day and the HOUR only (minutes matter
  when it is minutes away), the fixed columns give up a few px, and a ≤340px tier
  tightens them again. Measured in both engines: at 440 both chips are full, at
  402/375 both keep the clock, at 320 both still keep the clock.
- **Also here:** the reading's age appears once the numbers are a minute old
  rather than only when the server flags them stale, so the space under "Claude"
  says something instead of usually being empty — and it reads just "3m ago".
  "as of" was three words of scaffolding holding up one number, and every px it
  took in the identity column came straight out of the reset time beside it;
  dropping it is what lets a 320px phone keep "· resets Thu 11 AM" in full.
- **Rule:** when space runs out, rank what to drop by what the reader came for —
  not by what is easiest to remove. Twice now the shortest form was also the most
  useful one, and I dropped it first.

## A fractional tile index does not throw — it writes somewhere else entirely

- **Symptom:** Iron Frontier's mirrored map generator produced wildly unfair
  starts — one side could reach 60–88% more ore than the other, and a band of
  ore appeared along a row no patch was anywhere near. The rock layer, built by
  the same mirroring code, was pixel-perfect symmetric.
- **Cause:** ore patches take a *fractional* radius (`patch(15, 8, 3.4, 900)`),
  and the loop was written `for (yy = cy - r; yy <= cy + r; yy++)`. That starts
  at **4.6**, so every index went through `idx(x, y) = y * MAP + x` as a
  fraction — `306.0`, `306.6`, … A typed array truncates that to a single
  integer index, so writes landed on tiles with no relationship to the patch,
  scattered along a wholly different row. Nothing threw; the map just quietly
  became a different map. Rock was symmetric only because its radius was an
  integer.
- **Fix:** snap the loop bounds — `Math.ceil(cy - r)` … `Math.floor(cy + r)`.
- **What actually caught it** was not reading the code. It was a test that
  flood-fills the map from each start and compares reachable ore, plus one that
  asserts `ore[x][y] === ore[MAP-1-x][MAP-1-y]`. The generator *looked* correct
  in review, and a screenshot of a scattered ore field looks like a design
  choice.
- **Rule:** any index arithmetic fed by a float is a silent-corruption bug, not
  a crash. And when correctness is a property of generated *content*, only a
  test that reads the content back and does the arithmetic will find it — the
  same lesson as the unfinishable Mario level, in a different costume.

## An AI difficulty knob that nothing reads is not a difficulty

- **Symptom:** three difficulty tiers that played identically, and worse: the
  "hard" AI lost to "normal" 2 games out of 10. Every tier *looked* configured —
  `{ react, apm, focus, harass, group, expand }` per tier, right there in the
  table.
- **Causes, four of them, each invisible in review:**
  - **`focus` and `apm` were never read anywhere.** They were written into the
    table, asserted in a test, and consulted by no code. The only knobs with
    any effect were `react` and `group`, so "easy" and "hard" differed by
    almost nothing.
  - **Faster reaction was a *handicap*.** `requestPath()` cleared the unit's
    current path before queueing the new request, so a unit stopped dead until
    the pathfinder reached it. The AI that re-tasked its army three times more
    often therefore stood still three times more often.
  - **No wave concept.** Any unit that finished production walked at the enemy
    alone. One measured match: **129 units built, 12 alive, zero buildings
    taken** — an AI feeding itself into two gun turrets one soldier at a time.
  - **An ordered target suppressed all other targets.** A unit told to attack a
    building walked past live turrets shooting it and never fired back.
- **Fix:** implement the knobs (`focus` picks nearest-vs-highest-threat in
  `findTarget`; `apm` rations orders per tactical pass), keep the old path until
  the new one arrives, add wave commit/retreat with a per-tier survival
  threshold, and engage anything in range while advancing on the ordered target.
  Result: hard 12–0 over easy, 8–3–1 over normal, with strict transitivity.
- **Rejected:** giving the harder AI more credits or vision. A tier that cheats
  is not a harder opponent, it is a worse game — every knob here is a handicap
  on the AI's *own play*, and a test asserts no tier carries an
  income/vision-shaped field name.
- **Rule:** a config field is a claim about behaviour. Assert the behaviour, not
  the field — the test that read `easy.focus === false` passed happily for a
  week while nothing on earth consulted `focus`.

## A screenshot cannot show you that the camera is fighting the player

- **Symptom:** Iron Frontier shipped with four hand-reported complaints —
  panning felt janky, edge scrolling moved far too fast, clicking a build item
  made the view jump, and the units were ugly and hard to tell apart. Every
  automated check had passed: 61fps measured, no page errors, four green e2e
  tests, and screenshots that looked fine.
- **Why the checks missed all four.** They tested *state*, not *feel*.
  `__rts()` says the tick advanced and the building got placed; it says nothing
  about how the map behaved on the way there. A still frame cannot show motion
  at all.
  - **Panning** was `cam.x -= 13 * 1.6` per FRAME. At a steady 60fps that looks
    perfect and stutters the instant anything drops a frame.
  - **Edge scrolling** ran at ~1110 px/s across a 4096px map — a quarter of the
    world per second of hover.
  - **The build-panel jump** was the same bug in disguise: the panel is on the
    RIGHT, so the pointer crosses the canvas's right-hand edge band on the way
    to every build click. With no dwell requirement, every trip to the panel
    scrolled the map. No click-the-button test would ever find this — a test
    moves the mouse instantly and never lingers in the band.
  - **Readability** failed because sprites had ONE colour axis (faction) and
    fixed-pixel roof detail: everything was a blue box, and a 3x3 plot was a
    blank expanse with a toy sitting on it.
- **Fix:** speed in px/**second**, eased toward a target velocity; a 130ms
  dwell before the edge band engages, ramped by depth into it; a second colour
  axis on every sprite (faction = whose, accent = what); roof structures sized
  *from* the roof.
- **The tests that would have caught it** are numeric and now exist: dwell a
  second on the edge and assert the pan lands between 60 and 520px; sweep out
  to the panel and assert the camera moved ≤4px; assert the first moving frame
  of a pan covers under half the cruise distance. All three were run against a
  deliberately re-broken build first and observed to fail.
- **Rule:** for anything the player *feels* — camera, drag, inertia, input
  latency — assert the NUMBER, not the end state. "It ended up in the right
  place" is perfectly compatible with a terrible journey.

## Copying a behaviour without its stylesheet flashed the whole game

- **Symptom:** Iron Frontier flashed the entire screen, roughly once every
  couple of seconds, but only after a refinery existed — and it kept flashing
  with the player doing nothing at all, while harvesters ran their route.
- **Cause:** `creditPop()` — the little "+500" that rises out of the Credits
  chip when ore is delivered — was copied from `game2048.html`. The FUNCTION
  was copied. Its CSS was not. Without `.plus { position: absolute }` the span
  is an ordinary inline child appended to a `flex-direction: column` `.stat`,
  so every delivery added a real line: the top bar grew 44 → 66 → 88px (two
  harvesters unloading overlap), the stage shrank to match, `ResizeObserver`
  fired, and `resize()` assigned `canvas.width` — **which clears the canvas**.
  A full-screen repaint, once per ore delivery, forever.
- **How it was found:** measurement, in three steps, after two wrong guesses
  (sprite facing churn and draw-order flipping, both measured and cleared).
  Sampling the canvas every frame showed a median per-frame delta of **1** with
  isolated spikes of **45,000**; a 4×4 region map showed 14 of 16 regions
  changing at once, which is a full repaint, not an animation; and dumping the
  canvas dimensions on the spike frame showed `712` where `756` was expected —
  exactly one bar-height short.
- **Fix:** the missing `.plus` rule, plus a structural guard — `resize()` now
  returns early when the pixel size is unchanged, because assigning
  `canvas.width` clears the canvas even when you assign the same number. Any
  future stray resize notification is now free instead of a blank frame.
- **Rule:** when you lift a behaviour out of a sibling file, lift its CSS too —
  a function that manipulates the DOM is only half the feature. And a canvas
  app should never resize itself on a no-op: make the guard structural so the
  next layout wobble cannot repaint the world.

## An asymmetric faction still has to be able to answer everything

- **Context:** Iron Frontier gained two asymmetric factions — Directorate
  (reach, speed, vision) and Collective (mass, armour, cheap bodies). The
  temptation with asymmetry is to give each side only what expresses its
  identity, which is exactly how you ship a matchup that cannot be played.
- **The rule that keeps it playable:** every armour class must have an answer
  *within* each faction. If the Collective had no way to deal with vehicles
  because anti-armour is "the Directorate's thing", then a Directorate player
  who masses Lancers has not out-played anyone — they have found a hole in the
  design. The shared Rocketeer exists for exactly this reason, and a unit test
  asserts the property per faction rather than globally, because a global check
  passes happily while one side is helpless.
- **Identity has to be visible in the numbers, not just the flavour text.** The
  test asserts Lancer outranges and outruns Mammoth, Mammoth outlasts and
  outsplashes Lancer, and Conscript costs less than Rifleman. A faction whose
  "identity" does not survive contact with its own stat block is decoration.
- **Rosters are data, not branches.** Each `UNITS`/`BLDS` entry carries a `fac`
  (null = shared); `canBuild()` enforces it, the panel filters on it, sprite
  baking iterates the table, and the AI reads `FACTIONS[fac].{inf,tank,defence}`
  instead of naming units. Adding a third faction is a table edit. The one
  place that resisted this — a hard-coded four-sprite bake list — was the only
  thing that broke when the roster grew, which is the argument for the pattern.
- **Faction colour is not player colour.** Blue/red follows the PLAYER, so a red
  Directorate reads identically to a blue one; what says *what a thing is* is
  the fixed per-type accent (pale-blue long gun, black twin barrels, violet
  sensor dome). Two independent colour axes, because one axis cannot carry both
  "whose is it" and "what is it" at 20 pixels.
- **Rejected:** giving each faction its own harvester and its own core
  structures. It doubles the art and the balance surface to express nothing —
  the asymmetry that matters is what you fight with, not what you mine with.

## A preference score is not an eligibility threshold

- **Symptom:** a Gun Turret would sit and watch an enemy structure it was
  perfectly capable of damaging, and never fire. Units showed a milder version
  of the same thing against targets they were weak against.
- **Cause:** `findTarget()` picks the best candidate with
  `var best = null, bs = -1;` and keeps whatever scores highest. The score is
  a *preference* — how much do I want to shoot this rather than that — built
  from damage multiplier, distance and remaining health:
  `mult * 100 - dist * 6 - (hp/maxhp) * 40`. But the initial `-1` silently
  turned it into an *eligibility floor*. A Sentry Gun's `vs.bld` is 0.3, so
  against a full-health building it scores `30 - dist*6 - 40`, which is
  negative at every distance in range. No candidate ever beat -1, so `best`
  stayed null and the gun held fire against a target it could hurt.
- **Fix:** `bs = -Infinity`. Anything in range is eligible; the score only
  decides which one.
- **How it surfaced:** not from the bug report, but from a test that *avoided*
  it. A delegated agent writing coverage picked a mobile unit as its target
  instead of a building, with a comment calling the building case "a separate,
  real quirk". It had walked around a bug without recognising it as one — and
  because the brief said find bugs but do not fix them, the workaround was
  still there in the diff to be noticed.
- **Rule:** when a "best of" loop seeds its accumulator with a concrete number
  rather than an infinity, that number is a hidden threshold. Ask what it
  excludes. And when someone routes around a case while writing a test, treat
  the detour as evidence, not as tidiness.

## Ore is walkable, the ground around it need not be

- **Symptom:** a harvester whose patch ran dry would re-target correctly and
  then freeze in place for the rest of the match.
- **Cause:** ore tiles are passable, so `findOre()` happily returns a seam
  whose surrounding tiles are all rock. A* is then correct to return null —
  there is no route — but `stepHarvester()`'s `tomine` branch called
  `advance()` and ignored its return value, so the harvester kept re-issuing a
  path request that could never succeed. Being visible and being reachable are
  different properties, and only one of them was checked.
- **Fix:** when `advance()` reports no progress and no path for 45 ticks, the
  harvester blacklists that seam in its own `noGo` set and goes idle, which
  sends it back through `findOre()` — now told to skip what it has already
  failed to reach.
- **Rule:** any "go to X" that can be handed an unreachable X needs a giving-up
  branch, or the unit is lost for the match. This is the same shape as the
  `move` order fix (a path that runs out short must eventually abandon the
  order) — a pattern worth checking wherever pathing is requested.

## A test suite in the pre-commit hook is a shared budget, not a private one

- **Symptom:** `landing/rts.test.js` grew a set of genuinely good tests and
  the whole file went from milliseconds to **4m40s** — long enough that
  `node --test` cancelled it mid-run and reported `'Promise resolution is
  still pending but the event loop has already resolved'`, which reads like a
  bug in the tests rather than what it was: a timeout.
- **Cause:** the expensive tests each play a full headless AI-vs-AI match via
  `__rtsSim` — real pathfinding, AI planning and combat for tens of thousands
  of ticks, multiplied by the seeds each test sweeps. Individually every one
  of them was worth having. Collectively they landed in a file that
  `./run-tests.sh` runs, which `.githooks` runs on **every commit in the
  repository** — so an RTS balance sweep was being charged to someone fixing a
  typo in the terminal manager.
- **Fix:** an opt-in tier. `const slow = { skip: !process.env.RTS_SLOW && 'set
  RTS_SLOW=1' };` passed as the options argument to the five match-playing
  tests. Nothing deleted and no assertion weakened — the default run is back to
  ~0.1s (repo-wide `./run-tests.sh`: 15s) and the full tier runs on demand with
  `RTS_SLOW=1 node --test landing/rts.test.js`.
- **Rejected:** shortening the matches until they fit. A 4-game-minute match
  does not reach the phase these tests are about (waves, expansion, decisive
  attacks), so the cheap version would have kept the cost and lost the signal.
- **Rule:** cost belongs where the value is. A test that answers a question
  only this game asks does not belong in the budget every commit pays. When
  delegating test-writing, state the wall-clock budget in the brief — it is
  not inferable from "write good tests", and the agent will optimise for the
  goal it was given.

## A faction that cannot spend its money loses a game it is winning

- **Symptom:** headless AI-vs-AI, mirrored so map position cannot flatter
  either side, gave the Directorate **90% of decided games on normal and 73%
  on hard**. Reading the unit tables suggested the Collective should be *ahead*
  on paper (more HP and more damage per credit at equal spend).
- **Cause:** found by cutting the same matches at 3/6/9/12/16 minutes and
  printing both sides' army, buildings, units built and **bank**. At three
  minutes the two sides were level on every measure except one — the
  Collective was sitting on **8132 credits to the Directorate's 4846**. Its
  units build slower (Mammoth 18 vs Lancer 12), so its production lane hit
  `queues.v.list.length < 2` and stalled while income kept arriving. The AI's
  build ladder had no rule for "rich and saturated", and never built a second
  factory — so it could not convert money into army, and the multi-building
  speed-up the player gets was a feature the AI never used.
- **Fix:** two rules in `aiProduce()`'s ladder — a full vehicle lane plus
  >2200 credits builds another War Factory (up to 3), the same for Barracks at
  >1800. Banks at six minutes went from 1122 v 4974 to 361 v 36: both sides now
  spend what they earn.
- **Rule:** when two sides look even but one loses, diff the *state* over time
  before touching the stat tables. A resource that accumulates is a mechanism
  that is not running.

## Slower than your own infantry is a different unit than "slow"

- **Symptom:** with the money bug fixed the Collective still lost, and the
  trajectory dump showed the tell: at six minutes it had **built more units
  than its opponent (81 v 76) and had a third as many alive (15 v 49)**.
  Building fine, dying fast.
- **Cause:** the Mammoth moved at `spd 0.028` — *slower than infantry at
  0.050*. Every mixed Collective army therefore arrived strung out, fed itself
  into fights piecemeal, and could never disengage once committed. None of
  that is visible in a stat table, where 540 HP and 44 damage look dominant.
- **Fix:** `0.028 → 0.036`. Measured one axis at a time, each candidate run as
  its own mirrored 10-match duel against an unmodified build (a patchable
  loader applies the candidate to the source in memory, so the shipped file is
  never edited to test a number). Directorate win rate by axis, against an 88%
  control: **mammoth speed 50%**, mammoth range 63%, lancer range 75%, tesla
  power 75%, mammoth build time 80%. One axis carried nearly the whole gap.
- **Rejected:** buffing the Mammoth's damage or HP. It was already ahead on
  both per credit; more of what it had would not have made it *arrive*.
- **Rule:** movement speed relative to the rest of your own army is a
  different quantity from movement speed. Below it, a unit stops being slow
  and starts being late. Balance the ratio, not the number.

## Overlays positioned off the footprint drift into taller art

- **Symptom:** after the RA2 art rebuild, the HP bar and the unpowered ⚡ glyph
  sat *inside* 12 of the 14 structure sprites — painted across a refinery stack
  or the barracks statue.
- **Cause:** `drawBld` placed both at `py - (gw+gh)*8 - 22`, a height derived
  from the footprint that had been tuned for the old squat boxes. The rebuilt
  sprites rise up to ~120px above their anchor; a 2x2 Tesla Reactor is taller
  than a 3x3 factory used to be, so no footprint formula fits.
- **Fix:** `bakeAll` scans each baked canvas once (`artTop`) and stores
  `rise = ay - firstOpaqueRow`; overlays sit at `max(rise, footprint) + margin`.
  The headless test stub returns empty image data, so `artTop` falls back to 0
  and the footprint term keeps the old behaviour there.
- **Rule:** anything drawn *relative to a sprite* must be measured from the
  sprite, not from the grid cell it occupies. The same bug family produced the
  half-size selection ring (`diamond()` takes a full width; the caller passed a
  half) — and, once the sprites grew, the ring drawn *under* a unit or under a
  building's own platform vanished entirely. Selection is now RA2-style corner
  brackets around the sprite's opaque bounding box, drawn over it.

## The refinery's dock is on the +gy face, which is screen down-LEFT

- **Symptom:** both rebuilt refineries drew their unload dock / pit on the
  down-right face; the sim parks harvesters down-left, so a harvester would
  have unloaded into the flank of a stack.
- **Cause:** a source comment described the dock as "front / front-right" and
  the builder trusted it. `refDock`'s first ring candidate is
  `[cx, cy + gh/2 + 1]` (grid +gy), and in this projection +gx → down-right,
  +gy → down-left. The factory branch had the same derivation written out
  correctly two hundred lines later.
- **Fix:** the refinery branch was mirrored and the comment corrected.
- **Rule:** when art has a functional side (exit, dock), derive the side from
  the spawn/dock code and write the grid axis *and* the screen direction in
  the comment. "Front" is not a direction.

## Parallel agents must not share a scratch path

- **Symptom:** during the parallel art build, the main session's `splice.py`
  in the session scratchpad was silently overwritten by a builder agent's tool
  of the same name; running it injected the whole main file into that agent's
  worktree.
- **Cause:** the scratchpad root is shared by every agent in the session, and
  two agents picked the obvious name for the same job.
- **Fix:** main-session tools carry a distinct suffix (`splice_main.py`) and
  each builder is told to keep its helpers inside its own worktree.
- **Rule:** in a fan-out, every writer gets a private directory; the shared
  root is read-only by convention. Say so in the brief.

## A harvester that re-acquires ore every tick cannot be given an order

- **Symptom:** right-clicking a mining harvester to move it did nothing
  visible; sometimes it "only drove forward". The user reported it as stuck.
- **Cause:** `orderUnitsTo` set the move order and put the harvester in
  `idle`, but `stepHarvester`'s idle branch ran first on the next tick and,
  seeing no *harvest* order, picked a seam and went `tomine` — overwriting the
  player's order before a single step was taken. Harvesters never reached the
  generic move handling at all (they return early from `stepUnit`).
- **Fix:** `stepHarvester` now handles a `move` order itself, then HOLDS for
  20 s at the destination (`holdUntil`) before auto-mining resumes, matching
  how an RA2 miner parked by hand behaves. Regression test proves the old
  build fails (8.5 tiles off target, back on the ore).
- **Rule:** any unit with autonomous behaviour needs an explicit "the player
  spoke" branch that runs *before* the autonomy, and a hold so the autonomy
  does not undo the order the moment it completes.

## The AI packed its base because "not too crowded" was the only rule

- **Symptom:** the AI's structures stood shoulder to shoulder in a clump.
- **Cause:** `aiPlace` took the nearest legal spot to home whose neighbour
  ring was under half blocked; the nearest spot is always adjacent to the
  last building.
- **Fix:** two passes — first only spots with a clear one-tile gap all round
  (`crowding == 0`), then the old tolerance if the base has grown into its
  walls; plus a distance penalty per blocked neighbour tile.

## The only saturated red or blue on a sprite is the owner's colour

- **Symptom:** the user could not tell friend from foe: "the Allied base has
  both red and blue on it… many buildings carry both my colour and the
  opponent's". Hue audits confirmed it — a red-owner Allied factory carried 7%
  blue and 3% red; a blue-owner Soviet factory 12% red and 8% blue.
- **Cause:** the art spec kept RA2's *faction* colours as fixed paint (Allied
  blue trim, Soviet red grilles and stars) and added the *player* colour on
  top. With players coloured blue and red, every Soviet building looked
  half-enemy to a blue player and vice versa. RA2 itself has no fixed faction
  paint: those surfaces are the remap.
- **Fix:** policy for every branch — the only saturated blue/red pixels are
  `col`/`shade(col)`; former fixed accents become `col` if trim-sized (fins,
  bands, frames, pylons, grilles, flags) or a neutral (rust, brass, amber,
  gunmetal, khaki) if body-sized; glass shifted to violet (~270°) so it is
  not mistaken for the blue player. Target 12-18% of opaque pixels in `col`.
  Verified per sprite by a hue census: 0.0% of the opposing hue on every item.
- **Rule:** in a two-colour game the identity axis ("whose") owns the
  saturated hues outright; the type axis ("what") must live in shape and in
  desaturated materials.

## "Stretched" buildings: measure the aspect ratio, don't eyeball it

- **Symptom:** "many proportions are off — some flattened, some stretched".
- **Cause:** every rebuilt structure was 10-20% too tall for its width
  (barracks 0.99 vs reference 1.21, refinery 1.09 vs 1.28, yard 1.35 vs
  1.63); tall masts, flags and stacks set the bounding box, and nobody had a
  number to check against.
- **Fix:** opaque-bbox w/h of the reference sprite is the target; each builder
  reports before/after and lands within ±8%. Helper: `aspect.py` (bbox and
  ratio of a PNG, with a background-colour key for the prepared refs).
- **Rule:** proportion feedback is a measurement, not an opinion. Compute the
  reference ratio first; then argue about shape.

## RTS combat is RA2's rules.ini, not a three-class multiplier table

- **Symptom:** (user, 2026-09-02) "攻击力和血量、装甲等等因素也要全都符合ra2" —
  every unit's strength, armour, damage, rate of fire, range, speed and cost
  must be Red Alert 2's. The sim had hand-tuned numbers and a `vs:
  {inf, veh, bld}` multiplier per shooter, which cannot express RA2 (a GI's
  rifle does 25% to a Rhino but 50% to an IFV; Tesla ignores armour; Tanya's
  pistols do 200% to unarmoured infantry and 1% to everything else).
- **Fix:** the RA2 model verbatim. Nine armour classes (`none/flak/plate`
  infantry, `light/medium/heavy` vehicles, `wood/steel/concrete` structures)
  on every spec, a `VERSES` table keyed by warhead, and
  `damage = dmg × VERSES[wh][armourOf(target)] / 100`. Units with an RA2
  secondary weapon carry `w2: {…, use: 'veh'|'bld'|'inf'}` and `weaponFor()`
  picks it by the target's armour group (Guardian GI missile vs armour, Tanya
  C4 vs structures). Numbers come straight from rules.ini (compiled into a
  JSON by a research pass; the values not in the wiki — Conyard, Refinery,
  Barracks, War Factory, Depot, Lab, miners — are the well-known ones).
  Conversions: ROF frames ×4 (15 fps → 60 ticks/s), range cells = tiles,
  `spd = 0.013 × Speed` (keeps a GI at the pace the game already had), build
  time = cost × 0.042 s (BuildSpeed=.7 min per $1000). Veterancy is
  VeteranCombat 1.1 / VeteranArmor 1.5 per rank. Start credits 10000, miners
  carry 500 (Chrono) / 1000 (War Miner) at ~1 bail/s.
- **Per-faction structure specs:** RA2's Allied Power Plant ($800, +200) and
  Tesla Reactor ($600, +150) are one key (`power`) with a `byFac` override;
  everything that reads cost/power/name for a *placed* building goes through
  `bspecOf(g, key, p)`, and the sidebar through `bspecFor(key, fac)`. Do not
  read `BLDS[key].cost` for a Soviet building directly.
- **Rejected:** keeping `vs` and tuning it toward RA2 — it is not expressive
  enough (see the examples above), and the tests that asserted a "counter
  triangle" on three classes were encoding a design RA2 does not have. The
  tests now assert RA2 truths (small arms ≤25% vs heavy, AP ≤25% vs
  infantry, Electric 100% vs both) and that every armour class on the field
  has a full-strength answer (structures: 65%+, RA2 makes them tough).
## Harrier pads and reloads are a state machine on the unit, not a queue on the building

- **Symptom:** RA2 Harriers live on the Airforce Command's four pads, fly out
  with two missiles, fire both, come home, rearm, and go again while the
  target stands. Modelling "the building holds aircraft" as a building-side
  list would have meant a second ownership system beside `g.units`.
- **Fix:** the aircraft owns its pad (`u.pad` = structure id, `u.slot` 0-3)
  and its own cycle flags (`landed`, `rtb`, `ammo`); `stepAircraft` runs it:
  attack order → fly, fire until `ammo` is 0 → `rtb` → land on `padSlot` →
  rearm one missile per `reload` ticks → if the attack order is still set
  and the target alive, take off again. `spawnUnit` lands a new Harrier on
  the first free slot; `findPad` re-homes one whose HQ died. `canBuild` for
  the `a` lane counts `4 × Airforce Commands` against Harriers alive + queued.
- **Trap found on the way:** a landed, empty Harrier with a standing order
  bounced between `rtb` and `landed` every tick and never reached the reload
  branch (the harvester in the test sat at 120 hp forever). The attack branch
  now only engages or sets `rtb` when the aircraft is *not* landed.
- **Rejected:** a rally/return point per HQ; RA2 aircraft take no rally point
  (the Airforce Command tells you so if you try).

## `aa` / `ag` weapon flags instead of an "air" armour class

- **Symptom:** GIs, tanks, Sentry Guns and Pillboxes must never engage a
  Kirov; a Patriot must never engage a tank. Doing that through the `vs`
  table (a 0× multiplier) would still let units *acquire* the target, walk
  under it and stand there "firing" for nothing.
- **Fix:** `canHit(spec, tgt)` gates every acquisition path — `findTarget`
  (guard/idle), the ordered target in `stepUnit`, `orderAttack` (the UI
  refuses the order and shows a `not-allowed` cursor over an enemy aircraft
  when nothing selected can shoot up), AI threat answers and splash. AA
  weapons carry an `aaRng` because RA2's AA reach is longer than its ground
  reach. Splash stays in the target's domain (air or ground), so flak over a
  Rocketeer does not rake the squad below.
- **Rule:** a target you cannot hurt is a target you cannot select; the sim
  and the cursor agree.

## Aircraft are drawn in a second pass, sorted by ground position

- **Symptom:** a Kirov depth-sorted with the ground list slid behind any
  tall structure whose centre was "nearer", and its shadow had nowhere to
  fall.
- **Fix:** `render` pulls flying units out of the depth sort into an
  `airborne` list; after the ground pass it draws every shadow (one baked
  soft ellipse, offset `-0.42·alt, +0.06·alt` so it falls down-left as RA2's
  light does), then every airframe at `altOf(u)` (cruise height plus a slow
  bob). A Harrier parked on its pad is ground-level and sorts with the pad,
  1.2 tiles behind its structure so it is never painted under the HQ.
  `pickAt`/`boxSelect` subtract the same altitude so clicking the sprite
  selects it.
- **Rejected:** giving the Kirov a real 3D-ish y-sort key: RA2 simply draws
  aircraft last.

## Under RA2 pacing the AI has to open Power → Refinery and spend its bank

- **Symptom:** after the rules.ini port, hard-vs-easy self-play went 0/6 for
  the hard AI, and the Soviet hard AI lost every match by minute 10-15.
- **Cause (traced minute by minute with `__rtsSim`'s `everyMinute` hook):**
  four separate habits tuned for the old cheap economy. (1) It queued a $1500
  Tesla Coil before any power plant, ran unpowered at 0.4× for three minutes
  and got its War Factory two minutes after the Allied side. (2) It banked
  $20k while capping itself at two factories and two-deep queues — a factory
  turns out ~1.5 tanks a minute at RA2 build times. (3) It bought a third
  refinery, five miners, radar and a lab before it had ten fighters, while
  the easy AI floods GIs and wins a seven-minute timing attack (under RA2
  verses a shell does 25% to infantry, so tank-heavy armies lose to cheap
  infantry). (4) Its Soviet anti-infantry pick resolved to the Allied-only
  Guardian GI and silently failed, so it barely trained infantry at all.
- **Fix:** power first; never queue a defence into a power deficit; more
  factories/barracks and deeper queues as the bank grows; one or two miners
  per refinery; tech only behind an army; assume infantry until scouted and
  buy more IFVs/Flak Tracks; the attack decision weighs the enemy's live
  defences (`defenceValue`) so a wave is not fed into a coil piecemeal.
- **Two more, found on the next traces:** the Soviet AI still died at
  minute 10 because its power was counted at commit time only — a radar
  queued while a coil was building landed both and left it at −35 for three
  minutes of 0.4× production, so every `want` now checks `netQ` (live net
  plus everything queued in both structure lanes) and buys a plant first.
  And GI deploy (RA2's answer to conscript floods) swung it the other way
  until the AI stopped deploying units that carry an order: only holding
  GIs dig in, a charging wave keeps walking.
- **Still open (roadmap):** vehicles crushing infantry (RA2's main answer to
  infantry masses), the low-power production curve, MultipleFactory=0.8.

## Skewed art in `bakeBuilding` must be point math, not `g.transform`

- **Symptom:** `node --test landing/rts.test.js` died at load with
  `TypeError: g.transform is not a function` after the Soviet yard's
  hammer-and-sickle was drawn with `g.translate/transform/scale` to lay it
  into the wall plane. The browser renders were fine, so nothing in the art
  harness caught it.
- **Cause:** the test file runs `rts.html` under `vm` with a hand-written
  canvas-context stub that implements only the calls the art already used
  (paths, `ellipse`, `roundRect`, fills/strokes). Any new context method
  silently works in Chromium and breaks the sim tests.
- **Fix:** skew with the face helpers (`faceL`/`faceR`) or an explicit
  `[x + ex, y + ex * hh / hw + ey]` mapping (see `emP` in the yard branch).
  Structure idle animation (the yards' cranes) is `bakeBuilding(key, col,
  fac, bph)` baking N phases into `A.frames`, cycled by `drawBld`; the bbox
  is the union over phases so brackets and the build-up clip cover every
  frame.
- **Rejected:** extending the stub with `transform` — every future context
  call would need the same, and the stub is there to keep the sim tests
  hermetic, not to emulate canvas.

## The Allied refinery's drum is an open mouth facing the dock, not a hooped end cap

- **Symptom:** two successive rebuilds of the Allied Ore Refinery read the
  big drum wrong. The first drew a barrel vault with a half-disc "wheel" on
  its end and put the rail dock on the vault's flank; the second (this pass,
  first attempt) drew a closed hooped disc at one end of a horizontal
  cylinder. Both looked plausible on a contact sheet and neither matched the
  sprite side by side: the rails never left the drum.
- **Cause:** the reference's nested silver/ivory/lavender/blue arcs were read
  as rings ON a face. They are rings AROUND a cylinder seen almost end-on —
  fat on the right, thin on top, open on the left — and the "dark interior"
  beside them is the cylinder's open mouth, with the hoist and the ore glow
  inside and the rails coming out of it to the dock. Nothing about the shape
  is guessable from a description; only the mirrored 6x gridded crop made it
  obvious.
- **Fix:** nested C hoops (`rg(t)` interpolating rim → cavity ellipse) whose
  bands continue left as flat stripes over the opening, a navy cavity with a
  slatted floor, the ported spine ending in a jamb block at the mouth's left,
  rails from the cavity floor to the dock tile. Both refineries are the RA2
  sprite mirrored left-right (the sim docks on +gy, RA2's art docks on the
  down-right face) with the light kept upper-left.
- **Rule:** before drawing a structure with a functional opening, make the
  gridded mirrored crop and find where the vehicle physically goes; the
  greebles are painted around that hole, never the other way round.

## The wiki's "animation" gifs are build-ups: the sprite is the LAST frame

- **Symptom:** the first pass at the war factories saved frame 0 of
  `File:Allied War factory animation.gif` as `allied-war-factory-idle.png`
  and its alpha bbox came out as a 135x68 sliver - an empty pad. Read as an
  "idle" sequence the same way the refinery/yard gifs were, the diffs would
  have been drawn against nothing.
- **Cause:** those C&C-wiki `*animation.gif` files are RA2's MAKE (build-up)
  sequences: 24 frames from bare pad to finished structure, with the
  scaffolding, flukes and crane arriving one at a time. Only the final frame
  is the standing building; every earlier frame is missing parts.
- **Fix:** decode the whole gif with PIL, save the full 24-frame contact
  sheet as `*-war-factory-buildup.png` and the LAST frame as `*-idle.png`;
  diff the frames (`np.abs(A-B)`) before trusting any of them as an idle
  cycle - a build-up shows ~5k changed pixels per frame all the way through,
  an idle loop changes a few hundred in one spot.
- **Rule:** look at the contact sheet of every fetched gif before choosing a
  reference frame; frame 0 is the reference only when the frames differ in a
  small moving region.

## A MAKE gif's last frame can still be wearing its scaffolding

- **Symptom:** the fresh Allied Barracks rip (`File:Allied Barrack animation
  1.gif`, last of 24 frames) shows the finished huts *plus* two large red
  fan/wing shapes behind them. Taken as "the sprite" its alpha bbox is 170x123
  and the aspect comes out 1.19; the in-game screenshot of the same building
  has no fans anywhere and measures 118x115, aspect 1.026.
- **Cause:** the existing rule "the wiki's animation gifs are build-ups, so the
  sprite is the LAST frame" is true about *completeness* but not about
  *cleanliness*. RA2's MAKE sequence retracts its crane arms over the frames
  that follow the last one the gif was cut at, so the tail frame can still
  carry scaffolding that never appears in game.
- **Fix:** take the last frame for the massing, but cross-check its silhouette
  against a screenshot of the finished building before measuring anything.
  Mask the shadow (magenta in these rips) and any leftover scaffolding by hand
  and measure the bbox from what remains — here 118x115, which the rebuild hits
  at 1.031.
- **Also:** the shared `apron()` helper paints its hazard stripes and then lays
  a `rgba(140,148,140,.55)` veil over them, so a plate that has to read as
  yellow at 1:1 (RA2 puts two on the Barracks pad) must be drawn locally.


## Only a RED-owner rip tells you where a sprite's remap actually is

- **Symptom:** the Allied Power Plant had been built from
  `allied-power-plant.png`, a blue-player in-game screenshot. Read from that
  image the "team colour" looked like it was everywhere — the capacitor
  cylinders, their caps, the skirt bands and five stacked rings on the pad were
  all some shade of blue — so the rebuild spread `col` over all of them and the
  columns were painted violet to avoid a red-owner plant carrying blue.
- **Cause:** on a *blue* player every remap pixel AND every fixed cool-metal
  pixel is blue. The two are indistinguishable. RA2's own palette makes this
  worse for Allied structures, whose fixed shell is cobalt steel.
- **Fix:** fetch the same building's SHP/MAKE rip for a **red** owner (here
  `File:Power plant animation 1.gif` → `docs/ra2-ref/allied-power-plant-idle.png`)
  and diff by eye: whatever is red is remap, everything else is fixed. That
  showed the remap is exactly two surfaces — a big curved panel across the
  front of each tower's base drum, and a hairline rim on the base octagon —
  and that the caps and cylinders are fixed blue-slate steel, not house colour.
  Keep the blue screenshot for *true colour* (the wiki gifs are quantised to a
  web-safe palette and lie about hue), the red rip for *where the colour goes*.
- **Rule:** before deciding which surfaces carry `col`, look at the item in the
  owner colour that is NOT its faction's natural palette. For an Allied
  structure that means the red rip; for a Soviet one, a blue rip.
- **Corollary:** the real Allied sprite's cylinders read 8.3% saturated blue
  even on a red owner. Our stricter house rule (owner hue only, 0% opposing)
  cannot reproduce that, so the columns are desaturated slate-indigo — every
  cool navy in the branch is kept under HSV s=0.45 on purpose. Nudging any of
  them "a bit bluer" silently reintroduces opposing hue on a red-owner plant.

## A structure whose art is a landing pad must be laid out FROM the pad slots

- **Symptom:** the Airforce Command HQ's helipad was drawn from eyeballed
  fractions (`hquad(-0.84,-0.10, …)` per quadrant) and its outer rim ran to
  `hpx + 2*hpw = cx + 101` on a 164-wide sprite canvas — the pad's right vertex
  was being silently cut off by `mkCanvas`, and the four quadrant markings sat
  ~25% off the four spots Harriers actually park on. Nothing failed: the art
  harness draws the canvas bound, but only if you look for it, and the pad
  tests only assert the four slots are distinct.
- **Cause:** two independent sources of truth for the same four positions —
  `PAD_SLOTS` (grid offsets, read by `padSlot`/`stepAircraft`) and hand-tuned
  quadrant fractions in the `airforce` branch of `bakeBuilding`.
- **Fix:** derive the art from the sim. With `fw = TW`, `fh = TH` for a 2x2
  footprint, a slot at grid offset `(gx, gy)` lands at screen
  `((gx-gy)*fw/2, (gx+gy)*fh/2)` from the footprint centre, which for the
  current `PAD_SLOTS` is the pad frame's `(u,v) = (±0.363, ∓0.363)` — so the
  four markings are drawn at exactly those `(u,v)` and the pad rim is set to
  whatever still fits the canvas (`HPO = 0.685`, plus `pad = 24` for this key,
  matching the factory). Render four parked Harriers to confirm.
- **Rule:** whenever a structure's art marks a spot that gameplay also
  addresses (aircraft pads, vehicle exits, dock faces), compute the art
  positions from the gameplay constant. And check the canvas bound: a clipped
  sprite looks fine on a contact sheet with a dark background.
## A repair pad has to be centred on the FOOTPRINT, not where the sprite puts it

- **Symptom:** the rebuilt Service Depots were drawn faithfully — RA2 puts the
  Allied depot's grating disc well right of centre and hangs the gantry over
  the left third — and the first two scene renders showed the damaged tank
  parked *behind the gantry*, its front half hidden by the navy hull, sitting
  on the machinery rather than on the pad.
- **Cause:** `stepBld` repairs vehicles inside the footprint and a parked unit
  is drawn at the footprint centre `(cx, baseY)`, but the sprite's pad centre
  had been placed where the reference image put it (`cx + fw*0.16,
  baseY + fh*0.20`). The two centres were ~18 px apart, which at a 3x3 is most
  of a tank.
- **Fix:** pull the pad back onto the footprint centre (`cx + fw*0.04,
  baseY + fh*0.06` Allied, `cx + fw*0.08, baseY + fh*0.10` Soviet) and move the
  works *up-left* to compensate, raising the gantry so its hull clears the
  parked hull rather than crossing it. The composition still reads as the
  sprite; only the offset between pad and plot changed. The check that catches
  this is a scene render with a damaged vehicle actually parked on it — a
  contact sheet cannot show it.
- **Rule:** any structure with a functional standing area (repair pad, helipad,
  dock tile) centres that area on the footprint the sim uses, and the greebles
  move instead.

