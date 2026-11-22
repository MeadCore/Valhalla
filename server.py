#!/usr/bin/env python3
"""Valhalla - home command center server (Python 3 standard library only; nothing to pip install).

What it does
  * Serves the Valhalla screen (static/) to the wall/desk touchscreen.
  * Setup wizard backend (GET/POST /api/setup/...): the ONE place that writes config.json. Only whitelisted keys,
    each one validated; the old file is kept as config.backup.json. Setup only answers the computer itself.
  * Dry-erase board sync (/api/board...): the board lives here in data/board.json, and every screen that has
    Valhalla open (wall screen, phones over Tailscale) gets live updates (Server-Sent Events).
  * /config.js: the screen's settings. The Home Assistant token is only included for a browser on this computer.
  * Govee lights (/api/lights/govee...): talks to Govee lights over the home network (LAN) or Govee's cloud, see
    govee.py. The Govee API key stays in this program; browsers (even this computer's) never get it.

Who can reach it
  * Always 127.0.0.1 (this computer).
  * Optionally ALSO a Tailscale address (100.x.y.z), set in Setup > Remote. Only your own Tailscale devices can
    reach that address. Never 0.0.0.0, never a router port forward.
"""
import ipaddress
import json
import os
import queue
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import govee

VERSION = "2.0.0"
BASE = os.path.dirname(os.path.abspath(__file__))
# Where settings and the board live. Normally this folder; the Windows app (Valhalla.exe) points it at
# %APPDATA%\Valhalla with VALHALLA_DATA_DIR so the program folder can stay read-only (see appdata.py).
HOME = os.path.abspath(os.environ.get("VALHALLA_DATA_DIR") or BASE)
STATIC = os.path.join(BASE, "static")
CONFIG = os.path.join(HOME, "config.json")
EXAMPLE = os.path.join(BASE, "config.example.json")
BACKUP = os.path.join(HOME, "config.backup.json")
DATA = os.path.join(HOME, "data")
BOARD_FILE = os.path.join(DATA, "board.json")
LOCK = threading.Lock()

DEFAULTS = {
    "adapter": "mock", "ha_url": "", "ha_remote_url": "", "ha_token": "", "calendars": ["calendar.house"], "weather_entity": "weather.home",
    "default_preset": "home", "default_scene": "auto", "norse_days": True, "board_sync": True,
    "listen_port": 8795, "remote_listen": "", "setup_done": False,
    "govee_enabled": False, "govee_api_key": "", "govee_lan": True, "govee_lan_ips": [], "govee_builtin_scenes": False,
}
SCENE_IDS = ("auto", "valhalla", "rwb", "samhain", "yule", "imbolc", "ostara", "beltane", "litha", "lughnasadh", "mabon", "winternights", "disting")
ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def _tailscale_ip(v):
    if v == "":
        return ""
    try:
        ip = ipaddress.ip_address(v)
    except ValueError:
        return "Use a Tailscale address like 100.101.102.103 (or leave it blank)."
    return "" if ip in ipaddress.ip_network("100.64.0.0/10") else "Only a Tailscale address (100.64.x.x - 100.127.x.x) is allowed, so Valhalla is never open to the whole network."


