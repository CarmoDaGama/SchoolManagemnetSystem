@echo off
rem Emergencia / actualizacoes: copia com a aplicacao parada. As copias diarias sao feitas pela aplicacao.
setlocal
rem Caminho do MySQL definido uma unica vez (ajustar se a versao for outra)
set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin
set APP=C:\TransporteApp
set DEST=%APP%\backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
if not exist "%DEST%" mkdir "%DEST%"
"%MYSQL_BIN%\mysqldump.exe" --defaults-extra-file=%APP%\scripts\backup.cnf --single-transaction --routines --triggers --no-tablespaces --default-character-set=utf8mb4 --result-file="%DEST%\transporte_%TS%.sql" transporte
if errorlevel 1 (echo FALHOU & exit /b 1)
echo OK: %DEST%\transporte_%TS%.sql
exit /b 0
