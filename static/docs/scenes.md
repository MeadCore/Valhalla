# Holiday scenes

Scenes change Valhalla's colors (and, if you like, your color bulbs) for holidays. On **Auto**, Valhalla picks the scene by today's date and changes by itself at midnight.

## The scenes and when Auto uses them

| Scene | Days | Rule |
|---|---|---|
| ★ Red, White & Blue | Memorial Day, Flag Day, Fourth of July, Labor Day, Veterans Day | Last Mon of May · Jun 14 · Jul 4 · first Mon of Sep · Nov 11 |
| Imbolc | Feb 1 | Fixed |
| Disting (Norse) | Early Feb | First full moon after the first new moon after Jan 6 |
| Ostara | Spring equinox | Astronomical |
| Beltane | May 1 | Fixed |
| Litha | Summer solstice | Astronomical |
| Lughnasadh | Aug 1 | Fixed |
| Mabon | Autumn equinox | Astronomical |
| Winter Nights (Norse) | Mid-October | The Saturday from Oct 11 to 17 |
| Samhain | Oct 31 | Fixed |
| Yule | Winter solstice | Astronomical |
| ᛟ Valhalla | Every other day | Default gold and steel |

Each holiday's colors show a few days before and after. If two windows overlap, the shorter one wins.

> **Norse days vary.** Winter Nights is also kept on the Icelandic first day of winter (a Saturday from Oct 21 to 27) or at the first full moon after the autumn equinox. Disting is also kept on Feb 1–2 or at the full moon after Yule. Valhalla uses one clear rule for each (above). To leave them out of Auto, untick "Include the Norse days" in the scene picker or in ⚙ → Screen.

## Pick a scene by hand

Tap the scene button at the top (it shows the current one, e.g. "★ Red, White & Blue · auto"), then tap a scene. Tap **Auto** to go back to automatic.

## Change a scene's colors

1. Open `static/scenes.js` in Notepad (or VS Code).
2. Find the scene, for example `id: "samhain"`.
3. Change the colors:
   - `palette`: the colors shown in the picker, each with its meaning.
   - `lights`: colors sent to the color bulbs.
   - `vars`: the screen colors (`bg` background, `accent` main color, `accent2` second color, `glow1`/`glow2` corner glows, `tint` panel tint).
4. Save and reload Valhalla (press F5, or restart the PC in kiosk mode).

Colors are written like `#b22234`. Any "color picker" website gives you these codes.

## Add your own day

Copy an existing scene block and change it. For example, a family day on March 3:

```
{ id: "familyday", name: "Family Day", glyph: "♥", kind: "custom",
  blurb: "Our own holiday.",
  palette: [["#2e7d32", "Green"], ["#fdd835", "Gold"]],
  lights: ["#00ff40", "#ffd000"],
  vars: { bg: "#06100a", accent: "#2e7d32", accent2: "#fdd835", glow1: "#0c2a12", glow2: "#2a2405", tint: "#0b1a0e" },
  days: (y) => [{ label: "Family Day", date: new Date(y, 2, 3), window: [1, 1] }] },
```

- Months count from 0: January is `0`, March is `2`, December is `11`.
- `window: [1, 1]` shows the colors 1 day before and 1 day after.
- For "the last Monday of May" style days, copy how Memorial Day uses `lastMonday(y, 4)`.

Paste it inside the `SCENES` list, save, and reload. It appears in the picker and in Auto. Keep personal names out of the file if you plan to share it.

## Scene colors on the bulbs

The **🎨 Scene colors** button in the Lights box sends the scene's `lights` colors to your color bulbs. See [Add the lights](#guide:lights). Govee lights get them straight from Valhalla, and can play Govee's own matching animated scene instead: see [Govee lights](#guide:govee-lights).

## Your own themes (Asgard Theme Studio)

Asgard Theme Studio is a free, point-and-click app for making your own look: colors, button and label styles, fonts, textures, a moving background, even your own picture.

1. In Theme Studio, make your theme and press **💾 Save theme** (it goes to Documents › Asgard Themes).
2. In Valhalla, tap the **scene button** at the top, then **⇧ Import theme…** under **Your themes**, and pick the file.

Your theme then works like a scene: tap it to switch, and **🎨 Scene colors** sends its colors to the bulbs. Tap ✕ on its card twice to delete it. Themes are checked before use and can never contain code or links.
