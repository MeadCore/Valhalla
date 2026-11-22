// Checks Valhalla's update checker (static/app.js "updates") with pretend GitHub answers. Needs Node 18+.
//   node tools/test_updates.js
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "static", "app.js"), "utf8");
const a = src.indexOf("  const updates = {"), b = src.indexOf("  const help = {");
const VALHALLA_VERSION = (src.match(/const VALHALLA_VERSION = "([^"]+)"/) || [])[1];
const UPDATE_REPO = (src.match(/const UPDATE_REPO = "([^"]+)"/) || [])[1];
const mem = {}; const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
const esc = (x) => String(x); const $ = () => null; const toasts = []; const toast = (m) => toasts.push(m);
const CREDIT = "";
eval(src.slice(a, b).replace("const updates", "globalThis.updates"));
const u = globalThis.updates; let fails = 0;
const check = (n, ok, x) => { console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); if (!ok) fails++; };
check("repo is MeadCore/Valhalla", UPDATE_REPO === "MeadCore/Valhalla", UPDATE_REPO);
check("app.js version matches server.py", fs.readFileSync(path.join(__dirname, "..", "server.py"), "utf8").includes('VERSION = "' + VALHALLA_VERSION + '"'), VALHALLA_VERSION);
check("2.1.1 newer than 2.1.0", u.newer("2.1.1", "2.1.0"));
check("v2.2.0 newer than 2.1.0 (v prefix)", u.newer("v2.2.0", "2.1.0"));
check("2.10.0 newer than 2.9.9", u.newer("2.10.0", "2.9.9"));
check("2.1.0 not newer than 2.1.0", !u.newer("2.1.0", "2.1.0"));
check("2.0.0 not newer than 2.1.0", !u.newer("2.0.0", "2.1.0"));
const rel = (tag) => async () => ({ status: 200, ok: true, json: async () => ({ tag_name: tag, name: "Valhalla " + tag, body: "notes", html_url: "https://github.com/MeadCore/Valhalla/releases/tag/" + tag }) });
const cases = [
  ["no release yet (404)", async () => ({ status: 404, ok: false }), "none", "no release published yet"],
  ["newer release", rel("v9.0.0"), "new", "is available"],
  ["same version", rel("v" + VALHALLA_VERSION), "latest", "latest version"],
  ["offline", async () => { throw new TypeError("Failed to fetch"); }, "error", "Couldn't check right now"],
  ["rate limited (403)", async () => ({ status: 403, ok: false }), "error", "Couldn't check right now"],
  ["odd tag", rel("nightly"), "none", "no release published yet"],
];
(async () => {
  for (const [n, f, want, text] of cases) {
    globalThis.fetch = f; const r = await u.check();
    check(n + " -> " + want, r.state === want && u.describe(r).includes(text), r.state + " / " + u.describe(r));
  }
  check("auto-check is off by default (no fetch)", (() => { let called = false; globalThis.fetch = async () => { called = true; }; u.startup(); return !called; })());
  console.log(fails ? "\n" + fails + " failed" : "\nAll update checks passed.");
  process.exit(fails ? 1 : 0);
})();
