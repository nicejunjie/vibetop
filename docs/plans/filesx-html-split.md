# Plan: making `apps/everyday/files/filesx.html` maintainable and testable

> Written 2026-09-04 against `main` @ `80a874f` (clean tree). Read-only
> investigation; nothing here has been implemented. Every line number below was
> measured on that commit — re-measure before editing if the file has moved on.

## 0. Verdict first

**Do a reduced subset now. Do not do the big split.**

Concretely: extract the ~180 lines of genuinely pure logic (path, format, sort,
type-mapping, naming, type-ahead) into ONE plain-global script,
`apps/everyday/files/filesx-core.js`, give it a `node --test` suite, and stamp
it into `filesx.html` with a content-hash cache-buster. Leave the CSS, the
markup and the ~2,800 lines of DOM/verb code exactly where they are. Add two
cheap guard tests first, because the delivery path for a split file has a
silent-failure class that inline code does not.

Revisit a larger split only when **both** of these hold (the "trigger"):

1. `docs/files-native.md` Phase 4b (retiring FileBrowser) has shipped, i.e. the
   Native/Classic toggle, `filebrowser-patches.js` and the `/files/` nginx
   location are gone — so the app's *shape* is final and the wrapper contract
   (`files.html` ↔ `filesx.html`) is no longer moving.
2. `filesx.html` has gone one full release cycle (a `VERSION` bump cutting a
   user-visible release) with **no** feature commits touching it — only fixes.

### The evidence behind the verdict

Where the Files-native project stands (`docs/files-native.md`, read in full):

| Fact | Source |
|---|---|
| Phases 0–4a **shipped**. Native is **opt-in**; Classic (FileBrowser) is still the default. | `docs/files-native.md` lines 3–7; `files.html` line 135 (`localStorage['vibetop:filesx'] === '1'`) |
| Native was made default in v1.19.94 and **reverted in v1.19.96** — "the user judged the native view not yet as useful as FileBrowser; both stay offered until the polish gap closes". | `apps/everyday/files/files.html` lines 128–132 |
| Phase 4b (**not started**) is gated on the user living on Native, then a soak. Its footprint is the wrapper toggle, the patch layer, nginx, installers, docs — and in `filesx.html` only the Settings row that links to the classic app (`openManage`, line 3627). | `docs/files-native.md` lines 126–132 |
| "Feature blind spots surface only by living on it … Every audit so far has found things no test would have." — more polish commits to `filesx.html` are expected. | `docs/files-native.md` lines 141–143 |
| The file's churn: **14 releases in three days** (2026-08-28 → 08-30, `v1.19.99`–`v1.19.119`), roughly +1,000 / −200 lines, then **zero content changes** since 08-30 — only the two tree-restructure renames on 09-03. | `git log --follow --numstat -- apps/everyday/files/filesx.html` |
| The candidate pure helpers have barely moved: `normPath`, `fmtSize`, `iconFor`, `freeName`, `relParent` last changed 08-28; `fmtRel`, `kindOf` 08-29; `visibleRows` 08-30. | `git log -L '/function X/,+6:landing/filesx.html' fcc2f29` for each |

So: the app is *feature-complete against parity* but *not yet adopted*, and the
part that is still being iterated is the interaction layer (verbs, pill,
context menu, Settings, editor, layouts) — which is exactly the part that is
**not** unit-testable without a DOM and **would** conflict with in-flight polish
if split. The part that is stable is also the part that unit tests can actually
bite on. That is the whole case for the reduced subset.

Why not "defer entirely": the pure helpers encode contracts that have real
failure modes (natural sort with folders first and A→Z tie-break regardless of
direction; `~`/relative/`..` address-bar normalisation; the `OFF_RE` list that
"must be kept in step with `OFFICE_RE` in the manager" — a cross-file drift
nothing tests today), and they are not going to change shape in Phase 4b.
Pinning them costs one small file and touches ~20 lines of `filesx.html`.

## 1. Non-negotiables (apply to every step)

1. **The security invariant.** The root manager (`server/terminal-manager.py`)
   never reads or writes a user's files; listing, stat, mutations, zip, search,
   hash run **as the user** in `apps/everyday/files/fileagent.py`, reached over
   a `SO_PEERCRED`-checked socket that every `/api/fs/*` route gates with
   `_require_authed()`. **This plan moves nothing across that line.** It is a
   frontend-only refactor: no endpoint changes, no agent changes, no new server
   route, no new data path. If a step ever seems to need one, stop — it is out
   of scope for this plan and is a security change (`docs/files-native.md`
   §Risks).
2. **No build step.** Splitting means an extra `<script src>` tag and a plain
   `window.*` global. Not ES modules: `<script type="module">` is `defer`-by-
   default (changes the run order relative to the inline script), is not what
   any of the 30+ existing pages do, and the service worker / `test_static`
   tooling has never been exercised with `import` graphs. Don't be the first.
3. **Grouped tree, FLAT web root, URLs never change.** `/filesx.html` stays
   `/filesx.html`. Every new file needs a basename unique across `shell/`,
   `shared/`, `apps/**` (the walk in `shell/install.sh` fails on duplicates).
   The full deployed basename set today is:
   `apph.js circuit.html coach.js config.html desktop.html filebrowser-patches.js files.html filesx.html game2048.html gamescore.js imageview.html index.html kbd-input.js keybar.js loggedout.html login.html manifest.json minesweeper.html monitor.html notes.html office-editor.html rts.html rzdbg.html services.example.json solitaire.html sw.js tab-sync.js terminal-kbd.js terminals.html token-stats.html update.html upload.html vibe-modal.js video.html winmgr.js x11launcher.html xpra-patches.js`
   — `filesx-core.js` does not collide. Re-run the check before creating any
   file: `find shell shared apps -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' \) ! -name '*.test.js' ! -path '*/art/*' -printf '%f\n' | sort | uniq -d` must print nothing.
