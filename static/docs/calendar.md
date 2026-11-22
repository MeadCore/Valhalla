# Link the house calendar

Valhalla's Calendar box shows the next few days of events. Home Assistant reads the calendar, so **any provider** works: Google, iCloud, Outlook, Nextcloud, Fastmail, and others.

## Pick a way

| Way | Works with | Notes |
|---|---|---|
| **ICS link** (Remote Calendar) | Almost every provider | Read-only. Easiest. The link itself is the key, so keep it private |
| **CalDAV** | iCloud, Nextcloud, Fastmail, many others | Uses a username and an app password |
| **Google Calendar** integration | Google | Needs a Google Cloud "OAuth" setup (free, but more steps) |

> Our pick: the **ICS link**. It's the simplest and works for a shared house calendar.

## Way 1: ICS link (any provider)

1. Get the calendar's private ICS link:
   - **Google:** Calendar settings → click the house calendar → **Integrate calendar** → copy **Secret address in iCal format**.
   - **iCloud:** Calendar → share the calendar as **Public calendar** → copy the link, and change `webcal://` to `https://`.
   - **Outlook.com:** Settings → Calendar → Shared calendars → **Publish a calendar** → copy the **ICS** link.
2. In Home Assistant: **Settings → Devices & services → + Add integration → Remote Calendar**.
3. Name it `House`, paste the link, keep "Verify SSL" on, and Submit.
4. Home Assistant makes `calendar.house`.

> Treat the secret link like a password. Anyone with it can read the calendar. If it leaks, reset it in the calendar's settings and paste the new one into Home Assistant.

## Way 2: CalDAV

1. Make an **app password** at your provider (for iCloud: appleid.apple.com → Sign-In and Security → App-Specific Passwords).
2. In Home Assistant: **+ Add integration → CalDAV**. Enter the server address (iCloud: `https://caldav.icloud.com`), your username and the app password.
3. Pick the calendars to add.

## Way 3: Google Calendar integration

Follow [Home Assistant's Google Calendar guide](https://www.home-assistant.io/integrations/google/). It walks you through making a free Google Cloud project and signing in.

## Tell Valhalla which calendars to show

1. ⚙ → **Calendar & weather** ([open it](#setup:calendar)).
2. Type the calendar names, separated by commas, like `calendar.house, calendar.school`.
3. Save.

## Check it works

Add a test event for tomorrow in your calendar app. CalDAV and Google show it within about 15 minutes. ICS links refresh slowly (up to about a day); to fetch it right away, go to Settings → Devices & services → Remote Calendar → ⋮ → **Reload**. Then it shows in Home Assistant's Calendar page and on Valhalla.

> The holiday scenes (Samhain, the Fourth of July, Winter Nights…) show in the Calendar box by themselves. You don't need to add them to your calendar.
