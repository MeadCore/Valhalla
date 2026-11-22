# Add the lights

Valhalla shows each light with an on/off button and a brightness slider. Color bulbs can also take on the holiday scene's colors (the **🎨 Scene colors** button).

> **Going with Govee?** Govee lights don't need Home Assistant: Valhalla runs them itself. Follow [Govee lights](#guide:govee-lights) instead of the steps below.

## Pick a type (you can mix them)

| Type | Needs | Good for |
|---|---|---|
| Smart **switches** (Z-Wave, Zigbee, Lutron Caseta, Wi-Fi) | Neutral wire in most cases | Ceiling lights. The wall switch keeps working for guests |
| **Zigbee** bulbs (e.g. IKEA, Philips Hue, Sengled) | A Zigbee USB stick in Home Assistant, or the brand's bridge | Lamps and color bulbs. Local and fast |
| **Philips Hue** with a Hue Bridge | The Hue Bridge | Easiest color bulbs; Home Assistant finds the bridge |
| **Wi-Fi** bulbs/plugs (e.g. TP-Link Kasa/Tapo) | Just Wi-Fi | A few lamps. Too many Wi-Fi devices can crowd your network |
| **Govee** Wi-Fi strips, lamps, panels, bulbs | Just Wi-Fi + the Govee Home app | Color and holiday scenes. Valhalla runs them directly: see [Govee lights](#guide:govee-lights) |

All bulbs, switches and sticks are **paid** hardware. Home Assistant Green has no radio built in, so Zigbee or Z-Wave needs a USB stick.

## Steps

1. Install the switch or bulb using its own instructions. **Turn off the breaker before touching wall switches.**
2. In Home Assistant: **Settings → Devices & services**.
   - Zigbee stick: add the **Zigbee Home Automation (ZHA)** integration once, then **Add device** and put each bulb in pairing mode.
   - Hue: add the **Philips Hue** integration and press the bridge's button.
   - Others: look under "Discovered", or **+ Add integration** → brand.
3. Rename each `light.` entity clearly: `light.living_room`, `light.porch`, `light.kitchen`…
4. Optional: in **Settings → Areas**, put each light in a room.

## Scene colors on the bulbs

The **🎨 Scene colors** button runs the Home Assistant script `script.valhalla_scene_lights`, which sends the current scene's colors (for example red, white and blue) to your color bulbs.

1. Open `ha/valhalla_scripts.yaml` and find `valhalla_scene_lights`.
2. List your **color** bulbs in it (white-only bulbs can't show colors).
3. Add it in Home Assistant (see [Connect Valhalla](#guide:connect-valhalla), step 3).

## Check it works

- Valhalla's **Lights** box lists your lights. Tap one: it turns on in a second or two.
- Drag the slider: the brightness changes when you let go.
- **All off** turns everything off (it runs `script.valhalla_all_off`).
