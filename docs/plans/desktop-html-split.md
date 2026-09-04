# Plan: split `shell/desktop.html` into modules

*Written 2026-09-04 against `main` @ `8b94407` (clean tree, `VERSION` 1.19.270,
`shell/sw.js` `VERSION = 'v533'`). Every line number below is for that commit;
each is paired with a banner/anchor string so it can be re-found after the
numbers shift. Read `CLAUDE.md` and `shell/CLAUDE.md` before executing.*

---

## 0. Verdict

**Do it — but only three extractions, not a wholesale split.** The measured file
is 4,575 lines: head scripts 12–49, `<style>` 61–1028 (968 lines), five
`<script src>` tags 1029–1033, body markup 1035–1176, one main `<script>`
1177–4573. Inside that script there is ONE giant IIFE (`(function() {` at 1178,
closes `})();` at **3967**) followed by **six** independent column-0 IIFEs:
auto-refresh/SW 3980–4115, logout 4120–4167, clock 4173–4244, signed-in user
4250–4280, Claude usage strip 4290–4460, Codex usage strip 4466–4572.
(Boundaries re-derived and corrected 2026-09-04: the main IIFE closes at 3967,
not 4168, and auto-refresh + logout are siblings of it, not sections inside it.
The three steps below are unaffected — but re-derive the exact cut lines with
`awk '/^\(function|^\}\)\(\);/'` before moving any block.) The test ratio is real: `shell/*.test.js` totals 817 lines
against 5,721 lines of deployed shell source.

**What the payoff actually is (be honest with yourself):**

| Claimed benefit | Real? | Why |
|---|---|---|
| Testability | **Yes — the only benefit worth the churn.** | Only code that leaves the IIFE can be `require()`d by `node --test`. The five precedents (`winmgr.js`, `keybar.js`, `coach.js`, `apph.js`, `vibe-modal.js`) prove the pattern: DOM-free module → `window.X` in the browser / `module.exports` in node → a `.test.js` beside it. Today the APPS registry, the heartbeat state reducer and the usage strips are un-testable except by regex over the HTML (`shell/usage-strip.test.js` is literally that). |
| Review-ability | Partial | Reviewers get a 290-line strips file and an 86-line registry instead of hunting in a 3,400-line script. The window-mode glue (≈1,100 lines) stays where it is — it is coupled to everything (see §3 matrix) and its math is already in `winmgr.js`. |
| Load time | **No — slightly negative.** | No bundler. nginx `location /` (server/install.sh:365–367) adds `Cache-Control: no-cache, no-store` to every static file, so each new `<script src>` is one more round trip on a cold / SW-less load; only the service worker's SWR cache hides it on warm loads. Keep the file count small (this plan adds 3). |
| Smaller `desktop.html` | Cosmetic | 4,575 → ≈4,150 lines after all three steps. Do not sell the plan on this. |

**Extraction precedent, verified** (`shell/winmgr.js:11–271`, `shell/keybar.js`):
```js
(function (root) {
  'use strict';
  …
  var api = { … };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeWin = api;
})(typeof self !== 'undefined' ? self : this);
```
Loaded by a plain `<script src="/winmgr.js"></script>` in `<head>` (desktop.html:1031),
listed in `sw.js` `PRECACHE` (sw.js:24–28), deployed by `shell/install.sh`'s
`find` walk with no install edit (install.sh:104–106 — `*.html|*.js|*.json`,
minus `*.test.js`), parse-guarded automatically by `shell/js-syntax.test.js`
(its `walk()` over `shell/ shared/ apps/` picks up any new `.js`), and tested
by `node --test shell/winmgr.test.js` using `require("./winmgr.js")`.
DOM-touching modules (`coach.js`, `vibe-modal.js`) publish `window.vibeCoach` /
`window.vibeConfirm` and are tested by running the REAL source in a `vm`
sandbox with a stub `document` (`shell/coach.test.js:6–11`). **Follow exactly
this. Do not invent a namespace object, a loader, or a module system.**

**Module format decision: classic scripts + IIFE + `window.X` global — NOT ES
modules.** Proof the delivery path would reject ESM: (a) `shell/js-syntax.test.js:41–45`
compiles every deployed script with `new vm.Script(src)`, which throws on
`import`/`export` syntax → the test suite fails before anything ships;
(b) every existing test loads modules with CommonJS `require()`; (c) `<script type="module">`
is deferred by default, but `buildStartMenu()` runs synchronously at parse time
(desktop.html:1302) and needs `APPS` already defined — a deferred registry would
be `undefined` there; (d) no precedent anywhere in `shell/ shared/ apps/`.

---

## 1. Hard facts that constrain every step (all verified in this repo)

1. **Deployment is a walk.** `shell/install.sh:104–106` finds every
   `*.html *.js *.json` under `shell/ shared/ apps/` (excluding `*.test.js`,
   `*/art/*`, `services.example.json`) and installs each by **basename** into a
   flat web root. A new `shell/foo.js` deploys to `/foo.js` with no install edit.
   `install.sh:113–121` fails on duplicate destination basenames.
2. **Only `RENDERED` files get `@TOKEN@` stamping** (`install.sh:66–72`:
   `shell/desktop.html|index.html|version`). A `.js` file containing
   `@VERSION@`/`@SW_VERSION@` is copied verbatim — the literal token survives.
   Tokens live at desktop.html:1107 (build tag markup), 2144 (rzdbg diagnostic),
   3872–3875 (build tag JS) and **3997 `var STAMPED_SHELL_VER = '@SW_VERSION@'`**
   (the deploy-detection constant; the comment at 3994 explains why it must be a
   stamped constant). **None of that code may move into a `.js` file.**
