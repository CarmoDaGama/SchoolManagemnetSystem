<#
  Configuração automática do Transporte Escolar, chamada pelo instalador (Inno Setup).

  Faz tudo o que antes era manual: encontra o MySQL, cria a base e o utilizador dedicado,
  gera as senhas, escreve o .env e o backup.cnf, aplica as migrations, corre a seed,
  instala o serviço Windows e cria o atalho.

  As senhas nunca passam pela linha de comandos: vêm num ficheiro temporário (-Dados),
  que é apagado no fim.

  Modos:
    -Accao testar    → só verifica se o MySQL responde com as credenciais dadas
    -Accao instalar  → instalação completa
    -Accao actualizar→ mantém .env e base; só actualiza migrations e serviço
#>
[CmdletBinding()]
param(
  [ValidateSet('testar', 'instalar', 'actualizar')] [string]$Accao = 'instalar',
  [string]$Dados = '',
  [string]$App = 'C:\TransporteApp'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$SVC = 'TransporteApp'
$BASE = 'transporte'
$UTILIZADOR = 'transporte_app'

$logDir = Join-Path $App 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$log = Join-Path $logDir 'instalacao.log'

function Escrever($texto, $nivel = 'INFO') {
  $linha = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $nivel, $texto
  Add-Content -Path $log -Value $linha -Encoding utf8
  Write-Host $linha
}

function Falhar($texto) {
  Escrever $texto 'ERRO'
  exit 1
}

# ---------------------------------------------------------------- MySQL

function Encontrar-MySql {
  # 1) pelo serviço do Windows: dá o nome do serviço e o caminho real dos binários
  $servico = Get-CimInstance Win32_Service |
    Where-Object { $_.Name -match 'mysql|maria' -or $_.DisplayName -match 'mysql|maria' } |
    Sort-Object { $_.State -ne 'Running' } | Select-Object -First 1
  $bin = $null
  if ($servico -and $servico.PathName -match '"?([^"]*?\\bin)\\mysqld') { $bin = $Matches[1] }
  # 2) instalações sem serviço registado ou com caminho invulgar
  if (-not $bin -or -not (Test-Path (Join-Path $bin 'mysql.exe'))) {
    $bin = @(
      "$env:ProgramFiles\MySQL\*\bin", "${env:ProgramFiles(x86)}\MySQL\*\bin",
      'C:\xampp\mysql\bin', 'C:\laragon\bin\mysql\*\bin', "$env:ProgramFiles\MariaDB*\bin"
    ) | ForEach-Object { Get-ChildItem $_ -Directory -ErrorAction SilentlyContinue } |
      Where-Object { Test-Path (Join-Path $_.FullName 'mysql.exe') } |
      Select-Object -Last 1 -ExpandProperty FullName
  }
  if (-not $bin) { Falhar 'Não encontrei o MySQL neste computador. Instale-o ou indique a pasta manualmente no .env.' }
  foreach ($exe in 'mysql.exe', 'mysqldump.exe') {
    if (-not (Test-Path (Join-Path $bin $exe))) { Falhar "Encontrei a pasta do MySQL ($bin) mas falta o $exe." }
  }
  [pscustomobject]@{ Bin = $bin; Servico = $(if ($servico) { $servico.Name } else { '' }) }
}

function Correr-MySql($mysql, $utilizador, $senha, $porta, $sql, $ficheiro) {
  $env:MYSQL_PWD = $senha   # nunca na linha de comandos: não aparece na lista de processos
  try {
    $args = @('--host=127.0.0.1', "--port=$porta", "--user=$utilizador", '--default-character-set=utf8mb4', '--connect-timeout=10')
    if ($ficheiro) {
      $saida = Get-Content -Raw -Path $ficheiro | & $mysql @args 2>&1
    } else {
      $saida = & $mysql @args '-e' $sql 2>&1
    }
    return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Saida = ($saida | Out-String).Trim() }
  } finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  }
}

# senha só com letras e números: não precisa de escape no DATABASE_URL nem no SQL
function Nova-Senha([int]$bytes = 16) {
  -join (1..$bytes | ForEach-Object { '{0:x2}' -f (Get-Random -Minimum 0 -Maximum 256) })
}

# ---------------------------------------------------------------- dados do instalador

$cfg = @{}
if ($Dados) {
  if (-not (Test-Path $Dados)) { Falhar "Ficheiro de dados não encontrado: $Dados" }
  Get-Content $Dados -Encoding utf8 | ForEach-Object {
    # o Inno Setup pode escrever um BOM no início do ficheiro
    $l = $_ -replace "^﻿", ''
    if ($l -match '^\s*([^=#]+)=(.*)$') { $cfg[$Matches[1].Trim()] = $Matches[2] }
  }
}
$porta = if ($cfg.porta) { $cfg.porta } else { '3306' }
$rootUser = if ($cfg.utilizador) { $cfg.utilizador } else { 'root' }
$rootSenha = [string]$cfg.senha

