/* Valhalla - Govee lights layer. Adds your Govee lights to whichever adapter is in use (pretend devices or Home
   Assistant), so they show up in the Lights box next to the others and follow All off, Away, Night and Scene colors.

   The screen never talks to Govee itself and never sees the API key: it asks Valhalla's own server
   (server.py + govee.py), which uses LAN control when a light supports it and Govee's cloud otherwise.
     GET  api/lights/govee              the lights and how they are (the server caches, so polling is cheap)
     POST api/lights/govee/control      { id, on | brightness | rgb | kelvin | scene }
     POST api/lights/govee/paint        { colors: ["#ff0000", ...], scene: "rwb" }
     POST api/lights/govee/all-off
     GET  api/lights/govee/scenes?id=   Govee's built-in scene names for one light (cloud only)
   Govee lights appear as light.govee_<name> with attributes.govee = { id, via: "LAN"|"cloud", sku }.
   Only used when server.py runs and Govee is turned on in Setup; otherwise the base adapter is used unchanged. */
(function () {
  "use strict";
  const POLL_MS = 15000;

  function wrap(base) {
    const G = {}, byEnt = {}, subs = new Set();
    let timer = null, lastWarn = "", info = { mode: "", warning: "" };

    const toEntity = (l) => ({
      entity_id: l.entity_id, state: l.on ? "on" : "off",
      attributes: {
        friendly_name: l.name, brightness: Math.round((l.brightness || 100) * 2.55),
        color_mode: l.kelvin ? "color_temp" : l.caps.color ? "rgb" : "brightness",
        rgb_color: l.kelvin ? null : (l.rgb || (l.caps.color ? [255, 214, 160] : null)), color_temp_kelvin: l.kelvin || null,
        supports_color: !!l.caps.color, supports_ct: !!l.caps.ct, min_color_temp_kelvin: l.caps.ct_min, max_color_temp_kelvin: l.caps.ct_max,
        effect: l.scene || null, govee: { id: l.id, via: l.via, sku: l.sku, scenes: !!l.scenes, online: l.online !== false },
      },
    });
    function emit(id) { subs.forEach((fn) => { try { fn(id, G[id]); } catch (e) { console.error(e); } }); }

    async function refresh() {
      let j;
      try { j = await (await fetch("api/lights/govee", { cache: "no-store" })).json(); } catch (e) { return; }
      info = { mode: j.mode || "", warning: j.warning || "" };
      if (j.warning && j.warning !== lastWarn && window.VToast) window.VToast("Govee: " + j.warning, true);
      lastWarn = j.warning || "";
      const seen = new Set();
      (j.lights || []).forEach((l) => {
        const e = toEntity(l), old = G[e.entity_id]; seen.add(e.entity_id); byEnt[e.entity_id] = l.id;
        if (!old || JSON.stringify(old) !== JSON.stringify(e)) { G[e.entity_id] = e; emit(e.entity_id); }
      });
      Object.keys(G).forEach((k) => { if (!seen.has(k)) { delete G[k]; delete byEnt[k]; emit(k); } });
    }

    async function post(path, body) {
      const r = await fetch("api/lights/govee/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ ok: false, message: "No answer from the Valhalla server." }));
      if (!j.ok) throw new Error(j.message || (j.errors || []).join(" ") || "Govee light did not change.");
      return j;
    }
    // Show the change right away; the next poll confirms it.
    function guess(id, state, attrs) {
      const old = G[id]; if (!old) return;
      G[id] = { entity_id: id, state: state == null ? old.state : state, attributes: Object.assign({}, old.attributes, attrs || {}) }; emit(id);
    }

    async function lightCall(service, d, ids) {
      for (const id of ids) {
        const dev = byEnt[id], on = G[id] && G[id].state === "on";
        if (service === "turn_off" || (service === "toggle" && on)) { await post("control", { id: dev, on: false }); guess(id, "off"); continue; }
        if (service === "toggle") { await post("control", { id: dev, on: true }); guess(id, "on"); continue; }
        const body = { id: dev }, a = {};
        if (d.effect) { await post("control", { id: dev, scene: d.effect }); guess(id, "on", { effect: d.effect }); continue; }
        if (d.rgb_color) { body.rgb = d.rgb_color; a.rgb_color = d.rgb_color; a.color_mode = "rgb"; a.color_temp_kelvin = null; a.effect = null; }
        if (d.color_temp_kelvin) { body.kelvin = d.color_temp_kelvin; a.color_temp_kelvin = d.color_temp_kelvin; a.color_mode = "color_temp"; a.rgb_color = null; a.effect = null; }
        if (d.brightness_pct != null) { body.brightness = d.brightness_pct; a.brightness = Math.round(d.brightness_pct * 2.55); }
        if (Object.keys(body).length === 1) body.on = true;
        await post("control", body); guess(id, "on", a);
      }
    }

    return {
      name: base.name + " + Govee", pretend: base.pretend, base, govee: true,
      goveeInfo: () => info,
      async connect() {
        await base.connect();
        await refresh();
        clearInterval(timer); timer = setInterval(refresh, POLL_MS);
      },
      states: () => Object.assign({}, base.states(), G),
      subscribe(fn) { subs.add(fn); const un = base.subscribe(fn); return () => { subs.delete(fn); un(); }; },
      async call(domain, service, data) {
        data = data || {};
        if (domain === "light") {
          const all = [].concat(data.entity_id || []), mine = all.filter((x) => byEnt[x]), rest = all.filter((x) => !byEnt[x]);
          if (rest.length) await base.call(domain, service, Object.assign({}, data, { entity_id: rest }));
          if (mine.length) await lightCall(service, data, mine);
          return;
        }
        if (domain === "script" && service === "turn_on") {
          const id = data.entity_id;
          // Govee side of the Command Center buttons. The base adapter (or Home Assistant) handles everything else.
          const baseRun = base.call(domain, service, data).catch((e) => e);
          let govee = null;
          if (id === "script.valhalla_all_off" || id === "script.valhalla_away" || id === "script.valhalla_night") {
            govee = post("all-off", {}).then(() => Object.keys(G).forEach((k) => guess(k, "off")));
          } else if (id === "script.valhalla_scene_lights") {
            const v = data.variables || {};
            govee = post("paint", { colors: v.colors || [], scene: v.scene || "" }).then((j) => { setTimeout(refresh, 400); return j; });
          }
          const [b] = await Promise.all([baseRun, govee]);
          if (b instanceof Error && !govee) throw b; // e.g. Home Assistant has no such script yet, but the Govee part worked
          return;
        }
        return base.call(domain, service, data);
      },
      events: (s, e) => base.events(s, e),
      cameraSrc: (id) => base.cameraSrc(id),
      goveeScenes: async (entityId) => {
        const j = await (await fetch("api/lights/govee/scenes?id=" + encodeURIComponent(byEnt[entityId] || ""), { cache: "no-store" })).json();
        if (!j.ok) throw new Error(j.message || "No Govee scenes.");
        return j.scenes;
      },
      refreshGovee: refresh,
    };
  }

  window.VGovee = { wrap };
})();
