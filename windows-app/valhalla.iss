; Valhalla per-user installer (Inno Setup 6). No admin needed; installs to %LOCALAPPDATA%\Programs\Valhalla.
; Built by The_Mead_Maker & Odin, the same way as Asgard's installer.
#ifndef AppVer
  #define AppVer "2.0.0"
#endif
[Setup]
AppId={{8B16942A-86B6-48DB-A598-3506C101623B}
AppName=Valhalla
AppVersion={#AppVer}
AppVerName=Valhalla {#AppVer}
AppPublisher=The_Mead_Maker & Odin
AppCopyright=Copyright (c) 2026 The_Mead_Maker & Odin
VersionInfoVersion={#AppVer}.0
VersionInfoDescription=Valhalla installer
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Valhalla
DisableProgramGroupPage=yes
DisableDirPage=auto
SourceDir=..
OutputDir=Output
OutputBaseFilename=Valhalla-Setup-{#AppVer}
SetupIconFile=windows-app\valhalla.ico
UninstallDisplayIcon={app}\Valhalla.exe
UninstallDisplayName=Valhalla
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Tasks]
Name: desktopicon; Description: "Create a &desktop shortcut"; Flags: unchecked
Name: autostart; Description: "Start Valhalla with &Windows (in the tray, without opening the browser)"; Flags: unchecked

[Files]
; Never ship user data, even if a test run left some in dist\Valhalla.
Source: "dist\Valhalla\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion; Excludes: "config.json,config.backup.json,config.json.tmp,data,valhalla.log*,portable.txt"

[Icons]
Name: "{userprograms}\Valhalla"; Filename: "{app}\Valhalla.exe"; Comment: "Valhalla home command center"
Name: "{userprograms}\Valhalla (wall screen, full screen)"; Filename: "{app}\Valhalla.exe"; Parameters: "--kiosk"; Comment: "Valhalla full screen in Microsoft Edge"
Name: "{userdesktop}\Valhalla"; Filename: "{app}\Valhalla.exe"; Comment: "Valhalla home command center"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Valhalla"; ValueData: """{app}\Valhalla.exe"" --background"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\Valhalla.exe"; Description: "Start Valhalla now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop only the Valhalla.exe that runs from this install folder (never a copy elsewhere).
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Get-Process Valhalla -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '{app}\*' } | Stop-Process -Force"""; Flags: runhidden; RunOnceId: "StopValhalla"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var D: String;
begin
  if CurUninstallStep = usPostUninstall then begin
    D := ExpandConstant('{userappdata}\Valhalla');
    if DirExists(D) and (not UninstallSilent) then
      if MsgBox('Also delete your Valhalla settings (Home Assistant token, Govee key) and the dry-erase board?' #13#10 + D + #13#10#13#10 + 'Choose No to keep them for a later reinstall.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(D, True, True, True);
  end;
end;