$mysqlInfo = Encontrar-MySql
$mysql = Join-Path $mysqlInfo.Bin 'mysql.exe'
$mysqldump = Join-Path $mysqlInfo.Bin 'mysqldump.exe'

# ---------------------------------------------------------------- testar ligação

if ($Accao -eq 'testar') {
  $r = Correr-MySql $mysql $rootUser $rootSenha $porta 'SELECT VERSION();'
  if (-not $r.Ok) {
    Write-Host "Não foi possível ligar ao MySQL: $($r.Saida)"
    exit 1
  }
  Write-Host "Ligação OK. MySQL em $($mysqlInfo.Bin)$(if ($mysqlInfo.Servico) { ", serviço $($mysqlInfo.Servico)" })."
  exit 0
}

Escrever "=== $Accao === MySQL em $($mysqlInfo.Bin), serviço '$($mysqlInfo.Servico)', porta $porta"

# ---------------------------------------------------------------- pré-requisitos

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
# Node acabado de instalar pode ainda não estar no PATH desta sessão
if (-not $node -and (Test-Path "$env:ProgramFiles\nodejs\node.exe")) { $node = "$env:ProgramFiles\nodejs\node.exe" }
if (-not $node) { Falhar 'O Node.js não está instalado. Instale primeiro o node-v24.x-x64.msi que vai na pen.' }
Escrever "Node: $node ($(& $node -v))"
foreach ($f in 'dist\main.js', 'dist\prisma\seed.js', 'web\index.html', 'prisma\schema.prisma', 'node_modules\.bin\prisma.cmd', 'scripts\nssm.exe') {
  if (-not (Test-Path (Join-Path $App $f))) { Falhar "Pacote incompleto: falta $f" }
}
foreach ($d in 'logs', 'backups') {
  $p = Join-Path $App $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
}

$envPath = Join-Path $App '.env'
$cnfPath = Join-Path $App 'scripts\backup.cnf'

# ---------------------------------------------------------------- base de dados e ficheiros de configuração

if ($Accao -eq 'instalar') {
  $r = Correr-MySql $mysql $rootUser $rootSenha $porta 'SELECT VERSION();'
  if (-not $r.Ok) { Falhar "Não foi possível ligar ao MySQL com o utilizador '$rootUser': $($r.Saida)" }
  Escrever "Ligação ao MySQL confirmada (versão $($r.Saida -replace '\s+', ' '))."

  # a base já existe de uma instalação anterior? manter os dados e reaproveitar a senha do .env
  $existe = (Correr-MySql $mysql $rootUser $rootSenha $porta "SHOW DATABASES LIKE '$BASE';").Saida -match $BASE
  $senhaBD = $null
  if ($existe -and (Test-Path $envPath)) {
    $linha = (Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' })
    if ($linha -match "mysql://$UTILIZADOR`:([^@]+)@") { $senhaBD = $Matches[1] }
    Escrever "A base '$BASE' já existe: os dados são mantidos."
  }
  if (-not $senhaBD) { $senhaBD = Nova-Senha 16 }

  $sql = @"
CREATE DATABASE IF NOT EXISTS $BASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$UTILIZADOR'@'localhost' IDENTIFIED BY '$senhaBD';
CREATE USER IF NOT EXISTS '$UTILIZADOR'@'127.0.0.1' IDENTIFIED BY '$senhaBD';
ALTER USER '$UTILIZADOR'@'localhost' IDENTIFIED BY '$senhaBD';
ALTER USER '$UTILIZADOR'@'127.0.0.1' IDENTIFIED BY '$senhaBD';
GRANT ALL PRIVILEGES ON $BASE.* TO '$UTILIZADOR'@'localhost';
GRANT ALL PRIVILEGES ON $BASE.* TO '$UTILIZADOR'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
  $sqlTmp = Join-Path $env:TEMP "transporte_$(Get-Random).sql"
  try {
    Set-Content -Path $sqlTmp -Value $sql -Encoding utf8
    $r = Correr-MySql $mysql $rootUser $rootSenha $porta $null $sqlTmp
    if (-not $r.Ok) { Falhar "Não foi possível criar a base de dados: $($r.Saida)" }
  } finally {
    Remove-Item $sqlTmp -Force -ErrorAction SilentlyContinue
  }
  Escrever "Base '$BASE' e utilizador '$UTILIZADOR' prontos."

  $r = Correr-MySql $mysql $UTILIZADOR $senhaBD $porta "USE $BASE; SELECT 1;"
  if (-not $r.Ok) { Falhar "O utilizador '$UTILIZADOR' não consegue ligar-se à base: $($r.Saida)" }

  $adminSenha = if ($cfg.adminSenha) { $cfg.adminSenha } else { 'admin123' }
  $conteudoEnv = @"
NODE_ENV=production
PORT=3100
DATABASE_URL="mysql://$UTILIZADOR`:$senhaBD@127.0.0.1:$porta/$BASE"
JWT_SECRET=$(Nova-Senha 32)
WEB_DIR=web
MYSQLDUMP_PATH="$mysqldump"
MYSQL_PATH="$mysql"
MYSQL_CNF=$cnfPath
BACKUP_DIR_INICIAL=$App\backups
ADMIN_SENHA=$adminSenha
CHECKPOINT_DISABLE=1
PRISMA_HIDE_UPDATE_MESSAGE=1
"@
  [IO.File]::WriteAllText($envPath, $conteudoEnv, (New-Object Text.UTF8Encoding $false))

  $conteudoCnf = "[client]`r`nuser=$UTILIZADOR`r`npassword=$senhaBD`r`nhost=127.0.0.1`r`nport=$porta`r`ndefault-character-set=utf8mb4`r`n"
  [IO.File]::WriteAllText($cnfPath, $conteudoCnf, (New-Object Text.UTF8Encoding $false))

  # os dois ficheiros têm senhas: só SYSTEM e administradores podem lê-los
  foreach ($f in $envPath, $cnfPath) {
    icacls $f /inheritance:r /grant:r '*S-1-5-18:R' '*S-1-5-32-544:F' | Out-Null
  }
  Escrever 'Ficheiros .env e backup.cnf escritos e protegidos.'
} else {
  if (-not (Test-Path $envPath)) { Falhar 'Não encontrei o .env: use a instalação completa, não a actualização.' }
  Escrever 'Actualização: .env e base de dados mantidos.'
}

# ---------------------------------------------------------------- migrations e dados iniciais

Push-Location $App
try {
  $env:CHECKPOINT_DISABLE = '1'
  Escrever 'A aplicar migrations...'
  $saida = & (Join-Path $App 'node_modules\.bin\prisma.cmd') migrate deploy --schema=prisma\schema.prisma 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Falhar "As migrations falharam: $saida" }
  Escrever ($saida.Trim() -split "`n" | Select-Object -Last 1)

  Escrever 'A criar os dados iniciais...'
  $saida = & $node 'dist\prisma\seed.js' 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Falhar "A seed falhou: $saida" }
  Escrever $saida.Trim()
} finally {
  Pop-Location
}

