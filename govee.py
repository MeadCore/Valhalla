"""Valhalla - Govee lights driver (Python 3 standard library only; nothing to pip install).

Two ways to talk to Govee lights, used together:
  * LAN control (preferred): straight to the light over your home Wi-Fi. Fast, no internet needed, no daily limit.
    Only some Govee models have it, and it must be switched on per light in the Govee Home app (LAN Control).
      - find lights: send {"msg":{"cmd":"scan",...}} to the multicast group 239.255.255.250 port 4001
      - lights answer to this computer on UDP port 4002
      - commands go to the light's own address on UDP port 4003: turn, brightness, colorwc, devStatus
  * Govee cloud (Developer API, https://openapi.api.govee.com/router/api/v1/...): works for every Wi-Fi Govee light
    on your account, needs the free API key from the Govee Home app, and goes through Govee's servers.
      - GET  /user/devices    list lights + what each can do (cached 10 minutes; Govee allows 30 a minute)
      - POST /device/state    read one light (cached; Govee allows 30 a minute per light)
      - POST /device/control  change one light (spaced out; Govee allows 2 a second per light)
      - POST /device/scenes   Govee's built-in animated scenes for one light (cached 6 hours)
    Govee also caps an account at 10,000 cloud calls a day, so Valhalla never polls a cloud-only light more than once
    every 5 minutes and remembers what it last sent instead.

Rules this file follows: the API key is only ever sent to Govee in the Govee-API-Key header. It is never printed,
logged, returned to a browser or written anywhere except config.json (by server.py's Setup API).

Test-only overrides (environment variables, used by tools/test_govee.py with the pretend Govee in tools/govee_mock.py):
  VALHALLA_GOVEE_API_BASE        cloud address instead of https://openapi.api.govee.com
  VALHALLA_GOVEE_SCAN_ADDR       where to send the LAN scan instead of 239.255.255.250
  VALHALLA_GOVEE_SCAN_PORT / VALHALLA_GOVEE_LISTEN_PORT / VALHALLA_GOVEE_DEVICE_PORT   instead of 4001 / 4002 / 4003
  VALHALLA_GOVEE_LISTEN_ADDR     address to listen on for LAN replies instead of all addresses
"""
import ipaddress
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid

API_BASE = os.environ.get("VALHALLA_GOVEE_API_BASE", "https://openapi.api.govee.com").rstrip("/")
SCAN_ADDR = os.environ.get("VALHALLA_GOVEE_SCAN_ADDR", "239.255.255.250")
SCAN_PORT = int(os.environ.get("VALHALLA_GOVEE_SCAN_PORT", "4001"))
LISTEN_PORT = int(os.environ.get("VALHALLA_GOVEE_LISTEN_PORT", "4002"))
DEVICE_PORT = int(os.environ.get("VALHALLA_GOVEE_DEVICE_PORT", "4003"))
LISTEN_ADDR = os.environ.get("VALHALLA_GOVEE_LISTEN_ADDR", "")

DEVICE_LIST_TTL = 600      # cloud device list: 10 minutes
CLOUD_STATE_TTL = 300      # cloud-only light state: 5 minutes (keeps well under 10,000 calls a day)
SCENES_TTL = 6 * 3600      # Govee's scene list for a light: 6 hours
LAN_SCAN_EVERY = 60        # look for LAN lights once a minute
LAN_STATE_TTL = 8          # ask LAN lights how they are at most every 8 seconds
LAN_STALE = 300            # a LAN light silent this long is treated as gone (falls back to the cloud)
CLOUD_GAP = 0.55           # seconds between cloud commands to the same light (Govee: 2 a second)

HOME_NETS = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")  # home-network (and this-computer) addresses only
KEY_RE = re.compile(r"^[A-Za-z0-9\-]{16,80}$")

# Valhalla scene -> Govee built-in scene names to look for (first match wins, case-insensitive "contains").
# Govee's scene names differ by model, so these are hints. With no match the light just gets the scene's colors.
SCENE_HINTS = {
    "valhalla": ["Candlelight", "Warm", "Fireplace"],
    "rwb": ["Independence Day", "July 4th", "Fourth of July", "4th of July", "America", "Patriot", "Flag"],
    "samhain": ["Halloween", "Pumpkin", "Ghost"],
    "yule": ["Christmas", "Xmas", "Winter", "Snow"],
    "imbolc": ["Candlelight", "Candle", "Dawn"],
    "ostara": ["Spring", "Easter", "Blossom"],
    "beltane": ["Bonfire", "Fire", "Flame"],
    "litha": ["Summer", "Sunshine", "Sunrise", "Sun"],
    "lughnasadh": ["Harvest", "Wheat", "Field"],
    "mabon": ["Autumn", "Falling Leaves", "Fall", "Harvest"],
    "winternights": ["Aurora", "Starry", "Night", "Moonlight"],
    "disting": ["Moonlight", "Moon", "Ice", "Aurora"],
}


