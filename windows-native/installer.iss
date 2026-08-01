#define MyAppName "Sinu Game Vault"
; Supplied by build-release.ps1 from Directory.Build.props (ISCC /DMyAppVersion=...).
; The literal below is only a fallback for compiling installer.iss by hand.
#ifndef MyAppVersion
  #define MyAppVersion "2.3.0"
#endif
#define MyAppPublisher "Sinu Game Vault"
#define MyAppExeName "SinuGameVault.exe"

[Setup]
AppId={{A45F7F9D-89F4-4D7A-AE72-E0FD3B9D8CD2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Sinu Game Vault
DefaultGroupName=Sinu Game Vault
DisableProgramGroupPage=yes
OutputDir=installer-output
OutputBaseFilename=SinuGameVault-Setup-v{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no
ChangesAssociations=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "publish\SinuGameVault.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Sinu Game Vault"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Sinu Game Vault"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Sinu Game Vault"; Flags: nowait postinstall skipifsilent
