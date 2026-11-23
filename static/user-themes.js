/* Valhalla - Created October 26, 2026 by The_Mead_Maker & Odin. Copyright (c) 2026 The_Mead_Maker & Odin. MIT License.
   Your own themes (.asgard-theme files from Asgard Theme Studio, added November 22, 2026). Exposes window.VUserThemes.
   A theme is checked by theme-kit.js (AsgardThemeKit.validate: only known settings, colours, built-in choices and one
   re-drawn picture; never code or links), then shows up in the scene picker under "Your themes" like a scene. Saved in this
   browser: vh_user_themes (settings) and IndexedDB (pictures). Its colours also become the scene colours for the lights. */
(function () {
  "use strict";
  const K = window.AsgardThemeKit, KEY = "vh_user_themes", MAX = 30;
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const root = document.documentElement;
  let varKeys = [], fx = null, picId = "", picData = null, seq = 0;

  function list() {
    const l = get(KEY, []);
    return Array.isArray(l) ? l.filter((u) => u && /^u_[a-z0-9]{4,16}$/.test(u.id || "") && u.theme && u.theme.palette) : [];
  }
  const byId = (id) => list().find((u) => u.id === id) || null;
  // Re-check a stored entry (it lives in localStorage, so treat it like a file).
  function checked(u) {
    if (!K || !u) return null;
    const t = Object.assign({}, u.theme, { asgard_theme: 2, name: u.name || "Theme" });
    delete t.v; delete t.image;
    const r = K.validate(JSON.stringify(t));
    return r.err ? null : r.theme;
  }
  function scene(u) {
    const t = checked(u); if (!t) return null;
    const p = t.palette, txt = p.text || K.autoText(p.bg);
    return { id: u.id, name: u.name, glyph: "🎨", kind: "user", blurb: "Your theme" + (u.author ? " by " + u.author : ""),
      palette: [[p.accent, "Main color"], [p.accent2, "Second color"], [p.box, "Boxes"], [txt, "Text"]],
      lights: [p.accent, p.accent2, txt],
      vars: { bg: p.bg, accent: p.accent, accent2: p.accent2, glow1: p.box, glow2: p.bg, tint: p.box } };
  }
  function clear() {
    varKeys.forEach((k) => root.style.removeProperty(k)); varKeys = [];
    if (K) { K.clearSkin(root); K.applyImage(document, null); }
    if (fx) fx.stop();
    picId = ""; picData = null; seq++;
  }
  // Paint a user theme on top of the scene colours (VScenes.apply already ran with scene(u)).
  function paint(u) {
    const t = checked(u); if (!t) return;
    const v = K.vars(t.palette, t.boxes);
    varKeys = Object.keys(v); varKeys.forEach((k) => root.style.setProperty(k, v[k]));
    K.applySkin(root, t);
    if (document.body) {
      const b = t.background;
      if (!fx) fx = K.runner(document, {});
      if (b.effect !== "none") fx.set(b.effect, b, { accent: t.palette.accent, accent2: t.palette.accent2, text: v["--text"] }); else fx.stop();
      if (u.img) {
        const img = Object.assign({}, u.img), n = ++seq;
        if (picId === u.id && picData) K.applyImage(document, img, picData);
        else K.images.get(u.id).then((d) => { if (n !== seq) return; picId = d ? u.id : ""; picData = d; K.applyImage(document, d ? img : null, d); });
      }
    }
  }
  // text -> {entry} or {err}
  async function add(text) {
    if (!K) return { err: "Theme support didn't load. Reload the page." };
    const r = K.validate(text);
    if (r.err) return { err: r.err };
    const n = r.theme;
    if (n.base !== "custom") return { err: "That theme uses one of Asgard's built-in styles, which Valhalla doesn't have. Make a custom one in Theme Studio." };
    const l = list();
    if (l.length >= MAX) return { err: "You have " + MAX + " themes. Delete one first." };
    const id = "u_" + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "x").padEnd(6, "0");
    const theme = Object.assign({}, n); delete theme.image; delete theme.v; delete theme.name; delete theme.author;
    const entry = { id, name: n.name, author: n.author, theme };
    if (n.image) {
      const out = await K.reencode(n.image.data, n.image.use);   // re-drawn: only plain pixels are kept
      if (!out.err && await K.images.put(id, out.data)) entry.img = { use: n.image.use, dim: n.image.dim, corner: n.image.corner, size: n.image.size, tilt: n.image.tilt };
    }
    l.push(entry);
    if (!put(KEY, l)) return { err: "Couldn't save the theme (browser storage is full)." };
    return { entry, warnings: r.warnings || [], lostPicture: !!n.image && !entry.img };
  }
  function remove(id) { put(KEY, list().filter((u) => u.id !== id)); if (K) K.images.del(id); }
  window.VUserThemes = { list, byId, scene, paint, clear, add, remove, limit: K ? K.LIMITS.fileBytes : 0 };
})();
