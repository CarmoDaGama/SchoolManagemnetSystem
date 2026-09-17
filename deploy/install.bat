@echo off
rem Executar como administrador. Ver plan.md, seccao 9.
setlocal
set APP=C:\TransporteApp
set SVC=TransporteApp
rem Trocar pelo nome real do servico: sc query state= all | findstr /i mysql
set MYSQL_SVC=MySQL80
set CHECKPOINT_DISABLE=1
cd /d %APP%

where node >nul 2>&1 || (echo [ERRO] Node.js nao instalado. Instale o .msi da pen. & pause & exit /b 1)
if not exist "%APP%\.env" (echo [ERRO] Falta o ficheiro .env ^(copiar scripts\.env.example^) & pause & exit /b 1)
if not exist "%APP%\scripts\backup.cnf" (echo [ERRO] Falta scripts\backup.cnf ^(copiar scripts\backup.cnf.example^) & pause & exit /b 1)
if not exist "%APP%\node_modules\.bin\prisma.cmd" (echo [ERRO] Pacote incompleto: node_modules em falta & pause & exit /b 1)
sc query %MYSQL_SVC% >nul 2>&1 || (echo [ERRO] Servico MySQL "%MYSQL_SVC%" nao encontrado. Corrija MYSQL_SVC no topo deste ficheiro. & pause & exit /b 1)
if not exist logs mkdir logs
if not exist backups mkdir backups

rem backup.cnf tem a senha da base: so SYSTEM e administradores podem ler
icacls "%APP%\scripts\backup.cnf" /inheritance:r /grant:r *S-1-5-18:R *S-1-5-32-544:F >nul

echo [1/3] Migrations e dados iniciais...
call node_modules\.bin\prisma.cmd migrate deploy --schema=prisma\schema.prisma || goto :erro
call node dist\prisma\seed.js || goto :erro

echo [2/3] Servico Windows...
scripts\nssm.exe stop %SVC% >nul 2>&1
scripts\nssm.exe remove %SVC% confirm >nul 2>&1
for /f "delims=" %%i in ('where node') do (set NODE=%%i& goto :gotnode)
:gotnode
scripts\nssm.exe install %SVC% "%NODE%" "%APP%\dist\main.js"
scripts\nssm.exe set %SVC% AppDirectory "%APP%"
scripts\nssm.exe set %SVC% DisplayName "Transporte Escolar"
scripts\nssm.exe set %SVC% Start SERVICE_AUTO_START
scripts\nssm.exe set %SVC% DependOnService %MYSQL_SVC%
scripts\nssm.exe set %SVC% AppEnvironmentExtra CHECKPOINT_DISABLE=1
scripts\nssm.exe set %SVC% AppStdout "%APP%\logs\out.log"
scripts\nssm.exe set %SVC% AppStderr "%APP%\logs\err.log"
scripts\nssm.exe set %SVC% AppRotateFiles 1
scripts\nssm.exe set %SVC% AppRotateBytes 5242880
scripts\nssm.exe set %SVC% AppExit Default Restart
scripts\nssm.exe set %SVC% AppRestartDelay 5000
scripts\nssm.exe start %SVC% || goto :erro

echo [3/3] Atalho no ambiente de trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%\scripts\criar-atalho.ps1"

rem As copias de seguranca sao feitas pela propria aplicacao (Configuracao > Copias de seguranca).
timeout /t 8 >nul
powershell -NoProfile -Command "try{(Invoke-WebRequest http://127.0.0.1:3100/api/health -UseBasicParsing).StatusCode}catch{'FALHOU: veja logs\err.log'}"
echo Instalacao concluida.
pause
exit /b 0

:erro
echo [ERRO] Instalacao interrompida. Veja a mensagem acima e %APP%\logs\err.log
pause
exit /b 1