4. **Who deploys what** (verified, both installers read):
   - `shell/install.sh` deploys `filesx.html` **and** `files.html` **and**
     `filebrowser-patches.js` (the latter two via its `RENDERED` table with the
     `apphome` stamp; `filesx.html` via the plain walk, `install -m 644`). It is
     the only installer that will ever deploy `filesx-core.js` — the walk picks
     up `*.js` under `apps/` automatically.
   - `apps/everyday/files/install.sh` deploys **no web files**. It installs the
     FileBrowser binary/ffmpeg, renders `nginx/filebrowser.conf` (computing the
     `filebrowser-patches.js` content-hash `?v=`), and stops running
     `vibetop-fileagent-*` units. Nothing in this plan touches it.
   - The in-app Update redeploys `shell/install.sh` on any change under
     `WEB_SOURCE_DIRS = ("shell/", "shared/", "apps/")`
     (`server/terminal-manager.py` ~line 6431) and additionally runs
     `apps/everyday/files/install.sh` for `apps/everyday/files/` (line 6468,
     harmless here).
5. **nginx.** `filesx.html` is served by the static `location /` in the
   generated site (`server/install.sh` ~line 365: `try_files`, `Cache-Control:
   no-cache, no-store`). It is **not** proxied and **not** `sub_filter`ed —
   the `sub_filter` injection of `filebrowser-patches.js` in
   `apps/everyday/files/nginx/filebrowser.conf` applies only to the proxied
   `/files/` (FileBrowser) locations. Do not confuse the two: the patch file's
   hash is computed by `files/install.sh` and never bumped by hand; the new
   `filesx-core.js` will get its own hash, computed by `shell/install.sh`.
6. **Service worker.** `shell/sw.js` `VERSION` is `v533` today. `/filesx.html`
   is **not** in `PRECACHE` (only the wrapper `/files.html` is), so the native
   page is a non-shell navigation: network-only, never cached. Any `*.js` it
   loads, however, falls into the SW's **sub-resource branch: cache-first,
   stale-while-revalidate** (sw.js lines 131–145) — see §4.1 for why that
   forces the hash.
7. **Script load order.** Classic scripts execute in document order. The new
   `<script src>` must sit immediately **before** the inline `<script>` that
   opens at line 887 and **after** all the markup (the inline IIFE does
   `getElementById` at lines 903–915 and wires listeners at 3799–3844, so it
   already depends on the DOM being parsed). Never move either script into
   `<head>`.

## 2. What is actually in the file (measured)

| Region | Lines | Notes |
|---|---|---|
| `<style>` | 7–764 (~757) | Media queries at 179 (`hover:hover`), **324, 396, 613, 663** (`max-width:736px`), 644 (`hover:none`), 759 (`max-width:360px`). The ≤736px mobile layout (8-column icon grid toolbar → clickable breadcrumb `#crumbs` → single-row address bar `#addr`) lives at 663–758. |
| `<body>` markup | 766–886 (~120) | Toolbar, crumbs, address bar, `#main`, preview/editor/PDF overlays, action pill. |
| `<script>` IIFE | 887–3865 (~2,978) | One closure. 259 DOM touches, 7 `fetch(` sites (plus `api()`/`fsop()` wrappers), 17 `localStorage` sites. |

Inside the IIFE, the code that is **pure** (no DOM, no fetch, no storage, no
closure state other than what can be passed in) — with its current dependence
on closure variables noted:

