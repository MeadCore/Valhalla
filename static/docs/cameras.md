# Add the cameras

Do one camera at a time: add it to Home Assistant, check it, then do the next one.

## Before you buy

- Pick cameras that work **locally**, without a cloud account. Look for **RTSP** or **ONVIF** in the specs, or a brand with a local Home Assistant integration (for example Reolink, Amcrest or Hikvision). Check [the integrations list](https://www.home-assistant.io/integrations/#camera) first.
- **PoE** (power over Ethernet) cameras use one cable for power and network. They are more reliable than Wi-Fi for 24/7 video, and you already plan on Ethernet. You'll need a PoE switch or injector (**paid**).
- Cloud-only cameras (many doorbells and battery cameras) often can't show a live picture in Home Assistant, or only slowly.

## 1. Set up the camera itself

1. Plug it in and set it up with the maker's app or web page, as the box says.
2. Change the camera's default password to a strong one. Save it in your password manager.
3. Turn on RTSP/ONVIF in the camera's settings if it has a switch for it.
4. Give it a fixed address in your router, so it never moves.
5. Update the camera's firmware.

## 2. Add it to Home Assistant

1. **Settings → Devices & services**. Many cameras show up by themselves under "Discovered". Click **Add**.
2. If not: **+ Add integration** and search for the brand. If there's no brand integration, use **ONVIF**, or **Generic Camera** with the RTSP address from the camera's manual (it looks like `rtsp://192.168.1.60:554/stream1`).
3. Enter the camera's username and password when asked.

## 3. Name it

**Settings → Devices & services → Entities**, click the camera → ⚙. Set a clear name and entity ID, like `camera.front_door`, `camera.driveway`, `camera.backyard`, `camera.garage`. Valhalla shows the friendly name on each tile.

## Check it works

1. In Home Assistant, click the camera: you should see live video.
2. On Valhalla, the **Cameras** box shows it (click a tile for the big view).

> Recording and person detection are optional extras. Valhalla only shows live video. If you later want recording, look at the **Frigate** app on a mini PC (it needs more power than a Green).

## Privacy

- Cameras should never be reachable from the internet directly. Don't use port forwarding; remote viewing goes through Home Assistant over Tailscale. See [Use it from anywhere](#guide:remote-access).
- Point cameras at your own property.
