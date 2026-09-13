// Config — the sudo-gated settings panel: the read/write round trip of each
// setting, what it refuses to send, and what a 403 does to the controls.
//
// The page's REAL inline script runs in a vm sandbox against a minimal DOM; its
// own handlers are driven and fetch is a recorder, so a test asserts on the
// request the page WOULD send. Nothing here can reach /api/config or systemctl.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "config.html"), "utf8");
const SRC = (function () {
  const b = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .filter((s) => s.indexOf("function saveAll") >= 0);
  assert.strictEqual(b.length, 1, "expected exactly one main inline script");
  return b[0];
})();

function el(tag) {
  const e = {
    tagName: String(tag || "div").toUpperCase(),
    children: [], _attrs: {}, _on: {}, _q: {},
    style: {}, dataset: {},
    value: "", className: "", _text: "", _html: "", type: "text", placeholder: "",
    checked: false, disabled: false, hidden: false, offsetParent: {},
    addEventListener(t, fn) { (e._on[t] || (e._on[t] = [])).push(fn); },
    removeEventListener(t, fn) { const a = e._on[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    appendChild(c) { e.children.push(c); return c; },
    setAttribute(k, v) { e._attrs[k] = String(v); },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    hasAttribute(k) { return k in e._attrs; },
    removeAttribute(k) { delete e._attrs[k]; },
    querySelector(sel) {
      const k = String(sel);
      if (e._q[k]) return e._q[k];
      if (k[0] === "." && String(e.innerHTML).indexOf(k.slice(1)) >= 0) return (e._q[k] = el("span"));
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; }, focus() {},
    fire(t, ev) {
      if (e.disabled && t === "click") return null;      // a disabled control is inert
      const evt = Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev || {});
      (e._on[t] || []).slice().forEach((fn) => fn.call(e, evt));
      return evt;
    },
  };
  Object.defineProperty(e, "textContent", { get() { return e._text; }, set(v) { e._text = String(v); e.children.length = 0; }, enumerable: true });
  Object.defineProperty(e, "innerHTML", {
    get() { return e._html; },
    set(v) { e._html = String(v); e.children.length = 0; e._q = {}; },
    enumerable: true,
  });
  e.classList = {
    add(c) { if (!e.classList.contains(c)) e.className = (e.className + " " + c).trim(); },
    remove(c) { e.className = e.className.split(/\s+/).filter((x) => x && x !== c).join(" "); },
    toggle(c, on) { const want = on === undefined ? !e.classList.contains(c) : !!on; want ? e.classList.add(c) : e.classList.remove(c); },
    contains(c) { return e.className.split(/\s+/).indexOf(c) >= 0; },
  };
  return e;
}

// Every GET the panel makes at startup, answered with a sane host.
const DEFAULT_ROUTES = {
  "GET /api/config/idle": () => ({ status: 200, data: { enabled: false, hours: 2, reapTerminals: false } }),
  "GET /api/config/hints": () => ({ status: 200, data: { enabled: true } }),
  "GET /api/config/resources": () => ({ status: 200, data: { memMax: "", cpuCores: "", hostCores: 16 } }),
  "GET /api/config/services": () => ({ status: 200, data: { services: [] } }),
  "GET /api/config/users": () => ({ status: 200, data: { users: [] } }),
  "GET /api/config/disk": () => ({ status: 200, data: {} }),
  "GET /api/config/sessions": () => ({ status: 200, data: { sessions: [] } }),
};

function load(opts) {
  opts = opts || {};
  const byId = {};
  const calls = [];
  const timers = [];
  const alerts = [];
  const confirms = [];
  const confirmQueue = (opts.confirms || []).slice();
  const routes = Object.assign({}, DEFAULT_ROUTES, opts.routes || {});
  const doc = {
    hidden: false, _on: {}, activeElement: null,
    getElementById(id) { return byId[id] || (byId[id] = el("div")); },
    createElement(t) { return el(t); },
    createTextNode(t) { return { data: String(t) }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(t, fn) { (doc._on[t] || (doc._on[t] = [])).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (doc._on[t] || []).slice().forEach((fn) => fn.call(doc, Object.assign({ preventDefault() {} }, ev || {}))); },
  };
  doc.body = el("body");
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: doc,
    location: { origin: "https://host.test" },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    Promise, Math, JSON, Object, Array, String, Number, Error, Date,
    fetch(url, opt) {
      opt = opt || {};
      const key = (opt.method || "GET") + " " + String(url);
      calls.push({ url: String(url), method: opt.method || "GET", body: opt.body, headers: opt.headers || {} });
      const r = routes[key];
      if (!r) return Promise.reject(new Error("no route for " + key));
      const out = r(opt);
      if (out.__reject) return Promise.reject(new Error("network"));
      return Promise.resolve({ status: out.status, json: () => Promise.resolve(out.data === undefined ? {} : out.data) });
    },
    vibeAlert(m) { alerts.push(String(m)); return Promise.resolve(); },
    vibeConfirm(m, o) {
      const answer = confirmQueue.length ? confirmQueue.shift() : true;
      confirms.push({ message: String(m), opts: o || {}, answer });
      return Promise.resolve(answer);
    },
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "config.html" }).runInContext(sandbox);
  const h = {
    S: sandbox, byId, calls, timers, alerts, confirms, doc,
    id: (x) => doc.getElementById(x),
    route: (k, fn) => { routes[k] = fn; },
    answer: (v) => confirmQueue.push(v),
    runTimers: () => { const due = timers.splice(0); due.forEach((t) => t.fn()); },
    settle: () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r)))),
    posts: () => calls.filter((c) => c.method === "POST"),
    bodyOf: (url) => JSON.parse(calls.filter((c) => c.method === "POST" && c.url === url).pop().body),
    // A click on a row button inside one of the delegated lists.
    rowClick(listId, cls, dataAttr, dataVal) {
      const card = el("div");
      card.setAttribute(dataAttr, dataVal);
      card.innerHTML = '<span class="svc-name"></span>';
      card.querySelector(".svc-name").textContent = "Web server";   // the human label the row shows
      const btn = el("button");
      btn.className = cls;
      btn.closest = (sel) => (sel.indexOf("button") === 0 ? btn : card);
      h.id(listId).fire("click", { target: Object.assign(el("span"), { closest: (sel) => (sel.indexOf("button") === 0 ? btn : card) }) });
      return btn;
    },
    // Answer the panel's own styled prompt (vtPrompt), which is a real dialog
    // in the page, not window.confirm.
    prompt(value, checked) {
      if (value === null) { h.id("vt-cancel").fire("click"); return; }
      h.id("vt-input").value = value;
      h.id("vt-chk").checked = !!checked;
      h.id("vt-ok").fire("click");
    },
  };
  return h;
}