| Function / constant | Lines | Closure state used | New pure signature |
|---|---|---|---|
| `IMG_RE VID_RE OFF_RE AUD_RE ARC_RE` | 896–901 | — | exported as-is |
| `enc(p)`, `dec(s)` | 979–982 | — | as-is |
| `baseOf(p)`, `joinPath(dir,name)` | 983–984 | — | as-is |
| `normPath(input)` | 987–1001 | `HOME`, `path` | `normPath(input, home, cwd)` |
| `fmtSize(n)` | 1003–1008 | — | as-is |
| `fmtRel(ts, short)` | 1009–1025 | `exactDates`, `Date.now()` | `fmtRel(ts, short, exact, nowMs)` |
| `iconFor(name, isDir)` | 1041–1053 | the regexes | as-is |
| sort+filter body of `visibleRows()` | 1153–1169 | `filterText showHidden sortKey sortAsc entries` | `filterEntries(entries, showHidden, q)` + `compareEntries(sortKey, sortAsc)` (returns a comparator) |
| `expiryText(ts)` | 2833–2838 | `Date.now()` | `expiryText(ts, nowMs)` |
| the "base (n).ext" candidate inside `freeName` | 2320–2322 | — | `numberedName(name, n)` (the stat-probing `freeName` itself stays: it fetches) |
| type-ahead scan | 2629–2640 | `rows`, `anchor` | `typeAheadIndex(names, q, from)` → index or −1 |
| `KIND_MAP`, `kindOf(name, isDir)` | 2959–2986 | — | as-is |
| `fmtMode(mode)` | 2987–2991 | — | as-is |
| `fmtExact(ts)` | 2992–2994 | — | as-is (locale output — move, don't assert its string) |
| `relParent(abs)` | 3422–3427 | `path` | `relParent(abs, cwd)` |

That is the whole extractable set: **~180 lines**. Everything else —
`renderList`, `renderActions`, the pill/context menu, selection, drag, the
editor (`ed*`, 3148–3390), search, share, Info, uploads, Trash, Settings —
touches the DOM or the network on nearly every line and is also the part still
receiving features. It stays.

Honesty about the outcome: this takes `filesx.html` from 3,867 to roughly
3,690 lines. **This is a testability move, not a size move.** If the goal were
"a smaller file", the answer would be "wait for the trigger in §0".

## 3. Test story

### What exists today

- `tests/e2e/tests/files-native.spec.js` — behaviour contracts (touch
  tap-selects, desktop context menu, layouts, thumbnails, pill). Drives
  `/filesx.html` directly, seeds `/tmp/vibetop-e2e-filesx` through `/api/fs/*`.
- `tests/e2e/tests/files-native-layout.spec.js` — geometry audit at five widths.
- `tests/e2e/tests/layout.spec.js` — lists `/filesx.html` in `PAGES` (line 24).
- `server/tests/test_api_fs.py`, `test_api_image.py`, `test_fileagent.py` —
  the backend. Untouched by this plan.
- `shell/js-syntax.test.js` — `vm.Script`-parses every `*.js` under
  `shell/ shared/ apps/` (minus `*.test.js`) **and** every inline `<script>`
  block of every `*.html`. A new `filesx-core.js` is covered the day it lands.
- `server/tests/test_static.py` — `_web_sources()` resolves deployables by
  basename (`.html .js .json .png .ico`); `test_landing_html_parses_and_local_refs_resolve`
  checks **relative** `src=`/`href=` refs resolve (it deliberately skips refs
  starting with `/`); `test_every_precache_entry_has_a_source_file`;
  `test_every_template_placeholder_is_stamped` — which scans **only**
  `*/nginx/*` and `*/systemd/*`, not HTML pages.
- **No `node --test` covers a single line of `filesx.html` logic today.**

### Discovery: how a new test gets run

`run-tests.sh` line 61: `find shell shared apps server -name '*.test.js'` →
`node --test "${JS_TESTS[@]}"`. So `apps/everyday/files/filesx-core.test.js`
is picked up with no registration, and the pre-commit hook (`.githooks/
pre-commit` → `./run-tests.sh`) runs it. Run one file with
`node --test apps/everyday/files/filesx-core.test.js` (pass FILES, never a
directory — `docs/testing.md` line 142).

### Module shape — copy the precedent exactly

`apps/everyday/terminal/lib/tab-sync.js` is the house pattern for "pure logic
pulled out of a page": a UMD-ish wrapper —

```js
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;   // node test
  else root.FilesxCore = api;                                               // browser
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // ... moved functions, verbatim bodies ...
  return { IMG_RE, VID_RE, OFF_RE, AUD_RE, ARC_RE, KIND_MAP,
           enc, dec, baseOf, joinPath, normPath, fmtSize, fmtRel, fmtExact, fmtMode,
           iconFor, kindOf, filterEntries, compareEntries, expiryText, numberedName,
           typeAheadIndex, relParent };
});
```

— tested with a plain `require('./filesx-core.js')` (`tab-sync.test.js`
line 12). No vm sandbox needed (unlike `gamescore.test.js`, which has to stub a
DOM because that IIFE assigns `window.vibeScores`). Keep the module `"use
strict"`: none of the moved functions use `this`, `arguments` aliasing or
implicit globals (checked), so strictness changes nothing.

### What the tests must assert (and the tautology warning)

A test is worth writing only if it pins a behaviour that is **documented,
was once a bug, or is a cross-file contract** — and only if you have watched it
**fail** against a deliberately broken copy first (`prove-regression-test-
against-broken-build`). "Assert the function returns what the function
returns" is not a test.

| Test | Assertion | Why it is not tautological |
|---|---|---|
| `compareEntries`: folders first | `[file, dir]` sorts to `[dir, file]` for every `sortKey`, both directions | Pins the comment at line 1161. Break it by deleting the `isDir` line and watch it fail. |
| `compareEntries`: natural sort | `['file10','file2']` → `['file2','file10']` (the `numeric:true` collation); `'B'` vs `'a'` is case-insensitive (`sensitivity:'base'`) | Both options are easy to drop by "simplifying". |
| `compareEntries`: ties break by name **A→Z regardless of direction** | two entries of equal size, `sortKey:'size', sortAsc:false` → name order still ascending | The line-1167 rule; it is exactly the kind of thing a refactor "normalises" away. |
| `filterEntries`: dotfiles | `.bashrc` hidden when `showHidden=false`, shown when `true`; query match is case-insensitive substring | Pins the Settings toggle contract. |
| `normPath` | `'~'`→home; `'~/x'`→`home/x`; relative `'a/../b'` from cwd `/c` → `/c/b`; `'//x//y'` → `/x/y`; `'..'` at `/` stays `/`; `''`/whitespace → `null`; `path` unset + relative → `/rel` | Address-bar contract (`docs/files-native.md` §"What the app does today"). |
| `fmtSize` | `0`→`'0 B'`, `1023`→`'1023 B'`, `1024`→`'1.0 KB'`, `10*1024`→`'10 KB'`, `1536`→`'1.5 KB'`, 5 TB stays `TB` (no overflow past the unit table) | The `<10 → one decimal` rule and the unit-table clamp. |
| `fmtRel` | with an injected `nowMs`: 30 s → `'just now'`/`'now'`; 90 s → `'2m ago'`/`'2m'`; 3 h; 3 d. **Do not assert the `toLocaleDateString` branches or `fmtExact`** — locale-dependent, flaky across machines. `exact=true` must call through to a `Date` (assert it is *not* one of the relative strings). | The short/long pairs are a mobile contract (line 1011 comment). |
| `fmtMode` | `0o755`→`'rwxr-xr-x'`, `0o600`→`'rw-------'`, `0o777`, `0` | Bit-twiddling that is trivially inverted by a typo. |
| `kindOf` | `'a.PNG'`→`'PNG image'` (case-fold); unknown `'x.zzz'`→`'ZZZ file'`; no dot → `'File'`; dotfile `.bashrc` → `'File'` (the `dot > 0` guard); dir → `'Folder'` | The `dot > 0` guard is the subtle one. |
| `iconFor` / regexes | one sample per class; `OFF_RE` matches `.csv` and `.rtf` (the line-898 comment says the narrow list was a bug) | Pins a fixed bug. |
| **`OFF_RE` drift** | read `server/terminal-manager.py`, extract the `OFFICE_RE = re.compile(r"…" r"…")` string (lines 679–681, two concatenated raw strings), pull the extension alternation, compare the **set** of alternatives to `OFF_RE.source`'s | The comment at line 898 says "Kept in step with OFFICE_RE in terminal-manager.py" — nothing enforces it. This is the highest-value test in the file. Prove it by adding `|foo` to one side. |
| `numberedName` | `('a.txt',2)`→`'a (2).txt'`; `('a',2)`→`'a (2)'`; `('.hidden',2)`→`'.hidden (2)'` (dotfile: `dot>0` false, so the suffix goes at the end); `('a.tar.gz',3)`→`'a.tar (3).gz'` (documents current behaviour — do not "fix" it in this step) | Upload-conflict rename contract. |
| `typeAheadIndex` | fresh keystroke scans from `anchor+1` and wraps; repeat of the same letter cycles; extended buffer re-scans from `anchor`; no match → −1; prefix match only (`indexOf(q) === 0`) | The line-2622–2625 comment describes exactly this; it is easy to regress to "first match from 0". |
| `relParent` | hit in cwd → `''`; hit in `cwd/sub` → `'sub'`; hit outside cwd → absolute dir; cwd `/` | Search-result display contract. |
| `expiryText` | ≤0 → `'Expired'`; 2d 3h → `'Expires in 2d 3h'`; 3h 5m → `'Expires in 3h 5m'`; 5m → `'Expires in 5m'` | Share dialog contract. |
| `enc`/`dec` | round-trip `'/a b/c#d/%'`; `dec` tolerates a malformed `%` segment (returns it raw — the try/catch at line 981) | The catch branch is the bit that matters. |

Do **not** write: "`joinPath('/a','b') === '/a/b'`" alone (write the `'/'` root
case: `joinPath('/','b') === '/b'`, not `'//b'`); "`IMG_RE.test('x.png')`" alone
(add the negative `'x.png.txt'`); anything that reads the expected value back
out of the module's own constant table.

## 4. The steps

Each step is one commit that leaves the app working. Smallest risk first.

### Step 0 — guard tests for the delivery path (no product change)

Why first: a split file introduces two silent-failure modes that inline code
cannot have — a `<script src>` that 404s, and a `@TOKEN@` cache-buster that
ships literally (a **constant** cache key: every later edit served stale
forever, the exact `?v=0` class in `docs/design-decisions.md` §"Repo-path
references break SILENTLY"). Neither is caught today.

Files modified:
- `server/tests/test_static.py` — add two tests next to
  `test_every_template_placeholder_is_stamped` (line 159):
  1. `test_no_deployed_page_ships_a_literal_placeholder`: for every
     `*.html`/`*.js` returned by `_web_sources()`, every `_TOKEN_RE` match
     (`@[A-Z0-9_]+@`, line 148) must appear in the concatenated text of
     `_installers()`. Skip `filebrowser-patches.js`'s `@APP_HOME@`? No — it IS
     stamped by both installers, so it passes naturally. Expect it to be green
     on `main` (verify `terminals.html`'s `@SYNC_VER@` resolves via
     `server/install.sh`). **Prove it bites:** temporarily add `@NOPE@` to any
     page, run, watch it fail, revert.
  2. `test_root_level_script_refs_resolve`: parse every deployable `*.html` with
     the same `html.parser` subclass used at line 331; for each `src`/`href`
     matching `^/[^/?#]+\.(js|json)(\?.*)?$` (a **single-segment** web-root
     asset — this excludes proxied prefixes like `/api/…`, `/onlyoffice/…`,
     `/files/…`), assert the basename is in `_web_sources()`. Today this covers
     `/vibe-modal.js /coach.js /winmgr.js /keybar.js /apph.js /tab-sync.js` and
     must be green. **Prove it bites** by pointing one at `/nope.js`.
- `shell/sw.test.js` — one small addition to the classification tests:
  `classify('/filesx.html','navigate') === 'navigate'` (network-only, not
  shell, not bypass — the BYPASS regex is `files/` *with* a slash precisely so
  `/files.html` and `/filesx*` escape it) and
  `classify('/filesx-core.js','no-cors') === 'subresrc'`. Low value on its own;
  it exists so a future BYPASS edit (`files/` → `files`) that silently turns the
  native app into a bypassed path is named in a failing test.

No `sw.js` change, no `VERSION` bump (tests only). Acceptance:
`./run-tests.sh` green; the two "prove it bites" mutations each produced a
failure with a message naming the offending file.

### Step 1 — extract `filesx-core.js` + its tests + the hash stamp

**Files created**
- `apps/everyday/files/filesx-core.js` — the UMD-ish module of §3, public
  surface `window.FilesxCore` (browser) / `module.exports` (node). Header
  comment: what it is, that bodies are moved verbatim from `filesx.html`, the
  "keep it pure — no DOM, no fetch, no storage" rule, and the load-order note.
- `apps/everyday/files/filesx-core.test.js` — the table in §3. Excluded from
  deploy by the walk's `! -name '*.test.js'`; discovered by `run-tests.sh`.

**Files modified**
- `apps/everyday/files/filesx.html`:
  - Insert, between line 886 (`</div>` closing the last overlay) and line 887
    (`<script>`), preceded by a two-line comment mirroring `terminals.html`
    lines 213–214:
    ```html
    <!-- Pure path/format/sort helpers (unit-tested in filesx-core.test.js).
         Content-hash ?v= is stamped by shell/install.sh (RENDERED, mode fsxver). -->
    <script src="filesx-core.js?v=@FSX_VER@"></script>
    ```
    **Relative** `src` on purpose: the page is served at `/filesx.html`, so it
    resolves to `/filesx-core.js`, and it is what the games do for
    `gamescore.js` — which means `test_landing_html_parses_and_local_refs_resolve`
    (which strips `?…` and falls back to the web-root basename) covers it
    today, in addition to Step 0's absolute-ref test.
  - Replace lines 896–901 (the five regex `var`s) with the alias block:
    ```js
    var C = window.FilesxCore;
    if (!C) {                       // deploy/cache fault: say so, don't white-screen
      var m0 = document.getElementById('main');
      if (m0) m0.textContent = 'Files could not load filesx-core.js — reload the page.';
      return;
    }
    var IMG_RE = C.IMG_RE, VID_RE = C.VID_RE, OFF_RE = C.OFF_RE, AUD_RE = C.AUD_RE, ARC_RE = C.ARC_RE;
    var enc = C.enc, dec = C.dec, baseOf = C.baseOf, joinPath = C.joinPath;
    var fmtSize = C.fmtSize, fmtMode = C.fmtMode, fmtExact = C.fmtExact;
    var iconFor = C.iconFor, kindOf = C.kindOf, KIND_MAP = C.KIND_MAP;
    ```
    **No silent fallback implementation** (unlike `terminals.html`'s
    `TabSync ||` shim). A second copy of the logic is the thing being removed;
    a visible one-line error is the honest degradation, and the hash in §4.1
    makes the fault essentially unreachable.
  - Delete lines 979–984 (`enc dec baseOf joinPath`), 1003–1025 (`fmtSize
    fmtRel`), 1041–1053 (`iconFor`), 2959–2994 (`KIND_MAP kindOf fmtMode
    fmtExact`), 2833–2838 (`expiryText`), 3422–3427 (`relParent`), and the
    body of 987–1001 (`normPath`). Replace the closure-dependent ones with
    one-line wrappers **at the same place they were**, so nothing else in the
    file moves:
    ```js
    function normPath(input) { return C.normPath(input, HOME, path); }
    function fmtRel(ts, short) { return C.fmtRel(ts, short, exactDates, Date.now()); }
    function relParent(abs) { return C.relParent(abs, path); }
    function expiryText(ts) { return C.expiryText(ts, Date.now()); }
    ```
  - `visibleRows()` (1153–1169) becomes
    `return C.filterEntries(entries, showHidden, filterText).sort(C.compareEntries(sortKey, sortAsc));`
    (`filterEntries` returns a fresh array, so the in-place sort is safe).
  - `freeName`'s inner candidate (2320–2322) becomes `var next = C.numberedName(name, n);`.
  - The type-ahead loop (2633–2640) becomes
    `var hit = C.typeAheadIndex(rows.map(function(r){return r.name;}), q, from); if (hit >= 0) { ev.preventDefault(); setOnly(hit); } return;`
    — keep the `from` computation (line 2632) in the page; it reads `anchor`.
  - Hoisting note: the aliases are `var` **assignments**, not declarations, so
    they are live only after the alias block executes — but every call site is
    inside a function or in the init block at 3845–3863, all of which run after
    the top of the IIFE. Do not put a call to any alias between line 888 and
    the alias block.
- `shell/install.sh`:
  - Add to `RENDERED` (lines 63–69): `apps/everyday/files/filesx.html|filesx.html|fsxver`.
    Because `RENDERED` entries are skipped by the walk (`case "$PLAN" in *"$rel|"*)`),
    this replaces the plain copy; the duplicate-basename check still covers it.
  - Add a stamp function and a `case` arm, modelled on `stamp_apphome` and on
    `server/install.sh` lines 628–643 (`SYNC_VER`):
    ```bash
    FSX_CORE="$REPO/apps/everyday/files/filesx-core.js"
    if [ ! -f "$FSX_CORE" ]; then
      echo "shell/install.sh: $FSX_CORE missing — refusing to stamp a constant ?v= into filesx.html" >&2
      exit 1
    fi
    FSX_VER=$(md5sum "$FSX_CORE" | cut -c1-10)
    stamp_fsxver() { sed -e "s/@FSX_VER@/$FSX_VER/g" "$1" > "$2"; chmod 644 "$2"; }
    ```
    and in the dispatch loop
    `fsxver) … stamp_fsxver "$REPO/$src" "$DST_DIR/$dst" ;;` with a `DRY_RUN`
    print like the others. **Never** `|| echo 0` — that is the documented
    constant-cache-key trap.
- `shell/sw.js`: `VERSION` `v533` → `v534` (see §4.1). `PRECACHE` **unchanged**
  — `/filesx.html` is not precached, so precaching only its helper would buy
  nothing offline and would add a second cache-key to reason about.
- `docs/files-native.md` line 69: "the whole app, one file, inline JS" → name
  the two files and the stamp. `CLAUDE.md` line 95 ("`apps/everyday/files/filesx.html`
  the Files app" in the "each frontend is one self-contained file" sentence):
  add "(+ `filesx-core.js`, its unit-tested pure helpers)". `docs/testing.md`
  line 40–45 JS list: add `filesx-core.test.js`.
- `docs/design-decisions.md`: one entry (Symptom → Cause → Fix → Rejected):
  *Files-native helpers split out with a content-hash `?v=` because the SW's
  SWR branch would otherwise serve a stale helper under fresh HTML for one
  load; rejected: ES modules (defer semantics, no precedent), PRECACHE-ing
  (page itself isn't), a fallback copy (duplicate logic).* Then
  `python3 tools/gen-dd-toc.py` (a test fails if you forget).

**Commit subject convention:** `v1.19.NNN: Files — filesx-core.js, the pure helpers unit-tested (sw v533->v534)`
with the root `VERSION` bumped in the same commit **only if** cutting a
release; otherwise no `VERSION` bump but still the sw bump (the sw bump is
mandatory for any served-bytes change).

#### 4.1 Why the hash, in one paragraph

`filesx.html` is network-only (not a SHELL page), so a deploy changes it on the
very next open. Any `*.js` it loads is served by the SW **cache-first** (sw.js
line 133 onward) — so after a deploy the old helper is served under the new
HTML for at least one load. "Just bump `VERSION`" does not close that window:
on the reload the SSE signal triggers, the page's sub-resource requests are
answered by the **old** SW while the new one is still installing (the
`activate` that deletes `shell-v533` runs after `install` finishes
precaching), so that first reload still gets the stale helper. A new
`?v=<hash>` is a new cache key → miss → network, under either SW. It is the
same reason `tab-sync.js`, `kbd-input.js` and `filebrowser-patches.js` carry
hashes. The `VERSION` bump is still required (it is the deploy signal that
tells open tabs to reload at all).

#### Acceptance for Step 1

Automated:
```bash
./run-tests.sh                                            # everything, incl. the new node file + Step 0 guards
node --test apps/everyday/files/filesx-core.test.js       # the new suite alone
DRY_RUN=1 ./shell/install.sh | grep -E 'filesx'           # expect: "+ render apps/everyday/files/filesx.html -> filesx.html (@FSX_VER@ -> <10 hex>)"
                                                          #     and "+ install -m 644 .../filesx-core.js .../filesx-core.js"
```
Then — **before** committing the tests — the mutation proofs from §3: delete
the folders-first line in `compareEntries`, add `|foo` to `OFF_RE`, change
`numberedName` to always append: each must turn exactly the relevant test red.

After deploy (standing authorisation: push, then Update / `./deploy.sh`; the
Update runs `shell/install.sh` because `apps/` was touched):
```bash
curl -s http://127.0.0.1/filesx.html | grep -o 'filesx-core.js?v=[0-9a-f]\{10\}'   # stamped, not literal @FSX_VER@
curl -sI http://127.0.0.1/filesx-core.js | head -1                                  # HTTP/1.1 200
```
(`location /` is not auth-gated for static pages — their data is gated at `/api`.)

Manual click-path (Native toggled on in the Files tab bar; do it on a desktop
browser AND at ≤736px in devtools or a phone lane):
1. Files opens at Home; breadcrumb shows home-icon › `/` › `home` › `<user>`;
   click `/` in the crumbs → root listing (`renderCrumbs`/`go` unaffected).
2. Address bar: type `~/Downloads` + Enter → navigates; type `../..` + Enter →
   two levels up; type `//etc//` → `/etc` (`normPath` wrapper).
3. Sort menu → "Size (large→small)": folders still listed first, equal-size
   files in A→Z (the comparator).
4. Toggle hidden files in Settings: dotfiles appear/disappear (`filterEntries`).
5. Type `d` then `d` quickly in the listing: selection cycles between names
   starting with `d` (`typeAheadIndex`).
6. Rename a file; New Folder; upload a file whose name already exists → the
   conflict dialog's "Keep both" produces `name (2).ext` (`numberedName`).
7. **Double-click an `.mp4`** → the video player opens as an overlay INSIDE
   Files (the wrapper's `video-view` message handler, `files.html` ~line 421);
   Esc / close returns to the listing. Same for a `.png` (image viewer) and a
   `.docx` (office preview). These prove `VID_RE/IMG_RE/OFF_RE` still classify.
8. Get Info on `a.PNG` → Kind "PNG image", Permissions like `rw-r--r--`
   (`kindOf`, `fmtMode`); on a folder → "Folder".
9. Share a file → the card says "Expires in 6d 23h" (or similar) for 7 days
   (`expiryText`).
10. Search by name for a term with a hit in a sub-folder → the result's grey
    parent reads `sub/dir`, not an absolute path (`relParent`).
11. At ≤736px: toolbar is the 8-column icon grid, the clickable breadcrumb is
    above the single-row `[←][→][ path ][Copy]` address bar; nothing changed
    (no CSS was touched — this is the regression canary, not a feature check).

e2e (delegate the VM run per `vm-e2e-runs-go-to-a-subagent`; the fast local
path is fine for these specs because they never drive xpra):
```bash
cd tests/e2e && VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test tests/files-native.spec.js tests/files-native-layout.spec.js --project=desktop-chromium
tests/e2e/run-vm.sh tests/files-native.spec.js tests/files-native-layout.spec.js tests/layout.spec.js   # full lanes, in the KVM VM
```

### Step 2 — (deferred; do NOT start until the §0 trigger holds) the DOM layers

Listed so the executor knows what was considered and why it waits:

- `filesx-editor.js` — the text editor (`ed*`, lines 3148–3390, ~240 lines +
  the `#ed` markup and `.ed-*` CSS). DOM-bound; not unit-testable without a
  DOM harness; last got a feature (find/replace, gutter) on 08-29. Wait.
- `filesx-verbs.js` — Trash/Move picker/clipboard/upload (1810–2540). The most
  actively iterated region (Trash landed 08-30). Wait.
- Moving `fbToAbs`/`absToFb`/`labelFor` from `files.html` (lines 136–170) into
  `filesx-core.js` so the wrapper shares the path helpers. **Not** in Step 1
  because `files.html` IS in `PRECACHE` (a shell page, cached offline), so the
  moment it loads a `<script src>` that file must be added to `PRECACHE` too
  or the cached wrapper breaks on a cold offline start. Phase 4b rewrites the
  wrapper anyway (the toggle goes) — do it then, with the PRECACHE line.

## 5. The CSS question — leave it inline

Extract or leave? **Leave**, and here is the proof of the delivery path either
way:

- **No precedent.** There is not one `.css` file in the repo
  (`find . -name '*.css'` → nothing outside `node_modules`); every page inlines
  its styles. The other 3,000+-line pages (`desktop.html`, `rts.html`,
  `terminals.html`) do the same.
- **The walk would not deploy it.** `shell/install.sh`'s `find` pattern is
  `-name '*.html' -o -name '*.js' -o -name '*.json'` (line 103). A `.css`
  needs the pattern extended, **and** `test_static._web_sources()` extended
  (it filters to `.html .js .json .png .ico`), **and**
  `test_web_redeploy_trigger_covers_every_dir_the_installer_walks` re-read —
  three places that fail silently if one is missed (the file just doesn't
  deploy, or the tests just don't see it). nginx would serve it fine
  (`text/css` is in the default `mime.types`), and the SW would SWR-cache it —
  the same one-load-stale class as §4.1, needing the same hash stamp.
- **Cost on every tab.** `files.html` opens one `filesx.html` iframe per tab.
  Inline CSS paints styled on the first frame; a `<link rel=stylesheet>` is a
  render-blocking fetch per iframe (SW-cached after the first, but a new
  request per tab regardless).
- **Nothing gains testability.** CSS has no `node --test` story; its test is
  `files-native-layout.spec.js`, which measures the rendered page and is
  indifferent to where the rules live.
- **The mobile layout is a known-fragile, deliberately-iterated design**
  (`memory: files-mobile-layout`; `docs/apps.md` line 24; DD §"Mobile Files
  app: toolbar, clickable breadcrumb, folder-nav recovery"). At ≤736px the
  order is sticky 8-column icon-grid toolbar (`.tools`, lines 663–758) →
  **clickable breadcrumb** (`#crumbs` / `.crumb`, a row of `<button>`s built by
  `renderCrumbs`) → **editable address bar** (`#addr`, an `<input>` with
  `[←][→]…[Copy]`). Those are two different controls and have been confused
  before; a CSS move that reorders rules could change cascade order between
  the four `max-width:736px` blocks (324, 396, 613, 663) and the `hover:none`
  block (644) without any diff looking wrong. Zero upside, real downside.

If CSS *readability* is the itch: reorder/section-comment **within** the
existing `<style>` block only, keeping every `@media` block's relative order,
and run `files-native-layout.spec.js` at all five widths before and after. That
is allowed at any time; it changes no delivery path.

## 6. Risks, silent failures, rollback

### Every place that addresses these files by name (the "nine references" sweep)

| Where | What it says today | Change in this plan |
|---|---|---|
| `shell/sw.js` `PRECACHE` (lines 23–42) | `/files.html` (wrapper). `/filesx.html` **not** listed. | none — do not add either file |
| `shell/sw.js` `BYPASS` (line 52) | `files\/` (with slash) | none; Step 0 pins `/filesx*` classification |
| `shell/sw.js` `VERSION` | `v533` | `v534` in Step 1 |
| `shell/install.sh` walk + `RENDERED` | `filesx.html` plain-copied by the walk | Step 1: `RENDERED` line + `fsxver` stamp; `filesx-core.js` arrives via the walk |
| `apps/everyday/files/install.sh` | no web files; computes `@PATCH_VER@` for `filebrowser-patches.js` only | none |
| `apps/everyday/files/nginx/filebrowser.conf` | `/files/`, `/fileview/` only; `sub_filter` on proxied HTML | none — `filesx*` is static under `location /` |
| `server/install.sh` site heredoc | `location /` static, `no-store` | none |
| `server/terminal-manager.py` `WEB_SOURCE_DIRS` (~6431) / files trigger (6468) | `apps/` → `shell/install.sh`; `apps/everyday/files/` → files installer | none (already covers the new file) |
| `shell/desktop.html` `APPS` (line 1222) | `files: { src: '/files.html' }` | none |
| `apps/everyday/files/files.html` | `'/filesx.html#' + …` (147), `loc.pathname === '/filesx.html'` (155) | none — URL unchanged |
| `tests/e2e/tests/layout.spec.js` (24), `files-native.spec.js` (63,66), `files-native-layout.spec.js` (41,44) | `page.goto('/filesx.html…')` | none |
| `tests/e2e/tests/files-native.spec.js` line 2 comment | says `landing/filesx.html` — stale since 09-03 | fix the comment while there |
| `shell/js-syntax.test.js` | walks `*.js` + inline `<script>` blocks | none — auto-covers the new file |
| `server/tests/test_static.py` `_web_sources()` | basename map over `.html .js .json .png .ico` | none — auto-covers `filesx-core.js`; Step 0 adds two tests |
| `docs/files-native.md` (69), `CLAUDE.md` (95), `docs/testing.md` (40–45) | "one file, inline JS" | Step 1 doc edits |

### What breaks silently, and the guard for each

| Failure | Symptom | Guard |
|---|---|---|
| `@FSX_VER@` ships literally (walk copies instead of `RENDERED`, or a `\|\| echo 0`) | constant cache key → stale helper forever after any later edit | Step 0 test 1; installer exits non-zero if the core file is missing; `DRY_RUN` line shows the hash |
| `<script src>` typo / file not deployed | app renders the one-line error instead of a listing | the explicit `if (!C)` message; Step 0 test 2; `test_landing_html_parses_and_local_refs_resolve` |
| Stale helper under new HTML | a `TypeError` on a function the old helper lacks — blank listing on the first load after a deploy | the content hash (§4.1) |
| Forgot the sw `VERSION` bump | open tabs never get the reload signal; new visitors are fine | the release checklist in `CLAUDE.md`; the commit-subject `(sw vNN->vNN)` convention |
| A moved function still reads closure state (e.g. `path`) | `ReferenceError` in the module only on the code path that hits it | the module is `"use strict"` inside a factory with **no** outer scope — any leftover free variable throws at first call; the unit tests call every export |
| Alias block placed after a top-level use | `TypeError: enc is not a function` at load | none needed if the block replaces lines 896–901 as specified; the e2e `openFiles` helper (`waitForSelector('.row')`) fails within 20 s |
| Duplicate basename | `shell/install.sh` **exits 1** — loud, by design | re-run the `uniq -d` one-liner from §1.3 |
| Hash changes on every deploy even when the helper didn't | only the `?v=` in the served HTML differs — harmless (HTML is network-only anyway) | — |

### Rollback

`git revert <step-1 commit>`, bump `shell/sw.js` `VERSION` again in the revert
(so open tabs reload back onto the inline build), push, Update. The
`filesx-core.js` left in the web root is inert (nothing references it) and the
next `shell/install.sh` run does not remove stray files — delete
`<web root>/filesx-core.js` by hand on the reference host
(`/opt/vibetop/vibetop-www/`, per `z20-prod-www-and-deploy-path`) if tidiness
matters. Step 0 needs no rollback; its tests remain valid without Step 1.

## 7. Do not do this

- **Do not** restructure the DOM/verb layer, the editor, the pill or the
  context menu now — that is Step 2, gated on the §0 trigger, and it is where
  the in-flight polish lands.
- **Do not** extract the CSS (§5), and do not reorder `@media (max-width:
  736px)` blocks relative to each other or to the `@media (hover: none)` block.
- **Do not** use `<script type="module">` / `import`. Plain global, classic
  script, before the inline block.
- **Do not** add `/filesx.html` or `/filesx-core.js` to `PRECACHE` "for
  offline". The native app needs `/api/fs/*` for everything; a cached shell of
  it is an error page. Changing the page's caching class is a separate
  decision with its own SW test changes.
- **Do not** write `FSX_VER=$(… || echo 0)`. Missing file → exit 1.
- **Do not** bump `@PATCH_VER@`/`filebrowser-patches.js` hashes by hand or
  touch `apps/everyday/files/install.sh` / `nginx/filebrowser.conf` — that is
  the FileBrowser (Classic) path and is unrelated to the native page.
- **Do not** add a fallback copy of the helpers inside `filesx.html` "in case
  the module fails to load" — two implementations is the disease.
- **Do not** "fix" behaviours while moving them (e.g. `numberedName('a.tar.gz')`
  → `'a (2).tar.gz'`, or making `fmtRel` locale-stable). Move verbatim, pin
  current behaviour, change behaviour in a separate commit with its own test.
- **Do not** move anything between the frontend, the manager and
  `fileagent.py`. Not one line.
- **Do not** deploy before the commit that bumps `sw.js` is pushed (release
  checklist order in `CLAUDE.md`), and do not run `shell/install.sh` over a
  dirty prod checkout (`shared-checkout-release-hazard`).
- **Do not** trust "the tests still pass" after Step 1 until you have seen
  each new test fail against its mutation, and until `curl` shows a ten-hex
  `?v=` in the served `filesx.html`.

## Appendix A — commands in order (for the executor)

```bash
# Step 0
$EDITOR server/tests/test_static.py shell/sw.test.js
./run-tests.sh                                   # green; then the two "prove it bites" mutations, then green again
git commit -m "tests: deployed pages may not ship a literal @TOKEN@; root-level <script src> must resolve"

# Step 1
find shell shared apps -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' \) ! -name '*.test.js' ! -path '*/art/*' -printf '%f\n' | sort | uniq -d   # must print nothing
$EDITOR apps/everyday/files/filesx-core.js apps/everyday/files/filesx-core.test.js
node --test apps/everyday/files/filesx-core.test.js
$EDITOR apps/everyday/files/filesx.html          # tag before line 887; alias block replaces 896–901; wrappers in place
$EDITOR shell/install.sh                         # RENDERED line + FSX_VER + stamp_fsxver + case arm
$EDITOR shell/sw.js                              # VERSION v533 -> v534
$EDITOR docs/files-native.md CLAUDE.md docs/testing.md docs/design-decisions.md tests/e2e/tests/files-native.spec.js
python3 tools/gen-dd-toc.py
DRY_RUN=1 ./shell/install.sh | grep -E 'filesx'  # render line with a 10-hex hash + the core.js install line
./run-tests.sh
git commit -m "v1.19.NNN: Files — filesx-core.js, the pure helpers unit-tested (sw v533->v534)"
git push                                          # THEN deploy (Update app / ./deploy.sh); never deploy first
curl -s http://127.0.0.1/filesx.html | grep -o 'filesx-core.js?v=[0-9a-f]\{10\}'
cd tests/e2e && VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test tests/files-native.spec.js tests/files-native-layout.spec.js --project=desktop-chromium
```

## Appendix B — a side finding, not part of this plan

`terminals.html` carries `@SYNC_VER@` (line 215), stamped by
`server/install.sh` (lines 628–643) — but `shell/install.sh`'s walk **also**
matches `apps/everyday/terminal/terminals.html` (plain copy, literal token) and
`deploy.sh` runs `server/install.sh` (line 144) **before** `shell/install.sh`
(172/174). The deployed copies on this host are stamped (`?v=90813b45b5` in
both `~/vibetop-www` and `/opt/vibetop/vibetop-www`), so it is not broken
today, but nothing tests the ordering and the two installers disagree about who
owns the file. Step 0's placeholder test does **not** catch this (the token IS
stamped by *an* installer); a follow-up should either add `terminals.html` to
`shell/install.sh`'s `RENDERED` with its own `SYNC_VER` computation, or exclude
`apps/everyday/terminal/` from the walk. Flagged here because it is the exact
mechanism Step 1 relies on for `@FSX_VER@` — which is why Step 1 keeps the
stamp inside the one installer that deploys the page.