class GoveeError(Exception):
    """A plain-language problem to show on the screen. Never contains the API key."""


def valid_key(v):
    return v == "" or bool(KEY_RE.match(v))


def valid_lan_ip(v):
    try:
        ip = ipaddress.ip_address(v)
    except ValueError:
        return False
    return ip.version == 4 and any(ip in ipaddress.ip_network(n) for n in HOME_NETS)


def hex_rgb(h):
    h = str(h).lstrip("#")
    if not re.match(r"^[0-9a-fA-F]{6}$", h):
        raise GoveeError("Colors look like #ff0000.")
    return [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)]


def slug(s):
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", str(s).lower())).strip("_") or "light"


# ============================================================================================ cloud
class GoveeCloud:
    def __init__(self, key):
        self.key = key
        self.blocked_until = 0.0
        self.calls_today = 0
        self.day = time.strftime("%Y-%m-%d")
        self.remaining_today = None
        self.lock = threading.Lock()
        self.last_cmd = {}

    def _count(self):
        d = time.strftime("%Y-%m-%d")
        if d != self.day:
            self.day, self.calls_today = d, 0
        self.calls_today += 1

    def request(self, method, path, body=None, timeout=10):
        if not self.key:
            raise GoveeError("No Govee API key is saved yet.")
        if time.time() < self.blocked_until:
            raise GoveeError("Govee asked Valhalla to slow down. Cloud control is paused for about %d more seconds." % (self.blocked_until - time.time() + 1))
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(API_BASE + "/router/api/v1" + path, data=data, method=method,
                                     headers={"Govee-API-Key": self.key, "Content-Type": "application/json", "User-Agent": "Valhalla"})
        self._count()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                rem = r.headers.get("X-RateLimit-Remaining")
                if rem and rem.isdigit():
                    self.remaining_today = int(rem)
                out = json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            if e.code == 401 or e.code == 403:
                raise GoveeError("Govee said the API key is wrong or no longer works (%d). Get a new key in the Govee Home app. Note: a new key turns off the old one." % e.code)
            if e.code == 429:
                reset = e.headers.get("API-RateLimit-Reset") or e.headers.get("X-RateLimit-Reset") or e.headers.get("Retry-After") or ""
                wait = 60
                if reset.isdigit():
                    n = int(reset)
                    wait = max(5, min(3600, n - int(time.time()))) if n > 10 ** 9 else max(5, min(3600, n))
                self.blocked_until = time.time() + wait
                raise GoveeError("Govee's limit was reached, so cloud control waits %d seconds. LAN lights keep working." % wait)
            raise GoveeError("Govee's cloud answered with an error (%d). Try again in a minute." % e.code)
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise GoveeError("Could not reach Govee's cloud (%s). Check the internet connection." % (getattr(e, "reason", None) or type(e).__name__))
        code = out.get("code", 200)
        if code not in (200, "200"):
            raise GoveeError("Govee said: %s (%s)" % (str(out.get("message") or out.get("msg") or "error")[:120], code))
        return out

    def devices(self):
        out = self.request("GET", "/user/devices")
        return [d for d in out.get("data") or [] if isinstance(d, dict) and d.get("device") and d.get("sku")]

    def state(self, sku, device):
        out = self.request("POST", "/device/state", {"requestId": str(uuid.uuid4()), "payload": {"sku": sku, "device": device}})
        return (out.get("payload") or {}).get("capabilities") or []

    def control(self, sku, device, ctype, instance, value):
        with self.lock:  # space out commands to the same light (Govee allows 2 a second per light)
            wait = self.last_cmd.get(device, 0) + CLOUD_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last_cmd[device] = time.time()
        return self.request("POST", "/device/control", {"requestId": str(uuid.uuid4()), "payload": {
            "sku": sku, "device": device, "capability": {"type": ctype, "instance": instance, "value": value}}})

    def scenes(self, sku, device):
        out = self.request("POST", "/device/scenes", {"requestId": str(uuid.uuid4()), "payload": {"sku": sku, "device": device}})
        opts = []
        for cap in (out.get("payload") or {}).get("capabilities") or []:
            if cap.get("instance") == "lightScene":
                opts += (cap.get("parameters") or {}).get("options") or []
        return opts