VALIDATORS = {
    "adapter": lambda v: "" if v in ("mock", "ha") else "Pick pretend devices (mock) or Home Assistant (ha).",
    "ha_url": lambda v: "" if (v == "" or re.match(r"^https?://[A-Za-z0-9.\-\[\]:]+/?$", v)) else "Use an address like http://homeassistant.local:8123",
    "ha_remote_url": lambda v: "" if (v == "" or re.match(r"^https?://[A-Za-z0-9.\-\[\]:]+/?$", v)) else "Use Home Assistant's Tailscale name, like http://homeassistant.your-tailnet.ts.net:8123",
    "ha_token": lambda v: "" if (v == "" or re.match(r"^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$", v) and len(v) < 600) else "A long-lived access token is one long line that starts with eyJ (three parts separated by dots).",
    "calendars": lambda v: "" if (isinstance(v, list) and len(v) <= 10 and all(isinstance(x, str) and ENTITY.match(x) and x.startswith("calendar.") for x in v)) else "List calendar entities like calendar.house, separated by commas.",
    "weather_entity": lambda v: "" if (v == "" or (ENTITY.match(v) and v.startswith("weather."))) else "A weather entity looks like weather.home.",
    "default_preset": lambda v: "" if v in ("home", "security", "night", "family") else "Pick home, security, night or family.",
    "default_scene": lambda v: "" if v in SCENE_IDS else "Pick Auto or one of the scenes.",
    "norse_days": lambda v: "" if isinstance(v, bool) else "On or off.",
    "board_sync": lambda v: "" if isinstance(v, bool) else "On or off.",
    "listen_port": lambda v: "" if (isinstance(v, int) and 1024 <= v <= 65535) else "A port from 1024 to 65535 (default 8795).",
    "remote_listen": _tailscale_ip,
    "setup_done": lambda v: "" if isinstance(v, bool) else "On or off.",
    "govee_enabled": lambda v: "" if isinstance(v, bool) else "On or off.",
    "govee_api_key": lambda v: "" if (isinstance(v, str) and govee.valid_key(v)) else "A Govee API key is one line of letters, numbers and dashes (it comes by e-mail from Govee).",
    "govee_lan": lambda v: "" if isinstance(v, bool) else "On or off.",
    "govee_lan_ips": lambda v: "" if (isinstance(v, list) and len(v) <= 40 and all(isinstance(x, str) and govee.valid_lan_ip(x) for x in v)) else "Home-network addresses like 192.168.1.50, separated by commas (or leave it blank).",
    "govee_builtin_scenes": lambda v: "" if isinstance(v, bool) else "On or off.",
}
SECRET = ("ha_token", "govee_api_key")
RESTART_KEYS = ("listen_port", "remote_listen")


# ----------------------------------------------------------------------------------------------- config
def load_config():
    os.makedirs(HOME, exist_ok=True)
    if not os.path.exists(CONFIG) and os.path.exists(EXAMPLE):
        shutil.copyfile(EXAMPLE, CONFIG)
        print("First run: created config.json from config.example.json. Open the page and follow the Setup wizard.")
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG, encoding="utf-8-sig") as f:
            raw = json.load(f)
        cfg.update({k: v for k, v in raw.items() if not k.startswith("_")})
    except FileNotFoundError:
        pass
    except ValueError as e:
        print("config.json has a typo (%s) - using defaults until it is fixed." % e)
    return cfg


def save_config(changes):
    errors = {}
    clean = {}
    for k, v in changes.items():
        if k not in VALIDATORS:
            errors[k] = "Not a setting Valhalla knows."
            continue
        if isinstance(v, str):
            v = v.strip()
        if k in ("calendars", "govee_lan_ips") and isinstance(v, str):
            v = [x.strip() for x in v.split(",") if x.strip()]
        if k == "listen_port" and isinstance(v, str) and v.isdigit():
            v = int(v)
        msg = VALIDATORS[k](v)
        if msg:
            errors[k] = msg
        else:
            clean[k] = v
    if errors:
        return {"ok": False, "errors": errors}
    with LOCK:
        try:
            with open(CONFIG, encoding="utf-8-sig") as f:
                cur = json.load(f)
        except (FileNotFoundError, ValueError):
            cur = {}
        if os.path.exists(CONFIG):
            shutil.copyfile(CONFIG, BACKUP)
        cur.update(clean)
        tmp = CONFIG + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cur, f, indent=2)
            f.write("\n")
        os.replace(tmp, CONFIG)
    return {"ok": True, "saved": sorted(clean), "restart": any(k in clean for k in RESTART_KEYS)}


def masked_status(cfg):
    keys = {}
    for k in VALIDATORS:
        v = cfg.get(k, DEFAULTS.get(k))
        if k in SECRET:
            keys[k] = {"set": bool(v), "value": ("••••" + v[-4:]) if v else ""}
        else:
            keys[k] = {"set": v not in ("", None, []), "value": v}
    return {"ok": True, "keys": keys}


def public_config(cfg, local):
    out = {
        "server": True, "adapter": cfg["adapter"], "haUrl": (cfg["ha_url"] if local or not cfg.get("ha_remote_url") else cfg["ha_remote_url"]), "calendars": cfg["calendars"],
        "weather": cfg["weather_entity"] or "weather.home", "defaultPreset": cfg["default_preset"],
        "defaultScene": cfg["default_scene"], "norse": bool(cfg["norse_days"]), "boardSync": bool(cfg["board_sync"]),
        "setupDone": bool(cfg["setup_done"]), "local": local, "govee": bool(cfg.get("govee_enabled")),
    }
    if local and cfg.get("ha_token"):
        out["haToken"] = cfg["ha_token"]  # only ever sent to a browser on this computer
    return out


