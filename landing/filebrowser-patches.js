(function() {
  // Remember the last folder across refreshes. The shell always (re)loads the
  // Files app at /files/, so without this every refresh snaps back to home.
  // FileBrowser is same-origin with the shell, so localStorage persists across
  // iframe reloads. Restore runs first (before the rest of the patch sets up),
  // and may navigate away — in which case we bail out of the rest.
  var FILES_LAST_KEY = "vibetop:files:lastpath";
  function rememberLocation() {
    // Only remember real browse routes (not /files/settings, /login…).
    if (!/\/files\/files(\/|$)/.test(location.pathname)) return;
    // Don't remember an office/video file we opened (it auto-launches the viewer /
    // player) — remember the folder we were in, so a refresh returns to the listing.
    if (OFFICE_RE.test(location.pathname) || VIDEO_RE.test(location.pathname)) return;
    try { localStorage.setItem(FILES_LAST_KEY, location.pathname + location.search); } catch (e) {}
  }
  // Inside the tabbed Files wrapper (files.html), each tab iframe is named
  // "fbtab" and opened directly at its own path; the wrapper owns path memory,
  // so the single-key restore below must NOT run (it would yank every tab to one
  // saved path). window.name survives the SPA's in-iframe navigations.
  var IN_TABS = false;
  try { IN_TABS = (window.name === "fbtab"); } catch (e) {}
  var _ATTEMPT_KEY = "vibetop:files:attempt";
  var _curPath = location.pathname + location.search;
  var _base = location.pathname.replace(/\/+$/, "");
  var _atRoot = (!IN_TABS && (_base === "/files" || _base === "/files/files"));
  var _saved, _attempt;
  try { _saved = localStorage.getItem(FILES_LAST_KEY); } catch (e) {}
  try { _attempt = sessionStorage.getItem(_ATTEMPT_KEY); } catch (e) {}
  if (_atRoot) {
    if (_saved && _attempt === _saved) {
      // We kicked off a restore to _saved but we're (still/again) at root — it
      // never settled: a bad/slow/stale saved path that hangs the listing on
      // first open. PURGE it so Files stops hanging and re-learns from the next
      // real navigation. (Previously the marker only BLOCKED a re-restore, so the
      // app loaded fine on reopen but hung again on every fresh session, leaving
      // the bad path in localStorage forever — the "keeps loading first time"
      // bug. Self-healing instead.)
      try { localStorage.removeItem(FILES_LAST_KEY); } catch (e) {}
      try { sessionStorage.removeItem(_ATTEMPT_KEY); } catch (e) {}
    } else if (_saved) {
      var _savedBase = _saved.split("?")[0].replace(/\/+$/, "");
      var _savedIsRoot = (_savedBase === "/files" || _savedBase === "/files/files");
      // Restore the last folder. Record the target first; if it doesn't settle
      // (bounce to root, or a hang followed by a reopen), the check above purges
      // it next time instead of retrying forever.
      if (!_savedIsRoot && _saved !== _curPath) {
        try { sessionStorage.setItem(_ATTEMPT_KEY, _saved); } catch (e) {}
        location.replace(_saved);
        return;
      }
    }
  } else {
    // Settled on a real (non-root) folder — the restore succeeded; clear the
    // marker so the next refresh is free to restore again.
    try { sessionStorage.removeItem(_ATTEMPT_KEY); } catch (e) {}
  }

  // Permanent action buttons: always visible, greyed out when no file selected.
  // When clicked, they delegate to Vue's actual button if it exists.
  var PERMANENT_BUTTONS = [
    // Always-enabled refresh — re-fetches the current folder listing. Files is
    // always (re)opened at /files/ but the location-memory restore brings us
    // back to the saved folder, so a plain reload lands on the same listing.
    { icon: "refresh", label: "Refresh", refresh: true },
    { icon: "public", label: "Browser", custom: true },
    // Share = OUR passwordless public link (not FileBrowser's Access-gated share):
    // a read-only /s/<token> URL reachable without login. Works for files AND
    // folders (a folder downloads as a .zip). See terminal-manager.py /api/share.
    { icon: "share", label: "Share", share: true },
    { icon: "mode_edit", label: "Rename" },
    // Copy/Paste are an OS-style clipboard (Copy stashes the selection here, Paste
    // drops it into the folder you navigate to) — replacing FileBrowser's native
    // Copy, which pops a destination-picker dialog. Paste is enabled only when the
    // clipboard has something.
    { icon: "content_copy", label: "Copy", copy: true },
    { icon: "content_paste", label: "Paste", paste: true },
    { icon: "forward", label: "Move" },
    { icon: "delete", label: "Delete" },
    { icon: "file_download", label: "Download" },
    // Always-enabled layout toggle — cycles FileBrowser's list/grid view modes.
    // (FileBrowser HAS this natively, but its button shows a dynamic icon and
    // got buried among the wrapped action buttons; surface it explicitly.)
    { icon: "grid_view", label: "Layout", view: true }
  ];
  // FileBrowser's native view switcher renders ONE of these icons (it changes
  // with the current mode). We hide the native button and drive switchView from
  // the permanent Layout button so the toggle is always discoverable.
  var VIEW_ICONS = { grid_view: 1, view_module: 1, view_list: 1, view_comfy: 1,
                     view_comfy_alt: 1, view_compact: 1, mosaic: 1 };

  var style = document.createElement("style");
  style.textContent = [
    "header .action.fb-permanent { display: inline-flex !important; flex-direction: column !important; align-items: center !important; border-radius: 4px !important; padding: 2px 6px !important; min-width: 0 !important; width: auto !important; }",
    "header .action.fb-permanent span:not(.counter) { display: block !important; font-size: 11px !important; line-height: 1.2 !important; text-align: center !important; padding: 0 !important; max-width: 60px !important; word-wrap: break-word !important; overflow-wrap: break-word !important; white-space: normal !important; }",
    "header .action.fb-permanent i { font-size: 20px !important; margin: 0 !important; padding: 2px !important; display: block !important; }",
    "header .action.fb-permanent .counter { position: absolute !important; top: -4px !important; right: -4px !important; bottom: auto !important; left: auto !important; }",
    "header #dropdown .action { display: inline-flex !important; flex-direction: column !important; align-items: center !important; border-radius: 4px !important; padding: 2px 6px !important; min-width: 0 !important; width: auto !important; }",
    "header #dropdown .action span:not(.counter) { display: block !important; font-size: 11px !important; line-height: 1.2 !important; text-align: center !important; padding: 0 !important; max-width: 60px !important; word-wrap: break-word !important; overflow-wrap: break-word !important; white-space: normal !important; }",
    "header #dropdown .action i { font-size: 20px !important; margin: 0 !important; padding: 2px !important; display: block !important; }",
    "header .fb-permanent.disabled { opacity: 0.25 !important; pointer-events: none !important; }",
    // Mobile control bar — an even GRID (5 columns): every action is a uniform
    // cell, icon OVER its text label, and ALL buttons stay visible (the ones that
    // need a selection are greyed, never removed). Icon AND text kept, per the
    // user's ask; the only change from desktop is the LAYOUT. The header is
    // IN-FLOW + sticky (not position:fixed), so the content (breadcrumb / address
    // bar / listing) always flows BELOW it — overlap is impossible — and a grid
    // never needs horizontal scroll. This replaces the two rejected designs (a
    // wrapped fixed header that buried the address bar; a single-row bar that ran
    // buttons off-screen). #dropdown is display:contents so its native buttons
    // (Upload/Info/Select) fall into the SAME grid as one flat set. Verified on
    // WebKit (iOS engine): 15 cells, 2 rows (~89px), no overlap, no horiz scroll.
    // 8 columns keeps it to TWO rows so the toolbar doesn't eat the screen.
    "@media (max-width: 736px) {",
    "  header { display: grid !important; grid-template-columns: repeat(8, 1fr) !important; gap: 2px 1px !important; align-items: start !important; position: sticky !important; top: 0 !important; z-index: 50 !important; width: auto !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; padding: 4px 4px !important; background: var(--surfacePrimary, #fff) !important; border-bottom: 1px solid rgba(128,128,128,0.25) !important; box-shadow: none !important; }",
    // The 64px body padding-top existed to clear the old FIXED header; with the
    // header in-flow it is dead space — reclaim it. :has() guards the editor /
    // previewer (they keep a fixed 4em header); unsupported browsers just keep the
    // old padding (dead space, no breakage).
    "  body:not(:has(#editor-container)):not(:has(#previewer)) { padding-top: 0 !important; }",
    // Hide FB's breadcrumb on mobile: its path duplicates the editable address bar
    // right below the toolbar, and removing it puts the TOOLBAR at the very top
    // (the breadcrumb otherwise renders above it). One path display, toolbar on top.
    "  body:not(:has(#editor-container)):not(:has(#previewer)) .breadcrumbs { display: none !important; }",
    // FB renders a literal <title> element inside the header as a flex-grow spacer.
    "  header > title { display: none !important; }",
    // display:contents dissolves the #dropdown box so its buttons become grid
    // cells of the header itself (one flat, uniform set).
    "  header #dropdown { display: contents !important; }",
    // Each action = a centered icon-over-label cell.
    "  header .action, header #dropdown .action, header .action.fb-permanent { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: flex-start !important; gap: 1px !important; width: auto !important; min-width: 0 !important; max-width: none !important; height: auto !important; margin: 0 !important; padding: 3px 1px !important; border-radius: 6px !important; }",
    // Icon + label sizes must include the #dropdown selectors, else the base
    // `header #dropdown .action {i,span}` rules (higher specificity, the #dropdown
    // id) win and the native Upload/Info/Select render bigger than the rest — the
    // "sizes aren't consistent" report. One size for every icon, one for every
    // label; 9px labels (a touch bigger than before, using the spare row height)
    // without wrapping "Download" at 8 columns.
    "  header .action i, header .action.fb-permanent i, header #dropdown .action i { font-size: 20px !important; width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; }",
    "  header .action span:not(.counter), header .action.fb-permanent span:not(.counter), header #dropdown .action span:not(.counter) { font-size: 9px !important; line-height: 1.1 !important; text-align: center !important; max-width: 100% !important; white-space: normal !important; word-break: break-word !important; display: block !important; margin: 0 !important; }",
    // Relabel FB's verbose native "Toggle sidebar" to a clean "Menu"; Search keeps
    // its own label. (The sidebar holds My files / New folder / New file.)
    "  header .action.menu-button span:not(.counter) { display: none !important; }",
    "  header .action.menu-button::after { content: \"Menu\"; font-size: 9px; line-height: 1.1; }",
    // ALL buttons stay visible: GREY the disabled ones (don't hide them), so the
    // grid is stable and every action is discoverable; selecting a file lights the
    // selection actions up. (Overrides the desktop opacity/pointer-events rule.)
    "  header .fb-permanent.disabled { display: flex !important; opacity: 0.3 !important; pointer-events: none !important; }",
    // Drop the squashed native duplicates (hideVueButtons -> inline
    // position:absolute; Switch view, native Download) so they don't linger as
    // invisible, tappable phantoms overlapping the grid.
    "  header #dropdown .action[style*=\"position:absolute\"], header #dropdown .action[style*=\"position: absolute\"] { display: none !important; }",
    // The office Edit button hides itself via inline display:none — let that win.
    "  header .fb-office[style*=\"display: none\"] { display: none !important; }",
    // Hide FileBrowser's "..." / more-actions trigger (every action is in the grid).
    "  header > .action[aria-haspopup], header .action.show-more, header > .action.more, header > .action[title=\"More\"], header > .action[aria-label=\"More\"] { display: none !important; }",
    // Editor / previewer keep a FIXED single-row 4em header (grid off) since they
    // hard-code padding-top:4em clearance and only carry a few buttons.
    "  #editor-container header, #previewer header { display: flex !important; grid-template-columns: none !important; position: fixed !important; top: 0 !important; flex-wrap: nowrap !important; height: 4em !important; min-height: 0 !important; max-height: none !important; padding: 0 0.5em !important; border-bottom: none !important; }",
    "  main { margin-top: 0 !important; padding-top: 0 !important; }",
    "}",
    // Hide FileBrowser's selection-action popups: #file-selection is the
    // bottom-floating "X selected · [icons]" bar that appears on mobile when a
    // file is tapped; .context-menu is the right-click / long-press menu.
    // Every action already lives in the top toolbar, so both are redundant.
    "#file-selection, .context-menu { display: none !important; }",
    // FileBrowser runs with --auth.method=noauth, so its login view (#login) is
    // never a real destination — it just briefly mounts while the SPA
    // auto-authenticates, flashing a login form before redirecting to the file
    // listing. Hide it so that flash isn't visible. (display:none doesn't stop
    // the Vue component mounting, so the auto-login it triggers still runs.)
    "#login { display: none !important; }",
    // Address bar: the current full path as a selectable/copyable + typable
    // field (FileBrowser only shows a breadcrumb of links). Sits at the top of
    // the listing; Enter navigates, Copy copies. Theme-agnostic (color:inherit).
    "#fb-addrbar { display:flex; align-items:center; gap:6px; padding:6px 10px; box-sizing:border-box; width:100%; border-bottom:1px solid rgba(128,128,128,0.25); }",
    "#fb-addrbar input { flex:1 1 auto; min-width:0; font:13px ui-monospace,Menlo,Consolas,monospace; padding:6px 8px; border:1px solid rgba(128,128,128,0.45); border-radius:6px; background:rgba(128,128,128,0.06); color:inherit; }",
    "#fb-addrbar .fb-addr-btn { flex:0 0 auto; cursor:pointer; white-space:nowrap; border:1px solid rgba(128,128,128,0.45); border-radius:6px; background:transparent; color:inherit; padding:6px 10px; font:13px system-ui,sans-serif; }",
    // Browser-style Back/Forward arrows at the head of the address bar. Compact,
    // icon-only, with a comfortable tap target on touch (min 40px wide, taller on
    // phones). Disabled state dims + drops the pointer (best-effort, since the
    // History API can't report whether back/forward is actually available).
    "#fb-addrbar .fb-nav-btn { padding:6px; min-width:40px; display:inline-flex; align-items:center; justify-content:center; }",
    "#fb-addrbar .fb-nav-btn .material-icons { font-size:19px; line-height:1; }",
    "#fb-addrbar .fb-nav-btn:active { background:rgba(128,128,128,0.14); }",
    // Mobile: keep the address bar on ONE row — [<][>][ path ][Copy] together —
    // directly beneath the toolbar (the breadcrumb is hidden on mobile, so the
    // toolbar is the top element and this bar sits right under it). The path field
    // grows to fill and is scrolled to its END (see updateAddressBar/revealPathTail)
    // so the current FOLDER is always visible even though it's narrower than
    // full-width. Just touch-sized padding here; no wrap.
    "@media (max-width:736px){ #fb-addrbar { gap:6px; padding:8px 10px; } #fb-addrbar input { flex:1 1 auto; min-width:0; padding:9px 10px; font-size:14px; } #fb-addrbar .fb-nav-btn { min-width:44px; padding:9px 6px; } #fb-addrbar .fb-addr-btn { padding:9px 12px; } }",
    // Keep dotfiles out of LISTINGS (clean), while the server now ALLOWS access to
    // them (hideDotfiles is off server-side — see terminal-manager.py). FileBrowser
    // labels each listing item with aria-label=<filename>, so this hides names that
    // start with a dot in both list and mosaic views. Access still works: typing a
    // dotfile path in the address bar navigates straight in.
    "#listing [aria-label^='.'] { display:none !important; }",
    // Paste progress toast (a server-side copy of a big file takes a few seconds;
    // this makes it obvious it's working instead of looking dead).
    "#fb-paste-toast { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:2147483000; display:flex; align-items:center; gap:10px; padding:11px 16px; border-radius:11px; background:#12161d; color:#e6edf3; border:1px solid #2a3444; box-shadow:0 8px 30px rgba(0,0,0,.5); font:500 13px system-ui,sans-serif; }",
    "#fb-paste-toast .fb-spin { width:15px; height:15px; border:2px solid rgba(255,255,255,0.25); border-top-color:#4a86e8; border-radius:50%; animation:fbspin 0.8s linear infinite; flex:0 0 auto; }",
    "@keyframes fbspin { to { transform:rotate(360deg); } }",
  ].join("\n");
  document.head.appendChild(style);

  // Office files (Word/Excel/PPT/ODF) get an Edit toolbar button (opens the
  // OnlyOffice editor), shown only when such a file is selected. There is NO
  // "View" button: double-click (desktop) / tap (touch) already opens the
  // read-only viewer, so a separate View button just duplicated the gesture.
  var OFFICE_RE = /\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|ppsx?|ppsm|potx?|potm|odt|ods|odp|ott|ots|otp|rtf|csv|tsv)$/i;
  // Video files open in vibetop's in-Files player (video.html) instead of
  // FileBrowser's plain <video> previewer — which can't play .mkv/.avi and offers
  // no audio/subtitle track selection. Double-click/tap posts a `video-view`.
  var VIDEO_RE = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|ogv|mpg|mpeg|ts|m2ts|3gp)$/i;
  var OFFICE_BUTTONS = [
    { icon: "border_color", label: "Edit", act: "office-edit" }
  ];

  var RENAMES = {
    "Select multiple": "Select", "Switch view": "View", "Toggle sidebar": "Menu",
    "Select Multiple": "Select", "Switch View": "View", "Toggle Sidebar": "Menu"
  };

  function shortenLabels() {
    document.querySelectorAll("header #dropdown .action span:not(.counter)").forEach(function(span) {
      var text = span.textContent.trim();
      if (RENAMES[text]) span.textContent = RENAMES[text];
    });
  }

  // The permanent action toolbar belongs to the file LISTING only. FileBrowser
  // is a Vue SPA whose <header-bar> (incl. #dropdown) is shared across the
  // listing, the text editor (#editor-container) and the media/PDF previewer
  // (#previewer), so injecting on "#dropdown present" alone leaked our buttons
  // into the editor's toolbar — greyed-out and overlapping the breadcrumb.
  // Gate everything on the listing's own root id instead.
  function isListingView() {
    if (document.getElementById("listing")) return true;   // folder with items
    // EMPTY folder: FileBrowser renders no #listing — just a .message empty-state
    // (icon 'sentiment_dissatisfied'). We still want the toolbar + address bar there
    // (it's exactly where you'd Paste into a new folder). An ERROR page also uses
    // .message but with icon 'gps_off', so key on the icon (language-stable), not text.
    var m = document.querySelector(".message");
    if (m) {
      var ic = m.querySelector("i.material-icons, .material-icons");
      if (ic && (ic.textContent || "").indexOf("sentiment_dissatisfied") !== -1) return true;
    }
    return false;
  }

  // Drop any injected buttons when we leave the listing (editor/preview/error/
  // loading views), so they don't linger in those toolbars. Re-injected by
  // injectPermanentButtons when the listing comes back.
  function removeInjectedButtons() {
    document.querySelectorAll("header .fb-permanent").forEach(function(b) { b.remove(); });
    var ab = document.getElementById("fb-addrbar"); if (ab) ab.remove();
  }

  // Check if any item (file or folder) is selected
  function hasSelection() {
    return !!document.querySelector('[aria-selected="true"]');
  }

  // Get file path for Browser button — only files, not folders
  function getFilePath() {
    var p = location.pathname.replace(/.*\/files\/?/, "");
    if (p && !p.endsWith("/") && !/^(static|api|login|settings)\b/.test(p)) return p;
    var sel = document.querySelector('[aria-selected="true"]:not([data-dir="true"])');
    if (sel) {
      var name = sel.getAttribute("aria-label");
      // p (from location.pathname) is already percent-encoded; encode the raw
      // aria-label name to match, so spaces/#/? survive the /fileview/ URL.
      if (name) return (p || "") + encodeURIComponent(name);
    }
    return null;
  }

  function openInBrowser(filePath) {
    var url = "http://127.0.0.1/fileview/" + filePath;
    fetch("/api/browser/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    });
    try { window.top.postMessage({ type: "switch-to-browser" }, "*"); } catch(e) {}
  }

  // --- Public share links (our passwordless /s/<token>) ---------------------
  // Home path: stamped at deploy in single-user (@APP_HOME@ -> /home/you); empty
  // in the multi-user build (the logged-in user is unknown at deploy), so resolve
  // it once at runtime from /api/me. Used to fence shares to home and to point
  // the "My files" button at the real home below.
  var SHARE_HOME = "@APP_HOME@";
  if (!SHARE_HOME) {
    try {
      fetch("/api/me").then(function(r){ return r.json(); }).then(function(d){
        if (d && d.home) SHARE_HOME = d.home;
      }).catch(function(){});
    } catch (e) {}
  }

  // The selected file/folder as { abs, name, isDir }, or null.
  function selectedItem() {
    var sel = document.querySelector('[aria-selected="true"]');
    if (!sel) return null;
    var name = sel.getAttribute("aria-label");
    if (!name) return null;
    return { abs: currentFullPath().replace(/\/+$/, "") + "/" + name, name: name,
             isDir: sel.getAttribute("data-dir") === "true" };
  }
  // Absolute path -> path relative to home, or null if outside home (shares are
  // fenced to home; the backend enforces this too).
  function toHomeRel(abs) {
    var h = SHARE_HOME.replace(/\/+$/, "");
    if (abs === h) return "";
    if (abs.indexOf(h + "/") === 0) return abs.slice(h.length + 1);
    return null;
  }

  function shareApi(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) {
      return r.json().catch(function(){ return {}; })
              .then(function(j){ return { ok: r.ok, data: j }; });
    });
  }

  function copyText(text, btn) {
    var orig = btn ? btn.textContent : null;
    var done = function(){ if (btn) { btn.textContent = "Copied"; setTimeout(function(){ btn.textContent = orig; }, 1100); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){ legacyCopyText(text); done(); });
    } else { legacyCopyText(text); done(); }
  }
  function legacyCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  var TTL_OPTS = [["1", "1 day"], ["7", "7 days"], ["30", "30 days"], ["0", "Never"]];
  function expiryText(expires) {
    if (!expires) return "Never expires";
    var d = new Date(expires * 1000);
    return "Expires " + d.toLocaleDateString() + " " +
           d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function mkbtn(label, kind) {
    var b = document.createElement("button"); b.type = "button";
    b.className = "vt-share-btn vt-" + (kind || "ghost"); b.textContent = label;
    return b;
  }

  var _shareCss = false;
  function ensureShareCss() {
    if (_shareCss) return; _shareCss = true;
    var st = document.createElement("style");
    st.textContent =
      ".vt-share-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(6,9,14,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:18px;box-sizing:border-box;font-family:system-ui,sans-serif;}" +
      ".vt-share-card{width:100%;max-width:460px;max-height:85vh;overflow:auto;background:#0e1117;color:#e0e0e0;border:1px solid #2a3444;border-radius:12px;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.5);box-sizing:border-box;}" +
      ".vt-share-h{font-size:16px;font-weight:650;color:#eaf0f6;margin-bottom:6px;}" +
      ".vt-share-sub{font-weight:400;color:#8a9aaa;font-size:13px;}" +
      ".vt-share-p{font-size:13px;color:#9fb0c0;line-height:1.45;margin:0 0 12px;}" +
      ".vt-share-row{display:flex;gap:8px;align-items:center;margin-top:10px;}" +
      ".vt-share-end{justify-content:flex-end;flex-wrap:wrap;}" +
      ".vt-share-url{flex:1 1 auto;min-width:0;background:#0b0f15;border:1px solid #2a3444;border-radius:8px;color:#dbe4ee;padding:8px 10px;font:13px ui-monospace,monospace;}" +
      ".vt-share-select{background:#0b0f15;border:1px solid #2a3444;border-radius:8px;color:#dbe4ee;padding:7px 8px;font-size:13px;}" +
      ".vt-share-exp{flex:1 1 auto;font-size:12px;color:#8a9aaa;}" +
      ".vt-share-btn{border:1px solid #2a3444;background:#1a2230;color:#dbe4ee;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;}" +
      ".vt-share-btn:hover{background:#222c3a;}" +
      ".vt-share-btn.vt-primary{background:#2563eb;border-color:#2563eb;color:#fff;}" +
      ".vt-share-btn.vt-primary:hover{background:#1d4ed8;}" +
      ".vt-share-btn.vt-danger{background:transparent;border-color:#7f2d2d;color:#eb9090;}" +
      ".vt-share-btn.vt-danger:hover{background:#3a1e1e;}" +
      ".vt-share-btn.vt-ghost{background:transparent;}" +
      ".vt-share-list{margin-top:10px;display:flex;flex-direction:column;gap:8px;}" +
      ".vt-share-item{display:flex;gap:8px;align-items:center;border:1px solid #222c3a;border-radius:8px;padding:8px 10px;}" +
      ".vt-share-meta{flex:1 1 auto;min-width:0;}" +
      ".vt-share-name{color:#dbe4ee;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".vt-share-tag{background:#222c3a;border-radius:4px;padding:0 5px;margin-left:4px;font-size:11px;color:#9fb0c0;}" +
      ".vt-share-dim{color:#6a7a8a;font-size:12px;}";
    document.head.appendChild(st);
  }

  function modal() {
    ensureShareCss();
    var ov = document.createElement("div"); ov.className = "vt-share-ov";
    var card = document.createElement("div"); card.className = "vt-share-card";
    ov.appendChild(card);
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function(e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    return { card: card, close: close };
  }

  function infoModal(title, msg) {
    var m = modal();
    m.card.innerHTML = '<div class="vt-share-h">' + esc(title) + '</div>' +
                       '<p class="vt-share-p">' + esc(msg) + '</p>';
    var row = document.createElement("div"); row.className = "vt-share-row vt-share-end";
    var ok = mkbtn("OK", "primary"); ok.addEventListener("click", m.close);
    row.appendChild(ok); m.card.appendChild(row);
  }

  function openShareFlow() {
    var it = selectedItem();
    if (!it) return;
    var rel = toHomeRel(it.abs);
    if (rel === null || rel === "") {
      infoModal("Can't share this", "Only files and folders under your home folder can be shared as a public link.");
      return;
    }
    shareApi("POST", "/api/share", { path: rel, ttl: 7 }).then(function(r) {
      if (!r.ok) { infoModal("Share failed", (r.data && r.data.error) || "Could not create the link."); return; }
      shareDialog(r.data, rel);
    });
  }

  function shareDialog(data, rel) {
    var m = modal();
    var token = data.token, kind = data.kind, name = data.name;
    m.card.innerHTML =
      '<div class="vt-share-h">Public link<span class="vt-share-sub"> · ' + esc(name) +
        (kind === "dir" ? " (folder → .zip)" : "") + '</span></div>' +
      '<p class="vt-share-p">Anyone with this link can ' +
        (kind === "dir" ? "download this folder as a zip" : "view or download this file") +
        '. No login required — treat the link like a password.</p>';
    var urlRow = document.createElement("div"); urlRow.className = "vt-share-row";
    var input = document.createElement("input");
    input.className = "vt-share-url"; input.readOnly = true; input.value = data.url;
    input.addEventListener("focus", function(){ input.select(); });
    var copy = mkbtn("Copy", "primary");
    copy.addEventListener("click", function(){ copyText(input.value, copy); });
    urlRow.appendChild(input); urlRow.appendChild(copy);
    m.card.appendChild(urlRow);

    var expRow = document.createElement("div"); expRow.className = "vt-share-row";
    var lbl = document.createElement("span"); lbl.className = "vt-share-exp";
    lbl.textContent = expiryText(data.expires);
    var sel = document.createElement("select"); sel.className = "vt-share-select";
    TTL_OPTS.forEach(function(o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === "7") op.selected = true; sel.appendChild(op);
    });
    sel.addEventListener("change", function() {
      shareApi("POST", "/api/share/revoke", { token: token });   // re-mint with new lifetime
      shareApi("POST", "/api/share", { path: rel, ttl: parseFloat(sel.value) }).then(function(r) {
        if (r.ok) { token = r.data.token; input.value = r.data.url; lbl.textContent = expiryText(r.data.expires); }
      });
    });
    expRow.appendChild(lbl); expRow.appendChild(sel);
    m.card.appendChild(expRow);

    var act = document.createElement("div"); act.className = "vt-share-row vt-share-end";
    var manage = mkbtn("Manage links", "ghost");
    manage.addEventListener("click", function(){ m.close(); manageDialog(); });
    var revoke = mkbtn("Revoke", "danger");
    revoke.addEventListener("click", function(){ shareApi("POST", "/api/share/revoke", { token: token }); m.close(); });
    var done = mkbtn("Done", "primary"); done.addEventListener("click", m.close);
    act.appendChild(manage); act.appendChild(revoke); act.appendChild(done);
    m.card.appendChild(act);
  }

  function manageDialog() {
    var m = modal();
    m.card.innerHTML = '<div class="vt-share-h">Shared links</div>';
    var list = document.createElement("div"); list.className = "vt-share-list";
    list.textContent = "Loading…";
    m.card.appendChild(list);
    var foot = document.createElement("div"); foot.className = "vt-share-row vt-share-end";
    var close = mkbtn("Close", "primary"); close.addEventListener("click", m.close);
    foot.appendChild(close); m.card.appendChild(foot);
    shareApi("GET", "/api/share/list").then(function(r) {
      var shares = (r.data && r.data.shares) || [];
      list.innerHTML = "";
      if (!shares.length) { list.textContent = "No active links."; return; }
      shares.forEach(function(s) {
        var row = document.createElement("div"); row.className = "vt-share-item";
        var meta = document.createElement("div"); meta.className = "vt-share-meta";
        meta.innerHTML =
          '<div class="vt-share-name">' + esc(s.name) +
            (s.kind === "dir" ? ' <span class="vt-share-tag">folder</span>' : "") + '</div>' +
          '<div class="vt-share-dim">' + esc(expiryText(s.expires)) + " · " +
            s.hits + " hit" + (s.hits === 1 ? "" : "s") + '</div>';
        var cbtn = mkbtn("Copy", "ghost");
        cbtn.addEventListener("click", function(){ copyText(s.url, cbtn); });
        var rbtn = mkbtn("Revoke", "danger");
        rbtn.addEventListener("click", function() {
          shareApi("POST", "/api/share/revoke", { token: s.token }).then(function() {
            row.remove();
            if (!list.querySelector(".vt-share-item")) list.textContent = "No active links.";
          });
        });
        row.appendChild(meta); row.appendChild(cbtn); row.appendChild(rbtn);
        list.appendChild(row);
      });
    });
  }

  // Find Vue's actual button by icon name and click it
  function clickVueButton(iconName) {
    var buttons = document.querySelectorAll("header .action:not(.fb-permanent)");
    for (var i = 0; i < buttons.length; i++) {
      var icon = buttons[i].querySelector("i.material-icons");
      if (icon && icon.textContent.trim() === iconName) {
        buttons[i].style.pointerEvents = "";
        buttons[i].click();
        return;
      }
    }
  }

  // Click the native view switcher (matched by its dynamic icon, hidden by
  // hideVueButtons but still programmatically clickable) to cycle the layout.
  function clickViewButton() {
    var buttons = document.querySelectorAll("header .action:not(.fb-permanent)");
    for (var i = 0; i < buttons.length; i++) {
      var icon = buttons[i].querySelector("i.material-icons");
      if (icon && VIEW_ICONS[icon.textContent.trim()]) {
        buttons[i].style.pointerEvents = "";
        buttons[i].click();
        return;
      }
    }
  }

  // --- Address bar: full path, copyable + typable ------------------------
  // The browse URL is /files/files/<path-relative-to-root>; with root="/" that
  // tail IS the absolute path (minus the leading slash). Decode each segment.
  function currentFullPath() {
    var m = location.pathname.match(/\/files\/files(\/.*)?$/);
    var rel = (m && m[1]) ? m[1] : "/";
    var parts = rel.split("/").filter(Boolean).map(function(s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    return "/" + parts.join("/");
  }
  function goToPath(p) {
    if (p == null) return;
    p = p.trim();
    if (!p) return;
    if (p.charAt(0) !== "/") p = "/" + p;            // treat input as absolute
    p = p.replace(/\/{2,}/g, "/");                    // collapse //
    var enc = p.replace(/^\/+/, "").split("/").filter(Boolean)
               .map(encodeURIComponent).join("/");
    location.assign("/files/files/" + enc);          // SPA loads that folder
  }
  function legacyCopy(input) {
    try { input.focus(); input.select(); document.execCommand("copy"); } catch (e) {}
  }
  function injectAddressBar() {
    if (!isListingView()) return;
    // Anchor above the listing, or above the empty-state message when the folder
    // is empty (no #listing) — so the path bar shows in both.
    var anchor = document.getElementById("listing") || document.querySelector(".message");
    if (!anchor || !anchor.parentNode) return;
    if (document.getElementById("fb-addrbar")) return;
    var bar = document.createElement("div");
    bar.id = "fb-addrbar";
    // Back / Forward: drive the iframe's own session history — folder clicks and
    // the address bar's goToPath (location.assign) both push entries, and the
    // location-memory restore uses location.replace (no entry), so back()/forward()
    // walk the folders the user actually visited without escaping the app.
    function navBtn(icon, label, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fb-addr-btn fb-nav-btn";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = '<i class="material-icons">' + icon + '</i>';
      b.addEventListener("click", function () { try { fn(); } catch (e) {} });
      return b;
    }
    var back = navBtn("arrow_back", "Back", function () { history.back(); });
    var fwd = navBtn("arrow_forward", "Forward", function () { history.forward(); });
    var input = document.createElement("input");
    input.id = "fb-addr-input";
    input.type = "text";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-label", "Folder path — edit and press Enter to go");
    input.value = currentFullPath();
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); goToPath(input.value); }
    });
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "fb-addr-btn fb-copy-btn";
    copy.textContent = "Copy";
    copy.title = "Copy the full path";
    copy.addEventListener("click", function() {
      var v = input.value, orig = copy.textContent;
      var done = function() { copy.textContent = "Copied"; setTimeout(function() { copy.textContent = orig; }, 1000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(done, function() { legacyCopy(input); done(); });
      } else { legacyCopy(input); done(); }
    });
    bar.appendChild(back);
    bar.appendChild(fwd);
    bar.appendChild(input);
    bar.appendChild(copy);
    anchor.parentNode.insertBefore(bar, anchor);
    requestAnimationFrame(function () { revealPathTail(input); });   // show the tail on first paint (mobile)
  }
  function updateAddressBar() {
    var input = document.getElementById("fb-addr-input");
    if (!input || document.activeElement === input) return;   // don't clobber mid-type
    var p = currentFullPath();
    // When exactly one item is selected, show its FULL path (incl. the filename) so
    // it's visible + copyable; a folder listing with no selection shows the folder.
    var sel = document.querySelectorAll('[aria-selected="true"]');
    if (sel.length === 1) {
      var name = sel[0].getAttribute("aria-label");
      if (name) p = p.replace(/\/+$/, "") + "/" + name;
    }
    if (input.value !== p) input.value = p;
    revealPathTail(input);
  }
  // On mobile the path field is full-width but a deep path still overflows; the
  // useful part is the END (the current folder), so scroll the input to reveal it
  // rather than the predictable "/home/junjie/…" head. Only when not focused (so
  // editing/caret movement isn't fought) and only on phones (desktop stays
  // head-anchored, URL-bar style). Cheap: a single scrollLeft set.
  function revealPathTail(input) {
    if (!input || document.activeElement === input) return;
    if (window.innerWidth > 736) return;
    try { input.scrollLeft = input.scrollWidth; } catch (e) {}
  }

  // --- Copy/Paste clipboard --------------------------------------------------
  // Copy stashes the selected item(s); Paste copies them into the current folder
  // via FileBrowser's OWN API (the same PATCH its frontend uses), so you can Copy
  // in one folder and Paste in another — no destination-picker dialog.
  //
  // The clipboard is PERSISTED in localStorage, not just an in-memory var: moving
  // to the destination folder (address bar → location.assign, or any reload) throws
  // the page away, which is exactly the copy-here / paste-there flow — an in-memory
  // clipboard would be gone by the time you got there (Paste stuck greyed). Paste's
  // enabled state is recomputed from the stored clipboard on every button refresh.
  var CLIP_KEY = "vibetop:files:clip";
  function readClip() {
    try { var v = JSON.parse(localStorage.getItem(CLIP_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function writeClip(arr) { try { localStorage.setItem(CLIP_KEY, JSON.stringify(arr || [])); } catch (e) {} }
  function selectedItemsAll() {
    var out = [], base = currentFullPath().replace(/\/+$/, "");
    document.querySelectorAll('[aria-selected="true"]').forEach(function(el) {
      var name = el.getAttribute("aria-label");
      if (name) out.push({ name: name, abs: base + "/" + name });
    });
    return out;
  }
  function fbToken() { try { return localStorage.getItem("jwt") || ""; } catch (e) { return ""; } }
  function encFbPath(abs) { return abs.split("/").map(encodeURIComponent).join("/"); }   // encode segments, keep "/"
  function flashBtnLabel(btn, text) {
    var span = btn.querySelector("span"); if (!span) return;
    if (btn._flt) clearTimeout(btn._flt);
    if (btn._orig == null) btn._orig = span.textContent;
    span.textContent = text;
    btn._flt = setTimeout(function() { if (btn._orig != null) { span.textContent = btn._orig; btn._orig = null; } }, 1400);
  }
  function pasteToast(text, spinning) {
    var t = document.getElementById("fb-paste-toast");
    if (!t) { t = document.createElement("div"); t.id = "fb-paste-toast";
      (document.body || document.documentElement).appendChild(t); }
    t.innerHTML = (spinning ? '<span class="fb-spin"></span>' : "") + '<span class="fb-msg"></span>';
    t.querySelector(".fb-msg").textContent = text;
  }
  function hidePasteToast() { var t = document.getElementById("fb-paste-toast"); if (t) t.remove(); }
  function fbSize(abs) {   // current byte size of a file via FileBrowser's own API
    return fetch("/files/api/resources" + encFbPath(abs), { headers: { "X-Auth": fbToken() } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) { return j && typeof j.size === "number" ? j.size : 0; })
      .catch(function() { return 0; });
  }
  var _pasting = false;
  // Real % progress: FileBrowser copies write DIRECTLY to the destination (the file
  // grows), so we poll the dest size against the source size for a true byte-based
  // percentage across all items. onProgress(pct|null, curItem, totalItems).
  function pasteClipboardInto(destDir, items, onProgress, cb) {
    var base = destDir.replace(/\/+$/, ""), tok = fbToken();
    Promise.all(items.map(function(it) { return fbSize(it.abs); })).then(function(sizes) {
      var total = 0; sizes.forEach(function(s) { total += s; });
      var doneBytes = 0, ok = 0, fail = 0, i = 0;
      function pct(cur) { return total > 0 ? Math.min(100, Math.round((doneBytes + cur) / total * 100)) : null; }
      function next() {
        if (i >= items.length) { cb(ok, fail); return; }
        var it = items[i], srcSize = sizes[i], dest = base + "/" + it.name, curNum = i + 1;
        var poll = setInterval(function() {
          fbSize(dest).then(function(ds) { onProgress(pct(Math.min(ds, srcSize)), curNum, items.length); });
        }, 500);
        var url = "/files/api/resources" + encFbPath(it.abs) +
                  "?action=copy&destination=" + encFbPath(dest) + "&override=false&rename=true";
        fetch(url, { method: "PATCH", headers: { "X-Auth": tok } })
          .then(function(r) { if (r.ok) ok++; else fail++; })
          .catch(function() { fail++; })
          .then(function() { clearInterval(poll); doneBytes += srcSize; i++; onProgress(pct(0), i, items.length); next(); });
      }
      if (!items.length) { cb(0, 0); return; }
      onProgress(pct(0), 0, items.length);
      next();
    });
  }

  function injectPermanentButtons() {
    if (!isListingView()) return;   // listing-only toolbar (not editor/preview)
    var header = document.querySelector("header");
    if (!header || header.querySelector(".fb-permanent")) return;
    var dropdown = header.querySelector("#dropdown");
    if (!dropdown) return;

    PERMANENT_BUTTONS.forEach(function(def) {
      var btn = document.createElement("button");
      btn.className = "action fb-permanent disabled";
      btn.title = def.label;
      btn.setAttribute("aria-label", def.label);
      btn.setAttribute("data-icon", def.icon);
      if (def.view || def.refresh) btn.setAttribute("data-always", "1");   // not selection-dependent
      if (def.paste) btn.setAttribute("data-paste", "1");                  // gated on the clipboard, not selection
      btn.innerHTML = '<i class="material-icons">' + def.icon + '</i><span>' + def.label + '</span>';
      btn.addEventListener("click", function() {
        if (btn.classList.contains("disabled")) return;
        if (def.custom) {
          var fp = getFilePath();
          if (fp) openInBrowser(fp);
        } else if (def.share) {
          openShareFlow();
        } else if (def.refresh) {
          location.reload();
        } else if (def.view) {
          clickViewButton();
        } else if (def.copy) {
          var picked = selectedItemsAll();
          if (!picked.length) return;                 // nothing selected (button is greyed anyway)
          writeClip(picked);
          flashBtnLabel(btn, picked.length > 1 ? "Copied " + picked.length : "Copied");
          updatePermanentButtons();                   // enable Paste now (and in other tabs on next refresh)
        } else if (def.paste) {
          if (_pasting) return;
          var clip = readClip();
          if (!clip.length) return;
          _pasting = true;
          var total = clip.length;
          pasteToast("Pasting… 0%", true);
          pasteClipboardInto(currentFullPath(), clip,
            function(pct, cur, tot) {
              var head = tot > 1 ? ("Pasting " + Math.max(1, cur) + "/" + tot + "… ") : "Pasting… ";
              pasteToast(head + (pct == null ? "" : pct + "%"), true);
            },
            function(ok, fail) {
              _pasting = false;
              pasteToast(fail ? ("Pasted " + ok + ", " + fail + " failed") : ("Pasted " + (ok > 1 ? ok : "") + " ✓").replace("  ", " "), false);
              setTimeout(function() { hidePasteToast(); location.reload(); }, 900);   // show the pasted item(s)
            });
        } else {
          clickVueButton(def.icon);
        }
      });
      header.insertBefore(btn, dropdown);
    });
  }

  function injectOfficeButtons() {
    if (!isListingView()) return;   // listing-only toolbar (not editor/preview)
    var header = document.querySelector("header");
    if (!header || header.querySelector(".fb-office")) return;
    // Insert before the action dropdown when present (listing view); on the
    // single-file preview page there's no #dropdown, so append to the header.
    var dropdown = header.querySelector("#dropdown");
    OFFICE_BUTTONS.forEach(function(def) {
      var btn = document.createElement("button");
      btn.className = "action fb-permanent fb-office";
      btn.title = def.label;
      btn.setAttribute("aria-label", def.label);
      btn.setAttribute("data-icon", def.icon);
      btn.style.display = "none";   // shown only for office files
      btn.innerHTML = '<i class="material-icons">' + def.icon + '</i><span>' + def.label + '</span>';
      btn.addEventListener("click", function() {
        var fp = getFilePath();
        if (fp && OFFICE_RE.test(fp)) {
          try { fp = decodeURIComponent(fp); } catch (e) {}
          try { window.top.postMessage({ type: def.act, path: fp }, "*"); } catch (e) {}
        }
      });
      if (dropdown) header.insertBefore(btn, dropdown);
      else header.appendChild(btn);
    });
  }

  // FileBrowser can't preview office files — opening one lands on its "Preview
  // is not available" page. We open OUR viewer instead, and must do so on the
  // SAME gesture FileBrowser uses so office/video files behave like every other
  // type: a single click/tap only SELECTS; DOUBLE click/tap opens — ON TOUCH TOO.
  // (A single tap must never play a video — the user wants tap = select, and only
  // the second tap opens/plays. FileBrowser already selects a file on a single tap
  // on touch, verified, so the first tap just falls through to it.)
  //
  // FileBrowser detects its double-click via plain click events, so we can't just
  // listen for "dblclick" (it fires too late — FileBrowser has already navigated,
  // leaving the dead-end page behind our viewer). Instead we detect the
  // double-click ourselves and block only the SECOND click (so FileBrowser never
  // opens), leaving the first click to select normally. A capture-phase dblclick
  // block is a belt-and-suspenders for any build that opens on the native event.
  function officeItem(e) {
    var item = e.target.closest("[aria-label]");
    if (!item || !item.hasAttribute("data-dir") || item.getAttribute("data-dir") === "true") return null;
    var name = item.getAttribute("aria-label") || "";
    return OFFICE_RE.test(name) ? { item: item, name: name } : null;
  }
  function openOffice(name) {
    postForItem(name, "office-view");
  }
  function videoItem(e) {
    var item = e.target.closest("[aria-label]");
    if (!item || !item.hasAttribute("data-dir") || item.getAttribute("data-dir") === "true") return null;
    var name = item.getAttribute("aria-label") || "";
    return VIDEO_RE.test(name) ? { item: item, name: name } : null;
  }
  function openVideo(name) {
    // Build the item's ABSOLUTE path (FileBrowser root = /) from the current
    // folder via currentFullPath() — the robust helper the Share/address-bar
    // features use. NOT postForItem's location.pathname strip, which drops the
    // folder name when its URL lacks a trailing slash (e.g. .../test_data ->
    // "test_data" mistaken for a filename and stripped, so the file 404s). The
    // manager's _resolve_media_path accepts this absolute form (fenced to home).
    var base = currentFullPath().replace(/\/+$/, "");
    var rel = (base + "/" + name).replace(/^\/+/, "");
    try { window.top.postMessage({ type: "video-view", path: rel }, "*"); } catch (e) {}
  }
  // Turn a listing item name into its home-relative path and hand it to the shell.
  function postForItem(name, type) {
    var dir = location.pathname.replace(/.*\/files\/?/, "");
    if (dir && !/\/$/.test(dir)) dir = dir.replace(/[^/]*$/, "");   // keep just the folder
    var rel = dir + name;
    try { rel = decodeURIComponent(rel); } catch (e) {}
    try { window.top.postMessage({ type: type, path: rel }, "*"); } catch (e) {}
  }
  // Match an office OR video item and remember how to open it.
  function interceptItem(e) {
    var o = officeItem(e);
    if (o) { o.open = openOffice; return o; }
    o = videoItem(e);
    if (o) { o.open = openVideo; return o; }
    return null;
  }
  var _click = { item: null, t: 0 };
  document.addEventListener("click", function(e) {
    var o = interceptItem(e);
    if (!o) return;
    // Touch takes the same path as mouse now: the first tap falls through so
    // FileBrowser selects the file; only a second tap within the window opens it.
    var now = Date.now();
    if (_click.item === o.item && now - _click.t < 450) {   // second click/tap → open
      e.preventDefault(); e.stopPropagation();
      _click.item = null; _click.t = 0;
      o.open(o.name);
    } else {
      _click.item = o.item; _click.t = now;                 // first click → let FB select
    }
  }, true);
  document.addEventListener("dblclick", function(e) {
    if (interceptItem(e)) { e.preventDefault(); e.stopPropagation(); }  // never let FB open it
  }, true);

  // Fallback: if a click slips past the interceptor (unusual DOM) and
  // FileBrowser does land on an office file's page, open our viewer from the
  // URL. No history.back() here — it could leave the iframe on a blank entry;
  // the click path above is what keeps the listing in place.
  var _autoOpened = null;
  function currentOfficeFile() {
    var p = location.pathname.replace(/.*\/files\/?/, "");
    if (!p || /\/$/.test(p)) return null;                // a folder listing, not a file
    if (!OFFICE_RE.test(p)) return null;                 // not an office file
    try { return decodeURIComponent(p); } catch (e) { return p; }
  }
  function maybeAutoOpenOffice() {
    var rel = currentOfficeFile();
    if (!rel) { _autoOpened = null; return; }            // reset when back on a listing
    if (rel === _autoOpened) return;                     // already opened this one
    _autoOpened = rel;
    try { window.top.postMessage({ type: "office-view", path: rel }, "*"); } catch (e) {}
  }
  // Same fallback for a video FileBrowser navigated to (its plain previewer).
  var _autoOpenedVideo = null;
  function currentVideoFile() {
    var p = location.pathname.replace(/.*\/files\/?/, "");
    if (!p || /\/$/.test(p)) return null;                // a folder listing, not a file
    if (!VIDEO_RE.test(p)) return null;                  // not a video file
    try { return decodeURIComponent(p); } catch (e) { return p; }
  }
  function maybeAutoOpenVideo() {
    var rel = currentVideoFile();
    if (!rel) { _autoOpenedVideo = null; return; }       // reset when back on a listing
    if (rel === _autoOpenedVideo) return;                // already opened this one
    _autoOpenedVideo = rel;
    try { window.top.postMessage({ type: "video-view", path: rel }, "*"); } catch (e) {}
  }

  function updateOfficeButtons() {
    var fp = getFilePath();
    var show = !!(fp && OFFICE_RE.test(fp));
    document.querySelectorAll("header .fb-office").forEach(function(btn) {
      btn.style.display = show ? "" : "none";
      btn.classList.remove("disabled");
    });
  }

  function updatePermanentButtons() {
    var selected = hasSelection();
    var filePath = getFilePath();
    document.querySelectorAll("header .fb-permanent:not(.fb-office)").forEach(function(btn) {
      // Paste is enabled whenever the (persisted) clipboard has items — independent
      // of the current selection, and surviving navigation to the destination folder.
      if (btn.getAttribute("data-paste")) {
        var nclip = readClip().length;
        btn.classList.toggle("disabled", nclip === 0);
        btn.title = nclip ? ("Paste " + nclip + " item" + (nclip > 1 ? "s" : "") + " here") : "Paste";
        return;
      }
      // The Layout toggle is always available (not selection-dependent).
      if (btn.getAttribute("data-always")) { btn.classList.remove("disabled"); return; }
      var icon = btn.getAttribute("data-icon");
      // Browser button only active for files, not folders
      var active = icon === "public" ? !!filePath : selected;
      if (active) btn.classList.remove("disabled");
      else btn.classList.add("disabled");
    });
  }

  // Hide Vue's dynamic buttons — find any .action in header that isn't ours
  var DYNAMIC_ICON_SET = {};
  PERMANENT_BUTTONS.forEach(function(b) { DYNAMIC_ICON_SET[b.icon] = true; });

  function hideVueButtons() {
    document.querySelectorAll("header .action:not(.fb-permanent)").forEach(function(btn) {
      var icon = btn.querySelector("i.material-icons");
      var name = icon && icon.textContent.trim();
      // Hide the native originals we replace with permanent buttons, plus the
      // native view switcher (driven by the permanent Layout button instead).
      if (name && (DYNAMIC_ICON_SET[name] || VIEW_ICONS[name])) {
        btn.style.cssText = "position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;opacity:0!important;";
      }
    });
  }

  var patching = false;
  function patchAll() {
    if (patching) return;
    patching = true;
    rememberLocation();
    maybeAutoOpenOffice();
    maybeAutoOpenVideo();
    // Outside the listing (text editor, media previewer, error/loading views)
    // the action toolbar doesn't belong — strip any leftover buttons and stop,
    // so they don't overlap the editor's own toolbar/breadcrumb.
    if (!isListingView()) { removeInjectedButtons(); patching = false; return; }
    shortenLabels();
    injectPermanentButtons();
    injectOfficeButtons();
    injectAddressBar();
    updatePermanentButtons();
    updateOfficeButtons();
    updateAddressBar();
    hideVueButtons();
    patching = false;
  }

  // Vue emits bursts of mutations; coalesce them into one sweep per animation
  // frame instead of running patchAll on every single mutation. The observer
  // covers DOM structure + selection changes, so the old always-on 2s polling
  // fallback is unnecessary.
  var scheduled = false;
  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() { scheduled = false; patchAll(); });
  }
  // FileBrowser's root is "/" (the whole filesystem, so the app can browse /), so
  // its built-in "My files" button navigates to "/". Redirect it to the user's HOME
  // instead — matching where the Files app's tabs open. Capture phase so we beat
  // FileBrowser's own Vue click handler (stopImmediatePropagation blocks it), and
  // reuse goToPath for the SPA navigation. SHARE_HOME is the real home path
  // (stamped in single-user, resolved from /api/me in multi-user); "/" is a safe
  // fallback if it hasn't resolved yet.
  document.addEventListener("click", function(e) {
    var btn = e.target.closest && e.target.closest("button.action");
    if (!btn) return;
    var lbl = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
    if (lbl !== "my files") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    goToPath(SHARE_HOME || "/");
  }, true);

  var observer = new MutationObserver(schedulePatch);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  schedulePatch();
})();
