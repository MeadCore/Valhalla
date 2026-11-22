@echo off
rem Builds dist\Valhalla\Valhalla.exe (PyInstaller, one folder, tray icon, no console) and, if Inno Setup 6 is found,
rem Output\Valhalla-Setup-<ver>.exe. Same approach as Asgard.exe. Run it from anywhere; it works in the Valhalla folder.
setlocal
cd /d %~dp0..
set VER=2.0.0
if not exist venv py -3.12 -m venv venv || py -3 -m venv venv || exit /b 1
venv\Scripts\python -m pip install -q --disable-pip-version-check -r windows-app\requirements-build.txt || exit /b 1
venv\Scripts\pyinstaller --noconfirm --clean --onedir --windowed --name Valhalla --icon windows-app\valhalla.ico --contents-directory . ^
  --version-file windows-app\version_info.txt ^
  --add-data "static;static" --add-data "ha;ha" --add-data "config.example.json;." --add-data "windows-app\valhalla.ico;." ^
  --add-data "README.md;." --add-data "START-HERE.md;." --add-data "FIX-IT-YOURSELF.txt;." --add-data "windows-app\CREDITS.txt;." ^
  --hidden-import server --hidden-import govee --hidden-import pystray._win32 ^
  --paths . windows-app\valhalla_launcher.py || exit /b 1
venv\Scripts\python windows-app\release_check.py dist\Valhalla || exit /b 1
set ISCC=
if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set ISCC="%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set ISCC="%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%~dp0..\innosetup\ISCC.exe" set ISCC="%~dp0..\innosetup\ISCC.exe"
if not defined ISCC (echo Inno Setup 6 not found; skipped the installer. & exit /b 0)
%ISCC% /Q /DAppVer=%VER% windows-app\valhalla.iss || exit /b 1
echo Installer: %CD%\Output
