#!/usr/bin/env python3
"""Checks Valhalla's phone PIN (remote_pin.py + server.py). No phone or Tailscale needed.
    python3 tools/test_pin.py
Part 1 (no server): PIN hashing and checking, the 5-tries lockout and its 5-minute timer, remembered-phone tokens.
Part 2 (a throw-away Valhalla server): a "phone" (requests from 127.0.0.3, not this computer) is sent to the PIN page,
wrong PINs count down and then lock, the right PIN remembers the phone with a cookie, a forged cookie doesn't work,
this computer never needs the PIN, a new PIN signs phones out, and the PIN itself is never saved or sent anywhere."""
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import remote_pin as rp  # noqa: E402

FAILS = []
PORT = 18797
PHONE = ("127.0.0.3", 0)  # Linux answers on all of 127.x, so this looks like another device to Valhalla


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + str(extra)[:300]) if not ok else ""))
    if not ok:
        FAILS.append(name)


def unit():
    h = rp.hash_pin("2468")
    check("hash format is pbkdf2_sha256$iterations$salt$hash", h.startswith("pbkdf2_sha256$%d$" % rp.ITERATIONS) and h.count("$") == 3, h)
    check("PIN itself is not in the hash", "2468" not in h)
    check("right PIN verifies", rp.verify_pin("2468", h))
    check("wrong PIN fails", not rp.verify_pin("2469", h))
    check("same PIN gets a different salt each time", rp.hash_pin("2468") != h)
    check("garbage stored value fails quietly", not rp.verify_pin("2468", "nonsense") and not rp.verify_pin("2468", None))
    check("valid PINs: 4-8 digits only", rp.valid_pin("1234") and rp.valid_pin("12345678") and not rp.valid_pin("123")
          and not rp.valid_pin("123456789") and not rp.valid_pin("12a4") and not rp.valid_pin(" 1234") and not rp.valid_pin(1234))
    try:
        rp.hash_pin("12")
        check("hash_pin refuses a bad PIN", False)
    except ValueError:
        check("hash_pin refuses a bad PIN", True)

    now = [1000.0]
    lk = rp.Lockout(clock=lambda: now[0])
    left = [lk.failed() for _ in range(4)]
    check("wrong tries count down 4,3,2,1", left == [4, 3, 2, 1], left)
    check("not locked after 4 wrong", lk.wait() == 0)
    check("5th wrong try locks", lk.failed() == 0 and lk.wait() == 300, lk.wait())
    now[0] += 299
    check("still locked at 4:59", lk.wait() == 1, lk.wait())
    now[0] += 2
    check("unlocked after 5 minutes, fresh 5 tries", lk.wait() == 0 and lk.failed() == 4)
    lk.succeeded()
    check("right PIN resets the count", lk.failed() == 4)

    val, rec = rp.new_device("iPhone <script>")
    devs = [rec]
    check("token record keeps only a hash", val.split(".", 1)[1] not in json.dumps(rec) and len(rec["hash"]) == 64)
    check("device name is cleaned", "<" not in rec["name"], rec["name"])
    check("right token is recognised", rp.check_device(val, devs) == rec["id"])
    check("forged token is refused", rp.check_device(rec["id"] + ".forged", devs) is None)
    check("token for a forgotten phone is refused", rp.check_device(val, []) is None)
    check("junk cookie is refused", rp.check_device("junk", devs) is None and rp.check_device(None, devs) is None)
    check("cookie header parsing", rp.cookie_from_header("a=1; vh_device=" + val + "; b=2") == val)
    sc = rp.set_cookie_header(val)
    check("cookie is HttpOnly + SameSite=Strict + long-lived", "HttpOnly" in sc and "SameSite=Strict" in sc and "Max-Age=" in sc)


def req(method, path, body=None, cookie=None, source=PHONE):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=20, source_address=source)
    h = {"Host": "127.0.0.1:%d" % PORT}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.update({"Content-Type": "application/json", "Origin": "http://127.0.0.1:%d" % PORT})
    if cookie:
        h["Cookie"] = cookie
    c.request(method, path, body=data, headers=h)
    r = c.getresponse()
    raw = r.read().decode("utf-8", "replace")
    c.close()
    try:
        j = json.loads(raw)
    except ValueError:
        j = None
    return r.status, j, raw, r.getheader("Set-Cookie")


