"""Valhalla.exe entry point (windowed, no console), built the same way as Asgard.exe.
- If Valhalla already answers on its port, just open the browser and exit (single instance).
- Otherwise start server.py's server in a thread, open Valhalla in the default browser, and show a tray icon with
  "Open Valhalla" and "Quit" (clean shutdown).
- Settings (config.json), the board (data/) and valhalla.log go to %APPDATA%\\Valhalla, so the program folder can stay
  read-only. Portable mode: if a config.json or portable.txt sits next to Valhalla.exe, they stay there instead.
- "--background" (used by "Start Valhalla with Windows"): server + tray icon, no browser.
- "--kiosk": open Valhalla full screen (the wall touchscreen) in Brave if it is installed, else Google Chrome, each with
  its own small kiosk profile in the settings folder; otherwise the default browser, normally. Never Microsoft Edge.
Test-only overrides: VALHALLA_PORT, VALHALLA_NO_BROWSER=1, VALHALLA_TEST_BROWSER (JSON argv list), VALHALLA_DATA_DIR.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

BASE = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))


def data_dir():
    env = os.environ.get("VALHALLA_DATA_DIR", "").strip()
    if env:
        return os.path.abspath(env)
    if os.path.exists(os.path.join(BASE, "config.json")) or os.path.exists(os.path.join(BASE, "portable.txt")):
        return BASE
    if sys.platform == "win32" and os.environ.get("APPDATA"):
        return os.path.join(os.environ["APPDATA"], "Valhalla")
    return BASE


def kiosk_browser():
    """Path to Brave, else Chrome, else None. Microsoft Edge is never used for kiosk mode."""
    env = os.environ.get("VALHALLA_KIOSK_BROWSER", "").strip()  # test/override hook (an exe path)
    if env:
        return env if os.path.isfile(env) and "msedge" not in env.lower() else None
    roots = [os.environ.get(k, "") for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
    for rel in (("BraveSoftware", "Brave-Browser", "Application", "brave.exe"), ("Google", "Chrome", "Application", "chrome.exe")):
        for r in roots:
            if r and os.path.isfile(os.path.join(r, *rel)):
                return os.path.join(r, *rel)
    return None


def kiosk_command(exe, url, home):
    """Chromium kiosk with a separate profile, so it opens full screen even when the normal browser is already open."""
    return [exe, "--kiosk", url, "--no-first-run", "--no-default-browser-check", "--disable-session-crashed-bubble",
            "--user-data-dir=" + os.path.join(home, "kiosk-browser")]


def _alive(port):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/health" % port, timeout=2) as r:
            return b'"ok": true' in r.read(300)
    except Exception:
        return False


def main():
    home = data_dir()
    os.makedirs(home, exist_ok=True)
    os.environ["VALHALLA_DATA_DIR"] = home
    if getattr(sys, "frozen", False) or sys.stdout is None:
        try:  # windowed exe has no console: keep a small log (never contains keys or tokens)
            log = open(os.path.join(home, "valhalla.log"), "a", encoding="utf-8", buffering=1)
            sys.stdout = sys.stderr = log
        except OSError:
            pass
    port = int(os.environ.get("VALHALLA_PORT") or 0)
    if not port:
        try:
            with open(os.path.join(home, "config.json"), encoding="utf-8-sig") as f:
                port = int(json.load(f).get("listen_port") or 8795)
        except (OSError, ValueError):
            port = 8795
        os.environ["VALHALLA_PORT"] = str(port)
    url = "http://127.0.0.1:%d/" % port
    if os.environ.get("VALHALLA_TEST_BROWSER"):
        webbrowser.register("valhalla-test", None, webbrowser.BackgroundBrowser(json.loads(os.environ["VALHALLA_TEST_BROWSER"])), preferred=True)
    args = sys.argv[1:]
    open_browser = not os.environ.get("VALHALLA_NO_BROWSER") and "--background" not in args

    def show():
        if "--kiosk" in args:
            exe = kiosk_browser()
            if exe:
                try:
                    subprocess.Popen(kiosk_command(exe, url, home), shell=False)
                    return
                except OSError:
                    pass
            print("Kiosk: Brave or Chrome not found; opening the default browser instead (press F11 for full screen).")
        webbrowser.open(url)

    if _alive(port):  # already running: don't start a second server
        if open_browser:
            show()
        return

    print("%s Valhalla.exe starting (settings in %s)" % (time.strftime("%Y-%m-%d %H:%M:%S"), home))
    import server
    icon = None

    def run_server():
        try:
            server.main()
        except SystemExit:
            pass
        except Exception as exc:
            print("Valhalla server crashed: %r" % (exc,))
        if icon is not None:
            icon.stop()
    t = threading.Thread(target=run_server, name="valhalla-server", daemon=True)
    t.start()

    def open_when_ready():
        for _ in range(100):
            if _alive(port):
                show()
                return
            if not t.is_alive():
                return
            time.sleep(0.2)
    if open_browser:
        threading.Thread(target=open_when_ready, daemon=True).start()

    def quit_app(ic=None, item=None):
        server.stop()
        print("Stopped from tray.")
        if icon is not None:
            icon.stop()

    try:
        import pystray
        from PIL import Image
        img = Image.open(os.path.join(BASE, "valhalla.ico"))
        icon = pystray.Icon("Valhalla", img, "Valhalla (127.0.0.1:%d)" % port, menu=pystray.Menu(
            pystray.MenuItem("Open Valhalla", lambda ic, it: webbrowser.open(url), default=True),
            pystray.MenuItem("Quit", quit_app)))
        icon.run()  # blocks until Quit (or the server thread ends)
    except Exception as exc:
        print("Tray icon unavailable (%r); running without it." % (exc,))
        t.join()
    if t.is_alive():
        quit_app()
        t.join(5)
    os._exit(0)


if __name__ == "__main__":
    main()
