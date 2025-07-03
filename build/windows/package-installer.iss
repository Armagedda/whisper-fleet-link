[Setup]
AppName=Whisper Fleet Link
AppVersion=1.0
DefaultDirName={pf}\WhisperFleetLink
DefaultGroupName=Whisper Fleet Link
OutputDir=build/windows
OutputBaseFilename=WhisperFleetLinkSetup
Compression=lzma
SolidCompression=yes

[Files]
Source: "backend\target\release\backend.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".env.enc"; DestDir: "{app}"; Flags: ignoreversion
Source: "backend\backend\config.json.enc"; DestDir: "{app}\backend"; Flags: ignoreversion
Source: "backend\cert.pem"; DestDir: "{app}\backend"; Flags: ignoreversion
Source: "backend\key.pem"; DestDir: "{app}\backend"; Flags: ignoreversion

[Icons]
Name: "{group}\Whisper Fleet Link"; Filename: "{app}\backend.exe"

[Run]
Filename: "{app}\backend.exe"; Description: "Run Whisper Fleet Link"; Flags: nowait postinstall skipifsilent 