# Install Home Assistant

Home Assistant (HA) is free software that talks to all your smart devices. It runs on its own small box that stays on 24/7. Valhalla then shows and controls everything through it.

## 1. Pick the box

| | Home Assistant Green | Mini PC |
|---|---|---|
| What it is | A small ready-made box from the Home Assistant team | Any small Intel/AMD computer |
| Setup | Plug in and go. Easiest | You install Home Assistant OS onto it (about 30 minutes) |
| Speed | Fine for a normal house | Faster. Better if you later want camera recording or AI person detection |
| Radios | None built in. Add a USB Zigbee/Thread stick if you use Zigbee bulbs | Same: add a USB stick if needed |
| Best for | Beginners | Tinkerers, lots of cameras |

> Our pick for a beginner: **Home Assistant Green**. If you already have a spare mini PC, that works great too.

You **do not** run Home Assistant on the wall-screen PC. Keep them separate so a Windows update or a reboot of the screen never takes the house offline.

## 2a. Home Assistant Green

1. Plug the Green into your router with the Ethernet cable, then plug in power.
2. Wait about 5 minutes.
3. On any computer on your home network, open `http://homeassistant.local:8123`
4. Follow "Create my smart home": make the owner account (use a strong password and save it in your password manager), and set your home location and time zone (Central).

## 2b. Mini PC

1. Follow the official guide: [Install Home Assistant OS on a generic x86-64 PC](https://www.home-assistant.io/installation/generic-x86-64). In short: make a USB stick with the Home Assistant OS image, boot the mini PC from it, and write it to the internal drive. **This erases the mini PC.**
2. Unplug the USB stick, reboot, connect Ethernet.
3. Open `http://homeassistant.local:8123` and finish "Create my smart home" as in 2a.

## 3. A few good first settings

1. **Settings → System → Network**: give HA a fixed address (or reserve it in your router), so it never moves.
2. **Settings → System → Backups**: turn on automatic backups. Keep a copy off the box (USB stick or cloud).
3. **Settings → People**: add each family member, each with their own login. Don't share one login.
4. Turn on two-factor login: your profile (bottom left) → Security → Multi-factor authentication.
5. Install the **Home Assistant app** on each phone (free) and sign in.

## Check it works

- `http://homeassistant.local:8123` opens and you can log in.
- **Settings → Devices & services** shows "Met.no" (the free weather). Its weather entity is usually `weather.forecast_home`.

Next: [Connect Valhalla to Home Assistant](#guide:connect-valhalla).
