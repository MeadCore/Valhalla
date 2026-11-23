/* Asgard Theme Kit (theme format v2) - Created November 22, 2026 by The_Mead_Maker & Odin.
   Copyright (c) 2026 The_Mead_Maker & Odin. MIT License, see LICENSE. Keep this notice.
   One file shared, unchanged, by Asgard, Valhalla and Asgard Theme Studio (window.AsgardThemeKit, or module.exports in Node).
   - validate(text): the strict whitelist check for .asgard-theme files (v1 and v2). A theme is data only: every value is
     picked from the lists below or is a #rrggbb colour, a whole number in range, plain text, or one PNG/JPEG/WebP picture
     as a base64 data URI. Nothing in a theme can load a link, a font file, CSS or code.
   - vars()/applySkin()/applyImage(): how a checked theme is drawn (CSS variables + data-tk-* attributes styled by theme-kit.css).
   - painter(): the animated backgrounds (matrix rain, embers, snow, scanlines, film grain). The host owns the canvas and
     decides when to pause (hidden tab, Lite, Game mode); the theme only names the effect.
   - reencode(): redraws a picture on a canvas so only plain pixels survive (no hidden data), shrinking it to fit.
   - images: a small IndexedDB store for theme pictures (they are too big for localStorage). */
(function (root, factory) {
  const kit = factory();
  if (typeof module === "object" && module.exports) module.exports = kit;
  else root.AsgardThemeKit = kit;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const KIT_VERSION = 2;
  const LIMITS = {
    fileBytes: 1572864,        // whole .asgard-theme file, 1.5 MB (most of it is the optional picture)
    v1Bytes: 16000,            // v1 files never had pictures
    imageChars: 1500000,       // the data URI text of the picture (about 1.1 MB of image)
    nameChars: 40,
  };
  const BASES = ["custom", "asgard", "cyberpunk", "viking", "gothic", "mono", "pop", "gachi"];
  const RENAMED = { retro: "viking", romance: "gothic" };
  // Friendly names for the Studio. Keys are the only values a file may use.
  const BUTTONS = { plain: "Plain", pill: "Rounded pills", sticker: "Stickers & tape", clipped: "Clipped corners", neon: "Neon glow", "rose-gold": "Rose-gold edges" };
  const EFFECTS = { none: "None", "matrix-rain": "Matrix rain", embers: "Floating embers", snow: "Falling snow", scanlines: "Scanlines", "film-grain": "Film grain" };
  const TEXTURES = { none: "None", marble: "Marble", grunge: "Grunge", paper: "Paper", carbon: "Carbon fiber" };
  const LOGOS = { plain: "Plain", neon: "Neon", glitch: "Glitch", sticker: "Sticker", gold: "Gold", chrome: "Chrome", stencil: "Stencil" };
  // Fonts that ship with Windows (no downloads). Each falls back to a safe family if missing.
  const FONTS = {
    clean: { label: "Clean", stack: '"Segoe UI", system-ui, Arial, sans-serif' },
    rounded: { label: "Friendly", stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
    bold: { label: "Bold poster", stack: 'Impact, Haettenschweiler, "Arial Black", sans-serif' },
    techno: { label: "Techno", stack: 'Bahnschrift, "Segoe UI", "DejaVu Sans Condensed", sans-serif' },
    mono: { label: "Computer", stack: 'Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace' },
    typewriter: { label: "Typewriter", stack: '"Courier New", Courier, monospace' },
    serif: { label: "Book", stack: 'Georgia, "Times New Roman", serif' },
    fancy: { label: "Elegant", stack: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif' },
    gothic: { label: "Old gothic", stack: '"Old English Text MT", "Blackadder ITC", Georgia, serif' },
    marker: { label: "Hand-drawn", stack: '"Ink Free", "Segoe Print", "Comic Sans MS", cursive' },
  };
  const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const RANGES = {
    transparency: [0, 80, 0], glow: [0, 100, 40], corners: [0, 24, 12],
    density: [10, 100, 60], speed: [10, 100, 50], opacity: [5, 60, 30],
    strength: [0, 100, 50], dim: [0, 90, 45], size: [60, 360, 180], tilt: [-20, 20, 0],
  };
  const TOP_V1 = ["asgard_theme", "name", "base", "colors", "effects", "author", "effect", "effectOptions"];
  const TOP_V2 = ["asgard_theme", "name", "author", "base", "palette", "boxes", "buttons", "logo", "font", "texture", "background", "image"];
  const PALETTE = ["bg", "box", "accent", "accent2"], PALETTE_OPT = ["text"];
  const CODE = /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|<\s*\/?\s*(script|style|iframe|object|embed|svg|link|meta)|@import|\\u003c|<!--/i;
  const LINK = /\b(?:https?|ftp|file|data(?!:image\/(?:png|jpeg|webp);base64,))\s*:|\bwww\.[a-z0-9-]/i;   // web links (pictures only as data:image/…;base64)
  const DATA_URI = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  function cleanText(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>{}\\;`"]/g, "").replace(/\s+/g, " ").trim().slice(0, n); }
  function lum(h) { const n = parseInt(h.slice(1), 16), f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function autoText(bg) { return lum(bg) > 0.4 ? "#11141b" : "#f4f6fb"; }
  function byteLen(s) { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; }
  function num(v, key, label, strictInt) {
    const r = RANGES[key];
    if (v == null) return { v: r[2] };
    if (typeof v !== "number" || !Number.isFinite(v) || (strictInt && !Number.isInteger(v))) return { err: "“" + (label || key) + "” must be a whole number from " + r[0] + " to " + r[1] + "." };
    if (strictInt && (v < r[0] || v > r[1])) return { err: "“" + (label || key) + "” must be a whole number from " + r[0] + " to " + r[1] + "." };
    return { v: Math.round(Math.min(r[1], Math.max(r[0], v))) };
  }
  function onlyKeys(o, allowed, what) { const k = Object.keys(o).find((x) => allowed.indexOf(x) < 0); return k == null ? null : "Unknown " + what + " in theme file: " + cleanText(k, 30); }
  function pickFrom(v, list, d, what) {
    if (v == null) return { v: d };
    if (typeof v !== "string" || !own(list, v)) return { err: "Unknown " + what + ": " + cleanText(v, 30) };
    return { v: v };
  }
  function b64head(b64, n) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < b64.length && out.length < n; i++) {
      const c = A.indexOf(b64[i]); if (c < 0) break;
      buf = (buf << 6) | c; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }
  // -> {mime} or {err}. Checks the data URI shape, its size and that the bytes really start like that kind of picture.
  function checkImageData(d) {
    if (typeof d !== "string") return { err: "The picture is missing." };
    if (d.length > LIMITS.imageChars) return { err: "The picture is too big (the limit is about 1.1 MB)." };
    const m = DATA_URI.exec(d);
    if (!m) return { err: "The picture must be a PNG, JPG or WebP image." };
    const h = b64head(m[2], 12), mime = m[1];
    const png = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47 && h[4] === 0x0d && h[5] === 0x0a && h[6] === 0x1a && h[7] === 0x0a;
    const jpg = h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
    const webp = h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
    if ((mime === "png" && !png) || (mime === "jpeg" && !jpg) || (mime === "webp" && !webp)) return { err: "The picture's data doesn't match its type." };
    return { mime: "image/" + mime };
  }

  // ---------------------------------------------------------------- VALIDATOR
  // validate(text) -> {theme, warnings} or {err}. theme is always the normalized v2 shape:
  // {v, name, author, base, palette|null, boxes|null, buttons, logo, font:{headings,text}, texture:{kind,strength,boxes},
  //  background:{effect,density,speed,opacity}, image:null|{use,data,dim,corner,size,tilt}}
  function validate(text) {
    if (typeof text !== "string") return { err: "That isn't a theme file." };
    if (byteLen(text) > LIMITS.fileBytes) return { err: "That theme file is too big (the limit is 1.5 MB)." };
    if (CODE.test(text)) return { err: "That theme file contains code or links, so it wasn't loaded." };
    let d;
    try { d = JSON.parse(text); } catch (e) { return { err: "That isn't a theme file (it isn't readable theme data)." }; }
    if (!isObj(d)) return { err: "That isn't an .asgard-theme file." };
    // Again on the decoded text, so escapes like \u003c or \/ can't hide code or links.
    const flat = JSON.stringify(d);
    if (CODE.test(flat)) return { err: "That theme file contains code or links, so it wasn't loaded." };
    if (LINK.test(flat)) return { err: "That theme file contains a web link, so it wasn't loaded." };
    if (d.asgard_theme === 1) {
      if (byteLen(text) > LIMITS.v1Bytes) return { err: "That theme file is too big." };
      return v1(d);
    }
    if (d.asgard_theme === 2) return v2(d);
    return { err: d.asgard_theme == null ? "That isn't an .asgard-theme file." : "This theme was made for a newer version. Update to load it." };
  }
  function blank() {
    return { v: 2, name: "", author: "", base: "custom", palette: null, boxes: null, buttons: "plain", logo: "plain",
      font: { headings: "clean", text: "clean" }, texture: { kind: "none", strength: RANGES.strength[2], boxes: false },
      background: { effect: "none", density: RANGES.density[2], speed: RANGES.speed[2], opacity: RANGES.opacity[2] }, image: null };
  }
  function nameBase(d, t) {
    const name = cleanText(d.name, LIMITS.nameChars);
    if (!name) return "The theme needs a name.";
    t.name = name; t.author = cleanText(d.author, LIMITS.nameChars);
    let base = d.base == null ? "custom" : d.base;
    if (typeof base === "string" && RENAMED[base]) base = RENAMED[base];
    if (typeof base !== "string" || BASES.indexOf(base) < 0) return "Unknown base style: " + cleanText(base, 30);
    t.base = base;
    return null;
  }
  function palette(c, t, strictText) {
    if (!isObj(c)) return "A custom theme needs its colours (bg, box, accent, accent2).";
    const bad = onlyKeys(c, PALETTE.concat(PALETTE_OPT), "colour"); if (bad) return bad;
    const p = {};
    for (const k of PALETTE) { if (!isHex(c[k])) return "Colour “" + k + "” must look like #12ab34."; p[k] = c[k].toLowerCase(); }
    if (c.text != null) {
      if (!isHex(c.text)) return "Colour “text” must look like #12ab34.";
      const ok = contrast(c.text, p.bg) >= 4.5 && contrast(c.text, p.box) >= 4.5;
      if (!ok && strictText) return "The “text” colour is too hard to read on that background.";
      if (ok) p.text = c.text.toLowerCase(); else t._warn.push("The text colour was too hard to read, so a readable one is used instead.");
    }
    t.palette = p;
    return null;
  }
  function boxes(e, t, strict) {
    if (e == null) e = {};
    if (!isObj(e)) return "The box settings must be a list of numbers.";
    const bad = onlyKeys(e, ["transparency", "glow", "corners"], "box setting"); if (bad) return bad;
    const b = {};
    for (const k of ["transparency", "glow", "corners"]) { const r = num(e[k], k, k, strict); if (r.err) return r.err; b[k] = r.v; }
    t.boxes = b;
    return null;
  }
  function v1(d) {
    const t = blank(); t.v = 1; t._warn = [];
    const bad = onlyKeys(d, TOP_V1, "setting"); if (bad) return { err: bad };
    let e = nameBase(d, t); if (e) return { err: e };
    if (t.base === "custom") {
      e = palette(d.colors, t, true) || boxes(d.effects, t, true); if (e) return { err: e };
    } else if (d.colors != null || d.effects != null) return { err: "Only themes with base \"custom\" can set colours." };
    if (typeof d.effect === "string" && own(EFFECTS, d.effect) && d.effect !== "none") {
      const o = isObj(d.effectOptions) ? d.effectOptions : {};
      const g = (k) => num(typeof o[k] === "number" && Number.isFinite(o[k]) ? o[k] : null, k).v;
      t.background = { effect: d.effect, density: g("density"), speed: g("speed"), opacity: g("opacity") };
    }
    return finish(t);
  }
  function v2(d) {
    const t = blank(); t._warn = [];
    const bad = onlyKeys(d, TOP_V2, "setting"); if (bad) return { err: bad };
    let e = nameBase(d, t); if (e) return { err: e };
    if (t.base === "custom") {
      e = palette(d.palette, t, false) || boxes(d.boxes, t, false); if (e) return { err: e };
    } else {
      if (d.palette != null || d.boxes != null) return { err: "Only themes with base \"custom\" can set colours." };
      // Built-in styles keep their own buttons, fonts, logo and textures; a theme on top may add an effect and a picture.
      for (const k of ["buttons", "logo", "font", "texture"]) if (d[k] != null) return { err: "“" + k + "” needs base \"custom\" (built-in styles have their own)." };
    }
    let r = pickFrom(d.buttons, BUTTONS, "plain", "button style"); if (r.err) return { err: r.err }; t.buttons = r.v;
    r = pickFrom(d.logo, LOGOS, "plain", "logo style"); if (r.err) return { err: r.err }; t.logo = r.v;
    if (d.font != null) {
      if (typeof d.font === "string") d = Object.assign({}, d, { font: { headings: d.font, text: d.font } });
      if (!isObj(d.font)) return { err: "“font” must name fonts from the built-in list." };
      const fb = onlyKeys(d.font, ["headings", "text"], "font setting"); if (fb) return { err: fb };
      for (const k of ["headings", "text"]) { r = pickFrom(d.font[k], FONTS, "clean", "font"); if (r.err) return { err: r.err }; t.font[k] = r.v; }
    }
    if (d.texture != null) {
      const x = typeof d.texture === "string" ? { kind: d.texture } : d.texture;
      if (!isObj(x)) return { err: "“texture” must be one of: " + Object.keys(TEXTURES).join(", ") + "." };
      const tb = onlyKeys(x, ["kind", "strength", "boxes"], "texture setting"); if (tb) return { err: tb };
      r = pickFrom(x.kind, TEXTURES, "none", "texture"); if (r.err) return { err: r.err }; t.texture.kind = r.v;
      r = num(x.strength, "strength"); if (r.err) return { err: r.err }; t.texture.strength = r.v;
      if (x.boxes != null && typeof x.boxes !== "boolean") return { err: "texture “boxes” must be true or false." };
      t.texture.boxes = !!x.boxes;
    }
    if (d.background != null) {
      const x = typeof d.background === "string" ? { effect: d.background } : d.background;
      if (!isObj(x)) return { err: "“background” must name an effect." };
      const bb = onlyKeys(x, ["effect", "density", "speed", "opacity"], "background setting"); if (bb) return { err: bb };
      r = pickFrom(x.effect, EFFECTS, "none", "background effect"); if (r.err) return { err: r.err }; t.background.effect = r.v;
      for (const k of ["density", "speed", "opacity"]) { r = num(x[k], k); if (r.err) return { err: r.err }; t.background[k] = r.v; }
    }
    if (d.image != null) {
      const x = d.image;
      if (!isObj(x)) return { err: "“image” must be a picture with its settings." };
      const ib = onlyKeys(x, ["use", "data", "dim", "corner", "size", "tilt"], "picture setting"); if (ib) return { err: ib };
      if (x.use !== "background" && x.use !== "sticker") return { err: "A picture must be used as \"background\" or \"sticker\"." };
      const c = checkImageData(x.data); if (c.err) return { err: c.err };
      const img = { use: x.use, data: x.data, dim: 0, corner: "bottom-right", size: RANGES.size[2], tilt: 0 };
      for (const k of ["dim", "size", "tilt"]) { r = num(x[k], k); if (r.err) return { err: r.err }; img[k] = r.v; }
      if (x.corner != null) { if (CORNERS.indexOf(x.corner) < 0) return { err: "Unknown sticker corner: " + cleanText(x.corner, 20) }; img.corner = x.corner; }
      if (x.dim == null) img.dim = x.use === "background" ? RANGES.dim[2] : 0;
      t.image = img;
    }
    return finish(t);
  }
  function finish(t) { const w = t._warn; delete t._warn; return { theme: t, warnings: w }; }

  // Normalized theme -> the JSON file (always v2, only the parts that differ from the defaults are written).
  function serialize(t, pretty) {
    const o = { asgard_theme: 2, name: cleanText(t.name, LIMITS.nameChars) || "My theme" };
    if (t.author) o.author = cleanText(t.author, LIMITS.nameChars);
    o.base = BASES.indexOf(t.base) >= 0 ? t.base : "custom";
    if (o.base === "custom") {
      const p = t.palette || {};
      o.palette = { bg: p.bg, box: p.box, accent: p.accent, accent2: p.accent2 };
      if (p.text) o.palette.text = p.text;
      o.boxes = Object.assign({ transparency: 0, glow: 40, corners: 12 }, t.boxes || {});
      o.buttons = t.buttons || "plain";
      o.logo = t.logo || "plain";
      o.font = { headings: (t.font && t.font.headings) || "clean", text: (t.font && t.font.text) || "clean" };
      o.texture = { kind: (t.texture && t.texture.kind) || "none", strength: t.texture ? t.texture.strength : 50, boxes: !!(t.texture && t.texture.boxes) };
    }
    const b = t.background || {};
    o.background = { effect: b.effect || "none", density: b.density, speed: b.speed, opacity: b.opacity };
    if (t.image && t.image.data) o.image = { use: t.image.use, data: t.image.data, dim: t.image.dim, corner: t.image.corner, size: t.image.size, tilt: t.image.tilt };
    return JSON.stringify(o, null, pretty === false ? 0 : 2);
  }

  // ---------------------------------------------------------------- DRAWING (CSS variables + data-tk-* attributes)
  const mix = (a, b, pct) => "color-mix(in srgb, " + a + " " + pct + "%, " + b + ")";
  // The same colour recipe as Asgard's Custom style, so a palette looks alike in Asgard, Valhalla and the Studio preview.
  function vars(p, bx) {
    p = p || {}; bx = bx || {};
    const bg = isHex(p.bg) ? p.bg : "#0b0712", box = isHex(p.box) ? p.box : "#171024", ac = isHex(p.accent) ? p.accent : "#ff3d81", ac2 = isHex(p.accent2) ? p.accent2 : "#22e1ff";
    const t = Math.max(0, Math.min(80, +bx.transparency || 0)), glow = Math.max(0, Math.min(100, bx.glow == null ? 40 : +bx.glow)), rad = Math.max(0, Math.min(24, bx.corners == null ? 12 : +bx.corners));
    const light = lum(bg) > 0.4, txt = isHex(p.text) ? p.text : autoText(bg), op = 100 - t;
    return {
      "--bg": bg, "--bg2": mix(bg, txt, 96), "--panel": mix(box, "transparent", op), "--panel2": mix(mix(box, txt, 94), "transparent", op),
      "--panel3": mix(box, txt, 86), "--inset": mix(bg, "#000", 70), "--line": mix(box, txt, 84), "--line2": mix(box, txt, 70), "--scroll": mix(box, txt, 75),
      "--meter-bg": mix(box, txt, 80), "--text": txt, "--text2": mix(txt, box, 82), "--muted": mix(txt, box, 62),
      "--accent": ac, "--accent2": ac2, "--accent-glow": mix(ac, "transparent", 55), "--on-accent": lum(ac) > 0.45 ? "#07080b" : "#ffffff",
      "--glow1": mix(ac, bg, 22), "--glow2": mix(ac2, bg, 18), "--glass": mix(bg, "transparent", 80), "--radius": rad + "px",
      "--fx-glow": Math.round(glow * 0.3) + "px", "--menu-hi": ac2, "--on-menu-hi": lum(ac2) > 0.45 ? "#07080b" : "#ffffff",
      "--on-light": light ? "#ffffff" : "#07080b", "--tint": mix(box, bg, 50),
    };
  }
  const SKIN_ATTRS = ["tkBtn", "tkLogo", "tkTex", "tkTexBoxes", "tkFontH", "tkFontT"];
  const SKIN_VARS = ["--tk-font-h", "--tk-font-t", "--tk-tex-strength"];
  function clearSkin(el) {
    SKIN_ATTRS.forEach((a) => { delete el.dataset[a]; });
    SKIN_VARS.forEach((v) => el.style.removeProperty(v));
  }
  // el = <html>. Only whitelisted names ever reach the DOM.
  function applySkin(el, t) {
    clearSkin(el);
    if (!t || t.base !== "custom") return;
    if (own(BUTTONS, t.buttons) && t.buttons !== "plain") el.dataset.tkBtn = t.buttons;
    if (own(LOGOS, t.logo) && t.logo !== "plain") el.dataset.tkLogo = t.logo;
    const f = t.font || {};
    if (own(FONTS, f.headings) && f.headings !== "clean") { el.dataset.tkFontH = f.headings; el.style.setProperty("--tk-font-h", FONTS[f.headings].stack); }
    if (own(FONTS, f.text) && f.text !== "clean") { el.dataset.tkFontT = f.text; el.style.setProperty("--tk-font-t", FONTS[f.text].stack); }
    const x = t.texture || {};
    if (own(TEXTURES, x.kind) && x.kind !== "none") {
      el.dataset.tkTex = x.kind; if (x.boxes) el.dataset.tkTexBoxes = "1";
      el.style.setProperty("--tk-tex-strength", String(Math.max(0, Math.min(100, +x.strength || 0)) / 100));
    }
  }
  // The picture: one fixed layer behind everything (background) or a corner sticker. data must already be checked.
  function applyImage(doc, img, data) {
    let host = doc.getElementById("tk-art");
    if (!img || !data || checkImageData(data).err) { if (host) host.remove(); return; }
    if (!host) { host = doc.createElement("div"); host.id = "tk-art"; host.setAttribute("aria-hidden", "true"); doc.body.prepend(host); }
    host.className = "tk-art tk-art-" + (img.use === "sticker" ? "sticker tk-c-" + (CORNERS.indexOf(img.corner) >= 0 ? img.corner : "bottom-right") : "bg");
    let im = host.querySelector("img");
    if (!im) { im = doc.createElement("img"); im.alt = ""; im.decoding = "async"; im.draggable = false; host.appendChild(im); }
    if (im.getAttribute("src") !== data) im.setAttribute("src", data);
    if (img.use === "sticker") {
      host.style.setProperty("--tk-st-size", Math.max(60, Math.min(360, +img.size || 180)) + "px");
      host.style.setProperty("--tk-st-tilt", Math.max(-20, Math.min(20, +img.tilt || 0)) + "deg");
      host.style.removeProperty("--tk-dim");
    } else host.style.setProperty("--tk-dim", String(Math.max(0, Math.min(90, +img.dim || 0)) / 100));
  }

  // ---------------------------------------------------------------- ANIMATED BACKGROUNDS
  // painter(kind, {ctx, w, h, fx: {density, speed, opacity}, col: {accent, accent2, text}}) -> {fps, draw()} or null.
  // Each painter draws on a transparent canvas, so the theme's own background shows through.
  const MATRIX_CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾜﾝ0123456789ABCDEFZ:=*+<>";
  function rgb(h, a) { const n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
  const PAINTERS = {
    "matrix-rain"(o) {
      const x = o.ctx, s = o.w < 700 ? 14 : 16, rows = Math.ceil(o.h / s), keep = o.fx.density / 100;
      const ch = () => MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0];
      const drops = Array.from({ length: Math.ceil(o.w / s) }, () => ({ on: Math.random() < keep, y: Math.floor(Math.random() * (rows + 8)) - 8, pace: 0.55 + Math.random() * 0.6, acc: 0 }));
      x.clearRect(0, 0, o.w, o.h);
      return { fps: 14 + Math.round(o.fx.speed * 0.16), draw() {
        x.globalCompositeOperation = "destination-out"; x.fillStyle = "rgba(0,0,0,0.085)"; x.fillRect(0, 0, o.w, o.h);
        x.globalCompositeOperation = "source-over";
        x.font = s + 'px "MS Gothic", "Yu Gothic", "Noto Sans CJK JP", monospace'; x.textBaseline = "top";
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i]; if (!d.on) continue;
          d.acc += d.pace; if (d.acc < 1) continue; d.acc -= 1;
          if (d.y >= 0) {
            if (d.y > 0) { x.clearRect(i * s, (d.y - 1) * s, s, s); x.fillStyle = o.col.accent; x.fillText(ch(), i * s, (d.y - 1) * s); }
            x.fillStyle = "#e6ffec"; x.fillText(ch(), i * s, d.y * s);
          }
          d.y++;
          if (d.y > rows + 1 && Math.random() > 0.96) d.y = -Math.floor(Math.random() * 12);
        }
        x.fillStyle = o.col.accent2;
        for (let k = 0; k < 3; k++) { const i = (Math.random() * drops.length) | 0; if (drops[i].on) x.fillText(ch(), i * s, ((Math.random() * rows) | 0) * s); }
      } };
    },
    embers(o) {
      const x = o.ctx, n = Math.round(12 + o.fx.density * 1.1 * Math.min(1.6, o.w * o.h / 1.4e6)), sp = 0.3 + o.fx.speed / 60;
      const mk = (fresh) => ({ x: Math.random() * o.w, y: fresh ? o.h + Math.random() * 40 : Math.random() * o.h, r: 0.8 + Math.random() * 2.4,
        vy: (0.4 + Math.random() * 0.9) * sp, ph: Math.random() * 6.28, life: 0.5 + Math.random() * 0.5, c: Math.random() < 0.65 ? o.col.accent : o.col.accent2 });
      const ps = Array.from({ length: n }, () => mk(false));
      return { fps: 30, draw() {
        x.clearRect(0, 0, o.w, o.h);
        for (const p of ps) {
          p.y -= p.vy; p.ph += 0.03; p.x += Math.sin(p.ph) * 0.5 * sp;
          const a = Math.max(0, Math.min(1, p.y / o.h)) * p.life;
          if (p.y < -10 || a <= 0.02) { Object.assign(p, mk(true)); continue; }
          const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          g.addColorStop(0, rgb(p.c, a)); g.addColorStop(0.35, rgb(p.c, a * 0.45)); g.addColorStop(1, rgb(p.c, 0));
          x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r * 4, 0, 6.283); x.fill();
        }
      } };
    },
    snow(o) {
      const x = o.ctx, n = Math.round(20 + o.fx.density * 1.8 * Math.min(1.6, o.w * o.h / 1.4e6)), sp = 0.25 + o.fx.speed / 70;
      const mk = (top) => ({ x: Math.random() * o.w, y: top ? -10 : Math.random() * o.h, r: 0.8 + Math.random() * 2.6, ph: Math.random() * 6.28, v: 0.4 + Math.random() * 0.8 });
      const ps = Array.from({ length: n }, () => mk(false)), c = o.col.text || "#ffffff";
      return { fps: 30, draw() {
        x.clearRect(0, 0, o.w, o.h); x.fillStyle = c;
        for (const p of ps) {
          p.y += p.v * sp * (0.6 + p.r / 3); p.ph += 0.015; p.x += Math.sin(p.ph) * 0.4;
          if (p.y > o.h + 10) Object.assign(p, mk(true));
          x.globalAlpha = 0.35 + p.r / 5; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill();
        }
        x.globalAlpha = 1;
      } };
    },
    scanlines(o) {
      const x = o.ctx, gap = Math.round(6 - o.fx.density / 25), sp = 0.4 + o.fx.speed / 25; let band = 0;
      return { fps: 24, draw() {
        x.clearRect(0, 0, o.w, o.h);
        x.fillStyle = "rgba(0,0,0,0.55)";
        for (let y = 0; y < o.h; y += gap) x.fillRect(0, y, o.w, 1);
        band = (band + sp) % (o.h + 240);
        const g = x.createLinearGradient(0, band - 240, 0, band);
        g.addColorStop(0, rgb(o.col.accent2, 0)); g.addColorStop(0.85, rgb(o.col.accent2, 0.22)); g.addColorStop(1, rgb(o.col.accent2, 0));
        x.fillStyle = g; x.fillRect(0, band - 240, o.w, 240);
      } };
    },
    "film-grain"(o) {
      const x = o.ctx, cw = Math.max(1, Math.ceil(o.w / 3)), chh = Math.max(1, Math.ceil(o.h / 3));
      const small = (typeof OffscreenCanvas !== "undefined") ? new OffscreenCanvas(cw, chh) : (() => { const c = o.ctx.canvas.ownerDocument.createElement("canvas"); c.width = cw; c.height = chh; return c; })();
      const sx = small.getContext("2d"), img = sx.createImageData(cw, chh), amt = o.fx.density / 100;
      return { fps: 6 + Math.round(o.fx.speed / 6), draw() {
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.random() > amt * 0.6) { d[i + 3] = 0; continue; }
          const v = Math.random() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 40 + Math.random() * 90;
        }
        sx.putImageData(img, 0, 0);
        x.clearRect(0, 0, o.w, o.h); x.imageSmoothingEnabled = false; x.drawImage(small, 0, 0, o.w, o.h);
        if (Math.random() < 0.12) { x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect((Math.random() * o.w) | 0, 0, 1, o.h); }
      } };
    },
  };
  function painter(kind, o) { return own(PAINTERS, kind) ? PAINTERS[kind](o) : null; }
  function clampFx(o) { const out = {}; for (const k of ["density", "speed", "opacity"]) out[k] = num(Number.isFinite(+(o || {})[k]) && (o || {})[k] != null ? +o[k] : null, k).v; return out; }

  // A ready-made player for hosts without their own (Valhalla, the Studio preview): one fixed canvas behind everything.
  // opts.hidden() -> true hides it (e.g. a Lite layout); opts.paused() -> true keeps the last frame and stops drawing.
  // A hidden tab always pauses. set(kind, fx, col) starts/changes it; set("none") or stop() removes the canvas.
  function runner(doc, opts) {
    opts = opts || {};
    const win = doc.defaultView;
    const r = { cv: null, p: null, kind: "none", key: "", raf: 0, timer: 0, last: 0, fx: null, col: null, frozen: false };
    const hidden = () => !!(opts.hidden && opts.hidden()), paused = () => doc.hidden || !!(opts.paused && opts.paused()) || r.frozen;
    function reset() {
      if (!r.cv) return;
      const dpr = Math.min(1.5, win.devicePixelRatio || 1), w = win.innerWidth, h = win.innerHeight;
      r.cv.width = Math.round(w * dpr); r.cv.height = Math.round(h * dpr);
      const ctx = r.cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      r.p = painter(r.kind, { ctx, w, h, fx: r.fx, col: r.col });
      if (r.p) r.p.draw();
    }
    function wake() {
      win.cancelAnimationFrame(r.raf); win.clearTimeout(r.timer); r.raf = 0; r.timer = 0;
      if (!r.cv) return;
      const hide = hidden(); r.cv.style.visibility = hide ? "hidden" : "";
      if (hide || paused()) { r.timer = win.setTimeout(wake, 1000); return; }
      r.raf = win.requestAnimationFrame(frame);
    }
    function frame(t) {
      r.raf = 0;
      if (!r.cv || !r.p) return;
      if (hidden() || paused()) { wake(); return; }
      if (t - r.last >= 1000 / r.p.fps) { r.last = t; r.p.draw(); }
      r.raf = win.requestAnimationFrame(frame);
    }
    let rt = 0;
    const onResize = () => { win.clearTimeout(rt); rt = win.setTimeout(() => { reset(); wake(); }, 200); };
    r.set = function (kind, fx, col) {
      if (!own(PAINTERS, kind)) { r.stop(); return; }
      fx = clampFx(fx); col = { accent: isHex(col && col.accent) ? col.accent : "#00ff41", accent2: isHex(col && col.accent2) ? col.accent2 : "#008f11", text: isHex(col && col.text) ? col.text : "#ffffff" };
      const key = kind + JSON.stringify(fx) + JSON.stringify(col);
      if (!r.cv) {
        r.cv = doc.createElement("canvas"); r.cv.id = "bgfx"; r.cv.setAttribute("aria-hidden", "true");
        r.cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none";
        doc.body.prepend(r.cv);
        win.addEventListener("resize", onResize); doc.addEventListener("visibilitychange", wake);
      }
      r.cv.style.opacity = String(fx.opacity / 100);
      r.kind = kind; r.fx = fx; r.col = col;
      if (key !== r.key) { r.key = key; reset(); }
      wake();
    };
    r.stop = function () {
      win.cancelAnimationFrame(r.raf); win.clearTimeout(r.timer); r.raf = 0; r.timer = 0;
      if (r.cv) { r.cv.remove(); r.cv = null; win.removeEventListener("resize", onResize); doc.removeEventListener("visibilitychange", wake); }
      r.p = null; r.kind = "none"; r.key = "";
    };
    r.freeze = function (on) { r.frozen = !!on; wake(); };
    r.wake = wake;
    return r;
  }

  // ---------------------------------------------------------------- PICTURES
  // Redraw on a canvas: drops anything that isn't pixels, caps the size, and keeps the result under the limit.
  // use "sticker" keeps transparency (PNG, else WebP); "background" becomes JPEG/WebP.
  function reencode(src, use) {
    return new Promise((resolve) => {
      if (typeof document === "undefined") { resolve({ err: "Pictures can only be prepared in the app." }); return; }
      const im = new Image();
      im.onload = () => {
        const max = use === "sticker" ? 640 : 1920;
        let w = im.naturalWidth, h = im.naturalHeight;
        if (!w || !h) { resolve({ err: "That picture couldn't be read." }); return; }
        const tryAt = (scale, attempt) => {
          const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          const c = document.createElement("canvas"); c.width = cw; c.height = ch;
          const x = c.getContext("2d"); x.drawImage(im, 0, 0, cw, ch);
          const kinds = use === "sticker" ? [["image/png"], ["image/webp", 0.9], ["image/webp", 0.8]] : [["image/jpeg", 0.88], ["image/webp", 0.85], ["image/jpeg", 0.78]];
          for (const k of kinds) {
            const d = c.toDataURL(k[0], k[1]);
            if (d.indexOf("data:" + k[0]) === 0 && d.length <= LIMITS.imageChars && !checkImageData(d).err) { resolve({ data: d, w: cw, h: ch }); return; }
          }
          if (attempt > 6) { resolve({ err: "That picture is too detailed to fit. Try a smaller one." }); return; }
          tryAt(scale * 0.8, attempt + 1);
        };
        tryAt(Math.min(1, max / Math.max(w, h)), 0);
      };
      im.onerror = () => resolve({ err: "That file isn't a picture this app can read (use PNG, JPG or WebP)." });
      im.src = src;
    });
  }
  // IndexedDB store for pictures: put(id, data), get(id), del(id). Falls back to doing nothing if blocked.
  const images = {
    db: null,
    open() {
      if (images.db) return images.db;
      images.db = new Promise((res) => {
        try {
          const r = indexedDB.open("asgard-theme-pictures", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("pics");
          r.onsuccess = () => res(r.result); r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return images.db;
    },
    async tx(mode, fn) {
      const db = await images.open(); if (!db) return null;
      return new Promise((res) => { try { const t = db.transaction("pics", mode), s = t.objectStore("pics"), q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => res(null); } catch (e) { res(null); } });
    },
    put(id, data) { return images.tx("readwrite", (s) => s.put(data, id)).then(() => true); },
    get(id) { return images.tx("readonly", (s) => s.get(id)).then((v) => (typeof v === "string" && !checkImageData(v).err ? v : null)); },
    del(id) { return images.tx("readwrite", (s) => s.delete(id)); },
  };

  return { KIT_VERSION, LIMITS, BASES, BUTTONS, EFFECTS, TEXTURES, LOGOS, FONTS, CORNERS, RANGES,
    validate, serialize, checkImageData, cleanText, contrast, lum, autoText, isHex, vars, applySkin, clearSkin, applyImage,
    painter, runner, clampFx, reencode, images, blank };
});
