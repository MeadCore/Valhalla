#!/usr/bin/env python3
"""Checks Valhalla's Govee support against the pretend Govee (tools/govee_mock.py). Linux; no real lights needed.
    python3 tools/test_govee.py
Starts the pretend Govee and a Valhalla server with a throw-away settings folder, then checks: the Setup test,
saving the key (masked, never echoed), the light list (LAN + cloud merged, plugs left out), on/off, brightness,
color, white temperature, Govee scenes, Scene colors (patriotic, Norse), All off, LAN-to-cloud fallback, the 429
slow-down, a wrong key, and that the key never reaches a browser, the log or the screen's settings."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = "pretend-govee-key-0000"
PORT, MOCK = 18796, 18791
ENV = dict(os.environ, VALHALLA_PORT=str(PORT), VALHALLA_GOVEE_API_BASE="http://127.0.0.1:%d" % MOCK, GOVEE_MOCK_HTTP_PORT=str(MOCK),
           VALHALLA_GOVEE_SCAN_ADDR="127.0.0.2", VALHALLA_GOVEE_SCAN_PORT="15001", VALHALLA_GOVEE_LISTEN_PORT="15002", VALHALLA_GOVEE_DEVICE_PORT="15003")
B = "http://127.0.0.1:%d" % PORT
FAILS = []


def req(path, body=None, base=B, method=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(base + path, data=data, method=method or ("POST" if data else "GET"), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=20) as f:
            raw = f.read().decode()
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
    return json.loads(raw) if raw.strip().startswith(("{", "[")) else raw


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + str(extra)[:300]) if not ok else ""))
    if not ok:
        FAILS.append(name)


def mock_log(dev=None, since=0):
    return [e for e in req("/mock/log", base="http://127.0.0.1:%d" % MOCK)["log"] if e["t"] >= since and (dev is None or e["device"] == dev)]


def mock_state(dev):
    return req("/mock/log", base="http://127.0.0.1:%d" % MOCK)["state"][dev]


def inprocess(env, STRIP, BULB):
    """Driver-level checks (Valhalla server stopped, pretend Govee still running)."""
    os.environ.update({k: v for k, v in env.items() if k.startswith("VALHALLA_GOVEE")})
    sys.path.insert(0, HERE)
    import importlib
    import govee
    importlib.reload(govee)
    hub = govee.GoveeHub()
    hub.configure({"govee_enabled": True, "govee_api_key": KEY, "govee_lan": True, "govee_lan_ips": ["127.0.0.3"]})
    L = {l["id"]: l for l in hub.lights()["lights"]}
    check("driver: strip found on LAN", L[STRIP]["via"] == "LAN", L)
    hub.lan.devices[STRIP]["seen"] = 0   # pretend the strip stopped answering on LAN
    r = hub.control(STRIP, rgb=[1, 2, 3])
    check("fallback: silent LAN light goes through the cloud", r["via"] == "cloud" and mock_state(STRIP)["rgb"] == [1, 2, 3], r)
    hub.lan.stop()
    # real multicast scan on loopback (best effort: some containers have no multicast)
    os.environ["VALHALLA_GOVEE_SCAN_ADDR"] = "239.255.255.250"
    importlib.reload(govee)
    lan = govee.GoveeLan()
    lan.start()
    try:
        import socket
        lan.sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton("127.0.0.1"))
    except OSError:
        pass
    found = lan.scan([], wait=1.5)
    print(("PASS " if len(found) == 2 else "INFO ") + "multicast scan 239.255.255.250 found %d pretend LAN lights" % len(found))
    lan.stop()


def main():
    data = tempfile.mkdtemp(prefix="vh-govee-test-")
    env = dict(ENV, VALHALLA_DATA_DIR=data)
    mock = subprocess.Popen([sys.executable, os.path.join(HERE, "tools", "govee_mock.py")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "server.py")], env=env, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try:
                req("/api/health"); req("/mock/log", base="http://127.0.0.1:%d" % MOCK); break
            except Exception:
                time.sleep(0.2)
        STRIP, LAMP, BULB = "AA:BB:CC:DD:EE:FF:00:01", "AA:BB:CC:DD:EE:FF:00:02", "AA:BB:CC:DD:EE:FF:00:03"

        # --- before setup: pretend mode untouched
        cfgjs = req("/config.js")
        check("off by default: screen settings say govee false", '"govee": false' in cfgjs, cfgjs)
        check("off by default: control refused", req("/api/lights/govee/control", {"id": STRIP, "on": True}).get("ok") is False)

        # --- Setup test
        t = req("/api/setup/test-govee", {"govee_api_key": "wrong-key-1234567890", "govee_lan": False})
        check("setup test: wrong key explained", t["ok"] is False and "wrong" in t["message"], t)
        t = req("/api/setup/test-govee", {"govee_api_key": "bad key!", "govee_lan": False})
        check("setup test: malformed key refused", t["ok"] is False, t)
        t = req("/api/setup/test-govee", {"govee_api_key": KEY, "govee_lan": True, "govee_lan_ips": ["127.0.0.3"]})
        names = {l["name"]: l for l in t.get("lights", [])}
        check("setup test: key works, 3 lights (plug left out)", t["ok"] and len(names) == 3 and "Pretend Plug" not in names, t)
        check("setup test: LAN found strip + lamp, not bulb", names.get("Pretend Porch Strip", {}).get("lan") and names.get("Pretend Floor Lamp", {}).get("lan") and not names.get("Pretend Bulb", {}).get("lan"), names)
        t = req("/api/setup/test-govee", {"govee_lan": True, "govee_lan_ips": ["8.8.8.8"]})
        check("setup test: public address refused for LAN list", t["ok"] is False, t)

        # --- save settings
        r = req("/api/setup/config", {"govee_enabled": True, "govee_api_key": KEY, "govee_lan": True, "govee_lan_ips": "127.0.0.3"})
        check("save: ok", r.get("ok"), r)
        r = req("/api/setup/config", {"govee_lan_ips": "203.0.113.5"})
        check("save: public LAN address refused", r.get("ok") is False and "govee_lan_ips" in r.get("errors", {}), r)
        st = req("/api/setup/status")["keys"]
        check("status: key masked", st["govee_api_key"]["value"] == "••••0000" and KEY not in json.dumps(st), st["govee_api_key"])
        cfgjs = req("/config.js")
        check("screen settings: govee on, key not included", '"govee": true' in cfgjs and KEY not in cfgjs, cfgjs)

        # --- light list
        L = req("/api/lights/govee")
        by = {l["id"]: l for l in L["lights"]}
        check("list: 3 lights, mode LAN + cloud", len(by) == 3 and L["mode"] == "LAN + cloud", L)
        check("list: strip + lamp via LAN, bulb via cloud", by[STRIP]["via"] == "LAN" and by[LAMP]["via"] == "LAN" and by[BULB]["via"] == "cloud", by)
        check("list: lamp white range from Govee (2200-6500)", by[LAMP]["caps"]["ct_min"] == 2200 and by[LAMP]["caps"]["ct_max"] == 6500)
        check("list: never contains key", KEY not in json.dumps(L))

        # --- LAN control
        t0 = time.time()
        r = req("/api/lights/govee/control", {"id": STRIP, "on": True}); time.sleep(0.3)
        check("LAN on: answered via LAN", r.get("via") == "LAN" and mock_state(STRIP)["on"] == 1, r)
        req("/api/lights/govee/control", {"id": STRIP, "brightness": 35}); time.sleep(0.3)
        check("LAN brightness 35", mock_state(STRIP)["brightness"] == 35)
        req("/api/lights/govee/control", {"id": STRIP, "rgb": "#b22234"}); time.sleep(0.3)
        check("LAN color red", mock_state(STRIP)["rgb"] == [178, 34, 52], mock_state(STRIP))
        req("/api/lights/govee/control", {"id": LAMP, "kelvin": 9000}); time.sleep(0.3)
        check("LAN white temp clamped to lamp max 6500", mock_state(LAMP)["kelvin"] == 6500, mock_state(LAMP))
        check("LAN changes made no cloud control calls", not [e for e in mock_log(since=t0) if e["via"] == "cloud" and isinstance(e["what"], dict)], mock_log(since=t0))

        # --- cloud control (bulb has no LAN)
        r = req("/api/lights/govee/control", {"id": BULB, "on": True})
        check("cloud on: bulb via cloud", r.get("via") == "cloud" and mock_state(BULB)["on"] == 1, r)
        req("/api/lights/govee/control", {"id": BULB, "kelvin": 3000})
        check("cloud white temp 3000", mock_state(BULB)["kelvin"] == 3000)
        req("/api/lights/govee/control", {"id": BULB, "rgb": [20, 48, 255]})
        check("cloud color blue", mock_state(BULB)["rgb"] == [20, 48, 255])

        # --- state read back
        time.sleep(9)
        L = req("/api/lights/govee"); by = {l["id"]: l for l in L["lights"]}
        check("state read back over LAN (strip on, 35%, red)", by[STRIP]["on"] and by[STRIP]["brightness"] == 35 and by[STRIP]["rgb"] == [178, 34, 52], by[STRIP])
        check("state: lamp in white mode", by[LAMP]["kelvin"] == 6500 and by[LAMP]["rgb"] is None, by[LAMP])

        # --- Govee scenes (cloud)
        sc = req("/api/lights/govee/scenes?id=" + urllib.request.quote(STRIP))
        check("scenes listed", sc["ok"] and "Aurora" in sc["scenes"], sc)
        n_before = len([e for e in mock_log(STRIP) if e["what"] == "scenes"])
        req("/api/lights/govee/scenes?id=" + urllib.request.quote(STRIP))
        check("scenes cached (no second cloud call)", len([e for e in mock_log(STRIP) if e["what"] == "scenes"]) == n_before)
        r = req("/api/lights/govee/control", {"id": STRIP, "scene": "Aurora"})
        check("scene Aurora set via cloud", r.get("via") == "cloud" and mock_state(STRIP)["scene"] == "Aurora", (r, mock_state(STRIP)))

        # --- Scene colors: patriotic (colors) and Norse
        rwb = ["#ff0a1e", "#ffffff", "#1430ff"]
        r = req("/api/lights/govee/paint", {"colors": rwb, "scene": "rwb"}); time.sleep(0.3)
        got = sorted([tuple(mock_state(d)["rgb"]) for d in (STRIP, LAMP, BULB)])
        check("Red White & Blue painted across 3 lights", r["ok"] and got == sorted([(255, 10, 30), (255, 255, 255), (20, 48, 255)]), (r, got))
        r = req("/api/lights/govee/paint", {"colors": ["#3a5bff", "#cfe0ff", "#ff3a2a"], "scene": "winternights"}); time.sleep(0.3)
        check("Winter Nights painted", r["ok"] and len(r["done"]) == 3 and mock_state(STRIP)["rgb"] == [58, 91, 255], r)
        req("/api/setup/config", {"govee_builtin_scenes": True})
        r = req("/api/lights/govee/paint", {"colors": rwb, "scene": "rwb"})
        check("built-in scenes on: Independence Day chosen for rwb", all(d.get("scene") == "Independence Day" for d in r["done"]) and mock_state(BULB)["scene"] == "Independence Day", r)
        r = req("/api/lights/govee/paint", {"colors": ["#9fdcff", "#e8ecff", "#4a50ff"], "scene": "disting"})
        check("built-in scenes on: Disting -> Moonlight", all(d.get("scene") == "Moonlight" for d in r["done"]), r)
        req("/api/setup/config", {"govee_builtin_scenes": False})
        r = req("/api/lights/govee/paint", {"colors": ["#zzz"], "scene": "rwb"})
        check("paint: bad color refused", r.get("ok") is False, r)

        # --- All off
        r = req("/api/lights/govee/all-off", {}); time.sleep(0.3)
        check("All off: every light off", r["ok"] and all(mock_state(d)["on"] == 0 for d in (STRIP, LAMP, BULB)), r)

        # --- 429 slow-down
        req("/mock/ratelimit", {"n": 1}, base="http://127.0.0.1:%d" % MOCK)
        r = req("/api/lights/govee/control", {"id": BULB, "on": True})
        check("429: friendly pause message", r.get("ok") is False and "limit" in r.get("message", ""), r)
        r = req("/api/lights/govee/control", {"id": BULB, "on": True})
        check("429: no cloud call while paused", r.get("ok") is False and "slow down" in r.get("message", ""), r)
        r = req("/api/lights/govee/control", {"id": STRIP, "on": True}); time.sleep(0.2)
        check("429: LAN lights keep working", r.get("ok") and r.get("via") == "LAN", r)
        time.sleep(7.5)
        r = req("/api/lights/govee/control", {"id": BULB, "on": True})
        check("429: cloud resumes after the wait", r.get("ok") and r.get("via") == "cloud", r)

        # --- LAN only (no key)
        req("/api/setup/config", {"govee_api_key": ""})
        L = req("/api/lights/govee")
        check("LAN only: 2 LAN lights, generic names", len(L["lights"]) == 2 and L["mode"] == "LAN" and all(l["name"].startswith("Govee ") for l in L["lights"]), L)
        r = req("/api/lights/govee/control", {"id": L["lights"][0]["id"], "scene": "Aurora"})
        check("LAN only: scenes explain they need the key", r.get("ok") is False and "API key" in r.get("message", ""), r)
        req("/api/setup/config", {"govee_api_key": KEY, "govee_lan": False})
        L = req("/api/lights/govee"); by = {l["id"]: l for l in L["lights"]}
        check("cloud only (LAN off): all 3 via cloud", len(by) == 3 and all(l["via"] == "cloud" for l in by.values()), L)
        req("/api/setup/config", {"govee_lan": True})

        # --- secret never in logs / output
        req("/api/setup/config", {"govee_enabled": False})
        check("turn off: screen settings govee false", '"govee": false' in req("/config.js"))
        srv.terminate(); out = srv.communicate(timeout=5)[0].decode()
        check("server output never shows the key", KEY not in out, out)
        conf = json.load(open(os.path.join(data, "config.json")))
        check("key saved only in config.json in the settings folder", conf.get("govee_api_key") == KEY)
        inprocess(env, STRIP, BULB)
    finally:
        for p in (srv, mock):
            if p.poll() is None:
                p.terminate()
        shutil.rmtree(data, ignore_errors=True)
    print("\n%d failed" % len(FAILS) if FAILS else "\nALL GOVEE CHECKS PASSED")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
