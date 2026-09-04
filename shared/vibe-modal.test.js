/* Tests for vibe-modal.js — is it actually a MODAL, and can a keyboard or
 * screen-reader user use it?
 *
 *   node --test shared/vibe-modal.test.js
 *
 * It carried role="dialog" and nothing else: no accessible name, no aria-modal,
 * no focus trap, no background inerting, no focus restoration. Tab walked out of
 * a visible confirmation into the controls behind it — and eleven pages use
 * this, including Config's account-deletion and password-reset flows.
 *
 * Same zero-refactor approach as coach.test.js: run the real source in a vm with
 * a minimal DOM.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "vibe-modal.js"), "utf8");

function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    className: "", textContent: "", id: "", disabled: false,
    children: [], attrs: {}, _h: {}, parentNode: null,
    offsetParent: {},                      // "visible" for the focusable filter
    style: {}, classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    focused: 0,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    removeEventListener(ev, fn) {
      const a = this._h[ev] || [];
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    focus() { this.focused++; env.document.activeElement = this; },
    contains(n) {
      if (n === this) return true;
      return this.children.some((c) => c.contains && c.contains(n));
    },
    querySelectorAll(sel) {
      // Only the button/input selector the trap uses; return descendants in
      // document order.
      const out = [];
      const walk = (n) => n.children.forEach((c) => {
        if (c.tagName === "BUTTON" || c.tagName === "INPUT") out.push(c);
        walk(c);
      });
      walk(this);
      return out;
    },
  };
  return el;
}

function boot() {
  const body = makeEl("body");
  const head = makeEl("head");
  const docHandlers = {};
  const env = {
    document: {
      body, head, documentElement: makeEl("html"), activeElement: null,
      createElement: makeEl,
      getElementById: () => null,
      addEventListener(ev, fn) { (docHandlers[ev] = docHandlers[ev] || []).push(fn); },
      removeEventListener(ev, fn) {
        const a = docHandlers[ev] || [];
        const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
      },
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => { fn(); return 0; },
    Promise,
    _keys: docHandlers,
  };
  env.window = env;
  vm.createContext(env);
  vm.runInContext(SRC, env);
  return env;
}

let env;                                  // makeEl's focus() needs the live env
function open(opts, message) {
  env = boot();
  const p = env.window.vibeConfirm(message || "Delete this account?", opts || {});
  const ov = env.document.body.children.find(
    (c) => c.className === "vibe-modal-ov");
  const box = ov.children[0];
  return { env, p, ov, box, key: (k, shift) => {
    const e = { key: k, shiftKey: !!shift, preventDefault() { this.dflt = true; } };
    (env._keys.keydown || []).forEach((fn) => fn(e));
    return e;
  } };
}

// ---- it announces itself ---------------------------------------------------

test("the dialog tells assistive tech the rest of the page is unavailable", () => {
  const { box } = open({ title: "Delete account" });
  assert.equal(box.getAttribute("role"), "dialog");
  assert.equal(box.getAttribute("aria-modal"), "true");
});

test("an alert uses alertdialog", () => {
  env = boot();
  env.window.vibeAlert("Saved");
  const box = env.document.body.children.find((c) => c.className === "vibe-modal-ov").children[0];
  assert.equal(box.getAttribute("role"), "alertdialog");
});

test("the dialog has an accessible name from its title", () => {
  const { box } = open({ title: "Delete account" });
  const id = box.getAttribute("aria-labelledby");
  assert.ok(id, "no aria-labelledby");
  const h = box.children.find((c) => c.id === id);
  assert.equal(h.textContent, "Delete account");
});

test("with no title the message becomes the name, not nothing", () => {
  // A dialog whose only content is the message must still announce something;
  // pointing describedby at it and leaving labelledby empty announces "dialog".
  const { box } = open({}, "Really delete 4 files?");
  const id = box.getAttribute("aria-labelledby");
  assert.ok(id, "an untitled dialog has no accessible name");
  const p = box.children.find((c) => c.id === id);
  assert.equal(p.textContent, "Really delete 4 files?");
});

test("a titled dialog describes itself with the message", () => {
  const { box } = open({ title: "Delete account" });
  const id = box.getAttribute("aria-describedby");
  const p = box.children.find((c) => c.id === id);
  assert.equal(p.textContent, "Delete this account?");
});

test("two dialogs in one document do not share element ids", () => {
  // One boot = one page load; the IIFE runs once, so the id counter must carry
  // across calls or a second dialog's aria-labelledby points at the first's <h3>.
  env = boot();
  env.window.vibeConfirm("first", { title: "One" });
  env.window.vibeConfirm("second", { title: "Two" });
  const boxes = env.document.body.children
    .filter((c) => c.className === "vibe-modal-ov").map((o) => o.children[0]);
  assert.equal(boxes.length, 2);
  assert.notEqual(boxes[0].getAttribute("aria-labelledby"),
                  boxes[1].getAttribute("aria-labelledby"));
});

// ---- and it actually traps ------------------------------------------------

test("the background is inert while the dialog is open", () => {
  env = boot();
  const bg = makeEl("main");
  env.document.body.appendChild(bg);
  env.window.vibeConfirm("sure?");
  assert.ok(bg.hasAttribute("inert"),
            "Tab could reach the controls behind a visible confirmation");
});

test("closing releases the background again", async () => {
  env = boot();
  const bg = makeEl("main");
  env.document.body.appendChild(bg);
  const p = env.window.vibeConfirm("sure?");
  (env._keys.keydown || []).forEach((fn) => fn({ key: "Escape", preventDefault() {} }));
  await p;
  assert.ok(!bg.hasAttribute("inert"), "the page stayed inert after the dialog closed");
});

test("a background element already inert is left inert", async () => {
  // Don't un-inert something the page inerted for its own reasons.
  env = boot();
  const bg = makeEl("main");
  bg.setAttribute("inert", "");
  env.document.body.appendChild(bg);
  const p = env.window.vibeConfirm("sure?");
  (env._keys.keydown || []).forEach((fn) => fn({ key: "Escape", preventDefault() {} }));
  await p;
  assert.ok(bg.hasAttribute("inert"));
});

test("Tab wraps from the last control back to the first", () => {
  const { box, key, env: e } = open({});
  const btns = box.querySelectorAll("button");
  e.document.activeElement = btns[btns.length - 1];
  const ev = key("Tab");
  assert.ok(ev.dflt, "Tab was allowed to leave the dialog");
  assert.equal(e.document.activeElement, btns[0]);
});

test("Shift+Tab wraps from the first control back to the last", () => {
  const { box, key, env: e } = open({});
  const btns = box.querySelectorAll("button");
  e.document.activeElement = btns[0];
  const ev = key("Tab", true);
  assert.ok(ev.dflt);
  assert.equal(e.document.activeElement, btns[btns.length - 1]);
});

test("focus outside the dialog is pulled back in", () => {
  const { key, env: e, box } = open({});
  const stray = makeEl("button");
  e.document.activeElement = stray;
  key("Tab");
  assert.ok(box.contains(e.document.activeElement),
            "focus stayed outside the modal");
});

// ---- and it gives focus back ----------------------------------------------

test("the element that opened the dialog gets focus back", async () => {
  env = boot();
  const opener = makeEl("button");
  env.document.body.appendChild(opener);
  env.document.activeElement = opener;
  const before = opener.focused;
  const p = env.window.vibeConfirm("sure?");
  (env._keys.keydown || []).forEach((fn) => fn({ key: "Escape", preventDefault() {} }));
  await p;
  assert.ok(opener.focused > before,
            "a keyboard user is dumped at the top of the document after every confirm");
});

test("the OK button takes focus when the dialog opens", () => {
  const { box, env: e } = open({});
  const btns = box.querySelectorAll("button");
  assert.equal(e.document.activeElement, btns[btns.length - 1]);
});

// ---- reduced motion --------------------------------------------------------

test("the entrance animation is dropped for prefers-reduced-motion", () => {
  const src = fs.readFileSync(path.join(__dirname, "vibe-modal.js"), "utf8");
  assert.match(src, /prefers-reduced-motion/);
});

// ---- the promise still resolves the same way ------------------------------

test("Escape cancels, Enter confirms, and the result is unchanged", async () => {
  let r = open({});
  r.key("Escape");
  assert.equal(await r.p, false);
  r = open({});
  r.key("Enter");
  assert.equal(await r.p, true);
});
