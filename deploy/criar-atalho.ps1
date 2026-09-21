# Atalho no ambiente de trabalho: chama o lançador, que garante o serviço e abre o Edge em modo aplicação.
$app = Split-Path -Parent $PSScriptRoot
$perfil = "$env:ProgramData\TransporteApp\edge"
New-Item -ItemType Directory -Force -Path $perfil | Out-Null
icacls $perfil /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null   # Utilizadores: modificar

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:PUBLIC\Desktop\Transporte Escolar.lnk")
$lnk.TargetPath = Join-Path $app 'scripts\abrir.cmd'
$lnk.WindowStyle = 7   # minimizado: não mostra a janela preta do lançador
$lnk.Description = 'Abrir o sistema de transporte escolar'
if (Test-Path "$app\app.ico") { $lnk.IconLocation = "$app\app.ico" }
$lnk.WorkingDirectory = $app
$lnk.Save()
