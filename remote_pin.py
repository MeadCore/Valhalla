"""Phone PIN for Valhalla's remote (Tailscale) access. Python standard library only.

* The PIN (4-8 digits) is never stored. config.json keeps only a salted PBKDF2-SHA256 hash:
  "pbkdf2_sha256$<iterations>$<salt>$<hash>".
* 5 wrong PINs in a row lock PIN entry for 5 minutes (for every phone at once, so guessing can't be spread out).
* A phone that typed the right PIN gets a random "remember this phone" token in a cookie. config.json keeps only a
  SHA-256 of each token, so reading the file doesn't let anyone in. Setting a new PIN forgets every phone.
* This computer itself (127.0.0.1) never needs the PIN.
"""
import base64
import hashlib
import hmac
import re
import secrets
import threading
import time

ITERATIONS = 200_000
MAX_TRIES = 5
LOCK_SECONDS = 5 * 60
COOKIE = "vh_device"
COOKIE_MAX_AGE = 180 * 24 * 3600  # phones stay remembered for about 6 months
MAX_DEVICES = 20
_PIN = re.compile(r"^[0-9]{4,8}$")


def valid_pin(pin):
    return isinstance(pin, str) and bool(_PIN.match(pin))


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_pin(pin, salt=None, iterations=ITERATIONS):
    if not valid_pin(pin):
        raise ValueError("A PIN is 4 to 8 digits.")
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, iterations)
    return "pbkdf2_sha256$%d$%s$%s" % (iterations, _b64(salt), _b64(dk))


def verify_pin(pin, stored):
    """True if pin matches the stored hash. Constant-time compare; never raises on a bad stored value."""
    try:
        algo, it, salt, want = str(stored).split("$")
        if algo != "pbkdf2_sha256" or not valid_pin(pin):
            return False
        it = int(it)
        if not 1000 <= it <= 5_000_000:
            return False
        got = hashlib.pbkdf2_hmac("sha256", pin.encode(), _unb64(salt), it)
        return hmac.compare_digest(got, _unb64(want))
    except (ValueError, TypeError):
        return False


class Lockout:
    """5 wrong tries -> locked for 5 minutes. A right PIN resets the count. clock is injectable for tests."""

    def __init__(self, max_tries=MAX_TRIES, lock_seconds=LOCK_SECONDS, clock=time.monotonic):
        self.max_tries, self.lock_seconds, self.clock = max_tries, lock_seconds, clock
        self.fails, self.until = 0, 0.0
        self.lock = threading.Lock()

    def wait(self):
        """Seconds left in a lockout (0 = not locked)."""
        with self.lock:
            left = self.until - self.clock()
            if left <= 0 and self.until:
                self.until, self.fails = 0.0, 0
            return max(0, int(left + 0.999))

    def failed(self):
        with self.lock:
            self.fails += 1
            if self.fails >= self.max_tries:
                self.until, self.fails = self.clock() + self.lock_seconds, 0
                return 0
            return self.max_tries - self.fails

    def succeeded(self):
        with self.lock:
            self.fails, self.until = 0, 0.0


def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_device(name=""):
    """Returns (cookie_value, record). Only the record (with a hash of the token) is saved."""
    did, token = secrets.token_hex(6), secrets.token_urlsafe(32)
    clean = re.sub(r"[^A-Za-z0-9 ._()\-]", "", str(name or ""))[:40].strip() or "Phone"
    return did + "." + token, {"id": did, "hash": _token_hash(token), "name": clean, "added": time.strftime("%Y-%m-%d")}


def check_device(cookie_value, devices):
    """The matching device id, or None."""
    if not isinstance(cookie_value, str) or "." not in cookie_value or len(cookie_value) > 200:
        return None
    did, token = cookie_value.split(".", 1)
    h = _token_hash(token)
    for d in devices or []:
        if isinstance(d, dict) and d.get("id") == did and hmac.compare_digest(str(d.get("hash", "")), h):
            return did
    return None


def cookie_from_header(header):
    for part in (header or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == COOKIE:
            return v
    return None


def set_cookie_header(value):
    return "%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Strict" % (COOKIE, value, COOKIE_MAX_AGE)


PIN_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Valhalla - PIN</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090e;color:#e8e3d6;font:16px system-ui,sans-serif}
.box{width:min(340px,90vw);padding:28px;border-radius:16px;background:#121621;border:1px solid #2a3142;text-align:center}
h1{margin:0 0 6px;font-size:22px;color:#d4a64a}p{margin:6px 0 16px;color:#a9a597;font-size:14px;line-height:1.45}
input{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:8px;text-align:center;padding:12px;border-radius:12px;border:1px solid #3a4256;background:#0b0e15;color:#fff}
button{margin-top:14px;width:100%;padding:12px;font-size:17px;font-weight:600;border:0;border-radius:12px;background:#d4a64a;color:#07090e}
button:disabled{opacity:.5}#msg{min-height:22px;margin-top:12px;font-size:14px;color:#ff8a80}
</style></head><body><form class="box" id="f"><h1>&#5833; Valhalla</h1>
<p>Type the phone PIN that was set on the Valhalla computer. This phone is remembered afterwards.</p>
<input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" aria-label="PIN" autofocus>
<button id="go" type="submit">Unlock</button><div id="msg" role="status"></div></form>
<script>
document.getElementById("f").addEventListener("submit",async function(e){e.preventDefault();var b=document.getElementById("go"),m=document.getElementById("msg");b.disabled=true;m.textContent="";
try{var r=await fetch("api/pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:document.getElementById("pin").value,name:(navigator.platform||"Phone")})});
var j=await r.json();if(j.ok){location.replace("./");return}m.textContent=j.message||"That didn't work.";}catch(err){m.textContent="No answer from Valhalla. Check Tailscale is on.";}
document.getElementById("pin").value="";b.disabled=false;});
</script></body></html>"""

NO_PIN_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Valhalla</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090e;color:#e8e3d6;font:16px system-ui,sans-serif}
.box{width:min(360px,90vw);padding:28px;border-radius:16px;background:#121621;border:1px solid #2a3142;text-align:center}h1{color:#d4a64a;font-size:22px;margin:0 0 8px}p{color:#a9a597;line-height:1.5}</style>
</head><body><div class="box"><h1>&#5833; Valhalla</h1><p>Phone access is locked until a phone PIN is set.</p>
<p>On the Valhalla computer: &#9881; Setup &rarr; Phones &amp; board &rarr; Phone PIN.</p></div></body></html>"""