def live():
    tmp = tempfile.mkdtemp(prefix="vh-pin-")
    env = dict(os.environ, VALHALLA_DATA_DIR=tmp, VALHALLA_PORT=str(PORT))
    p = subprocess.Popen([sys.executable, os.path.join(HERE, "server.py")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try:
                if req("GET", "/api/health", source=None)[0] == 200:
                    break
            except OSError:
                time.sleep(0.2)
        st, _, raw, _ = req("GET", "/")
        check("phone with no PIN set yet: locked-out page", st == 403 and "Phone access is locked" in raw, st)
        st, j, _, _ = req("POST", "/api/pin", {"pin": "1234"})
        check("phone can't log in before a PIN exists", st == 403 and j and not j["ok"], st)
        st, j, _, _ = req("POST", "/api/setup/config", {"remote_listen": "100.101.102.103"}, source=None)
        check("Tailscale address refused until a PIN is set", st == 400 and "remote_listen" in (j or {}).get("errors", {}), j)
        st, j, _, _ = req("POST", "/api/setup/pin", {"pin": "12"}, source=None)
        check("too-short PIN refused", st == 400, j)
        st, j, _, _ = req("POST", "/api/setup/pin", {"pin": "4321"}, source=PHONE)
        check("a phone can't set the PIN", st in (401, 403), st)
        st, j, _, _ = req("POST", "/api/setup/pin", {"pin": "4321"}, source=None)
        check("this computer sets the PIN", st == 200 and j["ok"], j)
        cfgtxt = open(os.path.join(tmp, "config.json"), encoding="utf-8").read()
        check("config.json has the hash, not the PIN", "remote_pin_hash" in cfgtxt and "4321" not in cfgtxt)
        st, j, _, _ = req("POST", "/api/setup/config", {"remote_listen": "100.101.102.103"}, source=None)
        check("Tailscale address accepted once a PIN exists", st == 200 and j["ok"], j)
        st, j, raw, _ = req("GET", "/api/setup/status", source=None)
        check("status shows PIN set, never the hash", j["keys"]["remote_pin"]["set"] and "pbkdf2" not in raw, raw[:200])
        st, _, raw, _ = req("GET", "/")
        check("phone without cookie gets the PIN page", st == 200 and "Type the phone PIN" in raw, st)
        for path in ("/config.js", "/api/board", "/api/lights/govee", "/app.js", "/api/health"):
            st, j, _, _ = req("GET", path)
            check("phone without cookie can't read " + path, st == 401, st)
        st, _, _, _ = req("POST", "/api/board", {"op": "clear"})
        check("phone without cookie can't change the board", st == 401, st)
        st, _, _, _ = req("GET", "/", source=None)
        check("this computer never needs the PIN", st == 200)
        st, _, _, _ = req("GET", "/config.js", source=None)
        check("this computer reads config.js", st == 200)
        lefts = []
        for _ in range(4):
            st, j, _, _ = req("POST", "/api/pin", {"pin": "0000"})
            lefts.append((st, j.get("left")))
        check("wrong PINs: 401 with tries left 4..1", lefts == [(401, 4), (401, 3), (401, 2), (401, 1)], lefts)
        st, j, _, _ = req("POST", "/api/pin", {"pin": "0000"})
        check("5th wrong PIN locks for 5 minutes", st == 429 and j.get("wait") == 300, j)
        st, j, _, ck = req("POST", "/api/pin", {"pin": "4321"})
        check("even the right PIN waits during the lock", st == 429 and not ck, j)
        # restart the server to clear the in-memory lock (the hash and phones stay in config.json)
        p.terminate()
        p.wait(5)
        p2 = subprocess.Popen([sys.executable, os.path.join(HERE, "server.py")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        try:
            for _ in range(50):
                try:
                    if req("GET", "/api/health", source=None)[0] == 200:
                        break
                except OSError:
                    time.sleep(0.2)
            st, j, _, ck = req("POST", "/api/pin", {"pin": "4321", "name": "Test phone"})
            check("right PIN: ok + remember-me cookie", st == 200 and j["ok"] and ck and "vh_device=" in ck and "HttpOnly" in ck, (st, j, ck))
            cookie = ck.split(";", 1)[0]
            token = cookie.split("=", 1)[1].split(".", 1)[1]
            cfgtxt = open(os.path.join(tmp, "config.json"), encoding="utf-8").read()
            check("config.json keeps only a hash of the phone's token", token not in cfgtxt and '"remote_devices"' in cfgtxt)
            st, _, raw, _ = req("GET", "/", cookie=cookie)
            check("remembered phone opens Valhalla", st == 200 and "Type the phone PIN" not in raw)
            st, j, raw, _ = req("GET", "/config.js", cookie=cookie)
            check("remembered phone gets config.js, without secrets", st == 200 and "haToken" not in raw and '"local": false' in raw, raw[:200])
            st, j, _, _ = req("POST", "/api/board", {"op": "clear"}, cookie=cookie)
            check("remembered phone can use the board", st == 200, st)
            st, j, _, _ = req("GET", "/api/setup/status", cookie=cookie)
            check("remembered phone still can't open Setup", st == 403, st)
            st2, _, _, _ = req("GET", "/api/board", cookie=cookie[:-3] + "xyz")
            check("tampered cookie doesn't work", st2 == 401 and "Type the phone PIN" in req("GET", "/", cookie=cookie[:-3] + "xyz")[2], st2)
            st, j, _, _ = req("POST", "/api/setup/forget-phones", {}, source=None)
            st2, _, _, _ = req("GET", "/api/board", cookie=cookie)
            check("'Sign out all phones' works", st == 200 and st2 == 401, (st, st2))
            st, j, _, ck = req("POST", "/api/pin", {"pin": "4321"})
            cookie = ck.split(";", 1)[0]
            req("POST", "/api/setup/pin", {"pin": "98765"}, source=None)
            st, _, _, _ = req("GET", "/api/board", cookie=cookie)
            check("a new PIN signs every phone out", st == 401, st)
            st, j, _, _ = req("POST", "/api/pin", {"pin": "4321"})
            st2, j2, _, _ = req("POST", "/api/pin", {"pin": "98765"})
            check("old PIN stops working, new PIN works", st == 401 and st2 == 200, (st, st2))
            c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=10, source_address=PHONE)
            c.request("POST", "/api/pin", body=json.dumps({"pin": "98765"}), headers={"Host": "127.0.0.1:%d" % PORT, "Content-Type": "application/json", "Origin": "http://evil.example"})
            check("PIN login from another website is blocked", c.getresponse().status == 403)
            c.close()
        finally:
            p2.terminate()
            out = p2.communicate(timeout=5)[0].decode("utf-8", "replace")
            check("the PIN never shows up in the server's output", "4321" not in out and "98765" not in out, out[-300:])
    finally:
        if p.poll() is None:
            p.terminate()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unit()
    live()
    print("\n%d failed" % len(FAILS) if FAILS else "\nAll PIN checks passed.")
    sys.exit(1 if FAILS else 0)