def test_ha(url, token):
    url = (url or "").rstrip("/")
    if not url or not token:
        return {"ok": False, "message": "Fill in the Home Assistant address and the token first."}
    head = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

    def get(path):
        req = urllib.request.Request(url + path, headers=head)
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))
    try:
        conf = get("/api/config")
        states = get("/api/states")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"ok": False, "message": "Home Assistant said the token is wrong or was deleted (401). Make a new long-lived token."}
        return {"ok": False, "message": "Home Assistant answered with an error (%s)." % e.code}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"ok": False, "message": "Could not reach Home Assistant at %s (%s). Check the address and that this PC is on the same network or Tailscale." % (url, getattr(e, "reason", e))}
    counts = {}
    for s in states:
        d = s.get("entity_id", "").split(".")[0]
        if d in ("camera", "climate", "cover", "light", "calendar", "weather", "lock"):
            counts.setdefault(d, []).append(s["entity_id"])
    return {"ok": True, "message": "Connected to Home Assistant %s." % conf.get("version", ""), "version": conf.get("version"),
            "entities": {k: sorted(v)[:40] for k, v in counts.items()}}


# ----------------------------------------------------------------------------------------------- board sync
class Board:
    MAX_STROKES, MAX_POINTS = 3000, 4000

    def __init__(self):
        self.rev, self.strokes, self.listeners = 0, [], set()
        self.lock = threading.Lock()
        try:
            with open(BOARD_FILE, encoding="utf-8") as f:
                d = json.load(f)
            self.rev, self.strokes = int(d.get("rev", 0)), list(d.get("strokes", []))
        except (FileNotFoundError, ValueError):
            pass
        self._dirty = False
        threading.Thread(target=self._saver, daemon=True).start()

    @staticmethod
    def valid_stroke(s):
        if not isinstance(s, dict) or not isinstance(s.get("pts"), list) or not (0 < len(s["pts"]) <= Board.MAX_POINTS):
            return None
        if not re.match(r"^#[0-9a-fA-F]{6}$", str(s.get("color", ""))):
            return None
        try:
            pts = [[round(min(max(float(p[0]), 0), 1), 4), round(min(max(float(p[1]), 0), 1), 4)] for p in s["pts"]]
            size = int(s.get("size", 6))
        except (TypeError, ValueError, IndexError):
            return None
        sid = str(s.get("id") or uuid.uuid4().hex)[:40]
        return {"id": sid, "color": s["color"], "size": max(1, min(size, 40)), "erase": bool(s.get("erase")), "pts": pts}

    def apply(self, body):
        op, client = body.get("op"), str(body.get("client", ""))[:40]
        with self.lock:
            if op == "add":
                st = self.valid_stroke(body.get("stroke"))
                if not st:
                    return None
                if any(x["id"] == st["id"] for x in self.strokes):
                    return {"rev": self.rev}
                self.strokes.append(st)
                del self.strokes[:-self.MAX_STROKES]
                ev = {"op": "add", "stroke": st}
            elif op == "remove":
                sid = str(body.get("id", ""))
                self.strokes = [x for x in self.strokes if x["id"] != sid]
                ev = {"op": "remove", "id": sid}
            elif op == "clear":
                self.strokes = []
                ev = {"op": "clear"}
            elif op == "seed":  # first-run demo note: only onto a brand-new, empty board
                if self.rev != 0 or self.strokes:
                    return {"rev": self.rev, "ignored": True}
                self.strokes = [s for s in (self.valid_stroke(x) for x in body.get("strokes", [])[:200]) if s]
                ev = {"op": "replace", "strokes": self.strokes}
            else:
                return None
            self.rev += 1
            ev.update(rev=self.rev, client=client)
            self._dirty = True
            for q in list(self.listeners):
                q.put(ev)
            return {"rev": self.rev}

    def snapshot(self):
        with self.lock:
            return {"rev": self.rev, "strokes": list(self.strokes)}

    def _saver(self):
        while True:
            time.sleep(1)
            if self._dirty:
                snap = self.snapshot()
                self._dirty = False
                os.makedirs(DATA, exist_ok=True)
                tmp = BOARD_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(snap, f)
                os.replace(tmp, BOARD_FILE)