// ---- the settings round trip --------------------------------------------

test("each setting is READ at startup and nothing is written", async () => {
  const h = load({
    routes: {
      "GET /api/config/idle": () => ({ status: 200, data: { enabled: true, hours: 6, reapTerminals: true } }),
      "GET /api/config/resources": () => ({ status: 200, data: { memMax: "4G", cpuCores: "4", hostCores: 16 } }),
    },
  });
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "opening the panel must not write anything");
  assert.strictEqual(h.id("idle-enabled").checked, true);
  assert.strictEqual(h.id("idle-hours").value, 6);
  assert.strictEqual(h.id("idle-reapterms").checked, true);
  assert.strictEqual(h.id("hints-enabled").checked, true);
  assert.strictEqual(h.id("res-mem").value, "4G");
  assert.strictEqual(h.id("res-cpu").value, "4");
  assert.strictEqual(h.id("res-cpu-hint").textContent, "of 16 on this host");
  assert.strictEqual(h.id("save-all").disabled, true, "nothing has changed, so Save is off");
});

test("Save is off until something differs, and then POSTs ONLY the changed section", async () => {
  const h = load({ routes: { "POST /api/config/idle": () => ({ status: 200, data: {} }) } });
  await h.settle();
  assert.strictEqual(h.id("save-all").disabled, true);
  h.id("idle-hours").value = "5";
  h.id("idle-hours").fire("input");
  assert.strictEqual(h.id("save-all").disabled, false, "an edited field enables Save");
  h.id("save-all").fire("click");
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)), ["/api/config/idle"],
    "the untouched hints and resources sections must not be rewritten");
  assert.deepStrictEqual(h.bodyOf("/api/config/idle"), { enabled: false, hours: 5, reapTerminals: false });
  assert.strictEqual(h.posts()[0].headers["Content-Type"], "application/json");
  assert.strictEqual(h.id("save-status").textContent, "Saved");
  assert.strictEqual(h.id("save-all").disabled, true, "and the panel is clean again");
});

