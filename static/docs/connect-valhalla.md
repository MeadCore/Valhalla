# Connect Valhalla to Home Assistant

This switches Valhalla from pretend devices to your real house. It takes about 10 minutes. You can switch back to pretend mode any time.

## 1. Make a long-lived access token

A token is a long password just for Valhalla. You can delete it any time to cut Valhalla off.

1. In Home Assistant, click your name (bottom left) → **Security** tab.
2. Scroll to **Long-lived access tokens** → **Create token**.
3. Name it `Valhalla wall screen` → **OK**.
4. **Copy it now.** Home Assistant only shows it once. It starts with `eyJ` and is very long.

> Tip: make a separate Home Assistant user called "Wall screen" (Settings → People → Add person, allow login, not an administrator) and create the token while logged in as that user. Then the wall screen can't change Home Assistant's settings.

## 2. Put it in the Setup wizard

1. On the wall-screen PC, start Valhalla (`start.bat`) and click **⚙**.
2. Go to the **Home Assistant** step ([open it](#setup:mode)).
3. Pick **🏠 Home Assistant**.
4. Address: `http://homeassistant.local:8123` (or the fixed address from the install guide, like `http://192.168.1.50:8123`).
5. Paste the token.
6. Click **🔎 Test connection**. You should see "✓ Connected to Home Assistant" and a list of what was found.
7. Click **Save & next**, then go through the rest of the steps and **Finish**.

> The token is saved in `config.json` on the wall-screen PC only. Valhalla only hands it to a browser on that same PC. Phones never get it; they sign in with Home Assistant's own login page instead.

## 3. Add the Command Center scripts

The big buttons (All off, Away, Night, Lock up, Home) run Home Assistant scripts.

1. Open `ha/valhalla_scripts.yaml` in Notepad.
2. In Home Assistant: **Settings → Automations & scenes → Scripts → + Add script → ⋮ → Edit in YAML**. Paste one script at a time, change the entity names to yours, and save.
3. Or, if you use the File editor app: paste the whole file into `scripts.yaml` and restart Home Assistant.

## Names Valhalla looks for

Valhalla finds devices by their Home Assistant entity IDs. Rename them in **Settings → Devices & services → Entities** (click one → ⚙ → Entity ID).

| Box | Entity IDs |
|---|---|
| Cameras | `camera.` anything (all are shown) |
| Thermostats | `climate.` anything |
| Garage | `cover.garage_door` |
| Lights | `light.` anything |
| Calendar | set in the wizard, e.g. `calendar.house` |
| Weather | set in the wizard, e.g. `weather.forecast_home` |

## Go back to pretend mode

⚙ → Home Assistant step → **🧪 Pretend devices** → Save. Your token stays saved for later.

## Something wrong?

- **"Could not reach Home Assistant"**: check the address in a browser on the same PC. Try the number address instead of `homeassistant.local`.
- **"Token is wrong (401)"**: the token was deleted or pasted short. Make a new one.
- **A box is empty**: the entity ID doesn't match. See the table above.
- To cut Valhalla off: delete the token in Home Assistant (profile → Security).