def parse_caps(caps):
    """What a cloud light can do, from its capabilities list."""
    out = {"onoff": False, "brightness": False, "color": False, "ct": False, "ct_min": 2000, "ct_max": 9000, "scenes": False, "static_scenes": []}
    for c in caps or []:
        t, i, p = c.get("type", ""), c.get("instance", ""), c.get("parameters") or {}
        if i == "powerSwitch":
            out["onoff"] = True
        elif t.endswith("range") and i == "brightness":
            out["brightness"] = True
        elif i == "colorRgb":
            out["color"] = True
        elif i == "colorTemperatureK":
            out["ct"] = True
            r = p.get("range") or {}
            out["ct_min"], out["ct_max"] = int(r.get("min", 2000)), int(r.get("max", 9000))
        elif t.endswith("dynamic_scene") and i == "lightScene":
            out["scenes"] = True
            out["static_scenes"] = [o for o in p.get("options") or [] if isinstance(o, dict) and o.get("name")]
    return out


def parse_state(caps):
    st = {}
    for c in caps or []:
        i, v = c.get("instance"), (c.get("state") or {}).get("value")
        if v in ("", None):
            continue
        if i == "online":
            st["online"] = bool(v)
        elif i == "powerSwitch":
            st["on"] = v in (1, "1", True)
        elif i == "brightness":
            st["brightness"] = int(v)
        elif i == "colorRgb":
            v = int(v)
            st["rgb"] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
        elif i == "colorTemperatureK":
            if int(v) > 0:
                st["kelvin"] = int(v)
    return st


