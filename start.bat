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
if /i "%~1"=="kiosk" goto kiosk
start "" http://127.0.0.1:%PORT%/
goto run
:kiosk
rem Kiosk (full screen): Brave if installed, else Chrome, else the normal browser. Never Microsoft Edge.
set KB=
for %%b in ("%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" "%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") do (
  if not defined KB if exist %%b set KB=%%b
)
if defined KB (
  start "" %KB% --kiosk http://127.0.0.1:%PORT%/ --no-first-run --no-default-browser-check "--user-data-dir=%~dp0data\kiosk-browser"
) else (
  echo Brave or Chrome not found: opening your normal browser. Press F11 for full screen.
  start "" http://127.0.0.1:%PORT%/
)
:run
%PY% server.py
pause
