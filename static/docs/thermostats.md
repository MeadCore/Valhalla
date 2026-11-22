# Add the thermostats

You have two zones, so you'll add two thermostats. Valhalla shows each with the current temperature, the target and big − / + buttons.

## Before you buy

Pick a thermostat that works well with Home Assistant. Some good routes:

| Type | How it connects | Notes |
|---|---|---|
| ecobee | **HomeKit Device** integration (local) | Works without the cloud once paired |
| Z-Wave or Zigbee thermostat | Needs a Z-Wave/Zigbee USB stick | Fully local |
| Honeywell Home / Resideo | Cloud integration | Needs internet |
| Google Nest | Nest integration | Needs a Google Device Access registration (one-time **paid** fee) and more setup steps |

> Most smart thermostats need a **C-wire** (constant power). Check your wiring before you buy, or get one that comes with a power adapter.

## 1. Install it

Follow the thermostat's own instructions. **Turn off the HVAC breaker first.** Take a photo of the old wiring before you unscrew anything. If you're unsure, an HVAC tech can do it.

## 2. Add it to Home Assistant

1. **Settings → Devices & services**. Look under "Discovered" first.
2. Otherwise **+ Add integration** → search for the brand (or **HomeKit Device** for ecobee: put the thermostat in pairing mode and type its HomeKit code).

## 3. Name them

Rename the two `climate.` entities clearly, like `climate.upstairs` and `climate.downstairs`. Valhalla shows each one's friendly name.

## Check it works

- Valhalla's **Climate** box shows both thermostats.
- Tap **+**: the target goes up, and the thermostat itself shows the change within a few seconds.
- Change the mode (Heat / Cool / Auto / Off) and check the thermostat follows.

> The **Away** and **Night** buttons in the Command Center can set both thermostats too. Edit those scripts in `ha/valhalla_scripts.yaml` to pick your temperatures.
