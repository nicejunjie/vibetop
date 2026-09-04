/* vibe-modal.js — vibetop-styled confirm/alert dialogs that replace the native
   window.confirm/alert (which render as off-brand OS dialogs — and even sideways
   on a rotated tablet). Self-contained: injects its own CSS on first use, no
   dependencies. Included via <script src="/vibe-modal.js"> in each page; the
   modal renders inside the including document (vibetop apps are full-viewport
   iframes, so it covers the app it belongs to).

   API (both return a Promise so callers .then() instead of blocking):
     vibeConfirm(message, opts) -> Promise<boolean>   (true = OK, false = Cancel)
     vibeAlert(message, opts)   -> Promise<void>
   opts: { title, okText, cancelText, danger }.  message honors "\n" line breaks. */
(function () {
  var STYLE_ID = 'vibe-modal-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.vibe-modal-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(6,9,14,0.55);backdrop-filter:blur(3px);' +
      '-webkit-backdrop-filter:blur(3px);padding:20px;box-sizing:border-box;' +
      'font-family:system-ui,sans-serif;opacity:0;transition:opacity .12s ease;}' +
      '.vibe-modal-ov.in{opacity:1;}' +
      '.vibe-modal{background:#161b22;border:1px solid #2a3040;border-radius:12px;' +
      'box-shadow:0 12px 44px rgba(0,0,0,0.55);max-width:400px;width:100%;box-sizing:border-box;' +
      'padding:20px 20px 16px;color:#e6edf3;transform:translateY(8px) scale(.97);transition:transform .12s ease;}' +
      '.vibe-modal-ov.in .vibe-modal{transform:none;}' +
      '.vibe-modal h3{margin:0 0 8px;font-size:16px;font-weight:650;color:#f0f4f8;}' +
      '.vibe-modal p{margin:0 0 18px;font-size:14px;line-height:1.5;color:#b9c6d4;white-space:pre-line;}' +
      '.vibe-modal-btns{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}' +
      '.vibe-modal-btns button{font:inherit;font-size:14px;font-weight:600;padding:8px 16px;' +
      'border-radius:8px;cursor:pointer;border:1px solid transparent;}' +
      '.vibe-mb-cancel{background:transparent;color:#9fb0c0;border-color:#2a3040;}' +
      '.vibe-mb-cancel:hover{background:rgba(255,255,255,0.06);color:#c8d4e0;}' +
      '.vibe-mb-ok{background:#2f6fd6;color:#fff;}' +
      '.vibe-mb-ok:hover{filter:brightness(1.12);}' +
      '.vibe-mb-ok.danger{background:#c0392b;}' +
      // The QA charter requires it, and a dialog that slides in is the
      // exact motion a vestibular-sensitive reader asked to be spared.
      '@media (prefers-reduced-motion: reduce){.vibe-modal-ov,.vibe-modal{transition:none;}' +
      '.vibe-modal{transform:none;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  var seq = 0;

  function show(opts) {
    injectStyle();
    return new Promise(function (resolve) {
      var id = 'vibe-modal-' + (++seq);
      // The element that had focus when we opened, so it can be given it back.
      // Without this a keyboard user lands at the top of the document after
      // every confirmation and has to tab back to where they were.
      var opener = document.activeElement;
      var ov = document.createElement('div'); ov.className = 'vibe-modal-ov';
      var box = document.createElement('div'); box.className = 'vibe-modal';
      box.setAttribute('role', opts.alert ? 'alertdialog' : 'dialog');
      // aria-modal tells a screen reader the rest of the page is unavailable;
      // `inert` on the background is what actually MAKES that true. Without
      // both, Tab walked straight out of a visible confirmation into the
      // controls behind it — including, in Config, account deletion.
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('tabindex', '-1');
      if (opts.title) {
        var h = document.createElement('h3'); h.textContent = opts.title;
        h.id = id + '-t'; box.setAttribute('aria-labelledby', h.id);
        box.appendChild(h);
      }
      var p = document.createElement('p'); p.textContent = opts.message || '';
      p.id = id + '-d';
      // With no title the message IS the accessible name, or the dialog opens
      // announcing nothing at all.
      box.setAttribute(opts.title ? 'aria-describedby' : 'aria-labelledby', p.id);
      box.appendChild(p);
      var btns = document.createElement('div'); btns.className = 'vibe-modal-btns';

      // Everything that is not the overlay goes inert while it is open.
      var inerted = [];
      function setBackgroundInert(on) {
        var root = document.body || document.documentElement;
        for (var i = 0; i < root.children.length; i++) {
          var el = root.children[i];
          if (el === ov) continue;
          if (on) {
            if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); inerted.push(el); }
          }
        }
        if (!on) {
          for (var j = 0; j < inerted.length; j++) inerted[j].removeAttribute('inert');
          inerted = [];
        }
      }

      var done = false;
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        setBackgroundInert(false);
        ov.classList.remove('in');
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 140);
        try { if (opener && opener.focus) opener.focus(); } catch (e) {}
        resolve(val);
      }
      function focusables() {
        return [].slice.call(box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                 .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(opts.alert ? undefined : false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(opts.alert ? undefined : true); }
        else if (e.key === 'Tab') {
          // Trap. `inert` already stops most escapes, but browsers without it
          // (and the browser chrome's own tab order) still need the wrap.
          var f = focusables();
          if (!f.length) { e.preventDefault(); return; }
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
            e.preventDefault(); first.focus();
          }
        }
      }

      if (!opts.alert) {
        var cancel = document.createElement('button'); cancel.className = 'vibe-mb-cancel';
        cancel.textContent = opts.cancelText || 'Cancel';
        cancel.onclick = function () { close(false); };
        btns.appendChild(cancel);
      }
      var ok = document.createElement('button');
      ok.className = 'vibe-mb-ok' + (opts.danger ? ' danger' : '');
      ok.textContent = opts.okText || 'OK';
      ok.onclick = function () { close(opts.alert ? undefined : true); };
      btns.appendChild(ok);

      box.appendChild(btns);
      ov.appendChild(box);
      ov.addEventListener('click', function (e) {
        if (e.target === ov) close(opts.alert ? undefined : false);   // click backdrop = cancel/dismiss
      });
      document.addEventListener('keydown', onKey, true);
      (document.body || document.documentElement).appendChild(ov);
      setBackgroundInert(true);
      requestAnimationFrame(function () { ov.classList.add('in'); try { ok.focus(); } catch (e) {} });
    });
  }

  window.vibeConfirm = function (message, opts) { opts = opts || {}; opts.message = message; return show(opts); };
  window.vibeAlert = function (message, opts) { opts = opts || {}; opts.message = message; opts.alert = true; return show(opts); };
})();
