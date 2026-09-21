; Instalador do Transporte Escolar (Inno Setup 6)
; Compilar:  ISCC.exe /DVersao=1.0.0 /DFonte=..\..\release\TransporteApp deploy\installer\transporte.iss
; A pasta Fonte é a que o workflow monta (dist, web, prisma, node_modules, scripts, package.json).
; Pré-requisitos no PC: Windows 10/11 x64, Node.js 24 (msi da pen) e o MySQL já instalado.
; Instalação silenciosa (sem janelas):
;   TransporteApp-Setup-x.y.z.exe /VERYSILENT /SUPPRESSMSGBOXES /MYSQLUSER=root /MYSQLPASS=senha /ADMINPASS=senhaAdmin

#ifndef Versao
  #define Versao "1.0.0"
#endif
#ifndef Fonte
  #define Fonte "..\..\release\TransporteApp"
#endif

[Setup]
; nunca mudar: identifica a instalação para actualizações e desinstalação
AppId={{4BA9BB67-D9C4-438E-A985-3541103A9C0D}
AppName=Transporte Escolar
AppVersion={#Versao}
AppVerName=Transporte Escolar {#Versao}
AppPublisher=Carmo da Gama
DefaultDirName=C:\TransporteApp
DisableDirPage=yes
DisableProgramGroupPage=yes
DefaultGroupName=Transporte Escolar
OutputBaseFilename=TransporteApp-Setup-{#Versao}
OutputDir=..\..\release
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
SetupIconFile={#Fonte}\app.ico
PrivilegesRequired=admin
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=Transporte Escolar
UninstallDisplayIcon={app}\app.ico
CloseApplications=no

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
; .env e scripts\backup.cnf são criados na instalação e nunca vêm no pacote (têm senhas)
Source: "{#Fonte}\*"; DestDir: "{app}"; Excludes: ".env,backup.cnf,logs\*,backups\*"; Flags: ignoreversion recursesubdirs createallsubdirs
; cópia usada pelo botão "Testar ligação", antes de os ficheiros serem instalados
Source: "configurar.ps1"; Flags: dontcopy

[Dirs]
Name: "{app}\logs"
Name: "{app}\backups"

[Icons]
Name: "{group}\Transporte Escolar"; Filename: "{app}\scripts\abrir.cmd"; IconFilename: "{app}\app.ico"; Comment: "Abrir o sistema de transporte escolar"; Flags: runminimized
Name: "{group}\Cópias de segurança (pasta)"; Filename: "{app}\backups"
Name: "{group}\Registos de erros"; Filename: "{app}\logs"

[Run]
Filename: "{app}\scripts\abrir.cmd"; Description: "Abrir o sistema agora"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\scripts\nssm.exe"; Parameters: "stop TransporteApp"; Flags: runhidden; RunOnceId: "pararServico"
Filename: "{app}\scripts\nssm.exe"; Parameters: "remove TransporteApp confirm"; Flags: runhidden; RunOnceId: "removerServico"

[UninstallDelete]
Type: files; Name: "{commondesktop}\Transporte Escolar.lnk"

[Code]
var
  PaginaMySql: TInputQueryWizardPage;
  BotaoTestar: TNewButton;
  EtiquetaTeste: TNewStaticText;
  Actualizacao: Boolean;
  Falhou: Boolean;

// a constante app só existe depois da página de pasta: durante o assistente usar WizardDirValue
function PastaApp(): String;
begin
  Result := RemoveBackslashUnlessRoot(WizardDirValue);
end;

{ Instalação anterior (tem .env): actualizar sem perguntar nada }
function EActualizacao(): Boolean;
begin
  Result := FileExists(PastaApp() + '\.env');
end;

function PowerShellScript(const Script, Accao, App, Dados: String): String;
begin
  Result := '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Accao ' + Accao + ' -App "' + App + '"';
  if Dados <> '' then
    Result := Result + ' -Dados "' + Dados + '"';
end;

{ Guarda as credenciais num ficheiro temporário: nunca passam pela linha de comandos. }
function GuardarDados(): String;
var
  Linhas: TArrayOfString;
begin
  Result := ExpandConstant('{tmp}\dados.ini');
  SetArrayLength(Linhas, 4);
  Linhas[0] := 'utilizador=' + PaginaMySql.Values[0];
  Linhas[1] := 'senha=' + PaginaMySql.Values[1];
  Linhas[2] := 'porta=' + PaginaMySql.Values[2];
  Linhas[3] := 'adminSenha=' + PaginaMySql.Values[3];
  SaveStringsToUTF8File(Result, Linhas, False);
end;

procedure TestarLigacao(Sender: TObject);
var
  Codigo: Integer;
  Dados: String;
begin
  EtiquetaTeste.Caption := 'A verificar...';
  WizardForm.Refresh();
  Dados := GuardarDados();
  { os ficheiros ainda não foram instalados: usar a cópia temporária do script }
  ExtractTemporaryFile('configurar.ps1');
  if Exec('powershell.exe', PowerShellScript(ExpandConstant('{tmp}\configurar.ps1'), 'testar', ExpandConstant('{tmp}'), Dados),
          '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0) then
    EtiquetaTeste.Caption := 'Ligação ao MySQL confirmada.'
  else
    EtiquetaTeste.Caption := 'Não foi possível ligar. Verifique o utilizador, a senha e a porta.';
  DeleteFile(Dados);
end;

function NodeInstalado(): Boolean;
var
  Codigo: Integer;
begin
  { Node acabado de instalar pode ainda não estar no PATH desta sessão }
  Result := FileExists(ExpandConstant('{commonpf64}\nodejs\node.exe')) or
            (Exec('cmd.exe', '/c node -v', '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0));
end;

procedure InitializeWizard();
begin
  PaginaMySql := CreateInputQueryPage(wpSelectTasks,
    'Ligação ao MySQL',
    'O sistema precisa de criar a sua base de dados no MySQL deste computador.',
    'Indique um utilizador com permissões de administração do MySQL (normalmente "root").' + #13#10 +
    'É usado uma única vez, para criar a base "transporte" e um utilizador próprio com senha gerada automaticamente.' + #13#10 +
    'Depois disso, o sistema nunca mais usa esta senha.');

  PaginaMySql.Add('Utilizador do MySQL:', False);
  PaginaMySql.Add('Senha:', True);
  PaginaMySql.Add('Porta:', False);
  PaginaMySql.Add('Senha inicial do administrador do sistema:', True);
  { valores por omissão, ou parâmetros de instalação silenciosa:
    TransporteApp-Setup.exe /VERYSILENT /MYSQLUSER=root /MYSQLPASS=... /MYSQLPORT=3306 /ADMINPASS=... }
  PaginaMySql.Values[0] := ExpandConstant('{param:MYSQLUSER|root}');
  PaginaMySql.Values[1] := ExpandConstant('{param:MYSQLPASS|}');
  PaginaMySql.Values[2] := ExpandConstant('{param:MYSQLPORT|3306}');
  PaginaMySql.Values[3] := ExpandConstant('{param:ADMINPASS|}');

  BotaoTestar := TNewButton.Create(WizardForm);
  BotaoTestar.Parent := PaginaMySql.Surface;
  BotaoTestar.Caption := 'Testar ligação';
  BotaoTestar.Width := ScaleX(110);
  BotaoTestar.Height := ScaleY(25);
  BotaoTestar.Top := PaginaMySql.Edits[3].Top + PaginaMySql.Edits[3].Height + ScaleY(16);
  BotaoTestar.Left := 0;
  BotaoTestar.OnClick := @TestarLigacao;

  EtiquetaTeste := TNewStaticText.Create(WizardForm);
  EtiquetaTeste.Parent := PaginaMySql.Surface;
  EtiquetaTeste.Top := BotaoTestar.Top + ScaleY(5);
  EtiquetaTeste.Left := BotaoTestar.Width + ScaleX(12);
  EtiquetaTeste.Width := PaginaMySql.SurfaceWidth - BotaoTestar.Width - ScaleX(12);
  EtiquetaTeste.Caption := '';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { numa actualização a base e as senhas já existem }
  Result := (PageID = PaginaMySql.ID) and EActualizacao();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpWelcome then
  begin
    if not NodeInstalado() then
    begin
      MsgBox('O Node.js não está instalado neste computador.' + #13#10#13#10 +
             'Instale primeiro o ficheiro node-v24.x-x64.msi que vai na pen e volte a executar este instalador.',
             mbError, MB_OK);
      Result := False;
    end;
  end
  else if (PaginaMySql <> nil) and (CurPageID = PaginaMySql.ID) then
  begin
    if PaginaMySql.Values[0] = '' then
    begin
      MsgBox('Indique o utilizador do MySQL.', mbError, MB_OK);
      Result := False;
    end
    else if Length(PaginaMySql.Values[3]) < 6 then
    begin
      MsgBox('A senha inicial do administrador do sistema deve ter pelo menos 6 caracteres.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Codigo: Integer;
  Dados, Accao: String;
begin
  if CurStep = ssInstall then
    { decidido antes de copiar: o pacote nunca traz .env, por isso só existe numa instalação anterior }
    Actualizacao := EActualizacao()
  else if CurStep = ssPostInstall then
  begin
    if Actualizacao then
    begin
      Accao := 'actualizar';
      Dados := '';
    end
    else
    begin
      Accao := 'instalar';
      Dados := GuardarDados();
    end;

    WizardForm.StatusLabel.Caption := 'A configurar a base de dados e o serviço Windows...';
    WizardForm.Refresh();
    if not (Exec('powershell.exe',
                 PowerShellScript(ExpandConstant('{app}\scripts\installer\configurar.ps1'), Accao, ExpandConstant('{app}'), Dados),
                 '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0)) then
    begin
      Falhou := True;
      MsgBox('A configuração não ficou concluída.' + #13#10#13#10 +
             'Veja o ficheiro ' + ExpandConstant('{app}\logs\instalacao.log') + ' para saber o motivo.' + #13#10 +
             'Depois de corrigir, volte a executar este instalador.', mbError, MB_OK);
    end;
    if Dados <> '' then DeleteFile(Dados);
  end;
end;

{ Instalação silenciosa: código de saída diferente de 0 se a configuração falhou }
function GetCustomSetupExitCode(): Integer;
begin
  if Falhou then Result := 99 else Result := 0;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if MsgBox('Quer apagar também as cópias de segurança e os registos em ' + ExpandConstant('{app}') + '?' + #13#10#13#10 +
              'A base de dados no MySQL não é apagada em nenhum dos casos.', mbConfirmation, MB_YESNO) = IDYES then
    begin
      DelTree(ExpandConstant('{app}\backups'), True, True, True);
      DelTree(ExpandConstant('{app}\logs'), True, True, True);
      DeleteFile(ExpandConstant('{app}\.env'));
      DeleteFile(ExpandConstant('{app}\scripts\backup.cnf'));
    end;
  end;
end;
