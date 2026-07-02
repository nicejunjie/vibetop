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
      '.vibe-mb-ok.danger{background:#c0392b;}';
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function show(opts) {
    injectStyle();
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'vibe-modal-ov';
      var box = document.createElement('div'); box.className = 'vibe-modal';
      box.setAttribute('role', opts.alert ? 'alertdialog' : 'dialog');
      if (opts.title) {
        var h = document.createElement('h3'); h.textContent = opts.title; box.appendChild(h);
      }
      var p = document.createElement('p'); p.textContent = opts.message || ''; box.appendChild(p);
      var btns = document.createElement('div'); btns.className = 'vibe-modal-btns';

      var done = false;
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        ov.classList.remove('in');
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 140);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(opts.alert ? undefined : false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(opts.alert ? undefined : true); }
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
      requestAnimationFrame(function () { ov.classList.add('in'); try { ok.focus(); } catch (e) {} });
    });
  }

  window.vibeConfirm = function (message, opts) { opts = opts || {}; opts.message = message; return show(opts); };
  window.vibeAlert = function (message, opts) { opts = opts || {}; opts.message = message; opts.alert = true; return show(opts); };
})();
