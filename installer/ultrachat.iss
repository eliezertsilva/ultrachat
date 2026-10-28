; UltraChat para OBS - instalador (Inno Setup 6)
; Compile: ISCC.exe installer\ultrachat.iss  -> installer\Output\UltraChat-Setup.exe

#define AppName "UltraChat para OBS"
#define AppVersion "1.3.0"
#define Src ".."

[Setup]
AppId={{7E3C2A51-5B8F-4C1D-9A0E-6F2B8D4C1A77}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=UltraChat
DefaultDirName={localappdata}\Programs\UltraChat
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=UltraChat-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#Src}\assets\logo.ico
UninstallDisplayIcon={app}\logo.ico
UninstallDisplayName={#AppName}
CloseApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "configobs"; Description: "Configurar o OBS automaticamente (liga junto com o OBS + docks do chat e do painel)"
Name: "desktopicon"; Description: "Atalho do UltraChat na área de trabalho"

[Files]
Source: "{#Src}\src\*"; DestDir: "{app}\src"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\tools\*"; DestDir: "{app}\tools"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\installer\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "{#Src}\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\obs-ultrachat.lua"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\iniciar-oculto.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\abrir-ultrachat.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\dock-loader.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\assets\logo.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\UltraChat"; Filename: "wscript.exe"; Parameters: """{app}\abrir-ultrachat.vbs"""; IconFilename: "{app}\logo.ico"; Comment: "Configurar o UltraChat"
Name: "{group}\Desinstalar UltraChat"; Filename: "{uninstallexe}"
Name: "{autodesktop}\UltraChat"; Filename: "wscript.exe"; Parameters: """{app}\abrir-ultrachat.vbs"""; IconFilename: "{app}\logo.ico"; Comment: "Configurar o UltraChat"; Tasks: desktopicon

[Run]
Filename: "{app}\node\node.exe"; Parameters: """{app}\tools\configure-obs.js"" install"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Tasks: configobs; StatusMsg: "Configurando o OBS..."
Filename: "wscript.exe"; Parameters: """{app}\abrir-ultrachat.vbs"""; Flags: nowait postinstall skipifsilent; Description: "Abrir o UltraChat agora"

[UninstallRun]
Filename: "curl.exe"; Parameters: "-s -X POST http://127.0.0.1:8787/api/shutdown"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"
Filename: "{app}\node\node.exe"; Parameters: """{app}\tools\configure-obs.js"" uninstall"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "UnconfigObs"

[InstallDelete]
; leftovers from the old "MultiChat" name
Type: files; Name: "{app}\obs-multichat.lua"
Type: files; Name: "{app}\multichat.log"
; shortcuts from v1.3 and older (replaced by the "UltraChat" app window)
Type: files; Name: "{group}\Painel do UltraChat.url"
Type: files; Name: "{group}\Iniciar UltraChat.lnk"
Type: files; Name: "{autodesktop}\Painel do UltraChat.url"

[UninstallDelete]
Type: files; Name: "{app}\ultrachat.log"
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\loyalty.json"
Type: files; Name: "{app}\loyalty.json.tmp"
Type: files; Name: "{app}\gifts.json"
Type: files; Name: "{app}\auth.json"
Type: filesandordirs; Name: "{app}\.app-profile"

[Code]
function ObsRunning(): Boolean;
var Code: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/c tasklist /FI "IMAGENAME eq obs64.exe" | find /I "obs64.exe"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := (Code = 0);
end;

function WaitObsClosed(): Boolean;
begin
  Result := True;
  while ObsRunning() do
  begin
    if MsgBox('O OBS está aberto. Feche o OBS para que ele possa ser configurado e clique em OK.' + #13#10 +
              '(Cancelar = sair)', mbInformation, MB_OKCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := WaitObsClosed();
end;

function InitializeUninstall(): Boolean;
begin
  Result := WaitObsClosed();
end;
