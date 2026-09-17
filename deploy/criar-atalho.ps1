$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$perfil = "$env:ProgramData\TransporteApp\edge"
New-Item -ItemType Directory -Force -Path $perfil | Out-Null
icacls $perfil /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null   # Utilizadores: modificar

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:PUBLIC\Desktop\Transporte Escolar.lnk")
$lnk.TargetPath = $edge
$lnk.Arguments = "--app=http://127.0.0.1:3100/ --user-data-dir=`"$perfil`" --no-first-run --disable-features=msEdgeSidebarV2"
if (Test-Path "C:\TransporteApp\app.ico") { $lnk.IconLocation = "C:\TransporteApp\app.ico" }
$lnk.WorkingDirectory = "C:\TransporteApp"
$lnk.Save()
