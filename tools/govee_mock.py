#!/usr/bin/env python3
"""Pretend Govee lights, for testing Valhalla's Govee support before any real lights are bought.

Runs on this computer only (127.0.0.x):
  * a pretend Govee cloud (the same addresses and answers as https://openapi.api.govee.com/router/api/v1/...)
  * pretend LAN lights that answer the LAN scan and the turn / brightness / colorwc / devStatus commands

    python tools/govee_mock.py            (then start Valhalla with the settings it prints)

Pretend API key: pretend-govee-key-0000 (not a real key). Pretend lights:
  Pretend Porch Strip (H619A)  LAN at 127.0.0.2 + cloud
  Pretend Floor Lamp  (H6076)  LAN at 127.0.0.3 + cloud
  Pretend Bulb        (H6008)  cloud only (Govee bulbs have no LAN control)
  Pretend Plug        (H5080)  a smart plug, which Valhalla should leave out of the Lights box
Extra test addresses: GET /mock/log (what each light received), POST /mock/ratelimit {"n": 2} (answer 429 next n
times), POST /mock/reset. Linux needs nothing extra for 127.0.0.2-3; on Windows/macOS use VALHALLA_GOVEE_* overrides
or run it on Linux.
"""
import json
import os
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = "pretend-govee-key-0000"
HTTP_PORT = int(os.environ.get("GOVEE_MOCK_HTTP_PORT", "18790"))
SCAN_PORT = int(os.environ.get("VALHALLA_GOVEE_SCAN_PORT", "14001"))
LISTEN_PORT = int(os.environ.get("VALHALLA_GOVEE_LISTEN_PORT", "14002"))
DEVICE_PORT = int(os.environ.get("VALHALLA_GOVEE_DEVICE_PORT", "14003"))


def caps(color=True, ct=(2000, 9000), scenes=True):
    c = [{"type": "devices.capabilities.on_off", "instance": "powerSwitch", "parameters": {"dataType": "ENUM", "options": [{"name": "on", "value": 1}, {"name": "off", "value": 0}]}},
         {"type": "devices.capabilities.range", "instance": "brightness", "parameters": {"unit": "unit.percent", "dataType": "INTEGER", "range": {"min": 1, "max": 100, "precision": 1}}}]
    if color:
        c.append({"type": "devices.capabilities.color_setting", "instance": "colorRgb", "parameters": {"dataType": "INTEGER", "range": {"min": 0, "max": 16777215, "precision": 1}}})
    if ct:
        c.append({"type": "devices.capabilities.color_setting", "instance": "colorTemperatureK", "parameters": {"dataType": "INTEGER", "range": {"min": ct[0], "max": ct[1], "precision": 1}}})
    if scenes:
        c.append({"type": "devices.capabilities.dynamic_scene", "instance": "lightScene", "parameters": {"dataType": "ENUM", "options": []}})
    return c


DEVICES = [
    {"device": "AA:BB:CC:DD:EE:FF:00:01", "sku": "H619A", "deviceName": "Pretend Porch Strip", "type": "devices.types.light", "lan": "127.0.0.2", "capabilities": caps()},
    {"device": "AA:BB:CC:DD:EE:FF:00:02", "sku": "H6076", "deviceName": "Pretend Floor Lamp", "type": "devices.types.light", "lan": "127.0.0.3", "capabilities": caps(ct=(2200, 6500))},
    {"device": "AA:BB:CC:DD:EE:FF:00:03", "sku": "H6008", "deviceName": "Pretend Bulb", "type": "devices.types.light", "lan": None, "capabilities": caps(ct=(2700, 6500))},
    {"device": "AA:BB:CC:DD:EE:FF:00:04", "sku": "H5080", "deviceName": "Pretend Plug", "type": "devices.types.socket", "lan": None,
     "capabilities": [caps()[0]]},
]
SCENES = ["Sunrise", "Aurora", "Christmas", "Halloween", "Independence Day", "Candlelight", "Fire", "Falling Leaves", "Moonlight", "Spring"]
LOCK = threading.Lock()
STATE, LOG, RL = {}, [], {"n": 0}


def reset():
    with LOCK:
        STATE.clear()
        for d in DEVICES:
            STATE[d["device"]] = {"on": 0, "brightness": 50, "rgb": [255, 255, 255], "kelvin": 0, "scene": None}
        LOG.clear()
        RL["n"] = 0


