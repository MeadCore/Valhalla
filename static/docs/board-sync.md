# Dry-erase board sync

Write a note on the wall screen and see it on your phone, or the other way round, live.

## How it works

- The board is saved on the wall-screen PC, in `data/board.json` (private; not shared with anyone).
- Every screen that has Valhalla open (the wall screen, phones, a tablet) gets each new stroke within a second.
- If the connection drops, the board says **⚠ Reconnecting**. Your drawing stays on your screen and the board catches up as soon as it's back.
- **Undo** only undoes your own strokes, so a phone can't undo the note someone wrote on the wall.
- **Clear** wipes the board everywhere (it asks first).

The little label next to "Board" tells you the state:

| Label | Means |
|---|---|
| ⇄ Synced | Shared live with every screen |
| ⚠ Reconnecting | Can't reach the Valhalla server right now |
| This screen only | Sync is off, or Valhalla was opened without its server |

## Turn it on

It's on by default. To check: ⚙ → **Phones & board** ([open it](#setup:remote)) → "Share the dry-erase board with every screen and phone".

## Use it on phones

Phones reach the board through Tailscale, at home or away. (On purpose, Valhalla doesn't open itself to your whole home network.)

1. Set up Tailscale as in [Use it from anywhere](#guide:remote-access), section "Let phones open Valhalla too".
2. On the phone, with Tailscale on, open the wall PC's Tailscale name, like `http://wall-pc.your-tailnet.ts.net:8795`.
3. Add it to the home screen (Share → Add to Home Screen on iPhone; ⋮ → Add to Home screen on Android).

## Good to know

- Erase all of it at once with **Clear**; the eraser removes ink where you rub.
- The board keeps up to 3,000 strokes; the oldest drop off after that.
- To start fresh by hand: close Valhalla and delete `data/board.json`.
- Backups: copy `data/board.json` if you want to keep a drawing.
