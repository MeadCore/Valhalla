#!/bin/sh
# Valhalla - start on Mac/Linux. Keep this terminal open while you use Valhalla.
cd "$(dirname "$0")"
[ -f config.json ] || { echo "First run: copying config.example.json to config.json."; cp config.example.json config.json; }
PORT=$(python3 -c "import json;print(json.load(open('config.json')).get('listen_port',8795))" 2>/dev/null || echo 8795)
( sleep 1; (xdg-open "http://127.0.0.1:$PORT/" || open "http://127.0.0.1:$PORT/") >/dev/null 2>&1 ) &
exec python3 server.py
