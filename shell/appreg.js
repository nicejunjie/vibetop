/* The desktop's app registry — the canonical inventory of what the Start menu,
 * the taskbar and the window titles know about.
 *
 * Lifted VERBATIM out of shell/desktop.html (v1.19.272). It was the natural first
 * thing to extract: nothing in it reads the DOM, nothing else in the shell writes
 * to it, and it is the one table other people actually come looking for — CLAUDE.md
 * points at `the APPS map in shell/desktop.html` as the source of truth for the app
 * inventory, which meant opening a 4,500-line file to read a data structure.
 *
 * Loaded from <head>, BEFORE desktop.html's own script: buildStartMenu() runs at
 * parse time and reads APPS, so a defer/module tag here would render an empty menu.
 *
 * Adding an app: add it here, add its page under apps/<section>/<item>/, and (if it
 * must work offline) add the page to PRECACHE in sw.js. shell/install.sh finds the
 * file by walking the tree — there is no list to update.
 */
(function (root) {
  'use strict';
  // Every app's Start-menu/taskbar icon is an inline SVG (Material "filled" set,
  // drawn in currentColor) rather than an emoji, so the launcher is ONE
  // consistent, crisp icon set that renders identically on desktop and phone —
  // emoji vary per-OS and mix colored "stickers" with flat arrow glyphs. Each
  // app still keeps an `icon` emoji as a graceful-degradation fallback;
  // buildStartMenu + the taskbar prefer `svg` (attached below). width/height:1em
  // so the icon scales with the font-size (16px menu tile, 17px taskbar).
  function svgIcon(d) {
    return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  var ICON = {
    home:        svgIcon('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'),
    terminal:    svgIcon('M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM7 9.5 8.5 8l3 3-3 3L7 12.5 8.5 11 7 9.5zm5 4.5h5v1.5h-5V14z'),
    browser:     svgIcon('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z'),
    x11launcher: svgIcon('M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z'),
    files:       svgIcon('M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'),
    office:      svgIcon('M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'),
    notes:       svgIcon('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'),
    monitor:     svgIcon('M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z'),
    upload:      svgIcon('M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z'),
    update:      svgIcon('M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'),
    // Utilities — same Material 24-grid SVG style as the apps above (a gauge for
    // the usage strip, an assessment/bar-chart for token stats) so the Start-menu
    // icons match in style and size instead of falling back to emoji.
    claudeusage: svgIcon('M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z'),
    codexusage:  svgIcon('M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zm0 3.1L6 8.56v6.88l6 3.46 6-3.46V8.56L12 5.1zm0 2.3l4 2.3v4.6l-4 2.3-4-2.3V9.7l4-2.3z'),
    tokenstats:  svgIcon('M21 8c-1.45 0-2.26 1.44-1.93 2.51l-3.55 3.56c-.3-.09-.74-.09-1.04 0l-2.55-2.55C12.27 10.45 11.46 9 10 9c-1.45 0-2.27 1.44-1.93 2.52l-4.56 4.55C2.44 15.74 1 16.55 1 18c0 1.1.9 2 2 2 1.45 0 2.26-1.44 1.93-2.51l4.55-4.56c.3.09.74.09 1.04 0l2.55 2.55C12.73 16.55 13.54 18 15 18c1.45 0 2.27-1.44 1.93-2.52l3.56-3.55c1.07.33 2.51-.48 2.51-1.93 0-1.1-.9-2-2-2z'),
    sysstats:    svgIcon('M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z'),
    // System administration (settings gear) — a System-section app, sudo-gated.
    config:      svgIcon('M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'),
    // Video player (play triangle) — a hidden app, opened only from Files.
    video:       svgIcon('M8 5v14l11-7z')
  };

  // Single source of truth for every app: its taskbar/Start-menu icon, label,
  // Start-menu description, iframe src, and which Start-menu section it sits in.
  // The Start-menu items are generated from this (buildStartMenu) so the icon +
  // label aren't duplicated in static HTML, where they used to drift.
  var APPS = {
    home:     { label: 'Services', icon: '📡', src: '/landing.html',         desc: 'Network services on this host', section: 'utilities' },
    terminal: { label: 'Terminal', icon: '⬛', src: '/terminals/',           desc: 'Persistent bash terminals' },
    browser:  { label: 'Browser',  icon: '🌐', src: '/browser/',             desc: 'Persistent web browser' },
    x11launcher: { label: 'X11 Launcher', icon: '🚀', src: '/x11launcher.html',     desc: 'Launch GUI apps' },
    files:    { label: 'Files',    icon: '📁', src: '/files.html',           desc: 'File manager' },
    office:   { label: 'Office',   icon: '📄', src: '/office-editor.html',   desc: 'Edit Office docs' },
    notes:    { label: 'Notes',    icon: '📝', src: '/notes.html',           desc: 'Persistent scratchpad' },
    monitor:  { label: 'System Monitor', icon: '📊', src: '/monitor.html',  desc: 'Live CPU, memory and GPU', section: 'utilities' },
    upload:   { label: 'Upload',   icon: '⬆',  src: '/upload.html',          desc: 'Quick upload to ~/Uploads' },
    update:   { label: 'Update',   icon: '🔄', src: '/update.html',          desc: 'Pull latest & redeploy', section: 'system' },
    // System administration (idle-timeout policy + user management). Shown only
    // to users with OS sudo (sudo:true) — the row is hidden until /api/me reports
    // can_sudo; the real gate is a 403 on every /api/config/* endpoint.
    config:   { label: 'Config',   icon: '⚙',  src: '/config.html',          desc: 'System administration', section: 'system', sudo: true },
    // A toggle row, not an app: flips the opt-in Claude plan-usage strip on/off
    // (routes Claude Code through the local capture proxy). Handled specially in
    // the Start-menu click handler — no iframe, no src. Lives under the
    // collapsible "Utilities" submenu (section 'utilities').
    claudeusage: { label: 'Claude Limit', icon: '📈', desc: 'Off', section: 'utilities', toggle: true },
    codexusage: { label: 'Codex Limit', icon: '◈', desc: 'Off', section: 'utilities', toggle: true },
    // A normal app (iframe) under Utilities: token-consumption + estimated-cost
    // analytics parsed from Claude Code's local transcripts.
    tokenstats: { label: 'Token Stats', icon: '📊', src: '/token-stats.html', desc: 'Token use & est. cost', section: 'utilities' },
    // Client-side toggle (not an app): show/hide the CPU/GPU/MEM/VRAM readout in
    // the taskbar, freeing that space for app tabs. Per-device (localStorage).
    sysstats: { label: 'System Stats', icon: '🖥', desc: 'CPU/GPU in taskbar', section: 'utilities', toggle: true },
    // Client-side toggle (not an app): floating resizable windows vs the classic
    // full-screen desktop. Per-device (localStorage). Only takes visible effect
    // on tablet/desktop sizes (phones stay full-screen).
    // In-Files video player. `hidden` = no Start-menu tile: it's opened only by
    // double-clicking a video in Files (a `video-view` postMessage -> openVideo),
    // like the office viewer. Registered here so the taskbar/title can render it.
    video:    { label: 'Video player', icon: '🎬', src: '/video.html', desc: 'Play video files', hidden: true },
    // Native image viewer — opened by Files on an image click (image-view
    // postMessage), replacing FileBrowser's previewer. Hidden like video.
    imageview: { label: 'Images', icon: '🖼', src: '/imageview.html', desc: 'View images', hidden: true },
    // Games — a small classic set (user request), each a self-contained page.
    // They ride every normal app behavior for free (windows, taskbar, dots).
    minesweeper: { label: 'Minesweeper', icon: '💣', src: '/minesweeper.html', desc: 'Classic mine hunt', section: 'games' },
    solitaire:   { label: 'Solitaire',   icon: '🃏', src: '/solitaire.html',   desc: 'Klondike patience',  section: 'games' },
    game2048:    { label: '2048',        icon: '🔢', src: '/game2048.html',    desc: 'Slide & merge tiles', section: 'games' },
    circuit:     { label: 'Circuit Runner', icon: '🤖', src: '/circuit.html', desc: 'Side-scrolling platformer', section: 'games' },
    rts:         { label: 'Iron Frontier', icon: '⚔️', src: '/rts.html', desc: 'Isometric real-time strategy', section: 'games' }
  };
  // Attach the matching SVG icon to each app (fallback stays the `icon` emoji).
  Object.keys(APPS).forEach(function(id) { if (ICON[id]) APPS[id].svg = ICON[id]; });

  var api = { APPS: APPS, ICON: ICON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeApps = api;
})(typeof self !== 'undefined' ? self : this);
