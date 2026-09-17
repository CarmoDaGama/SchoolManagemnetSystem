@echo off
rem Emergencia: restauro com a aplicacao parada. Em uso normal, restaurar pelo sistema (Copias de seguranca).
setlocal
set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin
set APP=C:\TransporteApp
if "%~1"=="" (echo Uso: restore.bat caminho\ficheiro.sql & exit /b 1)
"%APP%\scripts\nssm.exe" stop TransporteApp
"%MYSQL_BIN%\mysql.exe" --defaults-extra-file=%APP%\scripts\backup.cnf --default-character-set=utf8mb4 transporte < "%~1"
if errorlevel 1 (echo [ERRO] Restauro falhou. & "%APP%\scripts\nssm.exe" start TransporteApp & pause & exit /b 1)
"%APP%\scripts\nssm.exe" start TransporteApp
echo Restauro concluido.
pause
