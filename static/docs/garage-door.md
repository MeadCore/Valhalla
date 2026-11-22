# Add the garage door

Valhalla shows the garage door as open or closed, with a big button to open or close it (it always asks "Are you sure?" first).

## Safety first

- Only use openers with working **safety sensors** (the little eyes near the floor). Never disable them.
- Close the door from Valhalla only if you can see it, either in person or on a camera. That's why the garage camera sits next to the Garage box in the Security layout.
- Smart openers beep and flash before they close on their own. Leave that on.

## Pick how to connect it

| Option | Works with | Notes |
|---|---|---|
| **ratgdo** board (or similar local controller) | Chamberlain / LiftMaster with Security+ 2.0 (yellow learn button), 1.0 or dry contact | Fully local. Popular since myQ stopped working with Home Assistant. **Not** for Security+ 3.0 (white learn button) |
| Meross / Tailwind smart garage controllers | Most openers | Check the Home Assistant integration page for your model first |
| Z-Wave or Zigbee garage controller | Most openers | Needs a Z-Wave/Zigbee stick |
| A new opener with built-in Wi-Fi | Depends on brand | Check it has a **local** Home Assistant integration before buying |

All of these are **paid** hardware. Check [Home Assistant's integrations list](https://www.home-assistant.io/integrations/#cover) for your exact model before you buy.

> Before you buy: look at the **learn button** on the opener motor. Yellow means ratgdo works. White means it doesn't, so pick another option.

## Steps

1. Install the controller using its own instructions. Unplug the opener while you wire anything.
2. In Home Assistant: **Settings → Devices & services**, then add it (look under "Discovered" first).
3. Rename the door entity to exactly `cover.garage_door` (Settings → Devices & services → Entities → click it → ⚙ → Entity ID). If the controller also has a light, it can be `light.garage_opener`.

## Check it works

1. Stand in the garage. On Valhalla, tap the garage door, then **Open**. Confirm. The door opens and the box shows "Opening…", then "Open".
2. Tap **Close** and watch the door the whole time.
3. Put something soft (a cardboard box) in the door's path and close again. The door must reverse. If it doesn't, stop and fix the opener before using it remotely.

> Want a reminder if it's left open? In Home Assistant, make an automation: "When `cover.garage_door` has been open for 15 minutes, send a notification to my phone".
