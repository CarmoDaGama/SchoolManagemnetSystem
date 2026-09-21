@echo off
rem Lançador do Transporte Escolar: garante que o serviço está a correr e abre a janela da aplicação.
setlocal
set APP=%~dp0..
set SVC=TransporteApp
set URL=http://127.0.0.1:3100/

rem 1) o sistema já responde?
powershell -NoProfile -Command "try{ (Invoke-WebRequest '%URL%api/health' -UseBasicParsing -TimeoutSec 3) | Out-Null; exit 0 }catch{ exit 1 }"
if not errorlevel 1 goto :abrir

rem 2) tentar iniciar o serviço (pede elevação se for preciso)
echo A iniciar o sistema, aguarde...
sc query %SVC% >nul 2>&1 || (
  echo [ERRO] O servico %SVC% nao esta instalado. Volte a executar o instalador.
  pause & exit /b 1
)
net start %SVC% >nul 2>&1 || powershell -NoProfile -Command "Start-Process sc.exe -ArgumentList 'start','%SVC%' -Verb RunAs -Wait" >nul 2>&1

rem 3) esperar até 40 s (o MySQL pode ainda estar a arrancar)
for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try{ (Invoke-WebRequest '%URL%api/health' -UseBasicParsing -TimeoutSec 3) | Out-Null; exit 0 }catch{ exit 1 }"
  if not errorlevel 1 goto :abrir
  timeout /t 2 >nul
)
echo [ERRO] O sistema nao respondeu. Veja %APP%\logs\err.log
pause & exit /b 1

:abrir
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" (
  start "" "%URL%"
  exit /b 0
)
set PERFIL=%ProgramData%\TransporteApp\edge
start "" "%EDGE%" --app=%URL% --user-data-dir="%PERFIL%" --no-first-run --no-default-browser-check --disable-features=msEdgeSidebarV2,Translate --disable-background-mode --start-maximized
exit /b 0