3. **`sw.js` PRECACHE + VERSION.** `shell/sw.js:19 VERSION = 'v533'`,
   `PRECACHE` at 22–40 lists `/vibe-modal.js /coach.js /winmgr.js /keybar.js /apph.js`.
   Sub-resources not in PRECACHE still work online (SWR branch, sw.js:135–147)
   but an offline shell load would half-load **with no error** — that is the
   silent failure to guard. `shell/sw.test.js` does **not** pin PRECACHE against
   the script tags (it only parses the list and classifies paths);
   `server/tests/test_static.py:320–322 test_every_precache_entry_has_a_source_file`
   pins the *other* direction (every PRECACHE entry has a source file, resolved by
   basename via `_web_sources()`, which only admits `.html .js .json .png .ico`).
   VERSION is both the PWA cache key and the deploy signal `/api/events` watches
   (`server/terminal-manager.py:7101–7107`): **bump it in every step that changes
   `desktop.html`** or already-open tabs never reload.
4. **Script load order.** The five module tags sit in `<head>` after `</style>`
   (1029–1033) and before `<body>` (1035). The main script at 1177 runs
   synchronously during parse and calls `buildStartMenu()` at 1302 — anything
   it needs at parse time must be loaded in `<head>`. The four trailing IIFEs
   touch DOM at load (`getElementById('cu-strip')` at 4291) and register
   `window.applyServer*` callbacks that the main IIFE calls **only** from the
   async `/api/desktop` response (`onDesktopResp`, 2570–2575) — so they must run
   after the body markup, and keeping them *after* the main script preserves
   today's order exactly. No `defer`/`async` on any new tag.
5. **Redeploy trigger already covers `shell/`.** `server/terminal-manager.py:6431
   WEB_SOURCE_DIRS = ("shell/", "shared/", "apps/")`, asserted against the
   installer's walk by `server/tests/test_api_update.py:191`. Nothing to change.
6. **Basename uniqueness — current deployable set** (checked with `find`):
   JS/JSON: `apph.js coach.js filebrowser-patches.js gamescore.js kbd-input.js keybar.js manifest.json services.example.json sw.js tab-sync.js terminal-kbd.js vibe-modal.js winmgr.js xpra-patches.js`.
   The three names proposed below (`appreg.js`, `usage-strips.js`, `deskstate.js`)
   collide with nothing. Re-run the check before each commit:
   `find shell shared apps -name '*.js' ! -name '*.test.js' ! -path '*/art/*' -exec basename {} \; | sort | uniq -d` (must print nothing).
7. **nginx never names shell JS.** `server/install.sh:365` `location /` serves
   the whole static root; the only `sub_filter`s are on `/tN/` (install.sh:530–531),
   `/files/` (apps/everyday/files/nginx/filebrowser.conf:34–35, 67–68) and
   `/browser/` `/x11-display/` (apps/everyday/browser/nginx/browser.conf:68–70, 122–123).
   None touch `index.html`. No nginx edit in any step.
8. **Tests that grep `desktop.html` as text** (they break if the text they look
   for moves): `server/tests/test_static.py:398` (nesting guard, head script),
   `:411 test_window_mode_switch_lives_only_in_the_taskbar` (needs `id="wm-btn"`,
   the CSS `body.wm-capable .wm-btn`, `if (visN >= 2)`, `g.max = true`,
   `addEventListener('contextmenu'` present and **the substrings `winmode` and
   `id="tidy-btn"` ABSENT**), `:472 test_keybar_lift_chain_is_intact`
   (`src="/keybar.js"`, `VibeKeybar.compute`, `applyLift`, `translateY`,
   `__activeTermFrame` all in desktop.html), and `shell/usage-strip.test.js`
   (regexes over the strip JS *and* one CSS rule). §4 Step 2 moves that last one.