test("the three settings cards go to three different endpoints in one Save", async () => {
  const h = load({
    routes: {
      "POST /api/config/idle": () => ({ status: 200, data: {} }),
      "POST /api/config/hints": () => ({ status: 200, data: {} }),
      "POST /api/config/resources": () => ({ status: 200, data: {} }),
    },
  });
  await h.settle();
  h.id("idle-enabled").checked = true; h.id("idle-enabled").fire("change");
  h.id("hints-enabled").checked = false; h.id("hints-enabled").fire("change");
  h.id("res-mem").value = " 8G "; h.id("res-mem").fire("input");
  h.id("save-all").fire("click");
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)).sort(),
    ["/api/config/hints", "/api/config/idle", "/api/config/resources"]);
  assert.deepStrictEqual(h.bodyOf("/api/config/hints"), { enabled: false });
  assert.deepStrictEqual(h.bodyOf("/api/config/resources"), { memMax: "8G", cpuCores: "" },
    "a pasted value is trimmed, and a blank cap is sent as blank (= no cap)");
});

test("an out-of-range idle timeout is refused here — it is never POSTed", async () => {
  for (const bad of ["0", "169", "", "abc"]) {
    const h = load({ routes: { "POST /api/config/idle": () => ({ status: 200, data: {} }) } });
    await h.settle();
    h.id("idle-hours").value = bad;
    h.id("idle-hours").fire("input");
    h.id("save-all").fire("click");
    await h.settle();
    assert.strictEqual(h.posts().length, 0, `"${bad}" hours must not reach the API`);
    assert.strictEqual(h.id("save-status").textContent, "Idle hours must be 1–168");
    assert.strictEqual(h.id("save-status").className, "status err");
  }
});

test("a valid value at each end of the range IS sent", async () => {
  for (const good of ["1", "168"]) {
    const h = load({ routes: { "POST /api/config/idle": () => ({ status: 200, data: {} }) } });
    await h.settle();
    h.id("idle-hours").value = good;
    h.id("idle-hours").fire("input");
    h.id("save-all").fire("click");
    await h.settle();
    assert.strictEqual(h.posts().length, 1, good + " hours is inside the range");
    assert.strictEqual(h.bodyOf("/api/config/idle").hours, Number(good));
  }
});

test("a section the server rejects stays dirty so the edit is not silently lost", async () => {
  const h = load({
    routes: {
      "POST /api/config/idle": () => ({ status: 200, data: {} }),
      "POST /api/config/resources": () => ({ status: 400, data: { error: "bad memory value" } }),
    },
  });
  await h.settle();
  h.id("idle-enabled").checked = true; h.id("idle-enabled").fire("change");
  h.id("res-mem").value = "4 gigs"; h.id("res-mem").fire("input");
  h.id("save-all").fire("click");
  await h.settle();
  assert.strictEqual(h.id("save-status").textContent, "bad memory value", "the server's reason is shown");
  assert.strictEqual(h.id("save-status").className, "status err");
  assert.strictEqual(h.id("save-all").disabled, false, "Save stays live because something is still unsaved");
  // The section that DID save is committed: saving again re-sends only the failure.
  h.id("save-all").fire("click");
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)), ["/api/config/idle", "/api/config/resources", "/api/config/resources"]);
});

test("Ctrl+S saves, but only when there is something to save", async () => {
  const h = load({ routes: { "POST /api/config/hints": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.doc.fire("keydown", { key: "s", ctrlKey: true });
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "a clean panel must not POST on Ctrl+S");
  h.id("hints-enabled").checked = false; h.id("hints-enabled").fire("change");
  h.doc.fire("keydown", { key: "s", metaKey: true });
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)), ["/api/config/hints"]);
});

// ---- the sudo gate -------------------------------------------------------

test("a 403 replaces the panel with the 'requires sudo' notice instead of failing silently", async () => {
  const deny = () => ({ status: 403, data: { error: "forbidden" } });
  const h = load({
    routes: {
      "GET /api/config/idle": deny, "GET /api/config/hints": deny, "GET /api/config/resources": deny,
      "GET /api/config/services": deny, "GET /api/config/users": deny, "GET /api/config/disk": deny,
      "GET /api/config/sessions": deny,
    },
  });
  await h.settle();
  assert.strictEqual(h.id("denied").style.display, "block", "the non-admin is told why");
  assert.strictEqual(h.id("body").style.display, "none", "and the controls are taken away");
  assert.strictEqual(h.id("tabs").style.display, "none");
  assert.strictEqual(h.posts().length, 0);
});

test("a 403 on SAVE also locks the panel, and no success is claimed", async () => {
  const h = load({ routes: { "POST /api/config/hints": () => ({ status: 403, data: {} }) } });
  await h.settle();
  h.id("hints-enabled").checked = false; h.id("hints-enabled").fire("change");
  h.id("save-all").fire("click");
  await h.settle();
  assert.strictEqual(h.id("denied").style.display, "block");
  assert.notStrictEqual(h.id("save-status").textContent, "Saved", "a refused save must never read 'Saved'");
});

