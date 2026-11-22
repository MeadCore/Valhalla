# Touchscreen kiosk mode

Kiosk mode makes the wall screen show only Valhalla, full screen, from the moment the PC turns on.

## 1. The screen

- Any touchscreen monitor that works with Windows is fine. Plug in its **USB touch cable** as well as the video cable, or touch won't work.
- Windows: **Settings → Display**. Set the scale so the buttons are a comfortable size (100–150%).
- If touch lands in the wrong spot on a two-screen PC: Control Panel → **Tablet PC Settings → Setup** and follow it.

## 2. Start Valhalla full screen when the PC turns on

> **Installed Valhalla with Valhalla-Setup.exe?** Then it's easier: tick **Start Valhalla with Windows** in the installer, and use the Start-menu shortcut **Valhalla (wall screen, full screen)**, or copy it into the Startup folder below instead of `start.bat`. Valhalla.exe has no black window; it sits in the tray (bottom right, the gold ᛟ icon). Right-click it for **Open Valhalla** or **Quit**.


1. Press **Win + R**, type `shell:startup`, press Enter. A folder opens.
2. Right-click inside it → **New → Shortcut** → **Browse** to Valhalla's `start.bat` → Next → name it `Valhalla` → Finish.
3. Right-click the new shortcut → **Properties**. In **Target**, add a space and the word `kiosk` at the very end, so it ends like `start.bat kiosk`.
4. Set **Run** to **Minimized** (so the black window stays out of the way) → OK.

With `kiosk`, Valhalla opens full screen with nothing but Valhalla, in **Brave** if it's installed, otherwise **Google Chrome**. It uses its own small browser profile, so it works even when your normal browser is already open. If neither Brave nor Chrome is installed, it opens your normal browser instead (press **F11** for full screen). Valhalla never uses Microsoft Edge for this.

> To get out of kiosk mode, press **Alt + F4**.

## 3. Keep the black window

The minimized black window is Valhalla's server. If someone closes it, Valhalla stops; restart the PC (or double-click `start.bat`) to bring it back.

## 4. Keep it awake (or let it sleep at night)

- **Settings → System → Power**: set "Turn off my screen" to **Never** (or to a time like 1 hour if you'd rather it sleeps; a tap wakes it).
- Set "Put my device to sleep" to **Never**, so Valhalla keeps running.
- The **🌙 Night** layout dims Valhalla's colors for the evening.

## 5. Sign in by itself (optional)

If the PC is only for the wall screen, you can make Windows sign in automatically. Only do this if the PC is in a safe place inside the house. Search for "Windows automatic sign-in" from Microsoft's own support pages for current steps.

## 6. Windows updates

**Settings → Windows Update → Advanced options → Active hours**: set them to cover the day, so updates restart the PC at night.

## Check it works

Restart the PC. Without touching anything, Valhalla should open full screen within a minute or two. Tap a light to check touch works.