9. **A latent bug the split exposes.** `pushDesktop` is a main-IIFE local
   (desktop.html:2648). It is called from the Claude strip IIFE (**4455**) and
   the Codex strip IIFE (**4564**) — both *outside* the main IIFE, which closed
   at 3967 — and nothing publishes `window.pushDesktop` (grep `window\.[A-Za-z_]\+ *=`
   → only `__syncKeybar wireWinFocus rewireWinFocus applyServerSysStats toggleSysStats canSudo viaAccess applyServerClaudeUsage toggleClaudeUsage applyServerCodexUsage toggleCodexUsage`).
   So each toggle's `.then(function(){ localOverrideUntil = 0; pushDesktop(); })`
   throws `ReferenceError`, swallowed by the trailing `.catch(function(){ localOverrideUntil = 0; })`.
   Effect: the immediate heartbeat push after toggling a usage strip never
   happens; the next 5 s heartbeat converges anyway. Same family as the
   design-decisions entry at `docs/design-decisions.md:2041` ("the same wrapper
   whose local `var`s make `window.APPS` undefined"). Step 2 fixes it and logs it.

---

## 2. The pilot: extract the `APPS` registry — confirmed

The user proposed `APPS` as the first step. The coupling matrix (§3) confirms it
is the best pilot, not merely an acceptable one:

- **Zero inbound coupling.** Lines 1179–1264 (`svgIcon`, `ICON`, `APPS`, the
  `svg` attach loop) reference nothing else in the file. They export exactly
  two names: `APPS` (23 uses, all inside the main IIFE: 1217 1263 1265 1271 1272
  1286 1287 1302 1550 1733 1761 2610 2613 2696 2697 2706 2799 2800 2853 2887 2888
  3127 3904) and `buildStartMenu` (DOM; stays).
- **Parse-time consumer ⇒ `<head>` placement — identical to the five precedents.**
- **First genuinely unit-testable contract in the shell**: the data invariants
  the product already depends on (every `src` is a real page, toggles have no
  `src`, hidden apps have no menu section, sections map to real `#sm-*`
  containers) are asserted today only indirectly by `tests/e2e/tests/games.spec.js`
  in a VM.
- **It is the documented "source of truth"** (CLAUDE.md "Canonical app inventory",
  `shell/CLAUDE.md:9,18`, `docs/desktop.md:13,48`), so the pilot also forces the
  doc-path discipline the recent regroup showed is needed.

The alternative lowest-risk first step — the 77-line clock IIFE (zero coupling,
already e2e-covered by `tests/e2e/tests/taskbar-clock.spec.js`) — was rejected:
a file for `Date` formatting adds a request and buys no test.

---

## 3. Coupling matrix (what makes the rest hard)

Computed over the main IIFE's top-level (2-space-indent) declarations. "USES"
= names declared outside the range that the range reads; "DEFINES→" = names the
range declares that are used elsewhere. (`top`/`height`/`btn` are regex noise.)

| Section (banner) | Lines | Size | USES from outside | DEFINES used outside | Verdict |
|---|---|---|---|---|---|
| icons + `APPS` + `buildStartMenu` | 1179–1295 | 117 | — | `APPS`, `buildStartMenu` | **Step 1** (data part only) |
| element refs + `openApps`/`active` | 1296–1306 | 11 | `buildStartMenu` | everything | stays (the state) |
| Floating window mode core | 1307–1394 | 88 | `active frameOf framesEl openApps renderWindows saveWins winOf` | `WM_FLAG applyWinGeom frameBox nudgeResize pumpActive raiseWin toggleMax winGeom windowModeOn wins zTop` | stays |
| snap-layout palette | 1395–1971 | 577 | 18 names incl. `APPS persist renderTaskbar immersiveApp` | `renderWindows saveWins showDesktop …` | stays — math already in `winmgr.js` |
| Browser keyboard relay | 1972–2102 | 131 | `active` (own local `post`) | `IS_TOUCH` | not now (§6) |
| resize-cursor diagnostic | 2103–2150 | 48 | — | — | stays (carries `@VERSION@` tokens, fact 2) |
| system-wide key bar | 2151–2524 | 374 | `active`, `frameOf` | — | not now — `test_static:472` pins its text in desktop.html; iOS-only behaviour untestable in node (§6) |
| cross-instance state | 2525–2994 | 470 | `APPS active autoTileIfUntouched closeAllFlyouts framesEl menuEl openApps renderSysStats renderWarnings scrimEl startBtn windowModeOn xWinCount` | `closeEverywhere coachForApp frameOf launch loadIfNeeded maybeWinTip renderTaskbar toggleMenu winOf` | **Step 3** — extract only the pure decisions |
| Submenu flyouts | 2995–3061 | 67 | `menuEl` | (`FLYOUTS`, `closeAllFlyouts` used by events) | stays |
| events | 3062–3186 | 125 | `APPS FLYOUTS IS_TOUCH closeAllFlyouts closeEverywhere launch menuEl showDesktop startBtn toggleMenu` | `taskDown` | stays (`test_static:411` greps `contextmenu` here) |
| drag-to-reorder taskbar | 3187–3222 | 36 | `openApps persist taskAppsEl taskDown` | — | stays |
| window mode move/resize/focus | 3223–3634 | 412 | 28 names | — | stays |
| document viewer | 3635–3701 | 67 | `ensureFrame frameOf openApps setActive` | — | stays |
| status bar / system stats | 3702–3893 | 192 | `pushDesktop` | `post relayStatus` | later candidate (§6) |
| restore this instance's windows | 3894–3967 | 74 | `active closeMenu frameOf openApps pushDesktop setActive` | — | stays (end of the main IIFE) |
| auto-refresh / SW register IIFE | 3980–4115 | 136 | — | — | stays (**`@SW_VERSION@` at 3997** is *here*, fact 2 — inline-only, install.sh stamps `RENDERED` entries only) |
| logout drop-up IIFE | 4120–4167 | 48 | — | — | stays |
| Taskbar clock IIFE | 4173–4244 | 72 | — | — | stays (no test payoff) |
| Signed-in user IIFE | 4250–4280 | 31 | — | publishes `window.canSudo/viaAccess` | stays |
| Claude usage strip IIFE | 4290–4460 | 171 | `pushDesktop` (**broken**, fact 9) | publishes `window.applyServerClaudeUsage/toggleClaudeUsage` | **Step 2** |
| Codex usage strip IIFE | 4466–4572 | 107 | `pushDesktop` (**broken**, fact 9) | publishes `window.applyServerCodexUsage/toggleCodexUsage` | **Step 2** |

---

## 4. Ordered steps — each is ONE commit that leaves the app working

Conventions for every step:
- New files go under **`shell/`** (never `shared/` — that is for modules used by
  many pages: `vibe-modal.js` ×6, `gamescore.js` ×5). Each `.js` gets a sibling
  `.test.js` with the same stem (`winmgr.js` ↔ `winmgr.test.js`).
- Header comment in the module states: what it is, that it is DOM-free (or not),
  the exact `node --test shell/<x>.test.js` command, and the global it publishes
  — as `winmgr.js:1–10` does.
- Move code **verbatim**. No renames, no clean-ups, no merging of IIFEs in the
  same commit — bisectability first; refactor in a follow-up commit if wanted.
- Commit subject carries the sw bump: `…(sw v533->v534)`. Root `VERSION` is a
  release number — leave it unless the maintainer is cutting a release.
- Release order (CLAUDE.md): bump `sw.js` → commit → push → **then** deploy
  (in-app Update, or `./shell/install.sh` for a home install).
- Before each commit: the basename-collision check from fact 6, then `./run-tests.sh`.

### Step 0 — guards first (no behaviour change, no sw bump)

*Why first:* the recent regroup broke nine path references with no error raised
(`docs/design-decisions.md:4002`). Two of the failure modes this plan can create
— a script tag missing from PRECACHE, a stamp token in an unstamped file — are
silent. Make them loud before anything moves. (Run these new tests against the
current tree and watch them pass; then, while executing Step 1, temporarily omit
the PRECACHE entry and watch the first one fail — a test that has never been seen
red proves nothing.)

**Modify `shell/sw.test.js`** — append two tests:
1. `"every <script src> in desktop.html is precached"`: read `desktop.html`
   (`path.join(__dirname, "desktop.html")`), collect
   `/<script\s+src="(\/[^"?]+\.js)"/g`, assert each is in `PRECACHE` (already
   extracted at sw.test.js:44). Today's five all pass.
2. `"no deployed shell script carries an unstamped @TOKEN@"`: for every
   `shell/*.js` except `*.test.js`, assert `!/@[A-Z_]+@/.test(src)` — because
   `shell/install.sh` stamps only `RENDERED` entries.

**Modify `docs/testing.md:138`** — the command reads `node --test landing/*.test.js
terminal/lib/*.test.js`; `landing/` no longer exists. Replace with
`node --test shell/*.test.js shared/*.test.js apps/everyday/terminal/lib/*.test.js`
(a glob of FILES — `node --test` must never be handed a directory).

**Acceptance:** `node --test shell/sw.test.js` green; `./run-tests.sh` green.

### Step 1 — pilot: `shell/appreg.js` (`window.VibeApps`) — sw v533→v534

**Create `shell/appreg.js`.** Contents, in order: header comment; the
`(function (root) { 'use strict'; … })(typeof self !== 'undefined' ? self : this);`
wrapper from `winmgr.js`; then **verbatim** from desktop.html:
- `function svgIcon(d)` (1186–1188),
- `var ICON = { … }` (1189–1211) including its comments,
- the `APPS` comment block + `var APPS = { … }` (1213–1262),
- the svg-attach loop (1263–1264: `Object.keys(APPS).forEach(function(id) { if (ICON[id]) APPS[id].svg = ICON[id]; });`).
Then the export, mirroring `winmgr.js:263–271`:
```js
  var api = { APPS: APPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeApps = api;
```
Public surface: **`window.VibeApps.APPS`** — the same mutable object the shell
used before (do NOT `Object.freeze` it; behaviour-preserving). Nothing else is
exported in this step (`ICON` is an implementation detail; `svgIcon` too). Keep
the leading comment block from 1179–1185 (the "why inline SVG" rationale) in the
module, above `svgIcon`.

**Modify `shell/desktop.html`:**
- Delete 1179–1264 and replace with one line at the top of the IIFE:
  `var APPS = VibeApps.APPS;   // registry lives in shell/appreg.js — the canonical app inventory`
  so the other 22 `APPS` references are untouched. `buildStartMenu` (1266–1294)
  stays exactly where it is.
- Insert `  <script src="/appreg.js"></script>` **after line 1033** (`/apph.js`),
  still inside `<head>` before `<body>`. Position rationale: it must precede the
  main script (parse-time use at what is now `var APPS = …` and `buildStartMenu()`),
  and the five precedents live in this block. Order among the six does not
  matter — none depends on another.

**Modify `shell/sw.js`:** add `'/appreg.js',` after `'/apph.js',` (line 28);
`VERSION` `'v533'` → `'v534'`.

**Create `shell/appreg.test.js`** (`const { APPS } = require("./appreg.js");`).
Assert, with `node:test` + `node:assert/strict`:
1. Every entry has non-empty string `label`, `icon`, `desc`; `src` and `toggle`
   are mutually exclusive and one of them is present (`claudeusage codexusage sysstats`
   are the toggles).
2. `section`, when present, is one of `'utilities' 'system' 'games'`; `hidden`
   entries (`video`, `imageview`) have neither `section` nor `toggle`.
3. `sudo: true` appears only on entries with `section === 'system'` (today: `config`).
4. **Every `src` resolves to a real deployable page or a known nginx route.**
   Reuse the `walk()` idea from `js-syntax.test.js:26–33` over `shell/ shared/ apps/`
   to build a basename→path map of `*.html`; map `/landing.html` → `index.html`
   (the `RENDERED` rename in `install.sh:69`); allowlist the proxied routes
   `['/terminals/', '/browser/']`. This is the "a page that ships but is not in
   APPS (or vice versa) fails here" promise that `games.spec.js:6` currently
   keeps only in a VM.
5. **Every distinct `section` has a container in desktop.html**: read
   `desktop.html` and assert `id="sm-utilities"`, `id="sm-system"`, `id="sm-games"`
   and `id="sm-apps"` exist (today at 1090–1106).
6. If an entry has `svg`, it starts with `<svg` and its `icon` fallback is still present.

**Docs to update in the same commit** (the "source of truth" statement moves):
`CLAUDE.md` ("Canonical app inventory (source of truth: the `APPS` map in
`shell/desktop.html` …)" → `shell/appreg.js`; and the "Code map" bullet
"`shell/desktop.html` ~4k lines is the entire shell, `APPS` map included");
`shell/CLAUDE.md:9` and `:18` (add an `appreg.js` line to the layout block);
`docs/desktop.md:13,48` ("registered in `APPS`" — add where it lives) and the
"Shell-wide front-end modules" section at `docs/desktop.md:51–55` (add `appreg.js`
to the list of deployed/precached/syntax-guarded modules); the comment at
`server/terminal-manager.py:4509` ("the client whitelists against its own APPS
map") may stay as is. `docs/testing.md:40–45` JS list: add `appreg.test.js`.

**Acceptance:**
- `node --test shell/appreg.test.js shell/sw.test.js shell/js-syntax.test.js`
  (js-syntax auto-covers the new file — its `walk()` needs no list edit; confirm
  the output contains `parses: shell/appreg.js`).
- `cd server && python -m pytest tests/test_static.py -q` (PRECACHE↔source check
  now sees `/appreg.js`).
- `./run-tests.sh` green; `DRY_RUN=1 ./shell/install.sh | grep appreg` shows
  `shell/appreg.js -> appreg.js`.
- Deploy to a home web root (`./shell/install.sh`, no sudo) and load `/`: DevTools
  console has **no** `ReferenceError`; `typeof VibeApps.APPS.terminal === 'object'`;
  Start ▸ menu shows Everyday apps, Utilities ▸ (Services, Monitor, Token Stats +
  the three toggles), Games ▸ five games, System ▸ Update; Config row hidden for
  a non-sudo user, shown for a sudo user; open Notes → taskbar button → close.
- Fast Playwright lane against the live host (shell-only specs, no VM):
  `cd tests/e2e && VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test tests/smoke.spec.js tests/games.spec.js --project=desktop-chromium`
  (games.spec has a `pageerror` listener, so a load-order slip shows up there).
  Never drive the Browser/xpra app this way.

### Step 2 — `shell/usage-strips.js` (Claude + Codex strips) — sw v534→v535

**Create `shell/usage-strips.js`.** Header comment (not DOM-free: it renders
into `#cu-strip` / `#cx-strip` and the `.sm-item[data-id="claudeusage|codexusage"]`
rows; tested via the vm-sandbox pattern of `coach.test.js`; publishes the four
window callbacks). Then **verbatim**: the banner + comment + `(function claudeUsage() { … })();`
(4282–4461) followed by the banner + comment + `(function codexUsage() { … })();`
(4462–4572). Two IIFEs in one file, unmerged. **One edit inside each**: the call
`pushDesktop();` at 4455 and 4564 becomes `if (window.pushDesktop) window.pushDesktop();`.

Public surface (unchanged names — the main IIFE dispatches on them by string at
2573–2575 and 3128–3131): `window.applyServerClaudeUsage(on, data)`,
`window.toggleClaudeUsage()`, `window.applyServerCodexUsage(on, data)`,
`window.toggleCodexUsage()`.

**Modify `shell/desktop.html`:**
- Delete 4282–4572 (everything after the signed-in IIFE's `})();` at 4281 up to
  and including the Codex IIFE's `})();` at 4572), leaving `</script>` at what
  was 4573.
- Insert **after that `</script>`**, before `</body>`:
  `<script src="/usage-strips.js"></script>`. Position rationale: it needs the
  body markup (`getElementById('cu-strip')` at load) and today it runs after the
  main IIFE; a body-end classic script executes at exactly that point. Putting it
  in `<head>` would make both IIFEs `return` early on a missing `#cu-strip`.
- In the main IIFE, directly after `function pushDesktop() { … }` (2648–2660),
  add one line: `window.pushDesktop = pushDesktop;   // called by usage-strips.js after a toggle`.
  This is the fix for fact 9 and follows the file's existing flat-global
  precedent (`window.applyServerSysStats` at 3735, `window.wireWinFocus` at 3366).

**Modify `shell/sw.js`:** add `'/usage-strips.js',` after `'/appreg.js',`;
`VERSION` `'v534'` → `'v535'`.

**Rename `shell/usage-strip.test.js` → `shell/usage-strips.test.js`** (`git mv`),
and split its reads: the two strip regexes (`var mid = '· resets ' + …`,
`var min = '· ' + …`, the two `!window.matchMedia('(max-width: 680px)')` matches)
now read `usage-strips.js`; the `grid-template-columns: repeat(2, 360px)` CSS
assertion and the `fetch('/api/update?build=1'…)` / `vtbuild` assertions
(verifyBuild block, which stays at ~3997–4125) keep reading `desktop.html`.
Then add behavioural tests in the `coach.test.js` style: build a stub `document`
with `#cu-strip`, `#cx-strip`, two `.sm-item` rows with `classList`, `innerHTML`,
`querySelector(All)`, `getElementById`, `addEventListener`; a `window` with
`matchMedia` returning `{matches:false}`, `fetch` returning a resolved stub,
`localStorage`; run the real source with `vm.runInNewContext`. Assert:
1. Loading defines all four window callbacks and throws nothing.
2. `applyServerClaudeUsage(true, {enabled:true, session:{pct:42, reset:<now+3600>}, weekly:{pct:10, reset:<now+86400>}})`
   marks the row `cu-on`, writes a `%` and a "resets" countdown into `#cu-strip`,
   and renders a `#cu-x` close; `applyServerClaudeUsage(false)` clears `cu-on`.
3. Same for Codex with `applyServerCodexUsage` / `#cx-x`.
4. `toggleClaudeUsage()` POSTs `/api/claude/usage` with `{enabled: true}` and
   calls `window.pushDesktop` when present (**this is the regression test for
   fact 9** — it fails on the current tree because `pushDesktop` is a
   ReferenceError there; run it against the pre-fix source first).
If the DOM stub grows past ~80 lines, stop at (1) + (4) + the moved regexes —
the point is the seam and the load guard, not a DOM emulator.

**Docs:** add a Symptom→Cause→Fix→Rejected entry to `docs/design-decisions.md`
for fact 9 ("usage-strip toggle's immediate heartbeat push was a swallowed
ReferenceError — the strip IIFEs sat outside the main script wrapper"; rejected:
moving the strips *into* the main IIFE, which would re-couple them and forfeit the
unit test), then `python3 tools/gen-dd-toc.py` (a test fails otherwise).
Update `docs/desktop.md:51–55` module list and `docs/testing.md:40–45`.

**Acceptance:**
- `node --test shell/usage-strips.test.js shell/sw.test.js shell/js-syntax.test.js`;
  `./run-tests.sh`.
- Deployed: load `/`; Start ▸ Utilities ▸ Claude Limit toggles the strip and
  the row accent on **two** devices/tabs (the second converges via heartbeat);
  the ✕ on the strip turns it off everywhere; same for Codex Limit; DevTools
  Network shows a `POST /api/desktop` within ~200 ms of the toggle (the push
  that fact 9 was silently dropping). No console errors.
- Fast lane: `smoke.spec.js` as in Step 1.

### Step 3 — `shell/deskstate.js` (`window.VibeDeskState`): the heartbeat's pure decisions — sw v535→v536

*Why this and not the window-mode glue:* the cross-instance section
(2525–2994) is where the real multi-user bugs have lived (CWD, time-only caches,
un-gated heartbeat folds — see the "Test as a real second user" lesson), and its
decisions are pure functions of `(server reply, my instance id, my open set)`
that never see the DOM. Only those decisions move; `onDesktopResp` stays as glue.

**Read first** (the executor must confirm the exact expressions before moving
them): `isRunning` 2553–2568, `onDesktopResp` 2570–2608, `INSTANCE_ID` minting
2533–2540, `markMenuRunning` 2809–2822 (this is where unknown ids from
`d.running` are whitelisted against the menu — the manager stores ids verbatim,
`server/terminal-manager.py:4509`).

**Create `shell/deskstate.js`** with the `winmgr.js` wrapper and a small API,
each function a verbatim lift of the expression it replaces:
- `isRunning(id, s)` where `s = { open, running, terminalCount, xWinCount }` — the
  body of 2553–2568 with the four closure reads (`openApps`, `runningGlobal`,
  `terminalCount`, and `xWinCount` for the `x11launcher` special case at 2560)
  replaced by `s.*`. Verified order of the checks: x11launcher → open → running →
  terminal → false.
- `resetDecision(lastEpoch, epoch)` → `'baseline' | 'clear' | 'none'` — the
  three-way logic at 2590–2593.
- `closeTargetsFor(closeTargets, instanceId, open)` → array of app ids this
  instance must close — the loop at 2597–2605 minus the `closeApp(app)` side effect.
- `mintInstanceId(now, rand)` — the `'i-' + now.toString(36) + '-' + rand.toString(36).slice(2, 8)`
  expression at 2537, injected clock/random so the test is deterministic.
Publish as `root.VibeDeskState = api` / `module.exports = api`.

**Modify `shell/desktop.html`:** in the four call sites, replace the inline
logic with calls (e.g. `if (VibeDeskState.isRunning(id, { open: openApps, running: runningGlobal, terminalCount: terminalCount, xWinCount: xWinCount }))` — or keep a local
`function isRunning(id) { return VibeDeskState.isRunning(id, {…}); }` so the
12+ existing callers stay untouched; prefer the wrapper). In `onDesktopResp`,
the reset block becomes a `switch` on `resetDecision(lastResetEpoch, d.reset_epoch)`
and the close block `VibeDeskState.closeTargetsFor(d.close_targets, INSTANCE_ID, openApps).forEach(closeApp)`.
**Call order inside `onDesktopResp` must not change** (it sets `terminalCount`
before `markMenuRunning` on purpose — comment at 2583–2585).
Insert `<script src="/deskstate.js"></script>` in `<head>` after `/appreg.js`
(DOM-free, like `winmgr.js`; used only at runtime, so head is not required but
is the precedent for pure modules).

**Modify `shell/sw.js`:** `'/deskstate.js',`; `VERSION` `'v535'` → `'v536'`.

**Create `shell/deskstate.test.js`** (`require("./deskstate.js")`). Fixtures
written as two-device scenarios:
1. Terminal running on another instance only → `isRunning('terminal', …)` true
   when `terminalCount > 0` even with an empty local `open`; false when 0 and
   not in `running`.
2. Browser is **not** special-cased (comment block just above 2553): `isRunning('browser')`
   false when nowhere open. `isRunning('x11launcher', {xWinCount: 1, …})` true with
   nothing open locally; false at 0 even if `running` lists it (the special case
   returns before the `running` check — assert that order, it is the current behaviour).
3. `resetDecision(null, 5) === 'baseline'`; `(5, 6) === 'clear'`; `(6, 6) === 'none'`;
   `(6, 5) === 'none'`.
4. `closeTargetsFor({notes:['i-a','i-b'], files:['i-b']}, 'i-a', ['notes','files'])`
   → `['notes']` only; an app listed for me but not open → not returned; a
   non-array value → ignored.
5. `mintInstanceId` shape `/^i-[0-9a-z]+-[0-9a-z]{6}$/` and determinism.

**Acceptance:** `node --test shell/deskstate.test.js …`; `./run-tests.sh`;
deployed two-browser check **as two different Linux users and as two instances
of one user**: open Notes on A → green dot on B's Start menu; ⏻ on B closes it
on A; Logout-all on A clears B's windows (reset epoch); Terminal dot lights on B
when a terminal runs on A. Fast lane: `smoke.spec.js multiuser.spec.js`.
If any of these verbatim lifts turns out not to be verbatim (the expression
depends on something the matrix did not show), **stop and ship Steps 0–2 only**;
this is the step with judgement in it.

### After Step 3 — stop

`desktop.html` will be ≈4,150 lines: the window-mode glue, key bar, events,
restore/SW block and CSS remain. That is the intended end state of this plan;
see §6 for what was deliberately not taken and §7 for the temptations.

---

## 5. The test story

| Module | Test file | Runs via | What it asserts |
|---|---|---|---|
| (guards) | `shell/sw.test.js` (+2 tests) | `node --test shell/sw.test.js` | every `<script src>` in desktop.html is in PRECACHE; no `@TOKEN@` in any `shell/*.js` |
| `appreg.js` | `shell/appreg.test.js` (new) | `node --test shell/appreg.test.js` | registry invariants; every `src` is a real page/route; every section has a `#sm-*` container |
| `usage-strips.js` | `shell/usage-strips.test.js` (renamed + extended) | `node --test shell/usage-strips.test.js` | defines the 4 callbacks; renders `cu-on`/close/countdown; toggle POSTs and calls `window.pushDesktop` (fact 9 regression) |
| `deskstate.js` | `shell/deskstate.test.js` (new) | `node --test shell/deskstate.test.js` | two-device fixtures for running-dots, reset epoch, close-targets, instance id |
| all new `.js` | `shell/js-syntax.test.js` | automatic | `walk()` over `shell/` — **no list edit**; check the run prints `parses: shell/<x>.js` |
| all new `.test.js` | `run-tests.sh:61` | automatic | `find shell shared apps server -name '*.test.js'` — no registration |

Always pass FILES to `node --test`, never a directory. Prove each new test
against the broken state first (omit the PRECACHE entry; run the strips test on
the pre-fix source) — green-only-on-the-fix proves nothing.

Ratio after the plan: roughly 817 → ~1,150 test lines against the same ~5,700
source lines, and — more to the point — the three pieces of shell logic with a
bug history (registry drift, heartbeat folds, strip toggles) have executable
contracts instead of regexes.

---

## 6. The CSS question — leave the 968 lines inline

Decision: **do not extract `<style>` (61–1028).** Evidence:
1. **The delivery path does not carry CSS.** `shell/install.sh:104–106` walks
   `*.html *.js *.json` only; a `shell/desktop.css` would not deploy until the
   `find` pattern is edited. `server/tests/test_static.py:288–296 _web_sources()`
   admits `.html .js .json .png .ico` only, so `test_every_precache_entry_has_a_source_file`
   would report a `/desktop.css` PRECACHE entry as having **no source**.
2. **Zero precedent.** `find . -name '*.css'` → nothing; no `rel="stylesheet"`
   in any page under `shell/ shared/ apps/`. The one shared style this repo has
   (`vibe-modal.js:14–41`) is injected from JS on first use, on purpose.
3. **Tests grep the CSS text inside desktop.html**: `test_static.py:414`
   (`body.wm-capable .wm-btn`) and `usage-strip.test.js:22` (`grid-template-columns: repeat(2, 360px)`).
4. **No test payoff.** Nothing in node can assert CSS; the only gain is a
   shorter HTML file, and the cost is a render-blocking request that nginx serves
   `no-store` and the SW serves network-first with a 2.5 s timeout — a stalled
   stylesheet fetch is a longer unstyled or blank first paint on the flaky-wifi
   iOS case the SW was tuned for (sw.js:96–104).
5. Nothing `sub_filter`s `index.html` (fact 7), so there is no injection
   mechanism that would benefit from a separate sheet either.
If it is ever revisited, it needs, in one commit: the `find` pattern in
`install.sh`, the extension list in `_web_sources()`, a PRECACHE entry, the two
greps above re-pointed, and a `<link rel="stylesheet" href="/desktop.css">`
before the module tags — plus an sw bump.

---

## 7. Risks, silent-failure modes, and rollback

**Every place that addresses shell files by name** (the checklist for each step;
the regroup broke nine of these with no error):

| Where | What it names | Touched by this plan? |
|---|---|---|
| `shell/sw.js` PRECACHE + VERSION | `/appreg.js /usage-strips.js /deskstate.js` | Steps 1–3 (guarded by Step 0 test + `test_static:320`) |
| `shell/desktop.html` `<script src>` tags (1029–1033, body end) | same | Steps 1–3 |
| `shell/install.sh` `find` walk + `RENDERED` | picks new `.js` up automatically; stamping unaffected | no edit; run `DRY_RUN=1 ./shell/install.sh` |
| `server/install.sh` nginx site (`location /`, `try_files /index.html`) | `index.html` only | no |
| `server/terminal-manager.py` `WEB_SOURCE_DIRS` (6431), `SW_FILE` (467), `:(glob)**/sw.js` (6239) | dirs / sw.js | no |
| `tools/doctor.sh:291–340` | `index.html`, `sw.js` | no |
| `server/tests/test_static.py:398,411,472` | text inside desktop.html | Steps 1–3 must leave `wm-btn`, `body.wm-capable .wm-btn`, `if (visN >= 2)`, `g.max = true`, `contextmenu`, `src="/keybar.js"`, `VibeKeybar.compute`, `applyLift`, `translateY`, `__activeTermFrame` in desktop.html — and **never introduce the substrings `winmode` or `id="tidy-btn"`** (asserted absent) |
| `shell/usage-strip.test.js` | text inside desktop.html | Step 2 renames/re-points it |
| `server/tests/test_api_update.py:20,72,76,104,126` | `"shell/desktop.html"` as a changed-path fixture only | no |
| `tests/e2e/tests/window-mode.spec.js:263,584,642,679` | `window.VibeWin` | no |
| Docs: `CLAUDE.md`, `shell/CLAUDE.md:9,18`, `docs/desktop.md:13,48,51–55`, `docs/testing.md:40–45,138`, `docs/terminal.md:286` | "APPS map in desktop.html", module lists | Steps 0–3 |

**Silent failures to expect and how each is caught:**
- *Forgot PRECACHE:* online fine, offline shell half-loads with no error →
  Step 0 test.
- *Tag in the wrong place:* `appreg.js` after the main script → `ReferenceError: VibeApps`
  at parse → blank desktop; `usage-strips.js` in `<head>` → both IIFEs `return`
  on a missing `#cu-strip` and the strips never render, **no error** → the
  behavioural test (defines callbacks) passes in node but the manual "toggle on
  two devices" check fails; `games.spec.js`/`surface-health.spec.js` `pageerror`
  listeners catch the first case.
- *Token in a `.js`:* `loadedShellVer` becomes `null` and deploy detection
  silently switches off → Step 0 test.
- *Deployed before the sw bump was committed:* every open client stays stale
  (CLAUDE.md release checklist) → redeploy `./shell/install.sh` after the bump.
- *Stale running manager after a `.py` edit:* not applicable here — no manager
  code changes in this plan.
- *Basename collision:* `install.sh` exits non-zero at deploy — loud, but only at
  deploy; run the `uniq -d` check before committing.

**Rollback:** each step is one commit; `git revert <sha>`, then **bump `sw.js`
VERSION forward again** (do not let the revert take it backwards — clients are
told to reload on *change*, but a forward bump is unambiguous and matches the
`vNNN` monotonic convention `doctor.sh:336–340` compares), commit, push, deploy.
The old `index.html` is self-contained at every step, so a revert never needs
the extracted file to still exist.

---

## 8. Not now — candidates considered and parked

- **Key bar glue (2151–2524, 374 lines).** Only `active`/`frameOf` inbound, so
  it *looks* easy — but its behaviour is iOS-only and untestable in node (the
  pure math already lives in `keybar.js`), and `test_static:472` pins five of
  its strings inside desktop.html. Moving it buys review-ability only, at the
  highest regression risk in the file. Revisit only with a device in hand.
- **Browser keyboard relay (1972–2102).** Self-contained (`setupKbd` IIFE with
  its own `post`), but the value-diff/debounce logic is small and iOS-shaped.
- **System stats render (`renderSysStats` 3753, `renderWarnings` 3794).** The
  number formatting is pure and would test well; do it as a Step 4 only if the
  stats readout regresses again.
- **Window-mode core / palette / move-resize (~1,077 lines).** Coupled to
  `wins openApps active renderTaskbar persist immersiveApp …` (matrix). The rule
  already in force (`docs/desktop.md:23`: "keep new geometry decisions in
  `winmgr.js`") is the right split; do not attempt a glue extraction.
- **Clock and signed-in IIFEs.** Zero coupling, zero test payoff; a file each
  would be pure request overhead.
- **Flyouts, events, taskbar DnD, doc viewer.** DOM glue; nothing to assert in node.

---

## 9. Do not do this

1. **No `<script type="module">`, no `import`/`export`, no `.mjs`.**
   `js-syntax.test.js` `vm.Script`-compiles every shell script and would fail;
   tests `require()` CommonJS; module scripts defer past the parse-time
   `buildStartMenu()`.
2. **No `defer`/`async` on the new tags** — order is load-bearing (fact 4).
3. **Do not extract the CSS** (§6).
4. **Do not move any code containing `@VERSION@`/`@SW_VERSION@`** into a `.js`
   (1107, 2144, 3872–3875, 3997) — `install.sh` stamps only `RENDERED` entries.
   Do not "fix" this by reading the build from `#build-sw` — the comment at
   3994–3996 records why that DOM-shaped check was itself a bug.
5. **Do not name a file, id or global containing `winmode`, or add `id="tidy-btn"`**
   — `test_static.py:415–419` asserts both substrings are absent from desktop.html.
6. **Do not rename the published globals** (`applyServerClaudeUsage`,
   `toggleCodexUsage`, …) or wrap them in a namespace object — the main IIFE
   calls them by name at 2573–2575 and 3128–3131, and flat `window.*` is the
   file's established seam.
7. **Do not put desktop-only modules in `shared/`** — that directory means "used
   by many pages".
8. **Do not add a root `package.json`, a bundler, or a deploy list** — the repo
   has no build step and `install.sh` deploys by walking; `RENDERED` is for
   renames/stamps only.
9. **Do not merge, tidy or rename while moving.** Verbatim first, refactor in a
   later commit, so a bisect lands on a one-line diff.
10. **Do not deploy before the sw bump is committed and pushed**, and never run
    `install.sh` over a dirty prod checkout (CLAUDE.md release checklist; the
    shared-checkout hazard).
11. **Do not touch `WEB_SOURCE_DIRS`** — `shell/` is already covered and a test
    asserts it against the installer's walk.
12. **Do not extend the plan past Step 3 in the same series** — the remaining
    3,000 lines are glue with an existing pure-math home (`winmgr.js`); more files
    there is churn.
