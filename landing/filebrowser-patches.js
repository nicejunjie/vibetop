(function() {
  // Permanent action buttons: always visible, greyed out when no file selected.
  // When clicked, they delegate to Vue's actual button if it exists.
  var PERMANENT_BUTTONS = [
    { icon: "public", label: "Browser", custom: true },
    { icon: "share", label: "Share" },
    { icon: "mode_edit", label: "Rename" },
    { icon: "content_copy", label: "Copy" },
    { icon: "forward", label: "Move" },
    { icon: "delete", label: "Delete" },
    { icon: "file_download", label: "Download" }
  ];

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
    // buttons off the right edge. FileBrowser's header is a single nowrap flex
    // row by default; on narrow viewports we relax that and grow the header
    // height to accommodate however many rows are needed.
    "@media (max-width: 736px) {",
    "  header { flex-wrap: wrap !important; height: auto !important; min-height: 4em !important; row-gap: 4px !important; padding-top: 4px !important; padding-bottom: 4px !important; }",
    "  header #dropdown { flex-wrap: wrap !important; height: auto !important; row-gap: 4px !important; }",
    "  header .action, header .action.fb-permanent { flex: 0 0 auto !important; }",
    // FileBrowser uses a fixed top offset on the main content equal to header
    // height; push it down so the wrapped toolbar doesn't overlap the file list.
    "  main { margin-top: 0 !important; padding-top: 0 !important; }",
    "}",
  ].join("\n");
  document.head.appendChild(style);

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

  function injectPermanentButtons() {
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
      btn.innerHTML = '<i class="material-icons">' + def.icon + '</i><span>' + def.label + '</span>';
      btn.addEventListener("click", function() {
        if (btn.classList.contains("disabled")) return;
        if (def.custom) {
          var fp = getFilePath();
          if (fp) openInBrowser(fp);
        } else {
          clickVueButton(def.icon);
        }
      });
      header.insertBefore(btn, dropdown);
    });
  }

  function updatePermanentButtons() {
    var selected = hasSelection();
    var filePath = getFilePath();
    document.querySelectorAll("header .fb-permanent").forEach(function(btn) {
      var icon = btn.getAttribute("data-icon");
      // Browser button only active for files, not folders
      var active = icon === "public" ? !!filePath : selected;
      if (active) btn.classList.remove("disabled");
      else btn.classList.add("disabled");
    });
  }

  // Inject "Open in Browser" into FileBrowser's native context menu
  function injectContextMenuButton() {
    var ctxMenu = document.querySelector(".context-menu");
    if (!ctxMenu || ctxMenu.querySelector(".fb-browser-ctx")) return;

    var btn = document.createElement("button");
    btn.className = "action fb-browser-ctx";
    btn.title = "Open in Browser";
    btn.setAttribute("aria-label", "Open in Browser");
    btn.innerHTML = '<i class="material-icons">public</i><span>Open in Browser</span>';
    btn.addEventListener("click", function() {
      var fp = getFilePath();
      if (fp) openInBrowser(fp);
    });

    ctxMenu.appendChild(btn);
  }

  // Hide Vue's dynamic buttons — find any .action in header that isn't ours
  var DYNAMIC_ICON_SET = {};
  PERMANENT_BUTTONS.forEach(function(b) { DYNAMIC_ICON_SET[b.icon] = true; });

  function hideVueButtons() {
    document.querySelectorAll("header .action:not(.fb-permanent)").forEach(function(btn) {
      var icon = btn.querySelector("i.material-icons");
      if (icon && DYNAMIC_ICON_SET[icon.textContent.trim()]) {
        btn.style.cssText = "position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;opacity:0!important;";
      }
    });
  }

  var patching = false;
  function patchAll() {
    if (patching) return;
    patching = true;
    shortenLabels();
    injectPermanentButtons();
    updatePermanentButtons();
    hideVueButtons();
    injectContextMenuButton();
    patching = false;
  }

  var observer = new MutationObserver(patchAll);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  setInterval(patchAll, 2000);
})();
