# Valhalla - Home Command Center (mockup)

Valhalla follows the Asgard gaming dashboard. It uses the same look and the same "boxes and presets" layout, and it is set up for running the house: cameras, thermostats, garage, lights, a family calendar and a dry-erase board.

**Version 2.2** (your own themes from [Asgard Theme Studio](https://github.com/MeadCore/Asgard-Theme-Studio); see [CHANGELOG.md](CHANGELOG.md)). Home: <https://github.com/MeadCore/Valhalla>. **Status: design mockup.** It runs on **pretend devices** today, and Govee lights work for real once you have them (tested against a pretend Govee, not yet real lights). No smart-home hardware or software is needed to try it, and nothing in this folder is personal. There are no names, addresses, passwords or tokens, so it is safe to share.

## Start here

Read **[START-HERE.md](START-HERE.md)**. It lists the steps in order. Every step has a plain-language guide in `static/docs/`, and the same guides open inside the app with the **❔ Help** button.

Something not working? See **[FIX-IT-YOURSELF.txt](FIX-IT-YOURSELF.txt)** (won't load, Govee key, firewall, lights not found, reinstall).

## Try it (pretend devices)

1. Install Python 3 (free) and tick "Add python.exe to PATH".
2. Double-click `start.bat` (Windows), or run `./start.sh` (Mac/Linux). The first run copies `config.example.json` to `config.json`.
3. Your browser opens <http://127.0.0.1:8795/>. Click **⚙** for the Setup wizard.

Handy address tricks:
- `?scene=yule` (or samhain, rwb, litha, ...) forces a scene.
- `?preset=security`, `night` or `family` picks a layout.
- `?adapter=mock` forces pretend devices.
- `?open=setup&step=mode` opens the Setup wizard at a step; `?open=help&guide=cameras` opens a guide.

## What is on the screen

| Box | What it does |
|---|---|
| Header | Weather, clock, current scene, preset menu, Boxes menu, full screen |
| Status strip | Mode, garage, both thermostats, lights on, cameras, next calendar event, scene colors |
| Command Center | Big buttons: **All off**, **Away**, **Night**, **Lock up**. Away and Lock up ask "are you sure?" first |
| Cameras | 4-camera grid. Tap one for a big view; **Cycle** rotates through them |
| Climate | 2 thermostats with -/+ setpoints and Heat / Cool / Auto / Off |
| Lights | Each room: tap to switch on/off, slide to dim, 🎨 for color and white temperature. **Scene colors** paints color bulbs with the scene. Govee lights show here too |
| Garage | Open/close, always with a confirm step, plus the opener light |
| Calendar | 14-day agenda from the house calendar, with holidays mixed in |
| Board | Dry-erase board: 6 colors, 3 pen sizes, eraser, undo and clear. It is saved in this browser |

Presets:
- **Home**: everything.
- **Security**: big cameras plus garage and lights.
- **Night**: dimmed screen with the essentials.
- **Family**: calendar and a big board.

The **Boxes** menu hides or shows boxes for each preset.

## Scenes (change automatically by date)

Pick **Auto by date** in the scene menu and Valhalla changes its colors on each holiday. **🎨 Scene colors** sends the same colors to the color lights (Govee lights directly, other lights through Home Assistant).

| Scene | When |
|---|---|
| Valhalla | Everyday look |
| Red, White & Blue (Old Glory colors) | Memorial Day, Flag Day, Fourth of July, Labor Day, Veterans Day |
| Wheel of the Year | Samhain, Yule, Imbolc, Ostara, Beltane, Litha, Lughnasadh, Mabon. Solstice and equinox dates come from an astronomical table for 2025-2035 |
| Winter Nights, Disting | Norse days. On by default (untick "Include the Norse days" to leave them out). Winter Nights = the Saturday Oct 11-17; Disting = first full moon after the first new moon after Jan 6 |

The scenes live in `static/scenes.js`. Each scene is a short block of colors, so adding or retuning one is easy.

## Files

```
START-HERE.md             read first: the steps in order
config.example.json       blank settings, safe to share (start.bat copies it to config.json)
config.json               YOUR settings, written by the Setup wizard (private, not shared)
data/board.json           the shared dry-erase board (private, made automatically)
server.py                 Valhalla's small server (Python standard library only): page, Setup API, board sync, Govee, phone PIN
remote_pin.py             phone PIN: salted PIN hash, 5-tries lockout, remembered-phone tokens
govee.py                  Govee lights: LAN control + Govee cloud, caching and rate limits
tools/govee_mock.py       pretend Govee (cloud + LAN lights) for testing; tools/test_govee.py runs the checks
tools/test_pin.py         phone PIN checks; tools/test_updates.js update-check checks; tools/test_kiosk.py kiosk browser checks
start.bat / start.sh      one-click start ("start.bat kiosk" opens Brave or Chrome full screen, never Edge)
static/index.html         the page
static/styles.css         look and layout (same style as Asgard)
static/app.js             boxes, presets, scene picker, board + sync, Setup wizard, Help panel
static/scenes.js          scene colors and holiday dates
static/config.js          fallback settings when opened without server.py (no secrets)
static/adapters/mock.js   pretend house
static/adapters/homeassistant.js   real house via Home Assistant (draft, untested on real hardware)
static/adapters/govee.js  adds Govee lights (through server.py) to whichever adapter is in use
static/docs/*.md          the how-to guides (also shown in the app's Help panel)
ha/valhalla_scripts.yaml  example Home Assistant scripts for the Command Center buttons
tools-shot.mjs            makes the preview screenshots (headless Chrome)
```

## Setup wizard (like Asgard's)

The **⚙** button opens a step-by-step wizard: Welcome, Home Assistant (address, token, Test connection), Devices, Govee lights (key, LAN, Find my Govee lights), Calendar & weather, Screen, Phones & board, Done. Each step saves only its own settings. `server.py` checks every value against a whitelist and writes `config.json` safely (the old one is kept as `config.backup.json`). Setup only works on the wall-screen PC itself. Pretend devices keep working until you switch to Home Assistant.

| Setting | What it is |
|---|---|
| `adapter` | `mock` (pretend) or `ha` (Home Assistant) |
| `ha_url` | Home Assistant address on the home network |
| `ha_remote_url` | Home Assistant's Tailscale address, used by phones away from home |
| `ha_token` | Long-lived access token. Only sent to a browser on the wall-screen PC. Shown masked |
| `calendars`, `weather_entity` | Which Home Assistant calendars and weather to show |
| `default_preset`, `default_scene`, `norse_days` | How the screen starts |
| `board_sync` | Share the dry-erase board live with every screen |
| `remote_listen` | Optional Tailscale address (100.64.0.0/10 only) so phones can open Valhalla. Never 0.0.0.0 |
| `listen_port` | Default 8795 |

## Govee lights (new in v2)

Valhalla runs Govee lights itself, no Home Assistant needed. Guide: `static/docs/govee-lights.md` (or ❔ Help → Govee lights). Setup: ⚙ → Govee lights.

- `govee.py` (standard library only) uses **LAN control** when a light has it (UDP: scan to 239.255.255.250:4001, replies on 4002, commands to the light on 4003: `turn`, `brightness`, `colorwc`, `devStatus`) and the **Govee cloud** otherwise (`https://openapi.api.govee.com/router/api/v1`: `user/devices`, `device/state`, `device/control`, `device/scenes`, header `Govee-API-Key`). If a LAN light goes quiet for 5 minutes, it uses the cloud.
- On/off, brightness, color, white temperature (clamped to each light's range), Govee's built-in scenes (cloud), **Scene colors** (each Valhalla scene's `lights` colors spread across the color lights), and optionally a matching Govee animated scene per holiday (`SCENE_HINTS` in `govee.py`). All off, Away and Night switch Govee lights off.
- Rate limits: device list cached 10 minutes, cloud-only lights read at most every 5 minutes, scene lists cached 6 hours, commands to one light spaced 0.55 s apart, and a 429 pauses cloud calls until Govee's reset time (LAN keeps working). Govee allows 10,000 cloud calls a day per account.
- The API key lives only in `config.json` (masked in Setup, never in `/config.js`, never logged). Phones on Tailscale can switch Govee lights but never get the key.
- Server routes: `GET /api/lights/govee`, `POST /api/lights/govee/control | paint | all-off`, `GET /api/lights/govee/scenes?id=`, `POST /api/setup/test-govee` (this computer only).
- The screen side is `static/adapters/govee.js`: it wraps whichever adapter is in use, so Govee lights appear as `light.govee_<name>` next to pretend or Home Assistant lights.
- Testing without lights: `python3 tools/test_govee.py` starts a pretend Govee (`tools/govee_mock.py`: pretend cloud + pretend LAN lights on 127.0.0.2-3) and checks everything end to end (Linux).

| Setting | What it is |
|---|---|
| `govee_enabled` | Use Govee lights (off by default; pretend mode is unchanged) |
| `govee_api_key` | Govee API key from the Govee Home app. Secret, shown masked |
| `govee_lan` | Use LAN control when a light has it (default on) |
| `govee_lan_ips` | Optional light addresses (home-network only) if the router blocks the LAN search |
| `govee_builtin_scenes` | Scene colors plays Govee's own matching animated scene when one exists |

## Board sync

The board is stored by `server.py` in `data/board.json`. Screens send each finished stroke (`POST /api/board`) and get everyone else's live (`GET /api/board/events`, Server-Sent Events; they fall back to checking every 4 seconds). Undo only removes your own strokes; Clear wipes it everywhere. Without the server the board stays in that browser only.

## Switching from pretend to the real house

Follow `static/docs/connect-valhalla.md` (or ❔ Help → Connect Valhalla). In short: make a long-lived token in Home Assistant, paste it into ⚙ → Home Assistant, press Test, Save.

The screen only talks to an **adapter** (`connect`, `states`, `subscribe`, `call`, `events`, `cameraSrc`): `mock.js` fakes a house, `homeassistant.js` talks to Home Assistant over its WebSocket API (calendar events too, via `calendar.get_events`).

Other option (no server.py): copy `static/` into Home Assistant as `config/www/valhalla/`, set `adapter: "ha"` in its `config.js`, and open `/local/valhalla/index.html`. It signs in with Home Assistant's own login page. The board is then per-browser only.

Remote access: **Tailscale** (free) or **Home Assistant Cloud** (paid). **Never open a port on the router.**

## Privacy rules for this folder

- No names, addresses, hometown, e-mail addresses, passwords, tokens or API keys in any shared file.
- `config.json`, `config.backup.json` and `data/` are private and listed in `.gitignore`. Share `config.example.json` instead.
- Phones never receive the wall screen's token; they sign in with Home Assistant's own login.
- The phone PIN is never stored, only a salted PBKDF2 hash in `config.json`; remembered phones are stored as hashes too.

## Updates

❔ Help → **About & updates** shows the version and checks [GitHub releases](https://github.com/MeadCore/Valhalla/releases) for a newer one (nothing is downloaded or installed). "Check automatically" is off by default and checks at most twice a day.

## Credits

Created October 26, 2026 by The_Mead_Maker & Odin.
Copyright (c) 2026 The_Mead_Maker & Odin. Released under the [MIT License](LICENSE).