# ---------------------------------------------------------------- serviço Windows

$nssm = Join-Path $App 'scripts\nssm.exe'
& $nssm stop $SVC 2>&1 | Out-Null
& $nssm remove $SVC confirm 2>&1 | Out-Null
& $nssm install $SVC $node "$App\dist\main.js" | Out-Null
& $nssm set $SVC AppDirectory $App | Out-Null
& $nssm set $SVC DisplayName 'Transporte Escolar' | Out-Null
& $nssm set $SVC Description 'Sistema de Gestão de Transporte Escolar (http://127.0.0.1:3100)' | Out-Null
& $nssm set $SVC Start SERVICE_AUTO_START | Out-Null
if ($mysqlInfo.Servico) { & $nssm set $SVC DependOnService $mysqlInfo.Servico | Out-Null }
& $nssm set $SVC AppEnvironmentExtra CHECKPOINT_DISABLE=1 | Out-Null
& $nssm set $SVC AppStdout "$App\logs\out.log" | Out-Null
& $nssm set $SVC AppStderr "$App\logs\err.log" | Out-Null
& $nssm set $SVC AppRotateFiles 1 | Out-Null
& $nssm set $SVC AppRotateBytes 5242880 | Out-Null
& $nssm set $SVC AppExit Default Restart | Out-Null
& $nssm set $SVC AppRestartDelay 5000 | Out-Null
& $nssm start $SVC | Out-Null
Escrever "Serviço '$SVC' instalado e iniciado$(if ($mysqlInfo.Servico) { " (depende de $($mysqlInfo.Servico))" })."

# ---------------------------------------------------------------- atalho e verificação final

$atalho = Join-Path $App 'scripts\criar-atalho.ps1'
if (Test-Path $atalho) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $atalho
  Escrever 'Atalho criado no ambiente de trabalho.'
}

$ok = $false
for ($i = 1; $i -le 20 -and -not $ok; $i++) {
  Start-Sleep -Seconds 2
  try { $ok = (Invoke-WebRequest 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {}
}
if (-not $ok) { Falhar "O sistema não respondeu em http://127.0.0.1:3100. Veja $App\logs\err.log" }

Escrever 'Instalação concluída: o sistema está a responder.'
exit 0