BOARD = None
GOVEE = govee.GoveeHub()


# ----------------------------------------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    server_version = "Valhalla"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def is_local(self):
        return self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        name = host.rsplit(":", 1)[0].strip("[]")
        allowed = {"127.0.0.1", "localhost", "::1"}
        if CFG.get("remote_listen"):
            allowed.add(CFG["remote_listen"])
        return name in allowed or name.endswith(".ts.net")  # Tailscale MagicDNS names

    def send_json(self, code, obj, extra=None):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise ValueError("Send JSON.")
        n = int(self.headers.get("Content-Length") or 0)
        if n > 1_000_000:
            raise ValueError("Too big.")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")

    def origin_ok(self):
        o = self.headers.get("Origin")
        return (not o) or o.split("//", 1)[-1].lower() == (self.headers.get("Host") or "").lower()

    def do_GET(self):
        global CFG
        if not self.host_ok():
            return self.send_json(403, {"error": "Unknown host name."})
        path = self.path.split("?", 1)[0]
        if path == "/config.js":
            CFG = load_config()
            body = ("window.VALHALLA_CONFIG = " + json.dumps(public_config(CFG, self.is_local())) + ";\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "version": VERSION, "board_rev": BOARD.rev})
        if path == "/api/setup/status":
            if not self.is_local():
                return self.send_json(403, {"error": "Setup only works on the wall-screen computer itself."})
            CFG = load_config()
            return self.send_json(200, masked_status(CFG))
        if path == "/api/board":
            return self.send_json(200, BOARD.snapshot())
        if path == "/api/lights/govee":
            try:
                return self.send_json(200, GOVEE.lights())
            except govee.GoveeError as e:
                return self.send_json(200, {"enabled": GOVEE.enabled, "lights": [], "warning": str(e)})
        if path == "/api/lights/govee/scenes":
            q = dict(x.split("=", 1) for x in (self.path.split("?", 1) + [""])[1].split("&") if "=" in x)
            try:
                return self.send_json(200, {"ok": True, "scenes": [o["name"] for o in GOVEE.scenes(urllib.parse.unquote(q.get("id", "")))]})
            except govee.GoveeError as e:
                return self.send_json(200, {"ok": False, "scenes": [], "message": str(e)})
        if path == "/api/board/events":
            return self.stream_board()
        return self.serve_static(path)

    def do_POST(self):
        global CFG
        if not self.host_ok() or not self.origin_ok():
            return self.send_json(403, {"error": "Blocked: wrong host or origin."})
        path = self.path.split("?", 1)[0]
        try:
            body = self.read_json()
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if path.startswith("/api/setup/"):
            if not self.is_local():
                return self.send_json(403, {"error": "Setup only works on the wall-screen computer itself."})
            if path == "/api/setup/config":
                res = save_config(body if isinstance(body, dict) else {})
                CFG = load_config()
                GOVEE.configure(CFG)
                return self.send_json(200 if res["ok"] else 400, res)
            if path == "/api/setup/test-govee":
                cfg = load_config()
                ips = body.get("govee_lan_ips", cfg.get("govee_lan_ips") or [])
                if isinstance(ips, str):
                    ips = [x.strip() for x in ips.split(",") if x.strip()]
                bad = [x for x in ips if not govee.valid_lan_ip(str(x))]
                if bad:
                    return self.send_json(200, {"ok": False, "message": "Not a home-network address: %s" % ", ".join(str(b)[:40] for b in bad[:3])})
                key = (body.get("govee_api_key") or cfg.get("govee_api_key") or "").strip()
                if not govee.valid_key(key):
                    return self.send_json(200, {"ok": False, "message": "That doesn't look like a Govee API key (letters, numbers and dashes)."})
                return self.send_json(200, GOVEE.test(key, bool(body.get("govee_lan", cfg.get("govee_lan", True))), ips))
            if path == "/api/setup/test-ha":
                cfg = load_config()
                return self.send_json(200, test_ha(body.get("ha_url") or cfg["ha_url"], body.get("ha_token") or cfg["ha_token"]))
        if path.startswith("/api/lights/govee/"):
            return self.govee_post(path, body if isinstance(body, dict) else {})
        if path == "/api/board":
            if not CFG.get("board_sync", True):
                return self.send_json(409, {"error": "Board sync is off in Setup."})
            res = BOARD.apply(body if isinstance(body, dict) else {})
            return self.send_json(200, res) if res else self.send_json(400, {"error": "Bad board change."})
        return self.send_json(404, {"error": "Not found."})

    def govee_post(self, path, body):
        if not GOVEE.enabled:
            return self.send_json(409, {"ok": False, "message": "Govee lights are off in Setup."})
        try:
            if path == "/api/lights/govee/control":
                kw = {}
                if "on" in body:
                    kw["on"] = bool(body["on"])
                if body.get("brightness") is not None:
                    kw["brightness"] = int(body["brightness"])
                if body.get("rgb") is not None:
                    rgb = body["rgb"]
                    kw["rgb"] = govee.hex_rgb(rgb) if isinstance(rgb, str) else [int(x) for x in rgb][:3]
                    if len(kw["rgb"]) != 3:
                        raise govee.GoveeError("A color needs red, green and blue.")
                if body.get("kelvin") is not None:
                    kw["kelvin"] = int(body["kelvin"])
                if body.get("scene"):
                    return self.send_json(200, GOVEE.set_scene_by_name(str(body.get("id", "")), str(body["scene"])))
                return self.send_json(200, GOVEE.control(str(body.get("id", "")), **kw))
            if path == "/api/lights/govee/paint":
                cols = body.get("colors")
                if not isinstance(cols, list):
                    raise govee.GoveeError("Send the scene's colors.")
                scene_id = str(body.get("scene") or "")
                return self.send_json(200, GOVEE.paint(cols, scene_id if re.match(r"^[a-z0-9_]{1,30}$", scene_id) else None))
            if path == "/api/lights/govee/all-off":
                return self.send_json(200, GOVEE.all_off())
        except govee.GoveeError as e:
            return self.send_json(200, {"ok": False, "message": str(e)})
        except (TypeError, ValueError):
            return self.send_json(400, {"ok": False, "message": "Bad light change."})
        return self.send_json(404, {"error": "Not found."})

    def stream_board(self):
        q = queue.Queue()
        BOARD.listeners.add(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(("retry: 3000\nevent: hello\ndata: %s\n\n" % json.dumps({"rev": BOARD.rev})).encode())
            self.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=20)
                    self.wfile.write(("data: %s\n\n" % json.dumps(ev)).encode())
                except queue.Empty:
                    self.wfile.write(b": keep-alive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            BOARD.listeners.discard(q)
            self.close_connection = True

    TYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
             ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon"}

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        full = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not full.startswith(STATIC + os.sep) or not os.path.isfile(full):
            return self.send_json(404, {"error": "Not found."})
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", self.TYPES.get(os.path.splitext(full)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(data)


class Server(ThreadingHTTPServer):
    daemon_threads = True


def main():
    global CFG, BOARD
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass
    CFG = load_config()
    BOARD = Board()
    GOVEE.configure(CFG)
    port = int(os.environ.get("VALHALLA_PORT") or CFG["listen_port"])
    addrs = ["127.0.0.1"] + ([CFG["remote_listen"]] if CFG.get("remote_listen") and not _tailscale_ip(CFG["remote_listen"]) else [])
    servers = []
    for a in addrs:
        try:
            servers.append(Server((a, port), Handler))
        except OSError as e:
            print("Could not listen on %s:%d (%s)." % (a, port, e))
    if not servers:
        sys.exit(1)
    SERVERS[:] = servers
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    print("Valhalla is running:  http://127.0.0.1:%d/   (%s%s)" % (port, "pretend devices" if CFG["adapter"] == "mock" else "Home Assistant",
                                                             ", Govee lights: " + GOVEE.mode() if CFG.get("govee_enabled") else ""))
    if len(servers) > 1:
        print("Phones on your Tailscale: http://%s:%d/" % (CFG["remote_listen"], port))
    print("Press Ctrl+C to stop.")
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass


def stop():
    """Clean shutdown (used by the Windows tray app's Quit)."""
    for s in SERVERS:
        try:
            s.shutdown()
            s.server_close()
        except Exception:
            pass
    GOVEE.lan.stop()


CFG = dict(DEFAULTS)
SERVERS = []
if __name__ == "__main__":
    main()
