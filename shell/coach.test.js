/* Tests for coach.js — the shared coach-tip banner state machine
 * (show-every-open-until-tapped, max-3 cap, versioned keys, one-at-a-time, rotate).
 *
 *   node --test landing/        (or: cd landing && node --test)
 *
 * coach.js is a browser IIFE that assigns window.vibeCoach. Rather than change
 * production code, we run the REAL source in a vm sandbox with minimal DOM /
 * localStorage stubs (same zero-refactor approach as sw.test.js), then drive the
 * public vibeCoach() and assert the persistence + banner behaviour. Nothing here
 * is deployed — *.test.js is never in the install allowlist.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "coach.js"), "utf8");

function makeEl(tag) {
  return {
    tagName: tag, className: "", style: { cssText: "" }, textContent: "",
    children: [], _h: {}, parent: null,
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    click() { (this._h.click || []).forEach((f) => f()); },
  };
}

function makeEnv() {
  const store = {};
  const body = makeEl("body");
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const document = {
    hidden: false,
    createElement: makeEl,
    body,
    documentElement: body,
    querySelector(sel) {
      // Only '.vibe-coach' is queried by coach.js.
      const cls = sel.replace(/^\./, "");
      return body.children.find((c) => c.className === cls) || null;
    },
  };
  const window = {};
  const ctx = { window, document, localStorage, Array, String, parseInt };
  vm.runInNewContext(SRC, ctx);
  return { vibeCoach: window.vibeCoach, document, localStorage, body, store };
}

const TIP = { key: "vibetop:tip:demo:v1", text: "hello tip" };

test("first open shows the banner and counts it", () => {
  const env = makeEnv();
  const el = env.vibeCoach(TIP);
  assert.ok(el, "should return an element on first show");
  assert.equal(env.body.children.length, 1);
  assert.equal(env.store[TIP.key], "1");        // this showing counted
  assert.equal(el.children[0].textContent, "hello tip");
});

test("only one banner at a time per surface", () => {
  const env = makeEnv();
  env.vibeCoach(TIP);
  const second = env.vibeCoach({ key: "other:v1", text: "x" });
  assert.equal(second, null, "a banner already present -> null");
  assert.equal(env.body.children.length, 1);
});

test("hidden document suppresses the banner", () => {
  const env = makeEnv();
  env.document.hidden = true;
  assert.equal(env.vibeCoach(TIP), null);
});

test("clicking dismisses for good (persists 'done')", () => {
  const env = makeEnv();
  const el = env.vibeCoach(TIP);
  el.click();
  assert.equal(env.store[TIP.key], "done");
  assert.equal(env.body.children.length, 0, "banner removed on click");
  assert.equal(env.vibeCoach(TIP), null, "dismissed tip never shows again");
});

test("retires after MAX showings even if never tapped", () => {
  const env = makeEnv();
  let shown = 0;
  for (let i = 0; i < 15; i++) {
    const el = env.vibeCoach(TIP);
    if (el) { shown++; el.remove(); }        // simulate a fresh page open
  }
  assert.equal(shown, 3, "shows exactly MAX (3) times, then retires");
});

test("versioned key: bumping :vN re-shows to someone who dismissed :v1", () => {
  const env = makeEnv();
  env.vibeCoach({ key: "vibetop:tip:x:v1", text: "old" }).click();  // dismiss v1
  const el = env.vibeCoach({ key: "vibetop:tip:x:v2", text: "new" });
  assert.ok(el, "a new versioned key is a fresh tip");
  assert.equal(el.children[0].textContent, "new");
});

test("rotate gives each live tip airtime across opens", () => {
  const env = makeEnv();
  const tips = [{ key: "a:v1", text: "A" }, { key: "b:v1", text: "B" }];
  const seen = [];
  for (let i = 0; i < 2; i++) {
    const el = env.vibeCoach(tips, { surface: "term", rotate: true });
    seen.push(el.children[0].textContent);
    el.remove();
  }
  assert.deepEqual(seen, ["A", "B"], "rotates through the tips one per open");
});
