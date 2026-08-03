/* split.js — pure state transitions for the desktop's 2-pane split view.
 *
 * DOM-free (like terminal/lib/tab-sync.js) so it can be unit-tested with
 * `node --test landing/split.test.js`. desktop.html loads it via <script src>
 * and does the DOM glue; ALL the branch-y decisions live here where they're
 * testable. Exposed as window.VibeSplit in the browser, module.exports in node.
 *
 * A "split" is { apps: [leftId, rightId], ratio } | null. `ratio` is the left
 * pane's fraction of the width. `active` is the focused pane id (one of apps).
 */
(function (root) {
  'use strict';

  var MIN = 0.05, MAX = 0.95;

  function clampRatio(r) {
    r = Number(r);
    if (!isFinite(r)) return 0.5;
    if (r < MIN) return MIN;
    if (r > MAX) return MAX;
    return r;
  }

  // The next split state when the user clicks ◫ on `target` while `active` is
  // focused. Returns {apps,ratio} to tile, or null for "no split change" (the
  // caller decides what null means — usually just focus/toggle-unsplit).
  function splitBesideNext(active, target, split) {
    if (!active || !target) return null;
    if (!split) {
      if (active === target) return null;                 // can't split with self
      return { apps: [active, target], ratio: 0.5 };
    }
    var ratio = clampRatio(split.ratio);
    var fi = split.apps.indexOf(active);
    if (fi === -1) {                                       // active isn't a pane (defensive)
      return active === target ? null : { apps: [active, target], ratio: ratio };
    }
    if (target === active) return null;                   // clicking the focused pane → caller unsplits
    var apps = split.apps.slice();
    apps[fi === 0 ? 1 : 0] = target;                      // replace the NON-focused pane
    if (apps[0] === apps[1]) return null;                 // would duplicate
    return { apps: apps, ratio: ratio };
  }

  // Which app ids are visible: [] (wallpaper), [id] (single), or [left,right]
  // (tiled). Tiling only shows when both panes are still open, the width allows
  // it (canSplit), and the focused app is one of the panes.
  function visibleSet(active, split, openApps, canSplit) {
    if (!active) return [];
    if (split && canSplit &&
        openApps.indexOf(split.apps[0]) !== -1 &&
        openApps.indexOf(split.apps[1]) !== -1 &&
        split.apps.indexOf(active) !== -1) {
      return split.apps.slice();
    }
    return [active];
  }

  // If the divider was dragged to an edge, the id to keep fullscreen (unsplit);
  // else null (stay split).
  function edgeUnsplit(split, ratio) {
    if (!split) return null;
    if (ratio < 0.08) return split.apps[1];   // pinched left → keep the right pane
    if (ratio > 0.92) return split.apps[0];   // pinched right → keep the left pane
    return null;
  }

  // Validate a split object loaded from the server: a dict with exactly two
  // distinct string apps, both currently open. Returns a clean copy or null.
  function sanitizeSplit(split, openApps) {
    if (!split || typeof split !== 'object') return null;
    var apps = split.apps;
    if (!Array.isArray(apps) || apps.length !== 2) return null;
    if (typeof apps[0] !== 'string' || typeof apps[1] !== 'string') return null;
    if (apps[0] === apps[1]) return null;
    if (openApps.indexOf(apps[0]) === -1 || openApps.indexOf(apps[1]) === -1) return null;
    return { apps: [apps[0], apps[1]], ratio: clampRatio(split.ratio) };
  }

  var api = {
    clampRatio: clampRatio,
    splitBesideNext: splitBesideNext,
    visibleSet: visibleSet,
    edgeUnsplit: edgeUnsplit,
    sanitizeSplit: sanitizeSplit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeSplit = api;
})(typeof self !== 'undefined' ? self : this);