# ============================================================================================ LAN
def _local_ipv4s():
    """This computer's home-network addresses, so the scan goes out on every network card (Wi-Fi and wired)."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:  # the address used to reach the internet (no packet is sent)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    out = []
    for ip in ips:
        try:
            a = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if valid_lan_ip(ip) and not a.is_loopback:
            out.append(ip)
    return sorted(out)


class GoveeLan:
    def __init__(self):
        self.devices = {}         # device id -> {"ip", "sku", "seen"}
        self.status = {}          # ip -> (time, data)
        self.sock = None
        self.error = ""
        self.lock = threading.Lock()
        self.got = threading.Condition(self.lock)
        self.running = False

    def start(self):
        if self.sock:
            return True
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((LISTEN_ADDR, LISTEN_PORT))
            s.settimeout(1.0)
        except OSError as e:
            self.error = ("LAN control could not listen on UDP port %d (%s). Another Govee program (or Home Assistant's Govee "
                          "integration) on this computer may be using it. Cloud control still works." % (LISTEN_PORT, e.strerror or e))
            return False
        self.sock, self.error, self.running = s, "", True
        threading.Thread(target=self._recv, name="govee-lan", daemon=True).start()
        return True

    def stop(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = None

    def _recv(self):
        while self.running and self.sock:
            try:
                data, addr = self.sock.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            try:
                msg = json.loads(data.decode("utf-8")).get("msg") or {}
            except (ValueError, UnicodeDecodeError, AttributeError):
                continue
            cmd, d = msg.get("cmd"), msg.get("data") or {}
            with self.got:
                if cmd == "scan" and d.get("device") and d.get("ip") and valid_lan_ip(str(d["ip"])):
                    self.devices[str(d["device"])] = {"ip": str(d["ip"]), "sku": str(d.get("sku", ""))[:16], "seen": time.time()}
                elif cmd == "devStatus":
                    self.status[addr[0]] = (time.time(), d)
                    for dev in self.devices.values():
                        if dev["ip"] == addr[0]:
                            dev["seen"] = time.time()
                self.got.notify_all()

    def _send(self, ip, port, obj, iface=None):
        s = self.sock
        if not s:
            raise GoveeError(self.error or "LAN control is off.")
        payload = json.dumps(obj).encode("utf-8")
        if iface is not None:
            try:
                s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(iface))
            except OSError:
                return
        s.sendto(payload, (ip, port))

    def scan(self, extra_ips=(), wait=1.5):
        if not self.start():
            return {}
        msg = {"msg": {"cmd": "scan", "data": {"account_topic": "reserve"}}}
        try:
            self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
            self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        except OSError:
            pass
        sent = False
        try:
            self._send(SCAN_ADDR, SCAN_PORT, msg)
            sent = True
        except OSError:
            pass
        if SCAN_ADDR.startswith("239."):
            for ip in _local_ipv4s():  # computers with several network cards: ask on each one
                try:
                    self._send(SCAN_ADDR, SCAN_PORT, msg, iface=ip)
                    sent = True
                except OSError:
                    pass
        for ip in extra_ips:          # lights typed in by hand (when the router blocks multicast)
            try:
                self._send(ip, SCAN_PORT, msg)
                sent = True
            except OSError:
                pass
        if not sent:
            self.error = "LAN scan could not be sent. Is this computer on the home network?"
        end = time.time() + wait
        with self.got:
            while time.time() < end:
                self.got.wait(end - time.time())
            return dict(self.devices)

    def command(self, ip, cmd, data):
        self._send(ip, DEVICE_PORT, {"msg": {"cmd": cmd, "data": data}})

    def query(self, ips, wait=0.8):
        """Ask several LAN lights how they are at once; returns {ip: data} for the ones that answered."""
        if not ips or not self.sock:
            return {}
        asked = time.time()
        for ip in ips:
            try:
                self.command(ip, "devStatus", {})
            except (OSError, GoveeError):
                pass
        end = asked + wait
        with self.got:
            while time.time() < end and not all(self.status.get(ip, (0,))[0] >= asked for ip in ips):
                self.got.wait(end - time.time())
            return {ip: self.status[ip][1] for ip in ips if self.status.get(ip, (0,))[0] >= asked}


# ============================================================================================ hub
class GoveeHub:
    """Everything server.py needs: one list of lights (LAN + cloud merged by device id) and one way to change them."""

    def __init__(self):
        self.lock = threading.RLock()
        self.enabled, self.key, self.use_lan, self.lan_ips, self.builtin = False, "", True, [], False
        self.cloud = None
        self.lan = GoveeLan()
        self.cloud_list, self.cloud_list_at, self.cloud_error = [], 0.0, ""
        self.state = {}            # device id -> {"on","brightness","rgb","kelvin","at","src"}
        self.scene_cache = {}      # device id -> (time, [options])
        self.last_scan = 0.0
        self.lan_states_at = 0.0
        self._bg = None

    # ------------------------------------------------------------------ settings
    def configure(self, cfg):
        with self.lock:
            key = (cfg.get("govee_api_key") or "").strip()
            self.enabled = bool(cfg.get("govee_enabled"))
            self.use_lan = bool(cfg.get("govee_lan", True))
            self.lan_ips = [ip for ip in (cfg.get("govee_lan_ips") or []) if valid_lan_ip(ip)]
            self.builtin = bool(cfg.get("govee_builtin_scenes"))
            if key != self.key:
                self.key = key
                self.cloud = GoveeCloud(key) if key else None
                self.cloud_list, self.cloud_list_at, self.cloud_error, self.scene_cache = [], 0.0, "", {}
            if not (self.enabled and self.use_lan):
                self.lan.stop()
            if self.enabled and self._bg is None:
                self._bg = threading.Thread(target=self._background, name="govee-bg", daemon=True)
                self._bg.start()

    def _background(self):
        while True:
            try:
                if self.enabled and self.use_lan and time.time() - self.last_scan > LAN_SCAN_EVERY:
                    self.last_scan = time.time()
                    self.lan.scan(self.lan_ips)
            except Exception:  # never let a network hiccup stop the server
                pass
            time.sleep(5)

    def mode(self):
        parts = []
        if self.use_lan:
            parts.append("LAN")
        if self.cloud:
            parts.append("cloud")
        return " + ".join(parts) or "off"

    # ------------------------------------------------------------------ reading
    def _cloud_devices(self, force=False):
        if not self.cloud:
            return []
        if force or time.time() - self.cloud_list_at > DEVICE_LIST_TTL:
            try:
                self.cloud_list = self.cloud.devices()
                self.cloud_error = ""
            except GoveeError as e:
                self.cloud_error = str(e)
            self.cloud_list_at = time.time()  # also after an error, so a bad key is not retried every few seconds
        return self.cloud_list

    def _lan_live(self, dev_id):
        d = self.lan.devices.get(dev_id)
        return d if (d and self.use_lan and self.lan.sock and time.time() - d["seen"] < LAN_STALE) else None

    def lights(self, refresh=True):
        with self.lock:
            if not self.enabled:
                return {"enabled": False, "lights": []}
            if self.use_lan and (not self.lan.devices or time.time() - self.last_scan > LAN_SCAN_EVERY):
                self.last_scan = time.time()
                self.lan.scan(self.lan_ips, wait=1.2 if not self.lan.devices else 0.6)
            cloud = {d["device"]: d for d in self._cloud_devices()
                     if str(d.get("type", "devices.types.light")) == "devices.types.light"}
            ids = list(dict.fromkeys(list(cloud) + list(self.lan.devices)))
            if refresh:
                self._refresh(ids, cloud)
            out, used = [], set()
            for dev_id in ids:
                c, lan = cloud.get(dev_id), self._lan_live(dev_id)
                if not c and not lan:
                    continue
                caps = parse_caps(c.get("capabilities")) if c else {"onoff": True, "brightness": True, "color": True, "ct": True,
                                                                      "ct_min": 2000, "ct_max": 9000, "scenes": False, "static_scenes": []}
                sku = (c or {}).get("sku") or (lan or {}).get("sku") or "Govee"
                name = (c or {}).get("deviceName") or ("Govee %s %s" % (sku, dev_id.replace(":", "")[-4:]))
                ent = "light.govee_" + slug(name)
                while ent in used:
                    ent += "_2"
                used.add(ent)
                st = self.state.get(dev_id, {})
                out.append({"id": dev_id, "entity_id": ent, "name": name, "sku": sku, "lan": bool(lan), "cloud": bool(c),
                            "via": "LAN" if lan else "cloud", "online": st.get("online", True),
                            "caps": {k: caps[k] for k in ("brightness", "color", "ct", "ct_min", "ct_max")},
                            "scenes": bool(c and self.cloud and caps["scenes"]),
                            "on": bool(st.get("on")), "brightness": st.get("brightness", 100), "rgb": st.get("rgb"), "kelvin": st.get("kelvin"),
                            "scene": st.get("scene")})
            res = {"enabled": True, "mode": self.mode(), "lights": out, "builtin_scenes": self.builtin}
            errs = [e for e in (self.cloud_error, self.lan.error if self.use_lan else "") if e]
            if errs:
                res["warning"] = " ".join(errs)
            if self.cloud:
                res["cloud_calls_today"] = self.cloud.calls_today
            return res

    def _refresh(self, ids, cloud):
        now = time.time()
        lan_ips = {}
        for dev_id in ids:
            lan = self._lan_live(dev_id)
            if lan:
                lan_ips[lan["ip"]] = dev_id
        if lan_ips and now - self.lan_states_at > LAN_STATE_TTL:
            self.lan_states_at = now
            for ip, d in self.lan.query(list(lan_ips)).items():
                st = self.state.setdefault(lan_ips[ip], {})
                st.update(on=d.get("onOff") in (1, "1", True), brightness=int(d.get("brightness") or 0) or st.get("brightness", 100),
                          at=now, src="lan", online=True)
                col, k = d.get("color") or {}, int(d.get("colorTemInKelvin") or d.get("colorTem") or 0)
                if k:
                    st["kelvin"], st["rgb"] = k, None
                elif col:
                    st["rgb"], st["kelvin"] = [int(col.get("r", 0)), int(col.get("g", 0)), int(col.get("b", 0))], None
        if not self.cloud:
            return
        for dev_id in ids:  # cloud-only lights: at most one read every 5 minutes each
            if dev_id in lan_ips.values() or dev_id not in cloud:
                continue
            st = self.state.get(dev_id, {})
            if now - st.get("at", 0) < CLOUD_STATE_TTL:
                continue
            try:
                got = parse_state(self.cloud.state(cloud[dev_id]["sku"], dev_id))
            except GoveeError as e:
                self.cloud_error = str(e)
                self.state.setdefault(dev_id, {})["at"] = now
                break  # don't hammer the cloud when it is unhappy
            st = self.state.setdefault(dev_id, {})
            if "kelvin" in got:
                st["rgb"] = None
            st.update(got, at=now, src="cloud")

    def _find(self, dev_id):
        cloud = {d["device"]: d for d in self.cloud_list}
        c, lan = cloud.get(dev_id), self._lan_live(dev_id)
        if not c and not lan:
            self.lights(refresh=False)
            cloud = {d["device"]: d for d in self.cloud_list}
            c, lan = cloud.get(dev_id), self._lan_live(dev_id)
        if not c and not lan:
            raise GoveeError("That Govee light was not found. Is it plugged in and on Wi-Fi?")
        return c, lan

    # ------------------------------------------------------------------ changing
    def control(self, dev_id, on=None, brightness=None, rgb=None, kelvin=None, scene=None):
        """Change one light. Uses LAN when the light answers on LAN, otherwise (or if LAN fails) the cloud."""
        with self.lock:
            c, lan = self._find(dev_id)
        caps = parse_caps(c.get("capabilities")) if c else None
        if brightness is not None:
            brightness = max(1, min(100, int(brightness)))
        if kelvin is not None:
            lo, hi = (caps["ct_min"], caps["ct_max"]) if caps and caps["ct"] else (2000, 9000)
            kelvin = max(lo, min(hi, int(kelvin)))
        if rgb is not None:
            rgb = [max(0, min(255, int(x))) for x in rgb][:3]
        st = self.state.setdefault(dev_id, {})
        used = "LAN"
        if scene is not None:
            if not (c and self.cloud):
                raise GoveeError("Govee's built-in scenes need the cloud (API key). LAN control can only do colors.")
            self.cloud.control(c["sku"], dev_id, "devices.capabilities.dynamic_scene", "lightScene", scene["value"])
            st.update(on=True, scene=scene.get("name"), rgb=None, kelvin=None)
            return {"ok": True, "via": "cloud"}
        steps = []
        if on is not None and not on:
            steps.append(("turn", {"value": 0}, ("devices.capabilities.on_off", "powerSwitch", 0)))
        else:
            if on or rgb is not None or kelvin is not None or brightness is not None:
                if not st.get("on") or on:
                    steps.append(("turn", {"value": 1}, ("devices.capabilities.on_off", "powerSwitch", 1)))
            if rgb is not None:
                steps.append(("colorwc", {"color": {"r": rgb[0], "g": rgb[1], "b": rgb[2]}, "colorTemInKelvin": 0},
                              ("devices.capabilities.color_setting", "colorRgb", (rgb[0] << 16) + (rgb[1] << 8) + rgb[2])))
            if kelvin is not None:
                steps.append(("colorwc", {"color": {"r": 0, "g": 0, "b": 0}, "colorTemInKelvin": kelvin},
                              ("devices.capabilities.color_setting", "colorTemperatureK", kelvin)))
            if brightness is not None:
                steps.append(("brightness", {"value": brightness}, ("devices.capabilities.range", "brightness", brightness)))
        lan_ok = False
        if lan:
            try:
                for cmd, data, _ in steps:
                    self.lan.command(lan["ip"], cmd, data)
                    time.sleep(0.05)
                lan_ok = True
            except (OSError, GoveeError):
                lan_ok = False
        if not lan_ok:
            if not (c and self.cloud):
                raise GoveeError("This light only works over LAN, and LAN control did not answer. " + (self.lan.error or "Check the light is on Wi-Fi and LAN Control is on in the Govee Home app."))
            used = "cloud"
            for _, _, (ct, inst, val) in steps:
                self.cloud.control(c["sku"], dev_id, ct, inst, val)
        if on is not None:
            st["on"] = bool(on)
        if rgb is not None:
            st.update(on=True, rgb=rgb, kelvin=None, scene=None)
        if kelvin is not None:
            st.update(on=True, kelvin=kelvin, rgb=None, scene=None)
        if brightness is not None:
            st.update(on=True, brightness=brightness)
        st["at"] = time.time()   # we know the state now; no need to ask the cloud again soon
        self.lan_states_at = time.time()  # give LAN lights a moment before re-reading them
        return {"ok": True, "via": used}

    def scenes(self, dev_id):
        with self.lock:
            c, _ = self._find(dev_id)
            if not (c and self.cloud):
                return []
            hit = self.scene_cache.get(dev_id)
            if hit and time.time() - hit[0] < SCENES_TTL:
                return hit[1]
        opts = list(parse_caps(c.get("capabilities"))["static_scenes"])
        try:
            opts += self.cloud.scenes(c["sku"], dev_id)
        except GoveeError:
            if not opts:
                raise
        seen, clean = set(), []
        for o in opts:
            n = str(o.get("name", ""))[:60]
            if n and n not in seen and isinstance(o.get("value"), (dict, int)):
                seen.add(n)
                clean.append({"name": n, "value": o["value"]})
        self.scene_cache[dev_id] = (time.time(), clean)
        return clean

    def set_scene_by_name(self, dev_id, name):
        with self.lock:
            c, _ = self._find(dev_id)
        if not (c and self.cloud):
            raise GoveeError("Govee's built-in scenes need the cloud (API key). LAN control can only do colors.")
        for o in self.scenes(dev_id):
            if o["name"] == name:
                return self.control(dev_id, scene=o)
        raise GoveeError("This light has no Govee scene called %s." % name[:60])

    def paint(self, colors, scene_id=None, ids=None):
        """Valhalla scene -> lights. Color lights get the scene's colors (one color per light, taking turns);
        with built-in scenes on, a light whose Govee scene list has a matching name plays that animated scene instead."""
        rgbs = [hex_rgb(c) for c in (colors or [])][:8]
        if not rgbs:
            raise GoveeError("This scene has no light colors.")
        res = self.lights(refresh=False)
        targets = [l for l in res["lights"] if l["caps"]["color"] and (not ids or l["id"] in ids)]
        done, errors, n = [], [], 0
        for l in targets:
            try:
                if self.builtin and scene_id and l["scenes"]:
                    match = self.match_scene(l["id"], scene_id)
                    if match:
                        self.control(l["id"], scene=match)
                        done.append({"name": l["name"], "scene": match["name"]})
                        continue
                r = self.control(l["id"], rgb=rgbs[n % len(rgbs)])
                done.append({"name": l["name"], "rgb": rgbs[n % len(rgbs)], "via": r["via"]})
                n += 1
            except GoveeError as e:
                errors.append("%s: %s" % (l["name"], e))
        return {"ok": not errors or bool(done), "done": done, "errors": errors}

    def match_scene(self, dev_id, scene_id):
        hints = SCENE_HINTS.get(scene_id) or []
        if not hints:
            return None
        try:
            opts = self.scenes(dev_id)
        except GoveeError:
            return None
        for h in hints:
            for o in opts:
                if h.lower() in o["name"].lower():
                    return o
        return None

    def all_off(self):
        res = self.lights(refresh=False)
        errors = []
        for l in res["lights"]:
            try:
                self.control(l["id"], on=False)
            except GoveeError as e:
                errors.append("%s: %s" % (l["name"], e))
        return {"ok": not errors, "errors": errors}

    # ------------------------------------------------------------------ setup test
    def test(self, key, use_lan, lan_ips):
        msgs, found, ok = [], [], False
        if key:
            try:
                devs = GoveeCloud(key).devices()
                lights = [d for d in devs if d.get("type", "devices.types.light") == "devices.types.light"]
                msgs.append("✓ Govee cloud: the key works. %d light%s on the account." % (len(lights), "" if len(lights) == 1 else "s"))
                found += [{"name": d.get("deviceName") or d["sku"], "sku": d["sku"], "id": d["device"], "cloud": True, "lan": False} for d in lights]
                ok = True
            except GoveeError as e:
                msgs.append("✗ " + str(e))
        if use_lan:
            lan = self.lan
            devs = lan.scan([ip for ip in lan_ips if valid_lan_ip(ip)], wait=2.0)
            if lan.error:
                msgs.append("✗ " + lan.error)
            else:
                fresh = {k: v for k, v in devs.items() if time.time() - v["seen"] < 10}
                msgs.append(("✓ LAN: %d light%s answered on the home network." % (len(fresh), "" if len(fresh) == 1 else "s")) if fresh else
                            "LAN: no lights answered yet. Turn on LAN Control for each light in the Govee Home app (only some models have it).")
                for dev_id, v in fresh.items():
                    hit = next((f for f in found if f["id"] == dev_id), None)
                    if hit:
                        hit["lan"] = True
                    else:
                        found.append({"name": "Govee %s %s" % (v["sku"], dev_id.replace(":", "")[-4:]), "sku": v["sku"], "id": dev_id, "cloud": False, "lan": True})
                ok = ok or bool(fresh)
        if not key and not use_lan:
            msgs.append("Turn on LAN control or paste an API key first.")
        return {"ok": ok, "message": " ".join(msgs), "lights": [{k: f[k] for k in ("name", "sku", "cloud", "lan")} for f in found][:60]}
