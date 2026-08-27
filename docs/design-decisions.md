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
straight into the PTY master, so `_inject_terminal` connects, `sendall(text + b"\r")`,
and closes. Three details are load-bearing:
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
