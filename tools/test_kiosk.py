#!/usr/bin/env python3
"""Checks the wall-screen (kiosk) browser choice in windows-app/valhalla_launcher.py: Brave first, then Chrome,
otherwise the normal browser, and never Microsoft Edge.   python3 tools/test_kiosk.py"""
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "windows-app"))
import valhalla_launcher as vl  # noqa: E402

FAILS = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + str(extra)) if not ok else ""))
    if not ok:
        FAILS.append(name)


def make(root, rel):
    p = os.path.join(root, *rel.split("\\"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").close()
    return p


with tempfile.TemporaryDirectory() as t:
    pf, pf86, lad = (os.path.join(t, x) for x in ("pf", "pf86", "lad"))
    for k in ("VALHALLA_KIOSK_BROWSER",):
        os.environ.pop(k, None)
    os.environ.update({"PROGRAMFILES": pf, "PROGRAMFILES(X86)": pf86, "LOCALAPPDATA": lad})
    make(pf86, r"Microsoft\Edge\Application\msedge.exe")
    check("only Edge installed -> no kiosk browser (normal browser instead)", vl.kiosk_browser() is None, vl.kiosk_browser())
    chrome = make(pf, r"Google\Chrome\Application\chrome.exe")
    check("Chrome used when there is no Brave", vl.kiosk_browser() == chrome, vl.kiosk_browser())
    brave = make(lad, r"BraveSoftware\Brave-Browser\Application\brave.exe")
    check("Brave (per-user install) wins over Chrome", vl.kiosk_browser() == brave, vl.kiosk_browser())
    os.environ["VALHALLA_KIOSK_BROWSER"] = os.path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe")
    check("Edge refused even when forced", vl.kiosk_browser() is None)
    os.environ.pop("VALHALLA_KIOSK_BROWSER")
    cmd = vl.kiosk_command(brave, "http://127.0.0.1:8795/", t)
    check("kiosk command: --kiosk, own profile, no Edge flags", "--kiosk" in cmd and any(a.startswith("--user-data-dir=") for a in cmd)
          and not any("edge" in a.lower() for a in cmd), cmd)
    src = open(os.path.join(HERE, "windows-app", "valhalla_launcher.py"), encoding="utf-8").read()
    bat = open(os.path.join(HERE, "start.bat"), encoding="utf-8").read()
    check("launcher never starts msedge", '["msedge"' not in src and "'msedge'" not in src)
    check("start.bat never starts msedge", "msedge" not in bat.lower())

print("\n%d failed" % len(FAILS) if FAILS else "\nAll kiosk checks passed.")
sys.exit(1 if FAILS else 0)
