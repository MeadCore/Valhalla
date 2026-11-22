@echo off
title Valhalla
rem Valhalla - double-click to start. Keep this window open while you use Valhalla; closing it stops Valhalla.
rem Kiosk (wall screen): make a shortcut to "start.bat kiosk" in the Startup folder (see static\docs\kiosk-touchscreen.md).
cd /d "%~dp0"
if not exist config.json (
  echo First run: copying config.example.json to config.json. Use the gear button in Valhalla to finish setup.
  copy config.example.json config.json >nul
)
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python 3 was not found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
    pause
    exit /b 1
  )
  set PY=py -3
) else (
  set PY=python
)
set PORT=8795
for /f "tokens=2 delims=:, " %%p in ('findstr /c:"\"listen_port\"" config.json') do set PORT=%%p
if /i "%~1"=="kiosk" (
  start "" msedge --kiosk http://127.0.0.1:%PORT%/ --edge-kiosk-type=fullscreen --no-first-run
) else (
  start "" http://127.0.0.1:%PORT%/
)
%PY% server.py
pause