// ---- users ---------------------------------------------------------------

test("adding a user needs both fields before anything is POSTed", async () => {
  const h = load({ routes: { "POST /api/config/users/add": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.id("add-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 0);
  assert.strictEqual(h.id("add-status").textContent, "Username and password required");
  h.id("add-user").value = "  alex  ";
  h.id("add-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "a username with no password is still refused");
  h.id("add-pw").value = "s3cret";
  h.id("add-btn").fire("click");
  await h.settle();
  assert.deepStrictEqual(h.bodyOf("/api/config/users/add"), { username: "alex", password: "s3cret" },
    "the username is trimmed; the password is sent as typed");
  assert.strictEqual(h.id("add-user").value, "", "and the form is cleared afterwards");
  assert.strictEqual(h.id("add-pw").value, "");
});

test("the delete button only exists once the advanced lock is opened", async () => {
  const h = load({ routes: { "GET /api/config/users": () => ({ status: 200, data: { users: [{ user: "jing", uid: 1001, sudo: false, online: true, lastActive: Math.floor(Date.now() / 1000) - 30 }] } }) } });
  await h.settle();
  assert.ok(h.id("users-body").innerHTML.indexOf("act-rm") < 0, "account deletion is locked by default");
  assert.ok(h.id("users-body").innerHTML.indexOf("act-pw") >= 0, "but a password reset is always offered");
  const adv = h.id("users-advanced");
  adv.checked = true;
  adv.fire("change");
  await h.settle();
  assert.ok(h.id("users-body").innerHTML.indexOf("act-rm") >= 0, "unlocking re-renders with the delete button");
});

test("deleting an account is refused unless the typed name matches exactly", async () => {
  const h = load({ routes: { "POST /api/config/users/remove": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.rowClick("users-body", "btn-danger sm act-rm", "data-user", "jing");
  h.prompt("jingg", true);                       // a near miss
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "a mistyped name must delete nothing");
  assert.ok(/did not match/.test(h.alerts.join(" ")));
  h.rowClick("users-body", "btn-danger sm act-rm", "data-user", "jing");
  h.prompt("jing", true);
  await h.settle();
  assert.deepStrictEqual(h.bodyOf("/api/config/users/remove"), { username: "jing", keepHome: true },
    "and the home directory is kept when the box is ticked");
});

test("cancelling the delete prompt sends nothing at all", async () => {
  const h = load({ routes: { "POST /api/config/users/remove": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.rowClick("users-body", "btn-danger sm act-rm", "data-user", "jing");
  h.prompt(null);
  await h.settle();
  assert.strictEqual(h.posts().length, 0);
});

test("a blank new password is not sent", async () => {
  const h = load({ routes: { "POST /api/config/users/passwd": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.rowClick("users-body", "btn-secondary sm act-pw", "data-user", "jing");
  h.prompt("");
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "an empty password must never be POSTed");
  h.rowClick("users-body", "btn-secondary sm act-pw", "data-user", "jing");
  h.prompt("new-pass");
  await h.settle();
  assert.deepStrictEqual(h.bodyOf("/api/config/users/passwd"), { username: "jing", password: "new-pass" });
});

test("'last active' reads as human time, and a never-signed-in account says never", async () => {
  const now = Math.floor(Date.now() / 1000);
  const h = load({
    routes: { "GET /api/config/users": () => ({ status: 200, data: { users: [
      { user: "a", uid: 1, lastActive: now - 10 }, { user: "b", uid: 2, lastActive: now - 600 },
      { user: "c", uid: 3, lastActive: now - 7200 }, { user: "d", uid: 4, lastActive: now - 3 * 86400 },
      { user: "e", uid: 5, lastActive: null },
    ] } }) },
  });
  await h.settle();
  const html = h.id("users-body").innerHTML;
  for (const want of ["just now", "10m ago", "2h ago", "3d ago", "never"]) {
    assert.ok(html.indexOf(">" + want + "<") >= 0, want + " should appear in the list: " + html);
  }
});

test("a user's name and gecos cannot inject markup into the list", async () => {
  const h = load({ routes: { "GET /api/config/users": () => ({ status: 200, data: { users: [{ user: '<img src=x onerror="x()">', uid: 1, name: "</div><script>" }] } }) } });
  await h.settle();
  const html = h.id("users-body").innerHTML;
  assert.ok(html.indexOf("<img") < 0 && html.indexOf("<script") < 0);
  assert.ok(html.indexOf("&lt;img") >= 0);
});

// ---- sessions ------------------------------------------------------------

test("signing a user out is confirmed, and carries the stop-apps choice", async () => {
  const h = load({ routes: { "POST /api/config/sessions/signout": () => ({ status: 200, data: {} }) } });
  await h.settle();
  h.rowClick("sessions-body", "btn-secondary sm act-so", "data-user", "jing");
  h.prompt(null);
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "cancelling signs nobody out");
  h.rowClick("sessions-body", "btn-secondary sm act-so", "data-user", "jing");
  h.prompt("", true);
  await h.settle();
  assert.deepStrictEqual(h.bodyOf("/api/config/sessions/signout"), { username: "jing", stopApps: true });
});

// ---- services ------------------------------------------------------------

test("a service's state decides its row class, so a dead unit is visibly dead", async () => {
  const h = load({
    routes: { "GET /api/config/services": () => ({ status: 200, data: { services: [
      { name: "vibetop-manager", label: "Manager", status: "active" },
      { name: "nginx", label: "Web server", status: "failed" },
      { name: "x", label: "X", status: "activating" },
    ] } }) },
  });
  await h.settle();
  const html = h.id("svc-body").innerHTML;
  assert.ok(/svc-row svc-active[\s\S]*Manager/.test(html));
  assert.ok(/svc-row svc-bad[\s\S]*Web server/.test(html), "a failed unit gets the bad row, not the unknown one");
  assert.ok(/svc-row svc-unknown[\s\S]*X/.test(html), "a transitional state is 'unknown', not a failure");
});

test("restarting a service is confirmed first and sends the unit NAME, not its label", async () => {
  const h = load({ confirms: [false, true], routes: { "POST /api/config/services/restart": () => ({ status: 200, data: {} }) } });
  await h.settle();
  const btn = h.rowClick("svc-body", "btn-secondary sm act-restart", "data-svc", "nginx");
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "declining restarts nothing");
  assert.ok(h.confirms[0].opts.danger, "and it is presented as disruptive");
  assert.match(h.confirms[0].message, /Web server/, "the human label is what the user is asked about");
  const btn2 = h.rowClick("svc-body", "btn-secondary sm act-restart", "data-svc", "nginx");
  await h.settle();
  assert.deepStrictEqual(h.bodyOf("/api/config/services/restart"), { service: "nginx" });
  assert.strictEqual(btn2.disabled, true, "the button locks while it restarts");
  assert.strictEqual(btn2.textContent, "Restarting…");
});

test("a restart that drops the connection recovers the button instead of wedging it", async () => {
  const h = load({ routes: { "POST /api/config/services/restart": () => ({ __reject: true }) } });
  await h.settle();
  const btn = h.rowClick("svc-body", "btn-secondary sm act-restart", "data-svc", "vibetop-manager");
  await h.settle();
  assert.strictEqual(btn.disabled, false, "restarting the manager drops its own reply — the UI must recover");
  assert.strictEqual(btn.textContent, "Restart");
});

// ---- disk ----------------------------------------------------------------

test("disk usage is formatted, and a nearly-full filesystem is flagged", async () => {
  const h = load({
    routes: { "GET /api/config/disk": () => ({ status: 200, data: {
      filesystems: [
        { mount: "/", pct: 42, free: 512, total: 1024 },
        { mount: "/data", pct: 91, free: 1073741824, total: 2199023255552 },
        { mount: "/boot", pct: 97, free: 1024, total: 1048576 },
      ],
      homes: [{ user: "junjie", bytes: 5368709120 }],
    } }) },
  });
  await h.settle();
  const html = h.id("disk-body").innerHTML;
  assert.ok(/512 B free \/ 1\.0 KB/.test(html), "bytes scale by 1024: " + html);
  assert.ok(/1\.0 GB free \/ 2\.0 TB/.test(html));
  assert.ok(/5\.0 GB/.test(html), "a home directory size is formatted too");
  assert.ok(/bar-fill " style="width:42%/.test(html), "a healthy filesystem gets no warning class");
  assert.ok(/bar-fill warn" style="width:91%/.test(html), "over 90% is a warning");
  assert.ok(/bar-fill crit" style="width:97%/.test(html), "over 95% is critical");
});

test("a host that reports no disk data says so instead of rendering an empty box", async () => {
  const h = load();
  await h.settle();
  assert.ok(/No data\./.test(h.id("disk-body").innerHTML));
});
