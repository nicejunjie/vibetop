/**
 * Patches for xpra HTML5 client.
 * Injected via nginx sub_filter. Designed to degrade gracefully if
 * xpra's API changes — each patch is wrapped in try/catch.
 */
(function() {
  'use strict';

  // 0. Suppress "leave site?" confirmation on refresh/close.
  try {
    window.onbeforeunload = null;
    Object.defineProperty(window, 'onbeforeunload', { get: function() { return null; }, set: function() {}, configurable: true });
    var origAEL = window.addEventListener.bind(window);
    window.addEventListener = function(type) {
      if (type === 'beforeunload') return;
      return origAEL.apply(null, arguments);
    };
  } catch(e) {
    console.warn('[xpra-patches] beforeunload patch failed:', e.message);
  }

  // 1. Mouse offset fix: getMouse uses clientX/clientY (viewport coords)
  //    but the canvas may not start at (0,0). Patch to use canvas-relative coords.
  try {
    var P = XpraClient.prototype;
    var origGM = P.getMouse;
    P.getMouse = function(e) {
      var r = origGM.call(this, e);
      if (e.target && e.target.getBoundingClientRect) {
        var b = e.target.getBoundingClientRect();
        r.x = this.last_mouse_x = Math.round((e.clientX - b.left) * (this.scale || 1));
        r.y = this.last_mouse_y = Math.round((e.clientY - b.top) * (this.scale || 1));
      }
      return r;
    };
  } catch(e) {
    console.warn('[xpra-patches] getMouse patch failed:', e.message);
  }

  // 2. Scroll fix: xpra's default scroll handler accumulates wheel deltas
  //    to 120 units before sending, which makes slow trackpad scrolling
  //    unresponsive. Replace with immediate per-event dispatch.
  try {
    var P = XpraClient.prototype;
    P.on_mousescroll = function(e, win) {
      if (this.server_readonly || this.mouse_grabbed || !this.connected || (!win && this.server_is_shadow))
        return false;
      var mouse = this.getMouse(e);
      var mx = Math.round(mouse.x), my = Math.round(mouse.y);
      var modifiers = this._keyb_get_modifiers(e);
      var wid = 0, coords = [mx, my];
      if (win) {
        wid = win.wid;
        var pos = win.get_internal_geometry();
        coords.push(Math.round(mouse.x - pos.x));
        coords.push(Math.round(mouse.y - pos.y));
      }
      var norm = Utilities.normalizeWheel(e);
      var dy = norm.pixelY, dx = norm.pixelX;
      if (dy !== 0) {
        var btn = dy > 0 ? 5 : 4;
        var n = Math.max(1, Math.round(Math.abs(dy) / 30));
        for (var i = 0; i < n; i++) {
          this.send([PACKET_TYPES.button_action, wid, btn, true, coords, modifiers, []]);
          this.send([PACKET_TYPES.button_action, wid, btn, false, coords, modifiers, []]);
        }
      }
      if (dx !== 0) {
        var btn = dx > 0 ? 7 : 6;
        var n = Math.max(1, Math.round(Math.abs(dx) / 30));
        for (var i = 0; i < n; i++) {
          this.send([PACKET_TYPES.button_action, wid, btn, true, coords, modifiers, []]);
          this.send([PACKET_TYPES.button_action, wid, btn, false, coords, modifiers, []]);
        }
      }
      e.preventDefault();
      return false;
    };
  } catch(e) {
    console.warn('[xpra-patches] scroll patch failed:', e.message);
  }
})();
