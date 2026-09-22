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

<#
  Encontra os programas do MySQL. O serviço do Windows é opcional: serve apenas para o serviço
  do sistema arrancar depois do MySQL. Há instalações (como a do KSoft) em que o MySQL vive
  dentro da pasta de outro programa, por isso a pasta pode ser indicada à mão.
#>
function Encontrar-MySql([string]$BinIndicado) {
  $servico = Get-CimInstance Win32_Service |
    Where-Object { $_.PathName -match 'mysqld|mariadbd' } |
    Sort-Object { $_.State -ne 'Running' } | Select-Object -First 1

  $candidatos = @()
  if ($BinIndicado) { $candidatos += $BinIndicado.Trim('"').TrimEnd('\') }
  # 1) pelo processo em execução: funciona mesmo sem serviço registado
  $candidatos += (Get-Process mysqld, mariadbd -ErrorAction SilentlyContinue | ForEach-Object { Split-Path $_.Path -Parent })
  # 2) pelo serviço
  if ($servico -and $servico.PathName -match '"?([^"]*?)\\(mysqld|mariadbd)') { $candidatos += $Matches[1] }
  # 3) pelos sítios habituais, incluindo MySQL dentro da pasta de outro programa
  $candidatos += @(
    "$env:ProgramFiles\MySQL\*\bin", "${env:ProgramFiles(x86)}\MySQL\*\bin",
    "$env:ProgramFiles\*\MysqlServer\bin", "${env:ProgramFiles(x86)}\*\MysqlServer\bin",
    "$env:ProgramFiles\MariaDB*\bin", "${env:ProgramFiles(x86)}\MariaDB*\bin",
    'C:\xampp\mysql\bin', 'C:\laragon\bin\mysql\*\bin', 'C:\tools\mysql\*\bin', 'C:\mysql\bin'
  ) | ForEach-Object { (Get-ChildItem $_ -Directory -ErrorAction SilentlyContinue).FullName }

  $bin = $candidatos | Where-Object { $_ -and (Test-Path (Join-Path $_ 'mysql.exe')) -and (Test-Path (Join-Path $_ 'mysqldump.exe')) } | Select-Object -First 1
  if (-not $bin) {
    if ($BinIndicado) { Falhar "Na pasta indicada ($BinIndicado) não estão o mysql.exe e o mysqldump.exe." }
    Falhar 'Não encontrei o MySQL neste computador. Indique a pasta bin do MySQL (a que tem o mysql.exe) no instalador.'
  }
  [pscustomobject]@{ Bin = $bin; Servico = $(if ($servico) { $servico.Name } else { '' }) }
}

<#
  Corre um programa externo com tempo limite. Nenhum passo pode deixar o instalador parado:
  se não terminar a tempo, a árvore de processos é terminada e o motivo fica no registo.
#>
function Executar {
  param(
    [string]$Exe, [string[]]$Argumentos = @(), [int]$Segundos = 120,
    [string]$Entrada = $null, [hashtable]$Ambiente = @{}, [string]$Pasta = $App
  )
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = ($Argumentos | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $true
  $psi.WorkingDirectory = $Pasta
  # variáveis só para o processo filho (ex.: MYSQL_PWD nunca aparece na linha de comandos)
  foreach ($k in $Ambiente.Keys) { $psi.EnvironmentVariables[$k] = [string]$Ambiente[$k] }
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync()
  $err = $p.StandardError.ReadToEndAsync()
  if ($Entrada) { $p.StandardInput.Write($Entrada) }
  $p.StandardInput.Close()   # nunca deixar um programa à espera de teclado
  if (-not $p.WaitForExit($Segundos * 1000)) {
    & taskkill.exe /T /F /PID $p.Id 2>&1 | Out-Null
    return [pscustomobject]@{ Ok = $false; Codigo = -1; Saida = "$([IO.Path]::GetFileName($Exe)) não terminou em $Segundos s e foi interrompido." }
  }
  $p.WaitForExit()
  [pscustomobject]@{ Ok = ($p.ExitCode -eq 0); Codigo = $p.ExitCode; Saida = ($out.Result + "`n" + $err.Result).Trim() }
}

function Correr-MySql($mysql, $utilizador, $senha, $porta, $sql, $ficheiro) {
  $opcoes = @('--host=127.0.0.1', "--port=$porta", "--user=$utilizador", '--default-character-set=utf8mb4', '--connect-timeout=10', '--batch', '--skip-column-names')
  $entrada = $null
  if ($ficheiro) { $entrada = Get-Content -Raw -Path $ficheiro } else { $opcoes += @('-e', $sql) }
  $r = Executar -Exe $mysql -Argumentos $opcoes -Segundos 60 -Entrada $entrada -Ambiente @{ MYSQL_PWD = $senha }
  # o aviso de senha em variável de ambiente não é erro
  $r.Saida = (($r.Saida -split "`n") | Where-Object { $_ -notmatch 'Using a password|MYSQL_PWD|\[Warning\]' }) -join "`n"
  $r
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

$mysqlInfo = Encontrar-MySql ([string]$cfg.mysqlBin)
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
  $versao = ($r.Saida -split '\s+')[0]
  Escrever "Ligação ao MySQL confirmada (versão $versao)."
  # CREATE USER IF NOT EXISTS e ALTER USER só existem a partir do MySQL 5.7.6;
  # antes disso (5.6, como o do cliente) o utilizador cria-se com GRANT ... IDENTIFIED BY
  $n = $versao -split '[.-]'
  $antigo = ($versao -notmatch 'MariaDB') -and ([int]$n[0] -lt 5 -or ([int]$n[0] -eq 5 -and ([int]$n[1] -lt 7 -or ([int]$n[1] -eq 7 -and [int]$n[2] -lt 6))))

  # a base já existe de uma instalação anterior? manter os dados e reaproveitar a senha do .env
  $existe = (Correr-MySql $mysql $rootUser $rootSenha $porta "SHOW DATABASES LIKE '$BASE';").Saida -match $BASE
  $senhaBD = $null
  if ($existe -and (Test-Path $envPath)) {
    $linha = (Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' })
    if ($linha -match "mysql://$UTILIZADOR`:([^@]+)@") { $senhaBD = $Matches[1] }
    Escrever "A base '$BASE' já existe: os dados são mantidos."
  }
  if (-not $senhaBD) { $senhaBD = Nova-Senha 16 }

  $sql = "CREATE DATABASE IF NOT EXISTS $BASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`r`n"
  foreach ($maquina in 'localhost', '127.0.0.1') {
    if ($antigo) {
      $sql += "GRANT ALL PRIVILEGES ON $BASE.* TO '$UTILIZADOR'@'$maquina' IDENTIFIED BY '$senhaBD';`r`n"
    } else {
      $sql += "CREATE USER IF NOT EXISTS '$UTILIZADOR'@'$maquina' IDENTIFIED BY '$senhaBD';`r`n"
      $sql += "ALTER USER '$UTILIZADOR'@'$maquina' IDENTIFIED BY '$senhaBD';`r`n"
      $sql += "GRANT ALL PRIVILEGES ON $BASE.* TO '$UTILIZADOR'@'$maquina';`r`n"
    }
  }
  $sql += 'FLUSH PRIVILEGES;'
  $sqlTmp = Join-Path $env:TEMP "transporte_$(Get-Random).sql"
  try {
    Set-Content -Path $sqlTmp -Value $sql -Encoding utf8
    $r = Correr-MySql $mysql $rootUser $rootSenha $porta $null $sqlTmp
    if (-not $r.Ok) { Falhar "Não foi possível criar a base de dados: $($r.Saida)" }
  } finally {
    Remove-Item $sqlTmp -Force -ErrorAction SilentlyContinue
  }
  Escrever "Base '$BASE' e utilizador '$UTILIZADOR' prontos."

  # mysqldump recente (MySQL 8.0.32+, 8.4, 9.x) faz FLUSH TABLES com --single-transaction e exige
  # o privilégio global FLUSH_TABLES. Não dá acesso a outras bases. Em servidores antigos ou MariaDB
  # o privilégio não existe, mas o mysqldump também não o pede: o erro é ignorado.
  if (-not $antigo) {
    $flush = "GRANT FLUSH_TABLES ON *.* TO '$UTILIZADOR'@'localhost'; GRANT FLUSH_TABLES ON *.* TO '$UTILIZADOR'@'127.0.0.1'; FLUSH PRIVILEGES;"
    $r = Correr-MySql $mysql $rootUser $rootSenha $porta $flush
    if ($r.Ok) { Escrever 'Privilégio FLUSH_TABLES concedido (necessário às cópias de segurança).' }
    else { Escrever "FLUSH_TABLES não disponível neste MySQL: $($r.Saida)" 'AVISO' }
  }

  $r = Correr-MySql $mysql $UTILIZADOR $senhaBD $porta "USE $BASE; SELECT 1;"
  if (-not $r.Ok) { Falhar "O utilizador '$UTILIZADOR' não consegue ligar-se à base: $($r.Saida)" }

  $adminSenha = if ($cfg.adminSenha) { $cfg.adminSenha } else { 'admin123' }
  # caminhos Windows entre aspas simples: com aspas duplas o Node transforma "\n" (ex.: C:\nova) em mudança de linha
  $conteudoEnv = @"
NODE_ENV=production
PORT=3100
DATABASE_URL="mysql://$UTILIZADOR`:$senhaBD@127.0.0.1:$porta/$BASE"
JWT_SECRET=$(Nova-Senha 32)
WEB_DIR=web
MYSQLDUMP_PATH='$mysqldump'
MYSQL_PATH='$mysql'
MYSQL_CNF='$cnfPath'
BACKUP_DIR_INICIAL='$App\backups'
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

$ambienteNode = @{ CHECKPOINT_DISABLE = '1'; PRISMA_HIDE_UPDATE_MESSAGE = '1' }

# prisma chamado directamente pelo node (sem prisma.cmd): nenhum cmd.exe intermédio fica pendurado
$prismaCli = Join-Path $App 'node_modules\prisma\build\index.js'
Escrever 'A aplicar migrations...'
$r = Executar -Exe $node -Argumentos @($prismaCli, 'migrate', 'deploy', '--schema=prisma\schema.prisma') -Segundos 300 -Ambiente $ambienteNode
if (-not $r.Ok) { Falhar "As migrations falharam: $($r.Saida)" }
Escrever (($r.Saida -split "`n" | Where-Object { $_.Trim() }) | Select-Object -Last 1)

Escrever 'A criar os dados iniciais...'
$r = Executar -Exe $node -Argumentos @('dist\prisma\seed.js') -Segundos 120 -Ambiente $ambienteNode
if (-not $r.Ok) { Falhar "A seed falhou: $($r.Saida)" }
Escrever $r.Saida

# ---------------------------------------------------------------- serviço Windows

$nssm = Join-Path $App 'scripts\nssm.exe'
function Nssm([string[]]$a, [switch]$Tolerar) {
  $r = Executar -Exe $nssm -Argumentos $a -Segundos 60
  if (-not $r.Ok -and -not $Tolerar) { Falhar "nssm $($a -join ' ') falhou: $($r.Saida)" }
}

Escrever 'A instalar o serviço Windows...'
Nssm @('stop', $SVC) -Tolerar
Nssm @('remove', $SVC, 'confirm') -Tolerar
Nssm @('install', $SVC, $node, "$App\dist\main.js")
Nssm @('set', $SVC, 'AppDirectory', $App)
Nssm @('set', $SVC, 'DisplayName', 'Transporte Escolar')
Nssm @('set', $SVC, 'Description', 'Sistema de Transporte Escolar (http://127.0.0.1:3100)')
Nssm @('set', $SVC, 'Start', 'SERVICE_AUTO_START')
if ($mysqlInfo.Servico) { Nssm @('set', $SVC, 'DependOnService', $mysqlInfo.Servico) }
Nssm @('set', $SVC, 'AppEnvironmentExtra', 'CHECKPOINT_DISABLE=1')
Nssm @('set', $SVC, 'AppStdout', "$App\logs\out.log")
Nssm @('set', $SVC, 'AppStderr', "$App\logs\err.log")
Nssm @('set', $SVC, 'AppRotateFiles', '1')
Nssm @('set', $SVC, 'AppRotateBytes', '5242880')
Nssm @('set', $SVC, 'AppExit', 'Default', 'Restart')
Nssm @('set', $SVC, 'AppRestartDelay', '5000')
Escrever 'A iniciar o serviço...'
Nssm @('start', $SVC) -Tolerar   # o arranque pode demorar; a verificação final confirma
Escrever "Serviço '$SVC' instalado$(if ($mysqlInfo.Servico) { " (depende de $($mysqlInfo.Servico))" })."

# ---------------------------------------------------------------- atalho e verificação final

$atalho = Join-Path $App 'scripts\criar-atalho.ps1'
if (Test-Path $atalho) {
  $r = Executar -Exe 'powershell.exe' -Argumentos @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $atalho) -Segundos 60
  if ($r.Ok) { Escrever 'Atalho criado no ambiente de trabalho.' } else { Escrever "Não foi possível criar o atalho: $($r.Saida)" 'AVISO' }
}

Escrever 'A confirmar que o sistema responde...'
$ok = $false
for ($i = 1; $i -le 20 -and -not $ok; $i++) {
  Start-Sleep -Seconds 2
  try { $ok = (Invoke-WebRequest 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {}
}
if (-not $ok) { Falhar "O sistema não respondeu em http://127.0.0.1:3100. Veja $App\logs\err.log" }

Escrever 'Instalação concluída: o sistema está a responder.'
exit 0
