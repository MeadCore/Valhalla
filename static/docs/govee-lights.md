# Govee lights

Valhalla can run Govee lights by itself. You don't need Home Assistant for them. Your Govee lights show up in the **Lights** box next to the others, and they follow **All off**, **Away**, **Night** and **🎨 Scene colors** (Red, White & Blue, Winter Nights, Disting and the rest).

Valhalla talks to Govee lights in two ways and picks the best one for each light by itself:

- **LAN control**: straight to the light over your home Wi-Fi. Fast (under a second), works even when the internet is down, and has no daily limit. Only some models have it.
- **Govee cloud**: through Govee's servers with a free **API key**. Works for every Wi-Fi Govee light, but takes a second or two and needs the internet.

> If a light has LAN, Valhalla uses LAN. If LAN stops answering, it switches to the cloud by itself.

## Before you buy

| Kind of Govee light | Works with Valhalla? |
|---|---|
| **Wi-Fi** lights (the box says "Wi-Fi + Bluetooth") | ✅ Yes, through the cloud (API key) |
| Wi-Fi lights that also have **LAN Control** | ✅✅ Best: fast and local |
| **Bluetooth-only** lights (no Wi-Fi on the box) | ❌ No. Valhalla can't reach them |

Which ones have LAN Control:
- **Usually yes:** most Wi-Fi **LED strip lights** (for example the H619A–H619E and H618A–H618F families), **floor lamps** (H6072, H6076), **Glide wall panels and hexagons** (H6061, H6066, H6067), **outdoor strip and string lights**, and **TV backlights**.
- **Usually no:** Govee **smart bulbs** (for example the H6008). They work with Valhalla through the cloud only.
- Govee keeps the official list in its [LAN guide](https://app-h5.govee.com/user-manual/wlan-guide). Check the model number (starts with **H**, on the box and the product page) before you buy.
- Every Wi-Fi model on Govee's [supported models list](https://developer.govee.com/docs/support-product-model) works through the cloud.

> Govee lights need **2.4 GHz Wi-Fi**. Most home routers have it, so leave it turned on.

## Steps

1. **Set up each light in the Govee Home app** (free, on your phone) using the light's own instructions. Give each light a clear name, like "Porch Strip" or "Living Room Lamp". Valhalla shows the same names.
2. **Turn on LAN Control** (only for lights that have it): in the Govee Home app, tap the light, tap **⚙** (top right) and switch on **LAN Control**.
   - Don't see the switch? Update the light's firmware in the same settings page, then wait a few minutes. If it still isn't there, that model has no LAN, and it will use the cloud.
3. **Get your free Govee API key:** in the Govee Home app, tap **Profile** (bottom right) → **⚙ Settings** (top right) → **Apply for API Key**. Type your name and a reason (for example "home dashboard"), agree, and submit. Govee e-mails you the key, usually within a few minutes.
   - ⚠ **Making a new key switches off your old one** (Govee's rule since May 2026). If you ever make a new key, paste the new one into Valhalla too.
   - Skip this step if *all* your lights have LAN Control. You only lose Govee's built-in animated scenes.
4. **In Valhalla:** click **⚙** → [Govee lights](#setup:govee):
   - Tick **Use Govee lights**.
   - Paste the API key.
   - Leave **Use LAN control** ticked.
   - Press **🔎 Find my Govee lights**. It lists each light with "LAN ✓" or "cloud ✓".
   - Press **Save & next**, then **Finish** at the end. The screen reloads with your Govee lights in the Lights box.
5. **Windows may ask** "Allow Valhalla (or Python) on networks?" the first time. Tick **Private networks** and press **Allow**. That lets the lights answer on your home network. (This is the Windows firewall asking once. Nothing else in Windows Security needs changing.)

> Keep `config.json` private: it holds your Govee key. Valhalla never shows the key on the screen, never sends it to phones, and never writes it in a log. The only place it goes is Govee itself.

## Using them

- **Tap** a light to switch it on or off. **Slide** to dim.
- **🎨** next to a light opens the color picker:
  - the current scene's colors and common colors,
  - a **White** slider (low numbers are warm candle light, high numbers are cool daylight),
  - **✨ Govee scenes…**: Govee's own animated scenes for that light (Aurora, Sunrise, Christmas…). These need the API key.
- **🎨 Scene colors** (top of the Lights box) paints every Govee color light with the current scene, one color per light, taking turns. For example: red, white, blue, red…
- **All off**, **Away** and **Night** switch the Govee lights off.

## Govee's own scenes for the holidays (optional)

In ⚙ → Govee lights, tick **Scene colors: use Govee's own animated scenes when one matches**. Then **🎨 Scene colors** plays a matching Govee scene on each light if that light has one, and uses the plain colors when it doesn't:

| Valhalla scene | Govee scene it looks for |
|---|---|
| ★ Red, White & Blue | Independence Day / July 4th / America |
| Yule | Christmas / Winter / Snow |
| Samhain | Halloween / Pumpkin |
| Winter Nights | Aurora / Starry / Night |
| Disting | Moonlight / Moon / Ice |
| Beltane | Bonfire / Fire |
| Others | Spring, Summer, Harvest, Autumn, Candlelight |

Govee's scene names differ from model to model, so some lights may not have a match. You can change the list in `govee.py` (`SCENE_HINTS`).

## Limits (good to know)

- **Cloud lights update every 5 minutes.** If someone changes a cloud-only light in the Govee app, Valhalla shows it within 5 minutes. LAN lights update within about 15 seconds. Changes made *from* Valhalla show right away.
- **Govee's cloud allows 10,000 requests a day** per account. Valhalla stays far below that by remembering what it set. If Govee ever says "slow down", Valhalla pauses cloud control for a minute and tells you. LAN lights keep working.
- **One color per light.** Strips with several sections ("segments") show one color at a time from Valhalla. Use Govee scenes for moving, multi-color effects.
- **Govee scenes need the cloud.** LAN control can only do on/off, brightness, colors and white.
- **Use one system per light.** If you also add Govee to Home Assistant, the same light could show twice. Pick either Valhalla's Govee step or Home Assistant's Govee integration for each light.

## If something doesn't work

- **"No lights answered" on LAN:** check LAN Control is on in the app, that the light and this PC are on the **same** home network (not a guest network), and that you allowed Valhalla in the Windows firewall prompt. Some routers block the search. If yours does, give each light a fixed address in the router and type the addresses into **Light addresses** in ⚙ → Govee lights (for example `192.168.1.50, 192.168.1.51`).
- **"The API key is wrong":** make a new key in the app (step 3) and paste it again.
- **A light shows "cloud" but has LAN Control:** wait a minute (Valhalla looks for LAN lights once a minute) or press **🔎 Find my Govee lights** again.
- **LAN control "could not listen on UDP port 4002":** another Govee program, or Home Assistant's Govee integration, is running on this same PC. Close it, or just use the cloud.

## Check it works

- ⚙ → Govee lights → **🔎 Find my Govee lights** lists every light.
- The Lights box shows each Govee light with a small **Govee · LAN** or **Govee · cloud** tag.
- Tap one: it switches in about a second (LAN) or two (cloud).
- Press **🎨 Scene colors** on a patriotic day: red, white and blue across your color lights.
