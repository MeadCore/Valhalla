/* Fallback settings for when Valhalla is opened WITHOUT server.py (for example copied into Home Assistant's
   www/ folder). When server.py runs, it answers /config.js itself from config.json (written by the Setup wizard),
   and this file is not used. No secrets here: never put a token or password in this file. */
window.VALHALLA_CONFIG = { adapter: "mock", haUrl: "", calendars: ["calendar.house"], weather: "weather.home" };
