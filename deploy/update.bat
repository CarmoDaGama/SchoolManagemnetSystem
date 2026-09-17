@echo off
rem Nova versao chega em pen: extrair o ZIP para C:\TransporteApp_novo e executar como administrador.
setlocal
set APP=C:\TransporteApp
set NOVO=C:\TransporteApp_novo\TransporteApp
if not exist "%NOVO%\dist\main.js" set NOVO=C:\TransporteApp_novo
if not exist "%NOVO%\dist\main.js" (echo [ERRO] Nao encontrei a nova versao em C:\TransporteApp_novo & pause & exit /b 1)

"%APP%\scripts\nssm.exe" stop TransporteApp
call "%APP%\scripts\backup.bat" || (echo Copia falhou, actualizacao cancelada & "%APP%\scripts\nssm.exe" start TransporteApp & pause & exit /b 1)
robocopy "%NOVO%\dist" "%APP%\dist" /MIR /NFL /NDL /NJH /NJS
robocopy "%NOVO%\web" "%APP%\web" /MIR /NFL /NDL /NJH /NJS
robocopy "%NOVO%\prisma" "%APP%\prisma" /MIR /NFL /NDL /NJH /NJS
copy /y "%NOVO%\package.json" "%APP%\" >nul
copy /y "%NOVO%\package-lock.json" "%APP%\" >nul
robocopy "%NOVO%\node_modules" "%APP%\node_modules" /MIR /NFL /NDL /NP /NJH /NJS
rem scripts: actualizar tudo excepto a configuracao local (backup.cnf) e o nssm em uso
robocopy "%NOVO%\scripts" "%APP%\scripts" /E /XF backup.cnf nssm.exe /NFL /NDL /NJH /NJS
cd /d %APP%
set CHECKPOINT_DISABLE=1
call node_modules\.bin\prisma.cmd migrate deploy --schema=prisma\schema.prisma || (echo [ERRO] migrations falharam & pause & exit /b 1)
"%APP%\scripts\nssm.exe" start TransporteApp
echo Actualizado.
pause
