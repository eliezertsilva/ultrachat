; MultiChat para OBS - instalador (Inno Setup 6)
; Compile: ISCC.exe installer\multichat.iss  -> installer\Output\MultiChat-OBS-Setup.exe

#define AppName "MultiChat para OBS"
#define AppVersion "1.0.0"
#define Src ".."

[Setup]
AppId={{7E3C2A51-5B8F-4C1D-9A0E-6F2B8D4C1A77}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=MultiChat
DefaultDirName={localappdata}\Programs\MultiChat-OBS
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=MultiChat-OBS-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
CloseApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "configobs"; Description: "Configurar o OBS automaticamente (liga junto com o OBS + docks do chat e do painel)"
Name: "desktopicon"; Description: "Atalho do painel na área de trabalho"; Flags: unchecked

[Files]
Source: "{#Src}\src\*"; DestDir: "{app}\src"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\tools\*"; DestDir: "{app}\tools"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs ignoreversion
Source: "{#Src}\installer\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "{#Src}\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\obs-multichat.lua"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\iniciar-oculto.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\dock-loader.html"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Iniciar MultiChat"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""
Name: "{group}\Painel do MultiChat"; Filename: "http://localhost:8787/"
Name: "{group}\Desinstalar MultiChat"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Painel do MultiChat"; Filename: "http://localhost:8787/"; Tasks: desktopicon

[Run]
Filename: "{app}\node\node.exe"; Parameters: """{app}\tools\configure-obs.js"" install"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Tasks: configobs; StatusMsg: "Configurando o OBS..."
Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; Flags: nowait postinstall skipifsilent; Description: "Iniciar o MultiChat agora e abrir o painel"
Filename: "http://localhost:8787/"; Flags: shellexec nowait postinstall skipifsilent; Description: "Abrir o painel de configuração"

[UninstallRun]
Filename: "curl.exe"; Parameters: "-s -X POST http://127.0.0.1:8787/api/shutdown"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"
Filename: "{app}\node\node.exe"; Parameters: """{app}\tools\configure-obs.js"" uninstall"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "UnconfigObs"

[UninstallDelete]
Type: files; Name: "{app}\multichat.log"
Type: files; Name: "{app}\config.json"

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
