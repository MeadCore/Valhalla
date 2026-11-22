/* Valhalla - Home Assistant adapter (design draft; NOT yet tested against a real Home Assistant).
   Same contract as adapters/mock.js. Talks to Home Assistant's WebSocket API for states and services, and to its REST
   API for calendar events. Sign-in uses Home Assistant's own login page (username + password + optional 2-factor),
   so no password or token is ever written into these files. Tokens live only in this browser's localStorage.

   Two ways to sign in:
     - Wall screen (server.py): a long-lived access token saved by the Setup wizard in config.json. server.py only
       gives it to a browser on the same computer (127.0.0.1), never to phones.
     - Phones / hosted inside Home Assistant: Home Assistant's own login page (OAuth), tokens kept in this browser.
   Settings (no personal data in code): window.VALHALLA_CONFIG or localStorage "vh_config", e.g.
     { "adapter": "ha", "haUrl": "", "calendars": ["calendar.house"], "weather": "weather.home" }
   haUrl "" means "same address this page came from" - the recommended setup is to copy Valhalla into Home Assistant's
   config/www/valhalla folder and open http(s)://<home-assistant>/local/valhalla/index.html, which also works remotely
   through Tailscale or Home Assistant Cloud/Link with no extra setup. */
(function () {
  "use strict";
  const TOK = "vh_ha_tokens";
  const cfg = () => Object.assign({ haUrl: "", calendars: ["calendar.house"] }, window.VALHALLA_CONFIG || {}, JSON.parse(localStorage.getItem("vh_config") || "{}"));
  const base = () => (cfg().haUrl || location.origin).replace(/\/$/, "");
  const clientId = () => location.origin + "/";
  const redirect = () => location.origin + location.pathname;

  let tokens = JSON.parse(localStorage.getItem(TOK) || "null");
  const saveTokens = (t) => { tokens = t; if (t) localStorage.setItem(TOK, JSON.stringify(t)); else localStorage.removeItem(TOK); };

  async function tokenRequest(body) {
    const r = await fetch(base() + "/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    if (!r.ok) throw new Error("Home Assistant sign-in failed (" + r.status + ")");
    const t = await r.json();
    t.expires_at = Date.now() + (t.expires_in - 30) * 1000;
    return t;
  }
  async function accessToken() {
    // 0) Wall screen with a long-lived token in config.json (server.py only hands it to the screen's own browser)
    if (cfg().haToken) return cfg().haToken;
    // 1) Coming back from Home Assistant's login page with ?code=
    const q = new URLSearchParams(location.search);
    if (!tokens && q.get("code")) {
      saveTokens(await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), client_id: clientId() }));
      history.replaceState(null, "", redirect());
    }
    // 2) Never signed in: go to Home Assistant's login page
    if (!tokens) {
      location.href = base() + "/auth/authorize?response_type=code&client_id=" + encodeURIComponent(clientId()) +
        "&redirect_uri=" + encodeURIComponent(redirect()) + "&state=valhalla";
      return new Promise(() => {});
    }
    // 3) Short-lived access token expired: refresh it
    if (Date.now() > tokens.expires_at) {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId() });
      saveTokens(Object.assign({}, tokens, t));
    }
    return tokens.access_token;
  }

  const S = {}, subs = new Set(), pending = new Map();
  let ws = null, nextId = 1;
  function send(msg) {
    return new Promise((resolve, reject) => { msg.id = nextId++; pending.set(msg.id, { resolve, reject }); ws.send(JSON.stringify(msg)); });
  }
  async function connect() {
    const token = await accessToken();
    await new Promise((resolve, reject) => {
      ws = new WebSocket(base().replace(/^http/, "ws") + "/api/websocket");
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
        else if (m.type === "auth_ok") resolve();
        else if (m.type === "auth_invalid") { saveTokens(null); reject(new Error("Home Assistant rejected the sign-in")); }
        else if (m.type === "result" && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.success ? p.resolve(m.result) : p.reject(new Error(m.error && m.error.message)); }
        else if (m.type === "event" && m.event && m.event.event_type === "state_changed") {
          const d = m.event.data; if (!d.new_state) { delete S[d.entity_id]; return; }
          S[d.entity_id] = d.new_state; subs.forEach((fn) => fn(d.entity_id, d.new_state));
        }
      };
      ws.onerror = () => reject(new Error("Could not reach Home Assistant"));
      ws.onclose = () => setTimeout(() => connect().catch(() => {}), 5000); // auto-reconnect
    });
    (await send({ type: "get_states" })).forEach((e) => { S[e.entity_id] = e; });
    await send({ type: "subscribe_events", event_type: "state_changed" });
    subs.forEach((fn) => Object.keys(S).forEach((id) => fn(id, S[id])));
  }

  // Calendar events through the same WebSocket (calendar.get_events with return_response), so no CORS setup is needed
  // and any provider Home Assistant can read (Google, CalDAV, ICS link) works the same way.
  async function events(start, end) {
    const cals = cfg().calendars || []; if (!cals.length) return [];
    const res = await send({ type: "call_service", domain: "calendar", service: "get_events", return_response: true,
      target: { entity_id: cals }, service_data: { start_date_time: start.toISOString(), end_date_time: end.toISOString() } });
    const out = [], resp = (res && res.response) || {};
    for (const cal of Object.keys(resp)) {
      for (const e of resp[cal].events || []) {
        const allDay = !/T/.test(e.start);
        out.push({ summary: e.summary, location: e.location || "", calendar: cal, allDay,
          start: new Date(allDay ? e.start + "T00:00" : e.start), end: new Date(allDay ? e.end + "T00:00" : e.end) });
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  window.VAdapters = window.VAdapters || {};
  window.VAdapters.ha = {
    name: "Home Assistant", pretend: false,
    connect, events,
    states: () => S,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    call: (domain, service, data) => {
      const d = Object.assign({}, data), target = d.entity_id ? { entity_id: d.entity_id } : undefined; delete d.entity_id;
      return send({ type: "call_service", domain, service, service_data: d, target });
    },
    // Live MJPEG stream through Home Assistant (camera's own short-lived access token; no password in the page)
    cameraSrc: (id) => { const e = S[id]; return e && e.attributes.access_token ? base() + "/api/camera_proxy_stream/" + id + "?token=" + e.attributes.access_token : null; },
    signOut: () => saveTokens(null),
  };
})();
