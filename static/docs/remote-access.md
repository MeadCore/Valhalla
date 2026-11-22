# Use it from anywhere (safely)

Goal: turn on the lights or check a camera from anywhere in the world, without opening your house to the internet.

> **Never forward ports on your router.** Port forwarding puts your Home Assistant (and your cameras) on the open internet for anyone to probe. Both options below avoid it.

## Option A: Tailscale (free, recommended)

Tailscale makes a private network just for your own devices. Your phone in another country can reach your Home Assistant as if it were at home, and nobody else can. The Personal plan is free (up to 6 users, unlimited devices).

1. Make a free account at [tailscale.com](https://tailscale.com). Sign in with an account you protect with two-factor login.
2. **On Home Assistant:** Settings → **Apps** (called Add-ons before 2026) → Install app → search **Tailscale** → Install → Start. Open its web page and log in to your Tailscale account.
3. **On each phone:** install the Tailscale app, sign in to the same account, and turn it on.
4. **On the wall-screen PC (for board sync from phones):** install Tailscale for Windows and sign in.
5. In the [Tailscale admin page](https://login.tailscale.com/admin/machines), turn on **MagicDNS** (DNS tab). Each device gets a name like `homeassistant.your-tailnet.ts.net`.
6. In the Home Assistant phone app: Settings → Companion app → your server → set the **external URL** to `http://homeassistant.your-tailnet.ts.net:8123`.

### Let phones open Valhalla too (optional)

1. On the wall-screen PC, find its Tailscale address (the Tailscale icon shows it; it starts with `100.`).
2. On that PC, open Valhalla → **⚙** → **Phones & board** ([open it](#setup:remote)).
3. Type a **Phone PIN** (4 to 8 digits). Valhalla won't save the Tailscale address until a PIN is set.
4. Paste the address into "Let phones reach Valhalla over Tailscale".
5. Paste Home Assistant's Tailscale name into "Home Assistant's Tailscale address".
6. Save, then restart Valhalla (close the black window, run `start.bat` again, or Quit Valhalla from the tray icon and start it again).
7. On a phone with Tailscale on, open `http://wall-pc-name.your-tailnet.ts.net:8795` (use the PC's MagicDNS name). Type the PIN once; the phone is remembered after that. Add it to your home screen.

### The phone PIN

- Every phone or tablet types the PIN once. After that it's remembered (for about 6 months) with a cookie that only works for that phone.
- **5 wrong PINs lock PIN entry for 5 minutes.**
- The wall-screen PC itself never needs the PIN.
- Valhalla never saves the PIN itself, only a scrambled (salted hash) version in `config.json`.
- **Forgot the PIN, or lost a phone?** On the wall-screen PC: **⚙ → Phones & board**, type a new PIN and press **Save & next**. That signs every phone out; each one types the new PIN once. To sign phones out but keep the PIN, press **Sign out all phones**.

Valhalla only listens on this computer and on that Tailscale address. It refuses to listen on your whole home network or the internet. Phones sign in with Home Assistant's own login page. The wall screen's token is never sent to them, and the ⚙ Setup can only be changed on the wall-screen PC.

## Option B: Home Assistant Cloud (paid)

Home Assistant Cloud (by Nabu Casa) is a **paid** subscription that gives you a secure remote address with one click, and it also helps fund Home Assistant. It's the easiest option if you don't want to set anything up.

1. In Home Assistant: **Settings → Home Assistant Cloud** → start the trial or subscribe.
2. Turn on **Remote control**. The phone app picks it up by itself.

It covers Home Assistant (lights, cameras, thermostats, garage), but not the Valhalla page itself. For the shared board on phones, add Tailscale to the wall-screen PC as in Option A.

## Keep it secure

- Turn on two-factor login in Home Assistant (profile → Security) and on your Tailscale account.
- Give each person their own Home Assistant login. Make only yourself an administrator.
- In the Tailscale admin page, remove lost or old phones right away.
- Keep Home Assistant updated (Settings → Updates).

## Check it works

Turn off Wi-Fi on your phone (use mobile data), turn on Tailscale, and open the Home Assistant app. Turn a light on and off.
