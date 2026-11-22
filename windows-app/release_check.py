"""Fails (exit 1) if a built Valhalla folder (or the source folder) contains user data or personal strings.
Run on dist\\Valhalla before packaging (build_exe.bat does it) and on the source before zipping.
  * private files: config.json, config.backup.json, data\\, logs, portable.txt
  * text files: e-mail addresses, Home Assistant tokens (eyJ...), and your private words
  * every file (also binaries): this PC's user name and your private words
Private words (names, home address, LAN addresses...) are read from windows-app\\private-words.txt, one per line.
That file is never shared (it is in .gitignore and left out of the zip), so no personal data lives in this script."""
import fnmatch
import os
import re
import sys

root = os.path.abspath(sys.argv[1])
HERE = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {"venv", "build", "dist", "Output", "innosetup", "__pycache__", ".git"}
DENY = ("config.json", "config.backup.json", "config.json.tmp", "board.json", "*.log", "*.log.*", "*.bak", "*.tmp", "portable.txt", "private-words.txt")
EMAIL_TOKEN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|eyJ[A-Za-z0-9_\-]{20,}")
ALLOWED = ("you@example.com",)
words = set()
try:
    with open(os.path.join(HERE, "private-words.txt"), encoding="utf-8-sig") as f:
        words = {w.strip().lower() for w in f if w.strip() and not w.startswith("#")}
except OSError:
    pass
words.add((os.environ.get("USERNAME") or os.environ.get("USER") or "").lower())
words = [w for w in words if len(w) >= 4 and w not in ("root", "user", "admin", "box")]
TEXT = (".py", ".js", ".html", ".css", ".json", ".txt", ".md", ".yaml", ".bat", ".sh", ".iss", ".mjs")
bad = []
for dp, dns, fns in os.walk(root):
    dns[:] = [d for d in dns if d not in SKIP_DIRS]
    rel = os.path.relpath(dp, root)
    if rel.split(os.sep)[0] == "data":
        bad.append("private folder: data")
        dns[:] = []
        continue
    for fn in fns:
        p = os.path.join(dp, fn)
        r = os.path.relpath(p, root)
        if fn != "config.example.json" and any(fnmatch.fnmatch(fn.lower(), pat) for pat in DENY):
            bad.append("private file: " + r)
            continue
        if rel != "." and rel.split(os.sep)[0] not in ("static", "ha", "windows-app", "tools") and not fn.lower().endswith(TEXT):
            # third-party runtime files (Python, Pillow...): only the user-name check
            pass
        low = open(p, "rb").read().lower()
        for w in words:
            if w.encode() in low:
                bad.append("%s contains a private word (%s...)" % (r, w[:2]))
        if fn.lower().endswith(TEXT) and (rel == "." or rel.split(os.sep)[0] in ("static", "ha", "windows-app", "tools")):
            for m in EMAIL_TOKEN.finditer(low.decode("utf-8", "replace")):
                if m.group(0) not in ALLOWED:
                    bad.append("%s: %s" % (r, m.group(0)[:12] + "..."))
if bad:
    print("RELEASE CHECK FAILED:\n  " + "\n  ".join(sorted(set(bad))[:50]))
    sys.exit(1)
print("release check OK: %s (%d private words checked)" % (root, len(words)))
