/* Valhalla - home command center front end. No libraries, no build step (same style as Asgard).
   All device talk goes through one adapter (adapters/mock.js now, adapters/homeassistant.js later).
   Saved per browser in localStorage: vh_scene, vh_norse, vh_preset, vh_boxes, vh_board, vh_config. */
(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  };
  const Q = new URLSearchParams(location.search);
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (isErr ? " err" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 3800);
  }
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const name = (e) => (e && e.attributes.friendly_name) || "";

  // ---------- adapter (pretend devices now, Home Assistant later) ----------
  // Settings come from server.py's /config.js (written by the Setup wizard). Without a server (static copy, or hosted
  // inside Home Assistant) the wizard saves them in this browser instead (localStorage "vh_config").
  const SERVER_CFG = window.VALHALLA_CONFIG || {};
  const CFG = SERVER_CFG.server ? Object.assign({ adapter: "mock" }, SERVER_CFG) : Object.assign({ adapter: "mock" }, SERVER_CFG, store.get("vh_config", {}));
  const BASE_A = (window.VAdapters || {})[Q.get("adapter") || CFG.adapter] || window.VAdapters.mock;
  // Govee lights (only with server.py, and only when turned on in Setup): adds them to whichever adapter is in use.
  const A = (CFG.server && CFG.govee && window.VGovee && Q.get("govee") !== "off") ? window.VGovee.wrap(BASE_A) : BASE_A;
  window.VToast = (m, err) => toast(m, err);
  const st = (id) => A.states()[id];
  const ids = (prefix) => Object.keys(A.states()).filter((k) => k.startsWith(prefix)).sort();
  const call = (d, s, data) => A.call(d, s, data).catch((e) => toast(e.message || String(e), true));

  // ---------- modal: confirm step + popovers ----------
  function confirmBox(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      const m = $("modal");
      $("modalBox").innerHTML = '<h3 id="modalTitle">' + esc(title) + "</h3><p>" + esc(text) + '</p><div class="modal-actions">' +
        '<button type="button" class="btn big ghost" data-r="0">Cancel</button><button type="button" class="btn big ' + (danger ? "danger" : "primary") + '" data-r="1">' + esc(okLabel) + "</button></div>";
      m.classList.remove("hidden");
      const done = (v) => { m.classList.add("hidden"); m.onclick = null; document.removeEventListener("keydown", key); resolve(v); };
      const key = (e) => { if (e.key === "Escape") done(false); };
      document.addEventListener("keydown", key);
      m.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); else if (e.target === m) done(false); };
      $("modalBox").querySelector('[data-r="1"]').focus();
    });
  }
  function openModal(html, cls) {
    const m = $("modal"); $("modalBox").className = "modal-box " + (cls || ""); $("modalBox").innerHTML = html; m.classList.remove("hidden");
    const close = () => { m.classList.add("hidden"); $("modalBox").className = "modal-box"; m.onclick = null; document.removeEventListener("keydown", key); };
    const key = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    m.onclick = (e) => { if (e.target === m || e.target.closest("[data-close]")) close(); };
    return close;
  }
  let popEl = null;
  function popMenu(anchor, html) {
    closePop();
    popEl = document.createElement("div"); popEl.className = "pop"; popEl.innerHTML = html; document.body.appendChild(popEl);
    const r = anchor.getBoundingClientRect(), w = popEl.offsetWidth;
    popEl.style.top = (r.bottom + 6) + "px"; popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    return popEl;
  }
  function outside(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function closePop() { if (popEl) popEl.remove(); popEl = null; document.removeEventListener("pointerdown", outside); }

  // ======================================================================
  // SCENES (holiday colors). "auto" = pick by today's date (scenes.js).
  // ======================================================================
  const scenes = {
    pick: Q.get("scene") || store.get("vh_scene", CFG.defaultScene || "auto"),
    current: null,
    resolve() {
      const norse = store.get("vh_norse", CFG.norse !== false);
      if (this.pick !== "auto" && VScenes.byId[this.pick]) return { scene: VScenes.byId[this.pick], auto: false };
      const r = VScenes.resolveAuto(new Date(), { norse: norse });
      return { scene: r.scene, auto: true, occurrence: r.occurrence };
    },
    apply() {
      const r = this.resolve(); this.current = r.scene; VScenes.apply(r.scene);
      $("logoGlyph").textContent = r.scene.glyph === "ᛟ" ? "ᛟ" : r.scene.glyph;
      $("sceneBtn").innerHTML = '<span class="sc-glyph" aria-hidden="true">' + esc(r.scene.glyph) + '</span><span class="sc-name">' + esc(r.scene.name) + "</span>" +
        (r.auto ? '<span class="sc-auto">auto</span>' : "") + '<span class="caret" aria-hidden="true">▾</span>';
      renderStatus(); board.redraw();
    },
    set(pick) { this.pick = pick; store.set("vh_scene", pick); this.apply(); },
    picker() {
      const auto = VScenes.resolveAuto(new Date(), { norse: store.get("vh_norse", CFG.norse !== false) }).scene;
      const next = {}; VScenes.upcoming(new Date(), 40, { norse: true }).forEach((o) => { if (!next[o.scene.id]) next[o.scene.id] = o; });
      const card = (s, extra) => {
        const o = next[s.id], on = this.pick === s.id;
        return '<button type="button" class="sc-card' + (on ? " on" : "") + '" data-scene="' + s.id + '">' +
          '<span class="sc-card-top"><span class="sc-glyph">' + esc(s.glyph) + '</span><b>' + esc(s.name) + "</b>" + (s.kind === "norse" ? '<span class="tag">Norse</span>' : "") + "</span>" +
          '<span class="sw">' + s.palette.map((p) => '<i style="background:' + p[0] + '" title="' + esc(p[1]) + '"></i>').join("") + "</span>" +
          '<span class="sc-sub">' + esc(extra || (o ? o.label + " · " + fmtDay(o.date) : s.blurb)) + "</span></button>";
      };
      const groups = [["Everyday", ["valhalla"]], ["Civic", ["rwb"]], ["Wheel of the Year", ["samhain", "yule", "imbolc", "ostara", "beltane", "litha", "lughnasadh", "mabon"]], ["Norse", ["winternights", "disting"]]];
      const known = new Set(groups.flatMap((g) => g[1])), own = VScenes.list.filter((x) => !known.has(x.id)).map((x) => x.id);
      if (own.length) groups.push(["Your own", own]); // scenes you add to scenes.js show up here
      const html = '<div class="sp-head"><h3 id="modalTitle">Scene</h3><button type="button" class="btn ghost" data-close>✕</button></div>' +
        '<p class="muted">Scenes recolor this screen now. After the smart bulbs arrive, the same scene paints the color lights.</p>' +
        '<button type="button" class="sc-card sc-auto-card' + (this.pick === "auto" ? " on" : "") + '" data-scene="auto"><span class="sc-card-top"><span class="sc-glyph">🗓</span><b>Auto by date</b></span>' +
        '<span class="sc-sub">Changes by itself on each holiday. Today: ' + esc(auto.glyph + " " + auto.name) + "</span></button>" +
        '<label class="sp-norse"><input type="checkbox" id="spNorse"' + (store.get("vh_norse", CFG.norse !== false) ? " checked" : "") + '> Include the Norse days (Winter Nights, Disting) in Auto</label>' +
        groups.map(([g, list]) => '<div class="sp-group">' + esc(g) + '</div><div class="sp-grid">' + list.map((id) => card(VScenes.byId[id], id === "valhalla" ? VScenes.byId[id].blurb : null)).join("") + "</div>").join("");
      const close = openModal(html, "scene-picker");
      $("modalBox").addEventListener("click", (e) => { const b = e.target.closest("[data-scene]"); if (b) { this.set(b.dataset.scene); close(); } });
      $("spNorse").addEventListener("change", (e) => { store.set("vh_norse", e.target.checked); this.apply(); close(); this.picker(); });
    },
    init() {
      $("sceneBtn").addEventListener("click", () => this.picker());
      this.apply();
      setInterval(() => { if (this.pick === "auto" && this.resolve().scene !== this.current) this.apply(); }, 60000); // rolls over at midnight
    },
  };

  // ======================================================================
  // LAYOUT PRESETS + BOXES. Desktop (>1000px): a 12 x 6 grid; each preset places the boxes (row / col / row-end / col-end).
  // Tablets get two columns and phones one column (styles.css), in the order below.
  // ======================================================================
  const BOXES = { cmd: "Command Center", cam: "Cameras", clim: "Climate", lights: "Lights", garage: "Garage", cal: "Calendar", board: "Board" };
  const PRESETS = {
    home:     { name: "Home", icon: "🏠", place: { cmd: "1/1/3/4", lights: "3/1/7/4", cam: "1/4/5/10", clim: "1/10/5/13", cal: "5/4/7/7", board: "5/7/7/10", garage: "5/10/7/13" } },
    security: { name: "Security", icon: "🛡", place: { cam: "1/1/7/10", garage: "1/10/3/13", cmd: "3/10/5/13", lights: "5/10/7/13" }, order: ["cam", "garage", "cmd", "lights"] },
    night:    { name: "Night", icon: "🌙", night: true, place: { cmd: "1/1/4/5", lights: "4/1/7/5", clim: "1/5/7/9", garage: "1/9/4/13", cam: "4/9/7/13" } },
    family:   { name: "Family", icon: "📋", place: { cal: "1/1/5/5", cmd: "5/1/7/5", board: "1/5/7/13" }, order: ["board", "cal", "cmd"] },
  };
  const presets = {
    id: Q.get("preset") || store.get("vh_preset", CFG.defaultPreset || "home"),
    apply() {
      const p = PRESETS[this.id] || PRESETS.home, hidden = store.get("vh_boxes", {})[this.id] || [];
      $("grid").dataset.preset = this.id;
      document.documentElement.dataset.night = p.night ? "1" : "";
      const order = p.order || Object.keys(BOXES);
      Object.keys(BOXES).forEach((b) => {
        const el = $("box-" + b), where = p.place[b];
        el.classList.toggle("boxoff", !where || hidden.includes(b));
        el.style.setProperty("--area", where || "auto");
        el.style.order = order.indexOf(b) < 0 ? 99 : order.indexOf(b);
      });
      $("presetBtn").innerHTML = '<span aria-hidden="true">' + p.icon + "</span> " + esc(p.name) + ' <span class="caret" aria-hidden="true">▾</span>';
      requestAnimationFrame(() => board.resize());
    },
    menu() {
      const m = popMenu($("presetBtn"), Object.entries(PRESETS).map(([k, p]) =>
        '<button type="button" class="pop-item' + (k === this.id ? " on" : "") + '" data-p="' + k + '"><span>' + p.icon + "</span>" + esc(p.name) + "</button>").join(""));
      m.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (!b) return; this.id = b.dataset.p; store.set("vh_preset", this.id); closePop(); this.apply(); });
    },
    boxesMenu() {
      const p = PRESETS[this.id], all = store.get("vh_boxes", {}), hidden = all[this.id] || [];
      const m = popMenu($("boxesBtn"), '<div class="pop-title">Boxes in ' + esc(p.name) + "</div>" + Object.keys(p.place).map((b) =>
        '<label class="pop-item"><input type="checkbox" data-b="' + b + '"' + (hidden.includes(b) ? "" : " checked") + "> " + esc(BOXES[b]) + "</label>").join(""));
      m.addEventListener("change", (e) => {
        const b = e.target.dataset.b; const h = new Set(hidden); e.target.checked ? h.delete(b) : h.add(b);
        all[this.id] = [...h]; store.set("vh_boxes", all); this.apply();
      });
    },
    init() {
      $("presetBtn").addEventListener("click", () => this.menu());
      $("boxesBtn").addEventListener("click", () => this.boxesMenu());
      this.apply();
    },
  };

  // ======================================================================
  // HEADER: clock, weather, status pills + house status strip
  // ======================================================================
  const WX = { sunny: "☀️", "clear-night": "🌙", partlycloudy: "⛅", cloudy: "☁️", rainy: "🌧️", pouring: "🌧️", lightning: "🌩️", "lightning-rainy": "⛈️", snowy: "🌨️", fog: "🌫️", windy: "💨" };
  function tickClock() { $("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function renderWeather() {
    const w = st(CFG.weather || "weather.home"); if (!w) return;
    $("wxChip").innerHTML = '<span class="wx-emoji">' + (WX[w.state] || "🌡️") + '</span><span class="wx-temp">' + Math.round(w.attributes.temperature) + (w.attributes.temperature_unit || "°") + "</span>";
    $("wxChip").title = "Outside: " + w.state.replace(/([a-z])([A-Z])/g, "$1 $2") + ", humidity " + w.attributes.humidity + "%";
  }
  let nextEvent = null;
  function renderStatus() {
    if (!A.states()["cover.garage_door"]) return;
    const pills = [];
    if (A.pretend) pills.push('<span class="pill warn" title="No real devices yet: everything here is pretend until Home Assistant is connected">Pretend devices</span>');
    else pills.push('<span class="pill ok">Home Assistant connected</span>');
    $("topStatus").innerHTML = pills.join("");
    const g = st("cover.garage_door"), mode = st("input_select.house_mode"), lightsOn = ids("light.").filter((k) => k !== "light.garage_opener" && st(k).state === "on").length;
    const climates = ids("climate."), cams = ids("camera.");
    const cell = (label, val, sub, cls) => '<div class="stat' + (cls ? " " + cls : "") + '"><div class="stat-label">' + esc(label) + '</div><div class="stat-main"><span class="stat-val">' + val + "</span></div>" + (sub ? '<div class="stat-sub">' + sub + "</div>" : "") + "</div>";
    const gs = g.state, gOpen = gs !== "closed";
    let html = cell("Mode", esc(mode ? mode.state : "Home"), "Command Center", "") +
      cell("Garage", esc(gs[0].toUpperCase() + gs.slice(1)), gOpen ? "Door is not closed" : "Door shut", gOpen ? "alert" : "ok");
    climates.forEach((c) => { const e = st(c); html += cell(name(e), Math.round(e.attributes.current_temperature) + "<small>°</small>", esc(climLabel(e)), ""); });
    html += cell("Lights", lightsOn + "<small> on</small>", "of " + (ids("light.").length - 1) + " rooms", "");
    html += cell("Cameras", cams.length + "<small> live</small>", A.pretend ? "pretend feeds" : "via Home Assistant", "");
    html += cell("Next up", nextEvent ? esc(nextEvent.summary) : "…", nextEvent ? esc((sameDay(nextEvent.start, new Date()) ? "Today" : fmtDay(nextEvent.start)) + (nextEvent.allDay ? "" : " · " + fmtTime(nextEvent.start))) : "", "wide");
    const sc = scenes.current;
    if (sc) html += cell("Scene", '<span class="sc-glyph">' + esc(sc.glyph) + "</span> " + esc(sc.name), '<span class="sw sm">' + sc.palette.map((p) => '<i style="background:' + p[0] + '"></i>').join("") + "</span>", "wide");
    $("statusStrip").innerHTML = html;
    $("modePill").textContent = mode ? mode.state : "Home";
  }

  // ======================================================================
  // COMMAND CENTER (quick actions = Home Assistant scripts with the same names)
  // ======================================================================
  const ACTIONS = [
    { id: "all_off", icon: "💡", label: "All off", sub: "Every light off", script: "script.valhalla_all_off" },
    { id: "away", icon: "🚪", label: "Away", sub: "Lights off, heat 62°, garage shut", script: "script.valhalla_away", confirm: "Set the house to Away? Lights go off, thermostats drop to 62° and the garage door closes." },
    { id: "night", icon: "🌙", label: "Night", sub: "Hall 10%, porch on, upstairs 66°", script: "script.valhalla_night" },
    { id: "lock", icon: "🔒", label: "Lock up", sub: "Close garage, outside lights on", script: "script.valhalla_lock_up", confirm: "Lock up? The garage door closes and the outside lights come on. (Smart door locks join this button when you add them.)" },
  ];
  function renderCmd() {
    $("cmdBody").innerHTML = '<div class="cmd-grid">' + ACTIONS.map((a) =>
      '<button type="button" class="cmd-btn" data-a="' + a.id + '"><span class="cmd-ico" aria-hidden="true">' + a.icon + '</span><span class="cmd-label">' + esc(a.label) + '</span><span class="cmd-sub">' + esc(a.sub) + "</span></button>").join("") + "</div>";
  }
  async function runAction(id) {
    const a = ACTIONS.find((x) => x.id === id); if (!a) return;
    if (a.confirm && !(await confirmBox(a.label, a.confirm, a.label, false))) return;
    const btn = document.querySelector('.cmd-btn[data-a="' + id + '"]'); btn.classList.add("busy");
    await call("script", "turn_on", { entity_id: a.script });
    btn.classList.remove("busy"); btn.classList.add("did"); setTimeout(() => btn.classList.remove("did"), 1200);
    toast(a.label + ": done" + (A.pretend ? " (pretend)" : ""));
  }

  // ======================================================================
  // CAMERAS: 2 x 2 grid, tap one for a big view. Pretend feeds are drawn SVG scenes.
  // ======================================================================
  const CAM_ART = {
    front_door: '<rect x="0" y="0" width="320" height="180" fill="#1b2026"/><rect x="0" y="130" width="320" height="50" fill="#262b30"/><rect x="120" y="40" width="80" height="120" fill="#3a2f27" stroke="#55473b" stroke-width="3"/><circle cx="188" cy="104" r="4" fill="#b8a46a"/><rect x="40" y="50" width="56" height="44" fill="#2c3540" stroke="#3d4955" stroke-width="3"/><rect x="224" y="50" width="56" height="44" fill="#2c3540" stroke="#3d4955" stroke-width="3"/><rect x="100" y="158" width="120" height="10" fill="#3b3f44"/><circle cx="160" cy="28" r="7" fill="#e8d9a0" opacity=".8"/>',
    driveway: '<rect width="320" height="180" fill="#151a20"/><rect y="0" width="320" height="70" fill="#1d2731"/><polygon points="130,70 190,70 300,180 20,180" fill="#2a2e33"/><polygon points="158,70 162,70 170,180 150,180" fill="#4a4d45" opacity=".6"/><rect x="186" y="96" width="70" height="30" rx="8" fill="#39424d"/><rect x="194" y="84" width="48" height="18" rx="6" fill="#2f3741"/><circle cx="200" cy="128" r="7" fill="#111"/><circle cx="244" cy="128" r="7" fill="#111"/><rect x="20" y="30" width="6" height="40" fill="#2f3a2a"/><circle cx="23" cy="26" r="16" fill="#243021"/>',
    backyard: '<rect width="320" height="180" fill="#18201b"/><rect width="320" height="80" fill="#1c2632"/><rect y="80" width="320" height="100" fill="#1f2a20"/>' + Array.from({ length: 16 }, (_, i) => '<rect x="' + (i * 20 + 2) + '" y="62" width="14" height="40" fill="#3a3329"/>').join("") + '<rect x="230" y="20" width="10" height="80" fill="#2e2619"/><circle cx="235" cy="22" r="30" fill="#22301f"/><rect x="60" y="120" width="70" height="8" fill="#3b3428"/><rect x="66" y="128" width="6" height="18" fill="#3b3428"/><rect x="118" y="128" width="6" height="18" fill="#3b3428"/>',
    garage_cam: '<rect width="320" height="180" fill="#202326"/><rect y="140" width="320" height="40" fill="#2b2e31"/><rect x="20" y="30" width="80" height="60" fill="#2a2e33" stroke="#3a3f45" stroke-width="2"/><line x1="20" y1="50" x2="100" y2="50" stroke="#3a3f45" stroke-width="2"/><line x1="20" y1="70" x2="100" y2="70" stroke="#3a3f45" stroke-width="2"/><rect x="140" y="96" width="140" height="44" rx="12" fill="#3a434d"/><rect x="160" y="78" width="96" height="26" rx="9" fill="#323a43"/><circle cx="168" cy="142" r="11" fill="#121314"/><circle cx="252" cy="142" r="11" fill="#121314"/><rect x="290" y="20" width="4" height="120" fill="#4a4a40"/>',
  };
  function camTile(id, big) {
    const e = st(id), key = id.split(".")[1], src = A.cameraSrc(id);
    const feed = src ? '<img class="cam-feed" src="' + esc(src) + '" alt="">'
      : '<svg class="cam-feed" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + (CAM_ART[key] || CAM_ART.front_door) + '<rect width="320" height="180" fill="url(#camNoise)" opacity=".18"/></svg>';
    return '<button type="button" class="cam' + (big ? " big" : "") + '" data-cam="' + id + '">' + feed +
      '<span class="cam-tl"><span class="live-dot"></span>' + esc(name(e)) + "</span>" +
      (e.attributes.motion ? '<span class="cam-tr motion">Motion</span>' : "") +
      (A.pretend ? '<span class="cam-bl">Pretend feed</span>' : "") + '<span class="cam-br cam-ts"></span></button>';
  }
  const camState = { cycle: false, idx: 0, timer: null };
  function renderCams() {
    const list = ids("camera.");
    $("camCount").textContent = list.length;
    const defs = '<svg width="0" height="0" style="position:absolute"><defs><pattern id="camNoise" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff" opacity=".25"/><rect x="2" y="2" width="2" height="2" fill="#000" opacity=".3"/></pattern></defs></svg>';
    $("camBody").innerHTML = defs + (camState.cycle ? '<div class="cam-one">' + camTile(list[camState.idx % list.length], true) + "</div>" : '<div class="cam-grid">' + list.map((id) => camTile(id)).join("") + "</div>");
    tickCams();
  }
  function tickCams() { const t = new Date().toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); document.querySelectorAll(".cam-ts").forEach((el) => { el.textContent = t; }); }
  function bigCam(id) {
    openModal('<div class="sp-head"><h3 id="modalTitle">' + esc(name(st(id))) + '</h3><button type="button" class="btn ghost" data-close>✕</button></div><div class="cam-one">' + camTile(id, true) + "</div>", "cam-modal");
    tickCams();
  }

  // ======================================================================
  // CLIMATE: two thermostats, big - / + and a mode switch
  // ======================================================================
  const MODES = [["heat", "Heat"], ["cool", "Cool"], ["heat_cool", "Auto"], ["off", "Off"]];
  function climLabel(e) {
    const a = e.attributes;
    if (e.state === "off") return "Off";
    if (e.state === "heat_cool") return "Auto " + a.target_temp_low + "–" + a.target_temp_high + "°";
    return (e.state === "heat" ? "Heat to " : "Cool to ") + a.temperature + "°";
  }
  function renderClim() {
    $("climBody").innerHTML = ids("climate.").map((id) => {
      const e = st(id), a = e.attributes, act = a.hvac_action || "idle";
      const setter = (label, field, val) => '<div class="tset"><button type="button" class="tbtn" data-t="' + id + '" data-f="' + field + '" data-d="-1" aria-label="' + label + ' down">−</button>' +
        '<div class="tval"><span class="tnum">' + val + '°</span><span class="tlab">' + label + '</span></div><button type="button" class="tbtn" data-t="' + id + '" data-f="' + field + '" data-d="1" aria-label="' + label + ' up">+</button></div>';
      let sets = "";
      if (e.state === "heat_cool") sets = setter("Heat to", "target_temp_low", a.target_temp_low) + setter("Cool to", "target_temp_high", a.target_temp_high);
      else if (e.state !== "off") sets = setter(e.state === "heat" ? "Heat to" : "Cool to", "temperature", a.temperature);
      else sets = '<div class="toff">System off</div>';
      return '<div class="therm mode-' + e.state + '"><div class="therm-top"><div><div class="therm-name">' + esc(name(e)) + '</div><div class="therm-act ' + act + '">' + esc(act === "idle" ? "Idle" : act[0].toUpperCase() + act.slice(1)) + " · " + a.current_humidity + '% humidity</div></div>' +
        '<div class="therm-now"><span>' + Math.round(a.current_temperature) + '°</span><small>inside</small></div></div>' +
        '<div class="therm-sets">' + sets + '</div><div class="seg" role="group" aria-label="Mode">' + MODES.map(([m, l]) =>
          '<button type="button" data-m="' + m + '" data-t="' + id + '" class="' + (e.state === m ? "on" : "") + '">' + l + "</button>").join("") + "</div></div>";
    }).join("");
    const w = st(CFG.weather || "weather.home"); $("climOut").textContent = w ? "Outside " + Math.round(w.attributes.temperature) + "°" : "";
  }
  function climClick(e) {
    const b = e.target.closest("button"); if (!b || !b.dataset.t) return;
    const id = b.dataset.t, ent = st(id), a = ent.attributes;
    if (b.dataset.m) return call("climate", "set_hvac_mode", { entity_id: id, hvac_mode: b.dataset.m });
    const f = b.dataset.f, v = Math.max(a.min_temp, Math.min(a.max_temp, a[f] + (+b.dataset.d)));
    if (f === "temperature") return call("climate", "set_temperature", { entity_id: id, temperature: v });
    const lo = f === "target_temp_low" ? Math.min(v, a.target_temp_high - 2) : a.target_temp_low, hi = f === "target_temp_high" ? Math.max(v, a.target_temp_low + 2) : a.target_temp_high;
    call("climate", "set_temperature", { entity_id: id, target_temp_low: lo, target_temp_high: hi });
  }

  // ======================================================================
  // GARAGE: open / close with a confirm step
  // ======================================================================
  function renderGarage() {
    const g = st("cover.garage_door"), s = g.state, lt = st("light.garage_opener");
    const pos = s === "open" ? 100 : s === "closed" ? 0 : 50, moving = s === "opening" || s === "closing";
    $("garagePill").textContent = s[0].toUpperCase() + s.slice(1);
    $("garagePill").className = "pill " + (s === "closed" ? "ok" : "warn");
    const panels = Array.from({ length: 4 }, (_, i) => '<rect x="22" y="' + (34 + i * 24) + '" width="116" height="20" rx="2" class="gd-panel"/>').join("");
    $("garageBody").innerHTML = '<div class="gd' + (moving ? " moving" : "") + '"><svg viewBox="0 0 160 140" class="gd-svg" aria-hidden="true">' +
      '<path d="M10 40 L80 8 L150 40 L150 136 L10 136 Z" class="gd-house"/><rect x="18" y="30" width="124" height="106" class="gd-hole"/>' +
      '<g style="transform:translateY(-' + pos * 0.96 + 'px)" class="gd-door"><clipPath id="gdClip"><rect x="18" y="30" width="124" height="106"/></clipPath><g clip-path="url(#gdClip)">' + panels + "</g></g></svg>" +
      '<div class="gd-side"><div class="gd-state">' + esc(s === "closed" ? "Closed" : s === "open" ? "Open" : s === "opening" ? "Opening…" : "Closing…") + "</div>" +
      '<button type="button" class="btn big ' + (s === "closed" ? "primary" : "danger") + '" id="gdBtn"' + (moving ? " disabled" : "") + ">" + (s === "closed" ? "Open garage" : "Close garage") + "</button>" +
      '<button type="button" class="btn ghost" id="gdLight">' + (lt && lt.state === "on" ? "💡 Opener light: on" : "💡 Opener light: off") + "</button></div></div>";
  }
  async function garageClick(e) {
    if (e.target.closest("#gdLight")) return call("light", "toggle", { entity_id: "light.garage_opener" });
    if (!e.target.closest("#gdBtn")) return;
    const open = st("cover.garage_door").state === "closed";
    const ok = await confirmBox(open ? "Open the garage door?" : "Close the garage door?",
      open ? "The door will start opening right away. Make sure that is what you meant." : "Check that nothing and nobody is under the door. The safety sensor still stops it if blocked.",
      open ? "Yes, open it" : "Yes, close it", open);
    if (ok) call("cover", open ? "open_cover" : "close_cover", { entity_id: "cover.garage_door" });
  }

  // ======================================================================
  // LIGHTS by room: on/off + dimmer
  // ======================================================================
  // What a light can do. Pretend lights and Govee lights say it directly; Home Assistant lists supported_color_modes.
  function lightCaps(e) {
    const a = e.attributes, modes = a.supported_color_modes || [];
    const color = a.supports_color != null ? a.supports_color : (a.color_mode === "rgb" || modes.some((m) => /^(rgb|rgbw|rgbww|hs|xy)$/.test(m)));
    const ct = a.supports_ct != null ? a.supports_ct : (modes.includes("color_temp") || (color && a.color_mode === "rgb" && !modes.length));
    return { color: !!color, ct: !!ct, min: a.min_color_temp_kelvin || 2000, max: a.max_color_temp_kelvin || 6500 };
  }
  // Rough on-screen color for a white temperature (2000 K candle orange ... 9000 K cool blue-white).
  function kelvinRgb(k) {
    const t = Math.max(0, Math.min(1, (k - 2000) / 7000));
    return [255, Math.round(170 + 75 * t), Math.round(90 + 165 * t)];
  }
  function renderLights() {
    const list = ids("light.").filter((k) => k !== "light.garage_opener");
    $("lightCount").textContent = list.filter((k) => st(k).state === "on").length + " on";
    if (lights.dragging) return;
    $("lightsBody").innerHTML = '<div class="lights">' + list.map((id) => {
      const e = st(id), a = e.attributes, on = e.state === "on", pct = Math.round((a.brightness || 0) / 2.55), caps = lightCaps(e);
      const rgb = a.color_temp_kelvin && !a.rgb_color ? kelvinRgb(a.color_temp_kelvin) : a.rgb_color;
      const gv = a.govee ? '<span class="lt-tag" title="Govee light, controlled over ' + (a.govee.via === "LAN" ? "your home network (LAN)" : "Govee's cloud") + '">Govee · ' + esc(a.govee.via) + "</span>" : "";
      const sub = a.effect ? '<span class="lt-sub">' + esc(a.effect) + "</span>" : "";
      return '<div class="lt' + (on ? " on" : "") + '" style="--lc:' + (rgb ? "rgb(" + rgb.join(",") + ")" : "#ffd9a0") + '"><button type="button" class="lt-toggle" data-l="' + id + '" aria-pressed="' + on + '" aria-label="' + esc(name(e)) + '"><span class="bulb"></span></button>' +
        '<div class="lt-main"><div class="lt-name"><span class="lt-title">' + esc(name(e)) + gv + sub + '</span><span class="lt-pct">' + (on ? pct + "%" : "Off") + "</span></div>" +
        '<input type="range" min="1" max="100" value="' + (pct || 1) + '" data-dim="' + id + '" aria-label="' + esc(name(e)) + ' brightness"></div>' +
        (caps.color || caps.ct ? '<button type="button" class="lt-color" data-color="' + id + '" title="Color" aria-label="' + esc(name(e)) + ' color">🎨</button>' : "") + "</div>";
    }).join("") + "</div>";
  }
  const lights = { dragging: false };
  // Color picker for one light: scene colors, common colors, white temperature, and Govee's own scenes.
  const COMMON = ["#ff0000", "#ff7a00", "#ffd000", "#00c853", "#00e5ff", "#1430ff", "#8a2be2", "#ff3fa4", "#ffffff"];
  function colorPop(anchor, id) {
    const e = st(id); if (!e) return;
    const caps = lightCaps(e), a = e.attributes, sc = scenes.current;
    const sw = (h, t) => '<button type="button" class="cp-sw" data-rgb="' + h + '" style="background:' + h + '" title="' + esc(t || h) + '"></button>';
    const k = a.color_temp_kelvin || 3000;
    const pop = popMenu(anchor, '<div class="cp"><div class="cp-h">' + esc(name(e)) + "</div>" +
      (caps.color ? '<div class="cp-l">' + esc(sc.name) + ' colors</div><div class="cp-row">' + sc.lights.map((h) => sw(h, sc.name)).join("") + "</div>" +
        '<div class="cp-l">Colors</div><div class="cp-row">' + COMMON.map((h) => sw(h)).join("") + "</div>" : "") +
      (caps.ct ? '<div class="cp-l">White: <span id="cpK">' + k + ' K</span> <small>(low = warm, high = cool)</small></div><input type="range" id="cpCt" min="' + caps.min + '" max="' + caps.max + '" step="100" value="' + Math.max(caps.min, Math.min(caps.max, k)) + '">' : "") +
      (a.govee && a.govee.scenes ? '<button type="button" class="btn small ghost cp-gs" id="cpGs">✨ Govee scenes…</button><div class="cp-scenes" id="cpScenes"></div>' : "") + "</div>");
    const fit = () => { // keep the picker on screen (the Lights box is often near the bottom)
      const r = anchor.getBoundingClientRect(), h = pop.offsetHeight;
      if (r.bottom + 6 + h > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - h - 6) + "px";
    };
    fit();
    pop.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-rgb]");
      if (b) { const h = b.dataset.rgb; call("light", "turn_on", { entity_id: id, rgb_color: [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) }); closePop(); return; }
      const g = ev.target.closest("[data-gscene]");
      if (g) { call("light", "turn_on", { entity_id: id, effect: g.dataset.gscene }); toast("Govee scene: " + g.dataset.gscene); closePop(); return; }
      if (ev.target.closest("#cpGs")) {
        const box = $("cpScenes"); box.innerHTML = '<span class="muted tiny">Loading Govee scenes…</span>';
        try {
          const list = await A.goveeScenes(id);
          box.innerHTML = list.length ? list.map((n) => '<button type="button" class="cp-scene" data-gscene="' + esc(n) + '">' + esc(n) + "</button>").join("") : '<span class="muted tiny">This light has no Govee scenes.</span>';
          fit();
        } catch (err) { box.innerHTML = '<span class="muted tiny">' + esc(err.message) + "</span>"; }
      }
    });
    const ct = pop.querySelector("#cpCt");
    if (ct) {
      ct.addEventListener("input", () => { $("cpK").textContent = ct.value + " K"; });
      ct.addEventListener("change", () => call("light", "turn_on", { entity_id: id, color_temp_kelvin: +ct.value }));
    }
  }

  // ======================================================================
  // CALENDAR: events from the adapter (Home Assistant calendar entity later: Google, CalDAV or an ICS link)
  // ======================================================================
  async function renderCal() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 14);
    let evs = await A.events(start, end);
    // Holiday scenes show up as all-day entries too
    VScenes.upcoming(new Date(), 6, { norse: store.get("vh_norse", CFG.norse !== false) }).filter((o) => o.date >= start && o.date < end)
      .forEach((o) => evs.push({ summary: o.label, start: o.date, end: o.date, allDay: true, holiday: o.scene }));
    evs.sort((a, b) => a.start - b.start || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0));
    nextEvent = evs.find((e) => !e.holiday && (e.allDay ? e.end > new Date() : e.start > new Date())) || null;
    $("calSrc").textContent = A.pretend ? "House calendar · pretend" : "House calendar";
    const days = [];
    evs.forEach((e) => { const d = new Date(e.start); d.setHours(0, 0, 0, 0); let g = days.find((x) => +x.d === +d); if (!g) days.push(g = { d, list: [] }); g.list.push(e); });
    const today = new Date(), tom = new Date(); tom.setDate(tom.getDate() + 1);
    $("calBody").innerHTML = '<div class="agenda">' + days.map((g) => '<div class="ag-day"><div class="ag-date' + (sameDay(g.d, today) ? " today" : "") + '">' +
      esc(sameDay(g.d, today) ? "Today" : sameDay(g.d, tom) ? "Tomorrow" : g.d.toLocaleDateString([], { weekday: "long" })) + "<small>" + esc(g.d.toLocaleDateString([], { month: "short", day: "numeric" })) + "</small></div>" +
      g.list.map((e) => '<div class="ag-ev' + (e.holiday ? " holiday" : "") + '"><span class="ag-time">' + (e.holiday ? esc(e.holiday.glyph) : e.allDay ? "All day" : esc(fmtTime(e.start))) + '</span><span class="ag-title">' + esc(e.summary) +
        (e.location ? '<small>' + esc(e.location) + "</small>" : "") + "</span></div>").join("") + "</div>").join("") + "</div>";
    renderStatus();
  }

  // ======================================================================
  // DRY-ERASE BOARD: draw with a finger or mouse. Strokes are saved as points (0-1 of the board size), so the drawing
  // survives resizes and layout changes. Saved in localStorage vh_board.
  // ======================================================================
  // Dry-erase board. With server.py running, the board is stored on the server (data/board.json) and every screen
  // that has Valhalla open (wall screen + phones over Tailscale) gets each stroke live (Server-Sent Events; falls back
  // to checking every 4 seconds). Without a server (e.g. opened as a plain file) it is kept in this browser only.
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const sync = {
    on: !!(CFG.server && CFG.boardSync !== false), client: uid(), rev: 0, es: null, poll: null, fails: 0, state: "local",
    async req(method, body) {
      const r = await fetch("api/board", { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(Object.assign({ client: this.client }, body)) : undefined, cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Board server error");
      return r.json();
    },
    send(body) { if (!this.on) return board.saveLocal(); this.req("POST", body).catch(() => { this.status("offline"); board.saveLocal(); }); },
    async pull() { const d = await this.req("GET"); this.rev = d.rev; board.strokes = d.strokes; board.redraw(); board.saveLocal(); this.status("live"); },
    apply(ev) {
      if (ev.rev !== this.rev + 1) { this.pull().catch(() => {}); return; } // missed something: get the whole board
      this.rev = ev.rev;
      if (ev.client === this.client) return; // our own stroke coming back
      if (ev.op === "add" && !board.strokes.some((x) => x.id === ev.stroke.id)) board.strokes.push(ev.stroke);
      if (ev.op === "remove") board.strokes = board.strokes.filter((x) => x.id !== ev.id);
      if (ev.op === "clear") board.strokes = [];
      if (ev.op === "replace") board.strokes = ev.strokes;
      board.redraw(); board.saveLocal();
    },
    listen() {
      if (!window.EventSource) return this.startPoll();
      this.es = new EventSource("api/board/events");
      this.es.addEventListener("hello", (e) => { this.fails = 0; const r = JSON.parse(e.data).rev; if (r !== this.rev) this.pull().catch(() => {}); else this.status("live"); });
      this.es.onmessage = (e) => this.apply(JSON.parse(e.data));
      this.es.onerror = () => { this.status("offline"); if (++this.fails >= 3) { this.es.close(); this.startPoll(); } };
    },
    startPoll() {
      clearInterval(this.poll);
      this.poll = setInterval(async () => { try { const d = await this.req("GET"); if (d.rev !== this.rev) { this.rev = d.rev; board.strokes = d.strokes; board.redraw(); } this.status("live"); } catch (e) { this.status("offline"); } }, 4000);
    },
    status(s) {
      this.state = s; const el = $("boardSync"); if (!el) return;
      const t = { live: ["⇄ Synced", "Shared with every screen and phone that has Valhalla open"], offline: ["⚠ Reconnecting", "Can't reach the Valhalla server; drawing here is kept and re-synced when it's back"], local: ["This screen only", "Board sync is off (or no Valhalla server), so this board is only on this screen"] }[s];
      el.textContent = t[0]; el.title = t[1]; el.className = "sync-pill " + s;
    },
    async init(seed) {
      if (!this.on) { this.status("local"); return false; }
      try {
        await this.pull();
        if (!board.strokes.length && this.rev === 0 && seed) await this.req("POST", { op: "seed", strokes: seed });
        this.listen(); return true;
      } catch (e) { this.status("offline"); this.startPoll(); return false; }
    },
  };

  const board = {
    strokes: store.get("vh_board", []), mine: [], cur: null, color: "#f4f6fb", size: 6, erase: false, ctx: null, w: 0, h: 0,
    colors() { const sc = scenes.current; return ["#f4f6fb", "#ffd23f", "#ff4d5e", "#3ddc84", "#4aa8ff", sc ? sc.vars.accent : "#d4a64a"]; },
    tools() {
      const c = this.colors();
      $("boardTools").innerHTML = c.map((col, i) => '<button type="button" class="bt-color' + (!this.erase && this.color === col ? " on" : "") + '" data-c="' + col + '" style="--c:' + col + '" title="' + (i === 5 ? "Scene color" : "Marker") + '"></button>').join("") +
        '<span class="bt-sep"></span>' + [[3, "Fine"], [6, "Marker"], [14, "Thick"]].map(([s, l]) => '<button type="button" class="bt-size' + (this.size === s ? " on" : "") + '" data-s="' + s + '" title="' + l + '"><i style="width:' + (s + 4) + "px;height:" + (s + 4) + 'px"></i></button>').join("") +
        '<span class="bt-sep"></span><button type="button" class="btn small ghost' + (this.erase ? " on" : "") + '" data-tool="erase" title="Eraser">🧽 Eraser</button>' +
        '<button type="button" class="btn small ghost" data-tool="undo" title="Undo your last stroke">↶ Undo</button>' +
        '<button type="button" class="btn small ghost" data-tool="clear" title="Wipe the whole board (on every screen)">Clear</button>';
    },
    resize() {
      const cv = $("boardCanvas"), wrap = $("boardWrap"); if (!wrap.offsetWidth) return;
      const dpr = window.devicePixelRatio || 1; this.w = wrap.clientWidth; this.h = wrap.clientHeight;
      cv.width = Math.round(this.w * dpr); cv.height = Math.round(this.h * dpr); cv.style.width = this.w + "px"; cv.style.height = this.h + "px";
      this.ctx = cv.getContext("2d"); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.redraw();
    },
    line(s) {
      const c = this.ctx, k = Math.min(this.w, this.h) / 600; // stroke width scales with the board
      c.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = Math.max(1.5, s.size * k * (s.erase ? 4 : 1)); c.lineCap = "round"; c.lineJoin = "round";
      const p = s.pts; if (!p.length) return;
      c.beginPath(); c.moveTo(p[0][0] * this.w, p[0][1] * this.h);
      if (p.length === 1) { c.arc(p[0][0] * this.w, p[0][1] * this.h, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; c.quadraticCurveTo(p[i][0] * this.w, p[i][1] * this.h, mx * this.w, my * this.h); }
      const l = p[p.length - 1]; c.lineTo(l[0] * this.w, l[1] * this.h); c.stroke();
    },
    redraw() { if (!this.ctx) return; this.ctx.clearRect(0, 0, this.w, this.h); this.strokes.forEach((s) => this.line(s)); this.ctx.globalCompositeOperation = "source-over"; this.tools(); },
    saveLocal() { clearTimeout(this.t); this.t = setTimeout(() => store.set("vh_board", this.strokes), 300); },
    pt(e) { const r = $("boardCanvas").getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]; },
    async init() {
      const cv = $("boardCanvas");
      cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); this.cur = { id: uid(), color: this.color, size: this.size, erase: this.erase, pts: [this.pt(e)] }; this.strokes.push(this.cur); this.redraw(); });
      cv.addEventListener("pointermove", (e) => { if (!this.cur) return; (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach((ev) => this.cur.pts.push(this.pt(ev))); this.redraw(); });
      const up = () => { if (!this.cur) return; const s = this.cur; this.cur = null; s.pts = s.pts.slice(0, 4000); this.mine.push(s.id); sync.send({ op: "add", stroke: s }); };
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      $("boardTools").addEventListener("click", async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.c) { this.color = b.dataset.c; this.erase = false; }
        if (b.dataset.s) this.size = +b.dataset.s;
        if (b.dataset.tool === "erase") this.erase = !this.erase;
        if (b.dataset.tool === "undo") { // undo only your own strokes, so a phone can't undo the wall screen's note
          let id; while ((id = this.mine.pop()) && !this.strokes.some((x) => x.id === id)) {}
          if (id) { this.strokes = this.strokes.filter((x) => x.id !== id); sync.send({ op: "remove", id }); }
          else if (!sync.on && this.strokes.length) { this.strokes.pop(); sync.send({}); }
        }
        if (b.dataset.tool === "clear" && this.strokes.length && await confirmBox("Wipe the board?", "This erases everything on the board" + (sync.on ? ", on every screen and phone." : "."), "Wipe it", true)) { this.strokes = []; this.mine = []; sync.send({ op: "clear" }); }
        this.redraw();
      });
      new ResizeObserver(() => this.resize()).observe($("boardWrap"));
      const seed = A.pretend && !store.get("vh_board_seen", false) ? demoNote() : null;
      if (seed) { seed.forEach((s) => { s.id = uid(); }); store.set("vh_board_seen", true); }
      if (!(await sync.init(seed))) { if (!this.strokes.length && seed) { this.strokes = seed; this.saveLocal(); } }
      this.redraw();
    },
  };
  function demoNote() {
    const S = [];
    const text = (str, x, y, sz, col) => { // tiny stroke font for the demo note only
      const G = { A: [[[0, 1], [.5, 0], [1, 1]], [[.25, .5], [.75, .5]]], B: [[[0, 1], [0, 0], [.7, 0], [.8, .25], [.7, .5], [0, .5]], [[.7, .5], [.85, .75], [.7, 1], [0, 1]]],
        C: [[[1, .1], [.6, 0], [.2, .1], [0, .5], [.2, .9], [.6, 1], [1, .9]]], D: [[[0, 0], [0, 1], [.6, 1], [.9, .7], [.9, .3], [.6, 0], [0, 0]]],
        E: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, .5], [.7, .5]]], G: [[[1, .15], [.6, 0], [.2, .1], [0, .5], [.2, .9], [.6, 1], [1, .85], [1, .55], [.6, .55]]],
        H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, .5], [1, .5]]], I: [[[.5, 0], [.5, 1]]], K: [[[0, 0], [0, 1]], [[1, 0], [0, .55], [1, 1]]], L: [[[0, 0], [0, 1], [1, 1]]],
        M: [[[0, 1], [0, 0], [.5, .6], [1, 0], [1, 1]]], N: [[[0, 1], [0, 0], [1, 1], [1, 0]]], O: [[[.5, 0], [.1, .2], [0, .5], [.1, .8], [.5, 1], [.9, .8], [1, .5], [.9, .2], [.5, 0]]],
        P: [[[0, 1], [0, 0], [.8, 0], [.9, .25], [.8, .5], [0, .5]]], R: [[[0, 1], [0, 0], [.8, 0], [.9, .25], [.8, .5], [0, .5], [1, 1]]], S: [[[1, .1], [.5, 0], [.05, .15], [.2, .45], [.8, .55], [.95, .85], [.5, 1], [0, .9]]],
        T: [[[0, 0], [1, 0]], [[.5, 0], [.5, 1]]], U: [[[0, 0], [0, .8], [.3, 1], [.7, 1], [1, .8], [1, 0]]], W: [[[0, 0], [.25, 1], [.5, .4], [.75, 1], [1, 0]]], Y: [[[0, 0], [.5, .5], [1, 0]], [[.5, .5], [.5, 1]]],
        "!": [[[.5, 0], [.5, .7]], [[.5, .95], [.5, 1]]], "-": [[[.1, .5], [.9, .5]]] };
      let cx = x;
      for (const ch of str) {
        if (ch === " ") { cx += sz * .6; continue; }
        (G[ch] || []).forEach((line) => S.push({ color: col, size: 5, erase: false, pts: line.map(([gx, gy]) => [+(cx + gx * sz * .6).toFixed(4), +(y + gy * sz * 2).toFixed(4) ]) }));
        cx += sz * .85;
      }
    };
    text("BUY MILK", .06, .12, .058, "#f4f6fb");
    text("TRASH OUT - TUE", .06, .38, .058, "#ffd23f");
    text("WELCOME HOME!", .06, .64, .065, "#3ddc84");
    S.push({ color: "#ff4d5e", size: 5, erase: false, pts: [[.035, .07], [.5, .06], [.51, .3], [.04, .31], [.035, .07]] });
    return S;
  }

  // ======================================================================
  // HELP / HOW-TO PANEL. Plain-language guides live in static/docs/*.md (also readable on GitHub or in any text editor).
  // Links inside a guide: [text](#guide:cameras) opens another guide, [text](#setup:mode) opens that Setup step.
  // ======================================================================
  const GUIDES = [
    ["start-here", "🚩", "Start here", "What Valhalla is, and the order to do things in"],
    ["install-home-assistant", "🏠", "Install Home Assistant", "Pick the box (Home Assistant Green or a mini PC) and set it up"],
    ["connect-valhalla", "🔌", "Connect Valhalla to Home Assistant", "Make a token, run the Setup wizard, switch off pretend mode"],
    ["cameras", "📷", "Add the cameras", "One camera at a time, then show them on the wall"],
    ["thermostats", "🌡", "Add the thermostats", "Both thermostats, and naming them so Valhalla finds them"],
    ["garage-door", "🚗", "Add the garage door", "Opener options and the safety steps"],
    ["lights", "💡", "Add the lights", "Smart bulbs and switches, and which ones show scene colors"],
    ["govee-lights", "🌈", "Govee lights", "API key, LAN Control, and which Govee lights to buy"],
    ["remote-access", "🌍", "Use it from anywhere (safely)", "Tailscale or Home Assistant Cloud. No port forwarding"],
    ["calendar", "📅", "Link the house calendar", "Google, iCloud, Outlook, Nextcloud: ICS link or CalDAV"],
    ["kiosk-touchscreen", "🖥", "Touchscreen kiosk mode", "Full screen on start-up, screen sleep, touch tips"],
    ["board-sync", "📝", "Dry-erase board sync", "Draw on the wall, see it on your phone (and back)"],
    ["scenes", "🎨", "Holiday scenes", "Change colors and dates, or add your own day"],
  ];
  function md(src) {
    const inline = (t) => esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
        if (url.startsWith("#guide:")) return '<a href="#" data-guide="' + url.slice(7) + '">' + txt + "</a>";
        if (url.startsWith("#setup:")) return '<a href="#" class="js-open-setup" data-step="' + url.slice(7) + '">' + txt + "</a>";
        return /^https:\/\//.test(url) ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + txt + " ↗</a>" : txt;
      });
    const lines = src.replace(/\r/g, "").split("\n"), out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^```/.test(l)) { const buf = []; while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]); out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>"); continue; }
      let m;
      if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { out.push("<h" + (m[1].length + 2) + ">" + inline(m[2]) + "</h" + (m[1].length + 2) + ">"); continue; }
      if (/^>\s?/.test(l)) { const buf = []; i--; while (++i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i].replace(/^>\s?/, "")); i--; out.push('<div class="md-tip">' + inline(buf.join(" ")) + "</div>"); continue; }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l), buf = []; i--;
        while (++i < lines.length && /^\s*([-*]|\d+\.)\s+|^\s{2,}\S/.test(lines[i])) {
          if (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^\s{2,}/.test(lines[i])) buf.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
          else buf[buf.length - 1] += "<br>" + lines[i].trim().replace(/^[-*]\s+/, "• ");
        }
        i--; out.push((ordered ? "<ol>" : "<ul>") + buf.map((b) => "<li>" + inline(b).replace(/&lt;br&gt;/g, "<br>") + "</li>").join("") + (ordered ? "</ol>" : "</ul>")); continue;
      }
      if (/^\|/.test(l)) {
        const rows = []; i--; while (++i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i]); i--;
        const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        out.push('<div class="md-table"><table><tr>' + cells(rows[0]).map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr>" +
          rows.slice(2).map((r) => "<tr>" + cells(r).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</table></div>"); continue;
      }
      if (!l.trim()) continue;
      const buf = [l]; while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|>|```|\||\s*([-*]|\d+\.)\s)/.test(lines[i + 1])) buf.push(lines[++i]);
      out.push("<p>" + inline(buf.join(" ")) + "</p>");
    }
    return out.join("\n");
  }
  const help = {
    open(id) {
      const html = '<div class="help-head"><h3 id="modalTitle">❔ Help &amp; how-to guides</h3><button type="button" class="btn small ghost" data-close>Close ✕</button></div>' +
        '<div class="help-wrap"><nav class="help-list" aria-label="Guides">' + GUIDES.map(([g, ic, t, sub], n) =>
          '<button type="button" class="help-item" data-guide="' + g + '"><span class="hi-num">' + (n ? n : "★") + '</span><span class="hi-ic" aria-hidden="true">' + ic + '</span><span><b>' + esc(t) + "</b><small>" + esc(sub) + "</small></span></button>").join("") +
        '<button type="button" class="help-item setup-link js-open-setup" data-step="welcome"><span class="hi-num">⚙</span><span class="hi-ic"></span><span><b>Open the Setup wizard</b><small>Save your settings step by step</small></span></button>' +
        '</nav><article class="help-doc" id="helpDoc" tabindex="-1"></article></div>';
      openModal(html, "help-modal");
      $("modalBox").addEventListener("click", (e) => { const a = e.target.closest("[data-guide]"); if (a) { e.preventDefault(); this.show(a.dataset.guide); } });
      this.show(id || store.get("vh_help_last", "start-here"));
    },
    async show(id) {
      const g = GUIDES.find((x) => x[0] === id) || GUIDES[0]; store.set("vh_help_last", g[0]);
      document.querySelectorAll(".help-item[data-guide]").forEach((b) => b.classList.toggle("on", b.dataset.guide === g[0]));
      const doc = $("helpDoc"); if (!doc) return;
      doc.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const r = await fetch("docs/" + g[0] + ".md", { cache: "no-store" }); if (!r.ok) throw new Error(r.status);
        doc.innerHTML = md(await r.text()) + '<p class="help-file muted tiny">This guide is the file <code>static/docs/' + g[0] + '.md</code>. You can open it in any text editor too.</p>';
      } catch (e) { doc.innerHTML = "<h3>" + esc(g[2]) + '</h3><p>Could not load this guide here. Open <code>static/docs/' + g[0] + ".md</code> in a text editor.</p>"; }
      doc.scrollTop = 0;
    },
  };

  // ======================================================================
  // ⚙ SETUP WIZARD (same idea as Asgard's). Each step saves only its own whitelisted keys:
  //   with server.py  -> POST api/setup/config (validated, written to config.json, backup kept)
  //   without server  -> this browser only (localStorage "vh_config"), and Home Assistant sign-in uses HA's own login.
  // Pretend devices (mock) keep working the whole time, so it is safe to run before you own any hardware.
  // ======================================================================
  const STEPS = [
    { id: "welcome", icon: "👋", name: "Welcome" },
    { id: "mode", icon: "🏠", name: "Home Assistant" },
    { id: "devices", icon: "📷", name: "Devices" },
    { id: "govee", icon: "🌈", name: "Govee lights" },
    { id: "calendar", icon: "📅", name: "Calendar & weather" },
    { id: "screen", icon: "🖥", name: "Screen" },
    { id: "remote", icon: "🌍", name: "Phones & board" },
    { id: "done", icon: "✅", name: "Done" },
  ];
  const LOCAL_MAP = { adapter: "adapter", ha_url: "haUrl", calendars: "calendars", weather_entity: "weather", default_preset: "defaultPreset", default_scene: "defaultScene", norse_days: "norse", board_sync: "boardSync", setup_done: "setupDone" };
  const setup = {
    i: 0, vals: {}, server: false, local: true, found: null,
    async load() {
      this.server = !!CFG.server; this.local = CFG.local !== false;
      const d = {
        adapter: CFG.adapter || "mock", ha_url: CFG.haUrl || "", ha_token: "", calendars: CFG.calendars || ["calendar.house"], weather_entity: CFG.weather || "weather.home",
        default_preset: CFG.defaultPreset || "home", default_scene: CFG.defaultScene || "auto", norse_days: CFG.norse !== false, board_sync: CFG.boardSync !== false,
        remote_listen: "", ha_remote_url: "", listen_port: 8795, setup_done: !!CFG.setupDone, _tokenMask: "",
        govee_enabled: !!CFG.govee, govee_lan: true, govee_lan_ips: [], govee_builtin_scenes: false, _goveeMask: "",
      };
      if (this.server && this.local) {
        try {
          const r = await (await fetch("api/setup/status", { cache: "no-store" })).json();
          Object.entries(r.keys || {}).forEach(([k, v]) => { if (k === "ha_token") d._tokenMask = v.value; else if (k === "govee_api_key") d._goveeMask = v.value; else d[k] = v.value; });
        } catch (e) { /* keep defaults */ }
      }
      this.vals = d;
    },
    async open(stepId) {
      await this.load();
      this.i = Math.max(0, STEPS.findIndex((s) => s.id === stepId));
      openModal('<div id="wizard"></div>', "wizard-modal");
      $("modalBox").addEventListener("click", (e) => this.click(e));
      this.render();
    },
    field(k, label, input, hint) { return '<label class="wz-field"><span class="wz-label">' + esc(label) + "</span>" + input + (hint ? '<span class="wz-hint">' + hint + "</span>" : "") + '<span class="wz-err" data-err="' + k + '"></span></label>'; },
    text(k, ph, type) { return '<input class="wz-input" data-k="' + k + '" type="' + (type || "text") + '" autocomplete="off" spellcheck="false" placeholder="' + esc(ph || "") + '" value="' + esc(Array.isArray(this.vals[k]) ? this.vals[k].join(", ") : this.vals[k] || "") + '">'; },
    toggle(k, label) { return '<label class="wz-check"><input type="checkbox" data-k="' + k + '"' + (this.vals[k] ? " checked" : "") + "> " + esc(label) + "</label>"; },
    select(k, opts) { return '<select class="wz-input" data-k="' + k + '">' + opts.map(([v, t]) => '<option value="' + v + '"' + (this.vals[k] === v ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select>"; },
    guide(id, txt) { return '<a href="#" class="wz-guide" data-help="' + id + '">📖 ' + esc(txt) + "</a>"; },
    body(id) {
      const v = this.vals, mode = v.adapter === "ha";
      if (id === "welcome") return "<p>This wizard saves Valhalla's settings one step at a time. You can stop any time and come back with the <b>⚙</b> button.</p>" +
        '<div class="wz-card"><b>' + (mode ? "🏠 Connected to Home Assistant" : "🧪 Pretend-devices mode is on") + "</b><span>" + (mode ? "Valhalla talks to your Home Assistant." : "Valhalla shows a made-up house (4 cameras, 2 thermostats, a garage door, lights) so you can try everything before you buy anything. Nothing you tap reaches a real device.") + "</span></div>" +
        '<div class="wz-card"><b>' + (this.server ? (this.local ? "💾 Settings are saved in config.json" : "🔒 Setup is only on the wall-screen computer") : "💾 Settings are saved in this browser") + "</b><span>" +
        (this.server ? (this.local ? "That file stays on this computer. Keep it private: it can hold your Home Assistant token." : "For safety, settings can only be changed on the computer that runs Valhalla. You can still read every step here.") : "No Valhalla server is running here, so these settings only apply to this browser.") + "</span></div>" +
        "<p class=\"muted\">New to all this? Read " + this.guide("start-here", "Start here") + " first. It lists the order to do things in.</p>";
      if (id === "mode") return '<div class="wz-seg">' + [["mock", "🧪 Pretend devices", "Try it now, no hardware"], ["ha", "🏠 Home Assistant", "Your real house"]].map(([k, t, s]) =>
          '<button type="button" class="wz-opt' + (v.adapter === k ? " on" : "") + '" data-adapter="' + k + '"><b>' + t + "</b><small>" + s + "</small></button>").join("") + "</div>" +
        '<div class="wz-ha' + (mode ? "" : " dim") + '">' +
        this.field("ha_url", "Home Assistant address", this.text("ha_url", "http://homeassistant.local:8123"), "The address you type to open Home Assistant on your home network.") +
        (this.server ? this.field("ha_token", "Long-lived access token", this.text("ha_token", v._tokenMask ? "Saved (" + v._tokenMask + "). Leave blank to keep it" : "Paste the token (starts with eyJ…)", "password"),
          "Home Assistant → your profile → Security → Long-lived access tokens → Create token. It stays in config.json on this computer and is never sent to phones.") :
          '<p class="wz-hint">Without the Valhalla server, Valhalla signs in with Home Assistant\'s own login page instead of a token.</p>') +
        (this.server ? '<div class="wz-row"><button type="button" class="btn small" data-act="test">🔎 Test connection</button><span class="wz-test" id="wzTest"></span></div>' : "") + "</div>" +
        '<p class="muted tiny">' + this.guide("install-home-assistant", "Install Home Assistant") + " · " + this.guide("connect-valhalla", "Connect Valhalla, step by step") + "</p>";
      if (id === "devices") {
        const f = this.found || {}, row = (ic, t, dom, want, g) => '<li><span>' + ic + "</span><b>" + t + '</b><span class="wz-found">' +
          (f[dom] ? "found " + f[dom].length + ": " + esc(f[dom].slice(0, 4).join(", ")) + (f[dom].length > 4 ? "…" : "") : (this.found ? "none found yet" : esc(want))) + "</span>" + this.guide(g, "How-to") + "</li>";
        return "<p>Valhalla finds devices by their Home Assistant names (entity IDs). Add devices in Home Assistant first, then name them like this:</p>" +
          '<ul class="wz-list">' + row("📷", "Cameras", "camera", "camera.front_door, camera.driveway, …", "cameras") + row("🌡", "Thermostats", "climate", "climate.upstairs, climate.downstairs", "thermostats") +
          row("🚗", "Garage door", "cover", "cover.garage_door", "garage-door") + row("💡", "Lights", "light", "light.living_room, …", "lights") + "</ul>" +
          '<p class="muted tiny">' + (this.found ? "Found by the connection test on the previous step." : "Tip: the Test button on the previous step lists what Home Assistant already has.") + " In pretend mode every box shows a made-up device; with Home Assistant, a box stays empty until its device is added.</p>";
      }
      if (id === "govee") {
        if (!this.server) return '<p>Govee lights need the Valhalla server (start.bat or Valhalla.exe), because the server keeps your Govee key private and talks to the lights on your home network.</p><p class="muted tiny">' + this.guide("govee-lights", "Govee lights, step by step") + "</p>";
        return this.toggle("govee_enabled", "Use Govee lights") +
          '<div class="wz-ha' + (v.govee_enabled ? "" : " dim") + '">' +
          this.field("govee_api_key", "Govee API key (for the cloud)", this.text("govee_api_key", v._goveeMask ? "Saved (" + v._goveeMask + "). Leave blank to keep it" : "Paste the key from Govee's e-mail", "password"),
            "Govee Home app → Profile → ⚙ Settings → Apply for API Key. Govee e-mails it to you. It stays in config.json on this computer and is never shown or sent to phones. Optional if all your lights do LAN.") +
          this.toggle("govee_lan", "Use LAN control when a light supports it (faster, works without internet)") +
          this.field("govee_lan_ips", "Light addresses (optional)", this.text("govee_lan_ips", "Leave blank: Valhalla finds them. Or 192.168.1.50, 192.168.1.51"),
            "Only needed if Valhalla can't find a LAN light by itself (some routers block the search). Give the lights fixed addresses in your router first.") +
          this.toggle("govee_builtin_scenes", "Scene colors: use Govee's own animated scenes when one matches (needs the API key)") +
          '<div class="wz-row"><button type="button" class="btn small" data-act="test-govee">🔎 Find my Govee lights</button><span class="wz-test" id="wzGovee"></span></div>' +
          '<ul class="wz-list" id="wzGoveeList"></ul></div>' +
          '<p class="muted tiny">' + this.guide("govee-lights", "Govee lights, step by step (and which ones to buy)") + "</p>";
      }
      if (id === "calendar") return this.field("calendars", "Calendars to show", this.text("calendars", "calendar.house"), "Home Assistant calendar names, separated by commas. Any provider works: Google, iCloud, Outlook, Nextcloud…") +
        this.field("weather_entity", "Weather", this.text("weather_entity", "weather.home"), "Home Assistant's built-in weather (Met.no) is free and needs no account. It's usually weather.forecast_home or weather.home.") +
        '<p class="muted tiny">' + this.guide("calendar", "Link the house calendar (ICS link or CalDAV)") + "</p>";
      if (id === "screen") return this.field("default_preset", "Layout when the screen starts", this.select("default_preset", [["home", "🏠 Home"], ["security", "🛡 Security"], ["night", "🌙 Night"], ["family", "📋 Family"]])) +
        this.field("default_scene", "Colors (scene)", this.select("default_scene", [["auto", "Auto: change by itself on each holiday"]].concat(VScenes.list.map((x) => [x.id, x.glyph + " " + x.name])))) +
        this.toggle("norse_days", "Include the Norse days (Winter Nights, Disting) in Auto") +
        '<p class="muted tiny">A choice made on the screen itself (the scene and layout buttons) still wins on that screen. ' + this.guide("scenes", "Customize or add a holiday") + " · " + this.guide("kiosk-touchscreen", "Kiosk mode") + "</p>";
      if (id === "remote") return this.toggle("board_sync", "Share the dry-erase board with every screen and phone") +
        '<p class="wz-hint">The board is stored on the Valhalla computer, and each stroke shows up live everywhere. ' + this.guide("board-sync", "How board sync works") + "</p>" +
        (this.server ? this.field("remote_listen", "Let phones reach Valhalla over Tailscale (optional)", this.text("remote_listen", "100.x.y.z  (leave blank for this computer only)"),
          "Paste this computer's Tailscale address. Only devices signed in to your own Tailscale can reach it. Takes effect after you restart Valhalla.") +
          this.field("ha_remote_url", "Home Assistant's Tailscale address (for phones)", this.text("ha_remote_url", "http://homeassistant.your-tailnet.ts.net:8123"),
          "Phones away from home use this instead of the home-network address. Phones sign in with Home Assistant's own login, never the wall screen's token.") : "") +
        '<div class="wz-card warn"><b>🚫 Never forward ports on your router</b><span>Remote access goes through Tailscale (free) or Home Assistant Cloud (paid), so nothing in your house is open to the internet.</span></div>' +
        '<p class="muted tiny">' + this.guide("remote-access", "Use it from anywhere, safely") + "</p>";
      if (id === "done") return "<p>That's it. Here's what's set:</p>" + '<ul class="wz-sum">' +
        "<li><span>Devices</span><b>" + (mode ? "🏠 Home Assistant" + (v.ha_url ? " at " + esc(v.ha_url) : "") : "🧪 Pretend devices") + "</b></li>" +
        "<li><span>Calendars</span><b>" + esc((v.calendars || []).join(", ") || "none") + "</b></li>" +
        "<li><span>Weather</span><b>" + esc(v.weather_entity || "none") + "</b></li>" +
        (this.server ? "<li><span>Govee lights</span><b>" + (v.govee_enabled ? "on" + (v.govee_lan ? " · LAN" : "") + (v._goveeMask || v.govee_api_key ? " · cloud key saved" : "") : "off") + "</b></li>" : "") +
        "<li><span>Start-up layout / colors</span><b>" + esc(v.default_preset) + " / " + esc(v.default_scene) + (v.norse_days ? " (with Norse days)" : "") + "</b></li>" +
        "<li><span>Board</span><b>" + (v.board_sync ? "shared live" : "this screen only") + "</b></li>" +
        (this.server ? "<li><span>Phones over Tailscale</span><b>" + (v.remote_listen ? esc(v.remote_listen) : "off") + "</b></li>" : "") + "</ul>" +
        '<p class="muted tiny">Finish reloads the screen with the new settings. Change anything later with the ⚙ button.</p>';
      return "";
    },
    keys: { govee: ["govee_enabled", "govee_api_key", "govee_lan", "govee_lan_ips", "govee_builtin_scenes"], mode: ["adapter", "ha_url", "ha_token"], calendar: ["calendars", "weather_entity"], screen: ["default_preset", "default_scene", "norse_days"], remote: ["board_sync", "remote_listen", "ha_remote_url"], done: ["setup_done"] },
    render() {
      const s = STEPS[this.i], last = this.i === STEPS.length - 1, ro = this.server && !this.local;
      $("wizard").innerHTML = '<div class="wz-head"><h3 id="modalTitle">⚙ Setup</h3><span class="muted tiny">Step ' + (this.i + 1) + " of " + STEPS.length + '</span><button type="button" class="btn small ghost" data-close>✕</button></div>' +
        '<ol class="wz-steps">' + STEPS.map((x, n) => '<li class="' + (n === this.i ? "on" : n < this.i ? "done" : "") + '"><button type="button" data-goto="' + n + '"><span>' + x.icon + "</span><em>" + esc(x.name) + "</em></button></li>").join("") + "</ol>" +
        '<div class="wz-body"><h4>' + s.icon + " " + esc(s.name) + "</h4>" + this.body(s.id) + "</div>" +
        '<div class="wz-foot"><button type="button" class="btn ghost" data-act="back"' + (this.i ? "" : " disabled") + ">← Back</button><span class=\"wz-sp\"></span>" +
        (last || this.i === 0 ? "" : '<button type="button" class="btn ghost" data-act="skip">Skip</button>') +
        '<button type="button" class="btn primary" data-act="next"' + (ro && this.keys[s.id] ? " disabled" : "") + ">" + (last ? "Finish ✓" : this.i === 0 ? "Let's go →" : "Save & next →") + "</button></div>";
    },
    collect() {
      const out = {};
      $("wizard").querySelectorAll("[data-k]").forEach((el) => { const k = el.dataset.k; out[k] = el.type === "checkbox" ? el.checked : el.value.trim(); });
      if (typeof out.calendars === "string") out.calendars = out.calendars.split(",").map((x) => x.trim()).filter(Boolean);
      if (typeof out.govee_lan_ips === "string") out.govee_lan_ips = out.govee_lan_ips.split(",").map((x) => x.trim()).filter(Boolean);
      if ("ha_token" in out && !out.ha_token) delete out.ha_token; // blank = keep the saved one
      if ("govee_api_key" in out && !out.govee_api_key) delete out.govee_api_key;
      return out;
    },
    async save(id) {
      const ks = this.keys[id]; if (!ks) return true;
      const got = Object.assign({}, this.collect()); if (id === "mode") got.adapter = this.vals.adapter; if (id === "done") got.setup_done = true;
      const body = {}; ks.forEach((k) => { if (k in got) body[k] = got[k]; });
      $("wizard").querySelectorAll("[data-err]").forEach((e) => { e.textContent = ""; });
      if (this.server) {
        const r = await fetch("api/setup/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({ ok: false, errors: { _: "No answer from the Valhalla server." } }));
        if (!j.ok) { Object.entries(j.errors || {}).forEach(([k, m]) => { const e = $("wizard").querySelector('[data-err="' + k + '"]'); if (e) e.textContent = m; else toast(m, true); }); return false; }
        if (j.restart) toast("Saved. Restart Valhalla (close start.bat and run it again) for the Tailscale address to take effect.");
      } else {
        const lc = store.get("vh_config", {}); Object.entries(body).forEach(([k, v]) => { if (LOCAL_MAP[k]) lc[LOCAL_MAP[k]] = v; }); store.set("vh_config", lc);
      }
      this.vals.govee_api_key = ""; // never keep the typed key around in the page
      if (body.govee_api_key) { this.vals._goveeMask = "••••" + body.govee_api_key.slice(-4); delete body.govee_api_key; }
      Object.assign(this.vals, body); if (body.ha_token) this.vals._tokenMask = "••••" + body.ha_token.slice(-4);
      return true;
    },
    async test() {
      const out = $("wzTest"); out.className = "wz-test"; out.textContent = "Checking…";
      const c = this.collect();
      try {
        const j = await (await fetch("api/setup/test-ha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ha_url: c.ha_url, ha_token: c.ha_token || "" }) })).json();
        out.className = "wz-test " + (j.ok ? "ok" : "bad"); out.textContent = (j.ok ? "✓ " : "✗ ") + j.message;
        if (j.ok) this.found = j.entities;
      } catch (e) { out.className = "wz-test bad"; out.textContent = "✗ No answer from the Valhalla server."; }
    },
    async testGovee() {
      const out = $("wzGovee"), list = $("wzGoveeList"); out.className = "wz-test"; out.textContent = "Looking for lights (a few seconds)…"; list.innerHTML = "";
      const c = this.collect();
      try {
        const j = await (await fetch("api/setup/test-govee", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ govee_api_key: c.govee_api_key || "", govee_lan: c.govee_lan, govee_lan_ips: c.govee_lan_ips || [] }) })).json();
        out.className = "wz-test " + (j.ok ? "ok" : "bad"); out.textContent = j.message;
        list.innerHTML = (j.lights || []).map((l) => "<li><span>💡</span><b>" + esc(l.name) + '</b><span class="wz-found">' + esc(l.sku) + " · " +
          (l.lan ? "LAN ✓" : "no LAN") + " · " + (l.cloud ? "cloud ✓" : "no cloud") + "</span></li>").join("");
      } catch (err) { out.className = "wz-test bad"; out.textContent = "✗ No answer from the Valhalla server."; }
    },
    async click(e) {
      const help = e.target.closest("[data-help]"); if (help) { e.preventDefault(); $("modal").click(); window.VHelpOpen(help.dataset.help); return; }
      if (e.target.dataset && e.target.dataset.k === "govee_enabled") { Object.assign(this.vals, this.collect()); this.render(); return; }
      const ad = e.target.closest("[data-adapter]"); if (ad) { Object.assign(this.vals, this.collect()); this.vals.adapter = ad.dataset.adapter; this.render(); return; }
      const g = e.target.closest("[data-goto]"); if (g) { this.i = +g.dataset.goto; this.render(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const s = STEPS[this.i];
      if (b.dataset.act === "test") return this.test();
      if (b.dataset.act === "test-govee") return this.testGovee();
      if (b.dataset.act === "back") { this.i--; return this.render(); }
      if (b.dataset.act === "skip") { this.i++; return this.render(); }
      if (b.dataset.act === "next") {
        b.disabled = true;
        const ok = await this.save(s.id).catch(() => false); b.disabled = false;
        if (!ok) return;
        if (s.id === "done") { location.reload(); return; }
        this.i++; this.render();
      }
    },
  };
  window.VHelpOpen = (id) => setTimeout(() => help.open(id), 0);
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".js-open-setup"); if (!b) return;
    e.preventDefault(); if (!$("modal").classList.contains("hidden")) $("modal").click();
    setTimeout(() => setup.open(b.dataset.step), 0);
  });

  // ======================================================================
  // WIRING
  // ======================================================================
  function renderAll() { renderWeather(); renderCmd(); renderCams(); renderClim(); renderGarage(); renderLights(); renderStatus(); }
  function onChange(id) {
    if (id.startsWith("light.")) renderLights();
    if (id.startsWith("climate.")) renderClim();
    if (id === "cover.garage_door" || id === "light.garage_opener") renderGarage();
    if (id.startsWith("camera.")) renderCams();
    if (id.startsWith("weather.")) { renderWeather(); renderClim(); }
    renderStatus();
  }
  function wire() {
    $("cmdBody").addEventListener("click", (e) => { const b = e.target.closest(".cmd-btn"); if (b) runAction(b.dataset.a); });
    $("camBody").addEventListener("click", (e) => { const b = e.target.closest("[data-cam]"); if (b && !camState.cycle) bigCam(b.dataset.cam); });
    $("camCycle").addEventListener("click", () => {
      camState.cycle = !camState.cycle; $("camCycle").classList.toggle("on", camState.cycle); clearInterval(camState.timer);
      if (camState.cycle) camState.timer = setInterval(() => { camState.idx++; renderCams(); }, 8000);
      renderCams();
    });
    $("climBody").addEventListener("click", climClick);
    $("garageBody").addEventListener("click", garageClick);
    $("lightsBody").addEventListener("click", (e) => {
      const c = e.target.closest("[data-color]"); if (c) { colorPop(c, c.dataset.color); return; }
      const b = e.target.closest("[data-l]"); if (b) call("light", "toggle", { entity_id: b.dataset.l });
    });
    $("lightsBody").addEventListener("input", (e) => {
      const id = e.target.dataset.dim; if (!id) return; lights.dragging = true;
      const row = e.target.closest(".lt"); row.classList.add("on"); row.querySelector(".lt-pct").textContent = e.target.value + "%";
    });
    $("lightsBody").addEventListener("change", (e) => {
      const id = e.target.dataset.dim; if (!id) return; lights.dragging = false;
      call("light", "turn_on", { entity_id: id, brightness_pct: +e.target.value });
    });
    $("lightsAllOff").addEventListener("click", () => call("script", "turn_on", { entity_id: "script.valhalla_all_off" }));
    $("lightsScene").addEventListener("click", () => {
      const sc = scenes.current; call("script", "turn_on", { entity_id: "script.valhalla_scene_lights", variables: { colors: sc.lights, scene: sc.id } });
      toast(sc.name + " colors sent to the color bulbs" + (A.govee ? " (Govee lights too)" : A.pretend ? " (pretend)" : ""));
    });
    $("wxChip").addEventListener("click", () => toast("Weather comes from Home Assistant's free weather service (Met.no). No account needed."));
    $("helpBtn").addEventListener("click", () => help.open());
    $("setupBtn").classList.toggle("needs", !CFG.setupDone);
    if (Q.get("open") === "setup") setup.open(Q.get("step") || "welcome");
    if (Q.get("open") === "help") help.open(Q.get("guide") || "start-here");
    $("fsBtn").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  }

  async function start() {
    tickClock(); setInterval(tickClock, 5000); setInterval(tickCams, 1000);
    scenes.init(); presets.init(); wire(); board.init();
    try { await A.connect(); } catch (e) { toast(e.message || "Could not connect", true); return; }
    A.subscribe(onChange);
    renderAll(); renderCal(); setInterval(renderCal, 5 * 60000);
    board.resize();
    document.documentElement.classList.add("ready");
  }
  start();
})();
