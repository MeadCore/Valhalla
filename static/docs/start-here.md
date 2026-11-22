# Start here

Valhalla is the home command center for the wall touchscreen: cameras, thermostats, the garage door, lights, the house calendar, a dry-erase board and holiday color scenes, all on one screen. It works like Asgard: one small program (`server.py`) and a web page.

> You don't need any smart-home hardware to try it. Until you connect Home Assistant, Valhalla runs in **pretend-devices mode**: a made-up house you can tap around in. Nothing you tap reaches a real device.

## What you need

- A Windows PC for the screen (a mini PC is fine), plugged in with Ethernet.
- **Python 3** (free). Get it from [python.org](https://www.python.org/downloads/). During install, tick **"Add python.exe to PATH"**.
  - Or skip Python: run **Valhalla-Setup-2.0.0.exe**. It installs Valhalla like Asgard (Start menu, tray icon, no black window). Your settings then live in `%APPDATA%\Valhalla`.
- Later: a **Home Assistant** box. It is the "brain" that actually talks to the cameras, thermostats, garage door and lights. Valhalla is just the pretty screen in front of it.

## Try it today (5 minutes)

1. Copy the whole `valhalla` folder onto the PC (for example to `C:\Valhalla`).
2. Double-click **`start.bat`**. A black window opens and your browser shows Valhalla.
3. Keep the black window open while you use Valhalla. Closing it stops Valhalla.
4. Click the **⚙** button (top right) and walk through the Setup wizard. Leave it on **Pretend devices** for now.
5. Click **❔ Help** any time to come back to these guides.

> The first time, `start.bat` copies `config.example.json` to `config.json`. That file holds your settings. Keep `config.json` private: it can hold your Home Assistant token. Share `config.example.json` instead; it has nothing personal in it.

## The order to do things in

Do these one at a time. Each guide is short and ends with a "Check it works" step.

1. [Install Home Assistant](#guide:install-home-assistant): pick a Home Assistant Green or a mini PC.
2. [Connect Valhalla to Home Assistant](#guide:connect-valhalla): make a token and switch off pretend mode.
3. Add devices, in any order, as you buy them:
   - [Cameras](#guide:cameras)
   - [Thermostats](#guide:thermostats)
   - [Garage door](#guide:garage-door)
   - [Lights](#guide:lights) (Govee lights: [Govee lights](#guide:govee-lights), no Home Assistant needed)
4. [Link the house calendar](#guide:calendar).
5. [Use it from anywhere, safely](#guide:remote-access), with Tailscale (free) or Home Assistant Cloud (paid). **Never** forward ports on your router.
6. [Set up the touchscreen in kiosk mode](#guide:kiosk-touchscreen).
7. [Share the dry-erase board with phones](#guide:board-sync).
8. [Customize the holiday scenes](#guide:scenes).

## Free or paid

| Thing | Cost |
|---|---|
| Valhalla, Python, Home Assistant software | Free |
| Tailscale (Personal plan, up to 6 users) | Free |
| Home Assistant built-in weather (Met.no) | Free, no account |
| Home Assistant Cloud (Nabu Casa) | **Paid** subscription (optional) |
| Home Assistant Green, mini PC, cameras, thermostats, bulbs, garage opener add-on | **Paid** hardware |

## Where things are

- `start.bat`: starts Valhalla (Windows). `start.sh` does the same on Mac/Linux.
- `config.example.json`: blank settings, safe to share. `config.json`: your settings (made for you).
- `static/docs/`: these guides, as plain text files.
- `ha/valhalla_scripts.yaml`: the Home Assistant scripts behind the big Command Center buttons (All off, Away, Night, Lock up, Home).
- `data/board.json`: the dry-erase board (made for you, private).
