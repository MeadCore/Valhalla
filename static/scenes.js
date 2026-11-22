/* Valhalla - scene (holiday theme) definitions and the "Auto by date" resolver.
   No libraries. Exposes window.VScenes. Each scene sets the UI colors now and, later, the smart-light colors
   (lights: list of hex colors Home Assistant will cycle across the color bulbs). No personal data in here. */
(function () {
  "use strict";

  // Equinox / solstice moments (UTC) and the Disting full moon (first full moon after the first new moon after 6 Jan).
  // Order: [Ostara (March equinox), Litha (June solstice), Mabon (September equinox), Yule (December solstice), Disting].
  // Computed with PyEphem. Converted to the viewer's own local date at run time, so no time zone lives in the code.
  // Past 2035 the code falls back to the usual calendar dates (20 Mar, 21 Jun, 22 Sep, 21 Dec, 1 Feb).
  const ASTRO = {
    2025: ["2025-03-20T09:01Z", "2025-06-21T02:42Z", "2025-09-22T18:19Z", "2025-12-21T15:02Z", "2025-02-12T13:53Z"],
    2026: ["2026-03-20T14:45Z", "2026-06-21T08:24Z", "2026-09-23T00:05Z", "2026-12-21T20:49Z", "2026-02-01T22:09Z"],
    2027: ["2027-03-20T20:24Z", "2027-06-21T14:10Z", "2027-09-23T06:01Z", "2027-12-22T02:41Z", "2027-01-22T12:17Z"],
    2028: ["2028-03-20T02:16Z", "2028-06-20T20:02Z", "2028-09-22T11:45Z", "2028-12-21T08:19Z", "2028-02-10T15:03Z"],
    2029: ["2029-03-20T08:01Z", "2029-06-21T01:48Z", "2029-09-22T17:38Z", "2029-12-21T14:13Z", "2029-01-30T06:03Z"],
    2030: ["2030-03-20T13:51Z", "2030-06-21T07:31Z", "2030-09-22T23:26Z", "2030-12-21T20:09Z", "2030-02-18T06:19Z"],
    2031: ["2031-03-20T19:40Z", "2031-06-21T13:17Z", "2031-09-23T05:15Z", "2031-12-22T01:55Z", "2031-02-07T12:46Z"],
    2032: ["2032-03-20T01:21Z", "2032-06-20T19:08Z", "2032-09-22T11:10Z", "2032-12-21T07:55Z", "2032-01-27T12:52Z"],
    2033: ["2033-03-20T07:22Z", "2033-06-21T01:01Z", "2033-09-22T16:51Z", "2033-12-21T13:45Z", "2033-02-14T07:04Z"],
    2034: ["2034-03-20T13:17Z", "2034-06-21T06:44Z", "2034-09-22T22:39Z", "2034-12-21T19:33Z", "2034-02-03T10:04Z"],
    2035: ["2035-03-20T19:02Z", "2035-06-21T12:33Z", "2035-09-23T04:38Z", "2035-12-22T01:30Z", "2035-01-23T20:16Z"],
  };
  const FALLBACK = [[2, 20], [5, 21], [8, 22], [11, 21], [1, 1]]; // [monthIndex, day]

  function localDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function astro(year, i) {
    const a = ASTRO[year];
    if (a) return localDay(new Date(a[i]));
    return new Date(year, FALLBACK[i][0], FALLBACK[i][1]);
  }
  function lastMonday(year, month) { const d = new Date(year, month + 1, 0); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d; }
  function firstMonday(year, month) { const d = new Date(year, month, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d; }
  // Winter Nights default: the Saturday from 11 to 17 Oct (mid-October, common modern heathen reckoning).
  // Others keep it on the Icelandic first day of winter (Saturday 21-27 Oct) or the first full moon after the autumn equinox.
  function winterNights(year) { const d = new Date(year, 9, 11); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return d; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // vars: the CSS variables a scene overrides. palette: 3-4 colors with their meaning (shown in the picker and plan).
  // day(year): the observance date. window: [days before, days after] the scene is active in "Auto by date".
  const SCENES = [
    { id: "valhalla", name: "Valhalla", glyph: "ᛟ", kind: "base", blurb: "Everyday look: night sky, hall gold and steel.",
      palette: [["#0b0f17", "Night hall"], ["#d4a64a", "Hall gold"], ["#5b8db8", "Steel"], ["#c4532d", "Hearth ember"]],
      lights: ["#ffd9a0"], vars: { bg: "#07090e", accent: "#d4a64a", accent2: "#5b8db8", glow1: "#1d1606", glow2: "#071a2a", tint: "#0b0f17" } },

    { id: "rwb", name: "Red, White & Blue", glyph: "★", kind: "civic",
      blurb: "Old Glory for the patriotic days: Memorial Day, Flag Day, the Fourth of July, Labor Day and Veterans Day.",
      palette: [["#b22234", "Old Glory Red: hardiness and valor"], ["#ffffff", "White: purity and innocence"], ["#3c3b6e", "Old Glory Blue: vigilance, perseverance and justice"]],
      // UI: navy field with white stars and red-and-white stripes (see styles.css). Bulbs: saturated flag colors, since
      // dark brick-red and navy look muddy on an LED bulb.
      lights: ["#ff0a1e", "#ffffff", "#1430ff"], vars: { bg: "#070a1c", accent: "#b22234", accent2: "#ffffff", glow1: "#3a0711", glow2: "#1b1a52", tint: "#0e1030" },
      days: (y) => [
        { label: "Memorial Day", date: lastMonday(y, 4), window: [3, 0] },
        { label: "Flag Day", date: new Date(y, 5, 14), window: [1, 0] },
        { label: "Fourth of July", date: new Date(y, 6, 4), window: [3, 1] },
        { label: "Labor Day", date: firstMonday(y, 8), window: [2, 0] },
        { label: "Veterans Day", date: new Date(y, 10, 11), window: [1, 0] },
      ] },

    { id: "samhain", name: "Samhain", glyph: "🎃", kind: "wheel", blurb: "Final harvest; the veil is thin; honor the ancestors.",
      palette: [["#0d0a0b", "The dark half / the veil"], ["#e8731c", "Last harvest and bonfire"], ["#5b2a86", "Magic and the thinning veil"], ["#e9dfc8", "Bone: the ancestors"]],
      lights: ["#ff6a00", "#7a2cff", "#ff8c1a"], vars: { bg: "#08060a", accent: "#e8731c", accent2: "#9b5de5", glow1: "#2a1203", glow2: "#1f0b33", tint: "#120c14" },
      days: (y) => [{ date: new Date(y, 9, 31), window: [6, 2] }] },

    { id: "yule", name: "Yule", glyph: "❄", kind: "wheel", blurb: "Winter solstice; the longest night and the sun's return.",
      palette: [["#1f5b3a", "Evergreen: life endures"], ["#a3202e", "Holly and the hearth fire"], ["#e0b84a", "The returning sun"], ["#f2f4f7", "Snow and stillness"]],
      lights: ["#1fa35a", "#d61f2c", "#ffc94a"], vars: { bg: "#050b09", accent: "#e0b84a", accent2: "#3fae6f", glow1: "#2b0a0e", glow2: "#06281a", tint: "#0b1410" },
      days: (y) => [{ date: astro(y, 3), window: [7, 11] }] }, // Yuletide: the week before through about New Year

    { id: "imbolc", name: "Imbolc", glyph: "🕯", kind: "wheel", blurb: "First stirrings of spring; candle flame and Brigid's hearth.",
      palette: [["#f5f3ee", "Snow, milk and new beginnings"], ["#f2d16b", "Candle flame"], ["#9cc58b", "First sprouts"], ["#c0392b", "The hearth fire"]],
      lights: ["#fff3d6", "#ffd36b", "#b8ff9c"], vars: { bg: "#0a0b0d", accent: "#f2d16b", accent2: "#9cc58b", glow1: "#2a2410", glow2: "#16261a", tint: "#121314" },
      days: (y) => [{ date: new Date(y, 1, 1), window: [3, 2] }] },

    { id: "ostara", name: "Ostara", glyph: "🌱", kind: "wheel", blurb: "Spring equinox; day and night in balance, new growth.",
      palette: [["#9fd8a8", "New growth"], ["#f7e07e", "Dawn light"], ["#b9a3e3", "Spring flowers"], ["#8ec5ea", "Balance of day and night"]],
      lights: ["#7dffa0", "#fff07a", "#c3a0ff"], vars: { bg: "#080b0c", accent: "#9fd8a8", accent2: "#b9a3e3", glow1: "#13281a", glow2: "#1d1630", tint: "#0e1314" },
      days: (y) => [{ date: astro(y, 0), window: [4, 4] }] },

    { id: "beltane", name: "Beltane", glyph: "🔥", kind: "wheel", blurb: "Fire festival; passion, fertility and the greenwood.",
      palette: [["#d7263d", "Fire and passion"], ["#f4f1ea", "Hawthorn blossom"], ["#2e8b57", "Fertility and the greenwood"], ["#f0b429", "The Beltane fires"]],
      lights: ["#ff2a3c", "#ffb11f", "#2bd46f"], vars: { bg: "#0a0707", accent: "#f0b429", accent2: "#e2384f", glow1: "#2e0b0e", glow2: "#0b2716", tint: "#140d0d" },
      days: (y) => [{ date: new Date(y, 4, 1), window: [3, 3] }] },

    { id: "litha", name: "Litha", glyph: "☀", kind: "wheel", blurb: "Summer solstice; the sun at its height.",
      palette: [["#f6b622", "The sun at full strength"], ["#3b8fd6", "Long summer sky"], ["#f26b1d", "Midsummer fire"], ["#4caf50", "Full green growth"]],
      lights: ["#ffc21a", "#ff7a1a", "#3aa0ff"], vars: { bg: "#070a0e", accent: "#f6b622", accent2: "#3b8fd6", glow1: "#2e1f05", glow2: "#06203a", tint: "#0f1216" },
      days: (y) => [{ date: astro(y, 1), window: [4, 4] }] },

    { id: "lughnasadh", name: "Lughnasadh", glyph: "🌾", kind: "wheel", blurb: "First harvest; grain, bread and gratitude.",
      palette: [["#d8a93b", "Ripe grain"], ["#b5651d", "First bread"], ["#6b4423", "The earth"], ["#6d8b3a", "The fields"]],
      lights: ["#ffb52e", "#ff8a2b", "#a8d94a"], vars: { bg: "#0a0806", accent: "#d8a93b", accent2: "#c27a35", glow1: "#2a1d07", glow2: "#1c1a08", tint: "#14100b" },
      days: (y) => [{ date: new Date(y, 7, 1), window: [3, 3] }] },

    { id: "mabon", name: "Mabon", glyph: "🍂", kind: "wheel", blurb: "Autumn equinox; second harvest, balance and thanks.",
      palette: [["#7b1e2b", "Wine and grapes"], ["#c4622d", "Turning leaves"], ["#c9a227", "Harvest gold"], ["#5a3e2b", "Balance and gratitude"]],
      lights: ["#c4192f", "#ff6f1f", "#ffbf2a"], vars: { bg: "#0a0607", accent: "#d9772f", accent2: "#c9a227", glow1: "#2b0b10", glow2: "#271b06", tint: "#140d0d" },
      days: (y) => [{ date: astro(y, 2), window: [4, 4] }] },

    { id: "winternights", name: "Winter Nights", glyph: "🌒", kind: "norse", blurb: "Norse start of winter (mid-October Saturday); honor the dísir and the elves. Dates vary by tradition.",
      palette: [["#18233f", "Long winter dark"], ["#cfd8e3", "Frost"], ["#8e1b1b", "The blót offering"], ["#c98a2b", "Hearth amber"]],
      lights: ["#3a5bff", "#cfe0ff", "#ff3a2a"], vars: { bg: "#05070d", accent: "#c98a2b", accent2: "#7f9cc9", glow1: "#2a0909", glow2: "#0d1a3d", tint: "#0c1020" },
      days: (y) => [{ date: winterNights(y), window: [1, 2] }] },

    { id: "disting", name: "Disting", glyph: "🌕", kind: "norse", blurb: "Norse late-winter full moon (first full moon after the first new moon after 6 Jan); the dísir, the thing-assembly and the coming thaw.",
      palette: [["#a9d6f0", "Ice beginning to thaw"], ["#c8ccd4", "Silver moonlight"], ["#2b2f6b", "Winter night"], ["#f3f1e7", "The full moon"]],
      lights: ["#9fdcff", "#e8ecff", "#4a50ff"], vars: { bg: "#06070e", accent: "#a9d6f0", accent2: "#8e93e8", glow1: "#0c2030", glow2: "#16183f", tint: "#0d0f1c" },
      days: (y) => [{ date: astro(y, 4), window: [1, 1] }] },
  ];
  const BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));

  // Every dated occurrence for a year: [{scene, label, date, start, end}]
  function occurrences(year, opts) {
    const out = [];
    for (const s of SCENES) {
      if (!s.days) continue;
      if (s.kind === "norse" && opts && opts.norse === false) continue; // Norse days are on unless turned off
      for (const d of s.days(year)) {
        out.push({ scene: s, label: d.label || s.name, date: d.date, start: addDays(d.date, -d.window[0]), end: addDays(d.date, d.window[1]) });
      }
    }
    return out.sort((a, b) => a.date - b.date);
  }
  // "Auto by date": the scene whose window contains today (Yule's window crosses New Year, so check last year too).
  function resolveAuto(now, opts) {
    const today = localDay(now || new Date());
    const list = occurrences(today.getFullYear() - 1, opts).concat(occurrences(today.getFullYear(), opts));
    let hit = null;
    for (const o of list) if (today >= o.start && today <= o.end) { if (!hit || o.end - o.start < hit.end - hit.start) hit = o; }
    return hit ? { scene: hit.scene, occurrence: hit } : { scene: BY_ID.valhalla, occurrence: null };
  }
  function upcoming(now, n, opts) {
    const today = localDay(now || new Date());
    const list = occurrences(today.getFullYear(), opts).concat(occurrences(today.getFullYear() + 1, opts));
    return list.filter((o) => o.end >= today).slice(0, n || 4);
  }

  // Apply a scene's colors as CSS variables on <html>.
  function apply(scene) {
    const r = document.documentElement, v = scene.vars;
    r.dataset.scene = scene.id;
    r.style.setProperty("--bg", v.bg);
    r.style.setProperty("--accent", v.accent);
    r.style.setProperty("--accent2", v.accent2);
    r.style.setProperty("--accent-glow", v.accent + "8c");
    r.style.setProperty("--glow1", v.glow1);
    r.style.setProperty("--glow2", v.glow2);
    r.style.setProperty("--tint", v.tint);
    r.style.setProperty("--on-accent", lum(v.accent) > 0.45 ? "#07080b" : "#ffffff");
    scene.palette.forEach((p, i) => r.style.setProperty("--sc" + i, p[0]));
    r.style.setProperty("--sc3", (scene.palette[3] || scene.palette[0])[0]);
  }
  function lum(h) {
    const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
  }

  window.VScenes = { list: SCENES, byId: BY_ID, occurrences, resolveAuto, upcoming, apply };
})();