def log(dev, via, what):
    with LOCK:
        LOG.append({"t": time.time(), "device": dev, "via": via, "what": what})


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def reply(self, code, obj, headers=None):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def gate(self):
        if self.path.startswith("/mock/"):
            return True
        if self.headers.get("Govee-API-Key") != KEY:
            self.reply(401, {"code": 401, "message": "Unauthorized"})
            return False
        with LOCK:
            if RL["n"] > 0:
                RL["n"] -= 1
                self.reply(429, {"code": 429, "message": "Too many requests"}, {"API-RateLimit-Reset": str(int(time.time()) + 7)})
                return False
        return True

    def do_GET(self):
        if not self.gate():
            return
        if self.path == "/router/api/v1/user/devices":
            log(None, "cloud", "list")
            return self.reply(200, {"code": 200, "message": "success", "data": [{k: v for k, v in d.items() if k != "lan"} for d in DEVICES]},
                              {"X-RateLimit-Remaining": "9990"})
        if self.path == "/mock/log":
            with LOCK:
                return self.reply(200, {"log": LOG, "state": STATE})
        self.reply(404, {"code": 404, "message": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if not self.gate():
            return
        if self.path == "/mock/reset":
            reset()
            return self.reply(200, {"ok": True})
        if self.path == "/mock/ratelimit":
            RL["n"] = int(body.get("n", 1))
            return self.reply(200, {"ok": True})
        p = body.get("payload") or {}
        dev = next((d for d in DEVICES if d["device"] == p.get("device") and d["sku"] == p.get("sku")), None)
        if not dev:
            return self.reply(200, {"code": 400, "msg": "device not found", "requestId": body.get("requestId")})
        s = STATE[dev["device"]]
        if self.path == "/router/api/v1/device/state":
            log(dev["device"], "cloud", "state")
            rgb = (s["rgb"][0] << 16) + (s["rgb"][1] << 8) + s["rgb"][2]
            return self.reply(200, {"requestId": body.get("requestId"), "code": 200, "msg": "success", "payload": {"sku": dev["sku"], "device": dev["device"], "capabilities": [
                {"type": "devices.capabilities.online", "instance": "online", "state": {"value": True}},
                {"type": "devices.capabilities.on_off", "instance": "powerSwitch", "state": {"value": s["on"]}},
                {"type": "devices.capabilities.range", "instance": "brightness", "state": {"value": s["brightness"]}},
                {"type": "devices.capabilities.color_setting", "instance": "colorRgb", "state": {"value": rgb}},
                {"type": "devices.capabilities.color_setting", "instance": "colorTemperatureK", "state": {"value": s["kelvin"] or ""}}]}})
        if self.path == "/router/api/v1/device/control":
            c = p.get("capability") or {}
            inst, v = c.get("instance"), c.get("value")
            with LOCK:
                if inst == "powerSwitch":
                    s["on"] = int(v)
                elif inst == "brightness":
                    s["brightness"] = int(v)
                elif inst == "colorRgb":
                    s["rgb"], s["kelvin"], s["scene"] = [(v >> 16) & 255, (v >> 8) & 255, v & 255], 0, None
                elif inst == "colorTemperatureK":
                    s["kelvin"], s["scene"] = int(v), None
                elif inst == "lightScene":
                    s["scene"] = next((n for i, n in enumerate(SCENES) if {"paramId": 9000 + i, "id": 100 + i} == v), "?")
                else:
                    return self.reply(200, {"code": 400, "msg": "unsupported", "requestId": body.get("requestId")})
            log(dev["device"], "cloud", {inst: v})
            return self.reply(200, {"requestId": body.get("requestId"), "code": 200, "msg": "success", "capability": c})
        if self.path == "/router/api/v1/device/scenes":
            log(dev["device"], "cloud", "scenes")
            return self.reply(200, {"requestId": body.get("requestId"), "code": 200, "msg": "success", "payload": {"sku": dev["sku"], "device": dev["device"], "capabilities": [
                {"type": "devices.capabilities.dynamic_scene", "instance": "lightScene", "parameters": {"dataType": "ENUM",
                 "options": [{"name": n, "value": {"paramId": 9000 + i, "id": 100 + i}} for i, n in enumerate(SCENES)]}}]}})
        self.reply(404, {"code": 404, "message": "not found"})


def lan_device(dev):
    ip = dev["lan"]
    scan = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    scan.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    scan.bind((ip, SCAN_PORT))
    ctl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    ctl.bind((ip, DEVICE_PORT))

    def answer_scan():
        while True:
            data, addr = scan.recvfrom(2048)
            try:
                m = json.loads(data)["msg"]
            except (ValueError, KeyError):
                continue
            if m.get("cmd") == "scan":
                log(dev["device"], "lan", "scan")
                ctl.sendto(json.dumps({"msg": {"cmd": "scan", "data": {"ip": ip, "device": dev["device"], "sku": dev["sku"],
                           "bleVersionHard": "3.01.01", "bleVersionSoft": "1.03.01", "wifiVersionHard": "1.00.10", "wifiVersionSoft": "1.02.03"}}}).encode(),
                           (addr[0], LISTEN_PORT))

    def answer_ctl():
        while True:
            data, addr = ctl.recvfrom(2048)
            try:
                m = json.loads(data)["msg"]
            except (ValueError, KeyError):
                continue
            cmd, d = m.get("cmd"), m.get("data") or {}
            s = STATE[dev["device"]]
            with LOCK:
                if cmd == "turn":
                    s["on"] = int(d.get("value", 0))
                elif cmd == "brightness":
                    s["brightness"] = int(d.get("value", 50))
                elif cmd == "colorwc":
                    k = int(d.get("colorTemInKelvin") or 0)
                    if k:
                        s["kelvin"] = k
                    else:
                        col = d.get("color") or {}
                        s["rgb"], s["kelvin"] = [col.get("r", 0), col.get("g", 0), col.get("b", 0)], 0
                    s["scene"] = None
            if cmd == "devStatus":
                ctl.sendto(json.dumps({"msg": {"cmd": "devStatus", "data": {"onOff": s["on"], "brightness": s["brightness"],
                           "color": {"r": s["rgb"][0], "g": s["rgb"][1], "b": s["rgb"][2]}, "colorTemInKelvin": s["kelvin"]}}}).encode(), (addr[0], LISTEN_PORT))
            log(dev["device"], "lan", {cmd: d})

    threading.Thread(target=answer_scan, daemon=True).start()
    threading.Thread(target=answer_ctl, daemon=True).start()


def multicast_listener():
    """Best effort: also answer a real multicast scan (239.255.255.250) sent on this computer's loopback."""
    try:
        g = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        g.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        g.bind(("", SCAN_PORT))
        g.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, socket.inet_aton("239.255.255.250") + socket.inet_aton("127.0.0.1"))
    except OSError as e:
        print("(multicast scan not available here: %s)" % e)
        return
    out = {}
    for d in DEVICES:
        if d["lan"]:
            o = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            o.bind((d["lan"], 0))
            out[d["device"]] = o

    def run():
        while True:
            data, addr = g.recvfrom(2048)
            try:
                m = json.loads(data)["msg"]
            except (ValueError, KeyError):
                continue
            if m.get("cmd") != "scan":
                continue
            for d in DEVICES:
                if d["lan"]:
                    log(d["device"], "lan", "multicast-scan")
                    out[d["device"]].sendto(json.dumps({"msg": {"cmd": "scan", "data": {"ip": d["lan"], "device": d["device"], "sku": d["sku"]}}}).encode(), (addr[0], LISTEN_PORT))
    threading.Thread(target=run, daemon=True).start()


def main():
    reset()
    for d in DEVICES:
        if d["lan"]:
            lan_device(d)
    multicast_listener()
    srv = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), H)
    print("Pretend Govee running. Start Valhalla with:")
    print("  VALHALLA_GOVEE_API_BASE=http://127.0.0.1:%d VALHALLA_GOVEE_SCAN_ADDR=127.0.0.2 VALHALLA_GOVEE_SCAN_PORT=%d "
          "VALHALLA_GOVEE_LISTEN_PORT=%d VALHALLA_GOVEE_DEVICE_PORT=%d python3 server.py" % (HTTP_PORT, SCAN_PORT, LISTEN_PORT, DEVICE_PORT))
    print("  and in Setup > Govee lights use the key %s and light addresses 127.0.0.2, 127.0.0.3" % KEY)
    if sys.stdout:
        sys.stdout.flush()
    srv.serve_forever()


if __name__ == "__main__":
    main()
