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
    // Don't remember an office file we opened (it auto-launches the viewer) —
    // remember the folder we were in, so a refresh returns to the listing.
    if (OFFICE_RE.test(location.pathname)) return;
    try { localStorage.setItem(FILES_LAST_KEY, location.pathname + location.search); } catch (e) {}
  }
  var _ATTEMPT_KEY = "vibetop:files:attempt";
  var _curPath = location.pathname + location.search;
  var _base = location.pathname.replace(/\/+$/, "");
  var _atRoot = (_base === "/files" || _base === "/files/files");
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
    { icon: "share", label: "Share" },
    { icon: "mode_edit", label: "Rename" },
    { icon: "content_copy", label: "Copy" },
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
    // Mobile: let the action toolbar wrap to multiple rows instead of clipping
    // buttons off the right edge OR collapsing them into a "..." overflow menu.
    // FileBrowser's stock behavior on narrow viewports is to hide extras inside
    // a popup #dropdown opened by a "more" button; we instead force #dropdown
    // to render inline + wrapped and hide the more-button so every action is
    // visible without an extra tap.
    "@media (max-width: 736px) {",
    "  header { flex-wrap: wrap !important; height: auto !important; min-height: 4em !important; row-gap: 4px !important; padding-top: 4px !important; padding-bottom: 4px !important; }",
    // The text editor (#editor-container) and media previewer (#previewer)
    // hard-code `padding-top: 4em` to clear the FIXED 4em header. Our wrap/grow
    // rule above must NOT apply to THEIR header: a taller header overflows that
    // 4em reservation and hides the top line(s) of the file with no way to
    // scroll up. Pin their header to exactly 4em, single row.
    "  #editor-container header, #previewer header { flex-wrap: nowrap !important; height: 4em !important; min-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; row-gap: 0 !important; }",
    "  header #dropdown { display: flex !important; flex-wrap: wrap !important; position: static !important; visibility: visible !important; opacity: 1 !important; transform: none !important; box-shadow: none !important; background: transparent !important; height: auto !important; max-height: none !important; row-gap: 4px !important; padding: 0 !important; }",
    "  header .action, header .action.fb-permanent { flex: 0 0 auto !important; }",
    // Hide FileBrowser's "..." / more-actions trigger so the dropdown buttons
    // stay flattened into the header instead of being a popup.
    "  header > .action[aria-haspopup], header .action.show-more, header > .action.more, header > .action[title=\"More\"], header > .action[aria-label=\"More\"] { display: none !important; }",
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
  ].join("\n");
  document.head.appendChild(style);

  // Office files (Word/Excel/PPT/ODF) get two extra toolbar buttons, shown only
  // when such a file is open: View (server renders a read-only PDF in the shell)
  // and Edit (opens it in LibreOffice on the Browser desktop). Both delegate to
  // the parent shell, which holds the Cloudflare Access cookie for /api calls.
  var OFFICE_RE = /\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|ppsx?|ppsm|potx?|potm|odt|ods|odp|ott|ots|otp|rtf|csv|tsv)$/i;
  var OFFICE_BUTTONS = [
    { icon: "visibility", label: "View", act: "office-view" },
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
    return !!document.getElementById("listing");
  }

  // Drop any injected buttons when we leave the listing (editor/preview/error/
  // loading views), so they don't linger in those toolbars. Re-injected by
  // injectPermanentButtons when the listing comes back.
  function removeInjectedButtons() {
    document.querySelectorAll("header .fb-permanent").forEach(function(b) { b.remove(); });
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
      if (name) return (p || "") + name;
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
      btn.innerHTML = '<i class="material-icons">' + def.icon + '</i><span>' + def.label + '</span>';
      btn.addEventListener("click", function() {
        if (btn.classList.contains("disabled")) return;
        if (def.custom) {
          var fp = getFilePath();
          if (fp) openInBrowser(fp);
        } else if (def.refresh) {
          location.reload();
        } else if (def.view) {
          clickViewButton();
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
  // SAME gesture FileBrowser uses so office files behave like every other type:
  // single click only SELECTS, double-click opens (desktop); a tap opens (touch).
  //
  // FileBrowser detects its double-click via plain click events, so we can't just
  // listen for "dblclick" (it fires too late — FileBrowser has already navigated,
  // leaving the dead-end page behind our viewer). Instead we detect the
  // double-click ourselves and block only the SECOND click (so FileBrowser never
  // opens), leaving the first click to select normally. A capture-phase dblclick
  // block is a belt-and-suspenders for any build that opens on the native event.
  var IS_TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  function officeItem(e) {
    var item = e.target.closest("[aria-label]");
    if (!item || !item.hasAttribute("data-dir") || item.getAttribute("data-dir") === "true") return null;
    var name = item.getAttribute("aria-label") || "";
    return OFFICE_RE.test(name) ? { item: item, name: name } : null;
  }
  function openOffice(name) {
    var dir = location.pathname.replace(/.*\/files\/?/, "");
    if (dir && !/\/$/.test(dir)) dir = dir.replace(/[^/]*$/, "");   // keep just the folder
    var rel = dir + name;
    try { rel = decodeURIComponent(rel); } catch (e) {}
    try { window.top.postMessage({ type: "office-view", path: rel }, "*"); } catch (e) {}
  }
  var _click = { item: null, t: 0 };
  document.addEventListener("click", function(e) {
    var o = officeItem(e);
    if (!o) return;
    if (IS_TOUCH) { e.preventDefault(); e.stopPropagation(); openOffice(o.name); return; }
    var now = Date.now();
    if (_click.item === o.item && now - _click.t < 450) {   // second click → open
      e.preventDefault(); e.stopPropagation();
      _click.item = null; _click.t = 0;
      openOffice(o.name);
    } else {
      _click.item = o.item; _click.t = now;                 // first click → let FB select
    }
  }, true);
  document.addEventListener("dblclick", function(e) {
    if (officeItem(e)) { e.preventDefault(); e.stopPropagation(); }  // never let FB open it
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
    // Outside the listing (text editor, media previewer, error/loading views)
    // the action toolbar doesn't belong — strip any leftover buttons and stop,
    // so they don't overlap the editor's own toolbar/breadcrumb.
    if (!isListingView()) { removeInjectedButtons(); patching = false; return; }
    shortenLabels();
    injectPermanentButtons();
    injectOfficeButtons();
    updatePermanentButtons();
    updateOfficeButtons();
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
  var observer = new MutationObserver(schedulePatch);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  schedulePatch();
})();
