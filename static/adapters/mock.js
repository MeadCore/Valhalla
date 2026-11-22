/* Valhalla - pretend-device adapter. Same shape as adapters/homeassistant.js, so the UI never knows which one it has.
   Entities and services mirror Home Assistant's names (light.turn_on, climate.set_temperature, cover.open_cover,
   script.turn_on ...) so swapping to the real house is a one-line change (adapter "ha" in config).

   Adapter contract (both adapters):
     name, pretend            label + true for this one
     connect()                -> Promise
     states()                 -> { entity_id: { entity_id, state, attributes } }
     subscribe(fn)            fn(entity_id, newState) on every change; returns an unsubscribe function
     call(domain, service, data) -> Promise
     events(start, end)       -> Promise<[{ summary, start, end, allDay, location, calendar }]>
     cameraSrc(entity_id)     -> image/stream URL, or null for "draw a placeholder"
*/
(function () {
  "use strict";
  const ent = (id, state, attributes) => ({ entity_id: id, state, attributes });
  const S = {};
  function put(e) { S[e.entity_id] = e; }

  // ---- pretend house (generic names only; rename in Home Assistant later) ----
  [["front_door", "Front door"], ["driveway", "Driveway"], ["backyard", "Backyard"], ["garage_cam", "Garage"]]
    .forEach(([k, n], i) => put(ent("camera." + k, "streaming", { friendly_name: n, motion: i === 1 })));
  put(ent("climate.main_floor", "heat", { friendly_name: "Main floor", current_temperature: 70, temperature: 70, current_humidity: 41,
    hvac_action: "idle", hvac_modes: ["heat", "cool", "heat_cool", "off"], min_temp: 50, max_temp: 90, unit: "°F" }));
  put(ent("climate.upstairs", "heat_cool", { friendly_name: "Upstairs", current_temperature: 72, target_temp_low: 68, target_temp_high: 75, temperature: null,
    current_humidity: 44, hvac_action: "idle", hvac_modes: ["heat", "cool", "heat_cool", "off"], min_temp: 50, max_temp: 90, unit: "°F" }));
  put(ent("cover.garage_door", "closed", { friendly_name: "Garage door", device_class: "garage" }));
  put(ent("light.garage_opener", "off", { friendly_name: "Opener light" }));
  [["living_room", "Living room", "on", 180, true], ["kitchen", "Kitchen", "on", 255, false], ["dining_room", "Dining room", "off", 150, true],
   ["hallway", "Hallway", "off", 90, false], ["primary_bedroom", "Bedroom", "off", 120, true], ["office", "Office", "on", 210, false],
   ["front_porch", "Front porch", "off", 200, true], ["backyard", "Backyard", "off", 255, true], ["garage", "Garage", "off", 255, false]]
    .forEach(([k, n, st, br, color]) => put(ent("light." + k, st, { friendly_name: n, brightness: br, color_mode: color ? "rgb" : "brightness",
      rgb_color: color ? [255, 214, 160] : null, area: n,
      supports_color: color, supports_ct: color, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 })));
  put(ent("weather.home", "partlycloudy", { friendly_name: "Home", temperature: 68, temperature_unit: "°F", humidity: 52 }));
  put(ent("input_select.house_mode", "Home", { friendly_name: "House mode", options: ["Home", "Away", "Night"] }));

  const subs = new Set();
  function set(id, state, attrs) {
    const old = S[id];
    S[id] = { entity_id: id, state: state == null ? old.state : state, attributes: Object.assign({}, old.attributes, attrs || {}) };
    subs.forEach((fn) => { try { fn(id, S[id]); } catch (e) { console.error(e); } });
  }
  const lightsAll = () => Object.keys(S).filter((k) => k.startsWith("light.") && k !== "light.garage_opener");
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  let garageTimer = null;
  function moveGarage(target) {
    clearTimeout(garageTimer);
    set("cover.garage_door", target === "open" ? "opening" : "closing");
    garageTimer = setTimeout(() => set("cover.garage_door", target), 4000); // a real door takes ~12-15 s
  }

  // ---- services (the subset Valhalla uses) ----
  const services = {
    "light.turn_on": (d) => [].concat(d.entity_id).forEach((id) => {
      const a = {};
      if (d.brightness_pct != null) a.brightness = Math.round(d.brightness_pct * 2.55);
      if (d.rgb_color) Object.assign(a, { rgb_color: d.rgb_color, color_mode: "rgb", color_temp_kelvin: null });
      if (d.color_temp_kelvin) Object.assign(a, { color_temp_kelvin: d.color_temp_kelvin, color_mode: "color_temp", rgb_color: null });
      set(id, "on", a);
    }),
    "light.turn_off": (d) => [].concat(d.entity_id).forEach((id) => set(id, "off")),
    "light.toggle": (d) => [].concat(d.entity_id).forEach((id) => set(id, S[id].state === "on" ? "off" : "on")),
    "climate.set_temperature": (d) => set(d.entity_id, null, d.temperature != null ? { temperature: d.temperature }
      : { target_temp_low: d.target_temp_low, target_temp_high: d.target_temp_high }),
    "climate.set_hvac_mode": (d) => {
      const e = S[d.entity_id], a = e.attributes, m = d.hvac_mode;
      if (m === "heat_cool" && a.target_temp_low == null) set(d.entity_id, m, { target_temp_low: (a.temperature || 70) - 2, target_temp_high: (a.temperature || 70) + 3, temperature: null });
      else if (m !== "heat_cool" && m !== "off" && a.temperature == null) set(d.entity_id, m, { temperature: a.target_temp_low || 70, target_temp_low: null, target_temp_high: null });
      else set(d.entity_id, m);
    },
    "cover.open_cover": () => moveGarage("open"),
    "cover.close_cover": () => moveGarage("closed"),
    "input_select.select_option": (d) => set(d.entity_id, d.option),
    // Command Center quick actions = Home Assistant scripts (create these in HA later with the same names)
    "script.turn_on": (d) => {
      const id = d.entity_id;
      if (id === "script.valhalla_all_off") services["light.turn_off"]({ entity_id: lightsAll() });
      if (id === "script.valhalla_away") {
        services["light.turn_off"]({ entity_id: lightsAll() });
        set("climate.main_floor", null, { temperature: 62 }); set("climate.upstairs", "heat", { temperature: 62, target_temp_low: null, target_temp_high: null });
        if (S["cover.garage_door"].state !== "closed") moveGarage("closed");
        set("input_select.house_mode", "Away");
      }
      if (id === "script.valhalla_night") {
        services["light.turn_off"]({ entity_id: lightsAll().filter((k) => k !== "light.hallway" && k !== "light.front_porch") });
        services["light.turn_on"]({ entity_id: ["light.hallway"], brightness_pct: 10 });
        services["light.turn_on"]({ entity_id: ["light.front_porch"], brightness_pct: 40 });
        set("climate.upstairs", "heat", { temperature: 66, target_temp_low: null, target_temp_high: null });
        set("input_select.house_mode", "Night");
      }
      if (id === "script.valhalla_lock_up") {
        if (S["cover.garage_door"].state !== "closed") moveGarage("closed");
        services["light.turn_on"]({ entity_id: ["light.front_porch", "light.backyard"], brightness_pct: 60 });
      }
      if (id === "script.valhalla_scene_lights") services["script.valhalla_scene_lights"](d.variables || {});
      if (id === "script.valhalla_home") {
        services["light.turn_on"]({ entity_id: ["light.living_room", "light.kitchen"], brightness_pct: 80 });
        set("climate.main_floor", "heat", { temperature: 70 });
        set("input_select.house_mode", "Home");
      }
    },
    // Paint the scene's colors across the color bulbs (later: an HA script that receives the palette)
    "script.valhalla_scene_lights": (d) => {
      const cols = (d.colors || []).map(hexRgb);
      if (!cols.length) return;
      lightsAll().filter((k) => S[k].attributes.supports_color).forEach((k, i) => set(k, "on", { rgb_color: cols[i % cols.length], color_mode: "rgb", color_temp_kelvin: null }));
    },
  };

  // ---- pretend calendar (relative to today, generic entries) ----
  function events(start, end) {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const at = (dayOff, h, m, durMin) => { const s = new Date(base); s.setDate(s.getDate() + dayOff); s.setHours(h, m || 0, 0, 0); return [s, new Date(s.getTime() + (durMin || 60) * 60000)]; };
    const allDay = (dayOff) => { const s = new Date(base); s.setDate(s.getDate() + dayOff); const e = new Date(s); e.setDate(e.getDate() + 1); return [s, e]; };
    const list = [
      ["Trash and recycling out", ...at(0, 19, 0, 15), false, ""],
      ["Dentist", ...at(1, 9, 30, 60), false, "Dental office"],
      ["Grocery run", ...at(1, 17, 30, 60), false, ""],
      ["Game night", ...at(2, 19, 0, 180), false, "Living room"],
      ["Furnace filter change", ...allDay(3), true, ""],
      ["Vet: annual checkup", ...at(4, 10, 15, 45), false, "Animal clinic"],
      ["Pay utilities", ...allDay(6), true, ""],
      ["Family dinner", ...at(7, 18, 0, 120), false, ""],
      ["Oil change", ...at(9, 8, 0, 60), false, "Auto shop"],
    ].map(([summary, s, e, allDayFlag, location]) => ({ summary, start: s, end: e, allDay: allDayFlag, location, calendar: "House" }));
    return Promise.resolve(list.filter((ev) => ev.end > start && ev.start < end));
  }

  window.VAdapters = window.VAdapters || {};
  window.VAdapters.mock = {
    name: "Pretend devices", pretend: true,
    connect: () => Promise.resolve(),
    states: () => S,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    call(domain, service, data) {
      const f = services[domain + "." + service] || (domain === "script" && services["script." + service]);
      if (!f) return Promise.reject(new Error("Pretend house has no service " + domain + "." + service));
      return new Promise((res) => setTimeout(() => { f(data || {}); res(); }, 120)); // tiny delay feels like a network
    },
    events,
    cameraSrc: () => null,
  };
})();
