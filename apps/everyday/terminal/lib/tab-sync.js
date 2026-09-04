/* Pure tab-set reconciliation for the tabbed terminal UI (terminals.html).
 *
 * Terminal N is ONE shared backend session, so the set of running terminals is
 * shared state across every client/device. The tab bar live-syncs to it: a tab
 * opened/closed on one client appears/disappears on the others. The fiddly part
 * is the race window — THIS client just opened/closed a tab and the next ~2.5s
 * status poll hasn't caught up yet — which two per-client sets cover:
 *   pending = opened here, awaiting backend "running" confirmation
 *   closing = closed here, awaiting backend "stopped" confirmation
 * The desired set is `(running ∪ pending) − closing`.
 *
 * This is the logic that kept regressing (v1.9.6..v1.9.10 are almost all
 * tab-sync fixes), so it lives here as a DOM-free, unit-tested module instead of
 * inline in terminals.html. It's dual-mode: a CommonJS export for `node:test`
 * and a `self.TabSync` global for the browser (loaded via <script src>). Keep it
 * pure — no DOM, no fetch, no globals — so the tests below are the whole story.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;   // node test
  else root.TabSync = api;                                                  // browser
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Reconcile the local tab membership against the shared backend running set.
  // Inputs (all plain data — the caller reads them off the DOM / its own state):
  //   running  : array of ints currently running on the backend
  //   pending  : object used as a set {n: true} of tabs opened-here-not-confirmed
  //   closing  : object used as a set {n: true} of tabs closed-here-not-confirmed
  // Returns NEW pending/closing (so the caller can reassign — no mutation of the
  // inputs) plus `desired`, the ascending list of tab numbers that should exist.
  // Mirrors the original inline reconcileTabs exactly:
  //   - a tab now running is confirmed up   → drop from pending
  //   - a tab no longer running is confirmed gone → drop from closing
  //   - desired = running ∪ pending − closing  (using the post-drop sets)
  function reconcile(running, pending, closing) {
    running = running || [];
    pending = pending || {};
    closing = closing || {};

    var runSet = {};
    running.forEach(function (n) { runSet[n] = true; });

    var newPending = {};
    Object.keys(pending).forEach(function (k) {
      // Keep only tabs still awaiting their "running" confirmation AND not also
      // closed-here. A tab opened then closed locally before the backend ever
      // confirmed it running would otherwise linger in pending (its `closing`
      // entry gets dropped below because it was never in runSet) and the tab
      // would reappear — a phantom. The local close supersedes the local open.
      if (!runSet[k] && !closing[k]) newPending[k] = true;
    });
    var newClosing = {};
    Object.keys(closing).forEach(function (k) {
      if (runSet[k]) newClosing[k] = true;           // still running → keep (not yet gone)
    });

    var desired = {};
    running.forEach(function (n) { desired[n] = true; });
    Object.keys(newPending).forEach(function (k) { desired[+k] = true; });
    Object.keys(newClosing).forEach(function (k) { delete desired[+k]; });

    var list = Object.keys(desired).map(Number).sort(function (a, b) { return a - b; });
    return { desired: list, pending: newPending, closing: newClosing };
  }

  // Lowest free terminal number in 1..max, given the tabs already shown (`used`)
  // and, optionally, the last-known backend running set — so two clients don't
  // both grab the same free number before a reconcile reveals the other's.
  // Returns 0 when every slot up to `max` is taken.
  function nextAvailable(used, running, max) {
    var u = {};
    (used || []).forEach(function (n) { u[n] = true; });
    if (running) running.forEach(function (n) { u[n] = true; });
    for (var i = 1; i <= max; i++) {
      if (!u[i]) return i;
    }
    return 0;
  }

  return { reconcile: reconcile, nextAvailable: nextAvailable };
});
