# Instalação manual no PC do cliente

Guia para instalar o Transporte Escolar sem o instalador, a partir do `TransporteApp.zip`. Serve quando o instalador falha ou quando o MySQL do cliente é antigo ou está numa pasta invulgar.

Este guia usa como exemplo o PC deste cliente: **MySQL 5.6.31 de 32 bits**, instalado pelo `SetupScript.iss` do KSoft, com o serviço `MysqlKsoft` e os programas em `C:\Program Files (x86)\Msys\MysqlServer\bin`. Ajusta os caminhos se forem outros.

Símbolos: 🛑 pára e resolve antes de continuar.

---

## 0. Antes de tudo: o Windows é de 64 bits?

```powershell
(Get-CimInstance Win32_OperatingSystem).OSArchitecture
```

🛑 **Se responder "32 bits", pára aqui.** O Node.js 24 e o Prisma não existem para Windows de 32 bits e o sistema não arranca. É preciso decidir outra solução (Windows de 64 bits, outro computador, ou reescrever o backend noutra tecnologia).

O MySQL ser de 32 bits (`win32`) não é problema: corre bem num Windows de 64 bits.

## 1. Cópia de segurança do MySQL que já existe

Ainda antes de instalar seja o que for, guarda tudo o que o cliente já tem. No **PowerShell como administrador**:

```powershell
$bin = "C:\Program Files (x86)\Msys\MysqlServer\bin"
mkdir C:\copia-antes-instalacao
& "$bin\mysqldump.exe" -u root -p --all-databases --single-transaction --routines --triggers --result-file=C:\copia-antes-instalacao\todas.sql
```

Se o root não tiver senha, tira o `-p`. Copia também este ficheiro para a tua pen.

Confirma que não existe já uma base chamada `transporte`:

```powershell
& "$bin\mysql.exe" -u root -p -e "SHOW DATABASES;"
```

🛑 Se aparecer `transporte` de outro programa, pára: é preciso escolher outro nome para a base.

Aproveita e aponta a versão e a porta:

```powershell
& "$bin\mysql.exe" -u root -p -e "SELECT VERSION(); SHOW VARIABLES LIKE 'port';"
```

## 2. Instalar o Node.js 24

Corre o `node-v24.x.x-x64.msi` da pen, com as opções por omissão. **Desmarca** "Tools for native modules", que tenta descarregar da internet.

Confirma numa janela **nova**:

```powershell
node -v
```

## 3. Extrair o sistema

Extrai o `TransporteApp.zip` para `C:\`, de modo a ficar `C:\TransporteApp\dist`, `C:\TransporteApp\web`, etc.

Confirma primeiro que o ficheiro não veio corrompido, comparando com o `.sha256`:

```powershell
certutil -hashfile E:\TransporteApp.zip SHA256
```

## 4. Gerar as senhas

```powershell
$senhaBD = -join (1..12 | % { '{0:x2}' -f (Get-Random -Max 256) }); $senhaBD
$jwt     = -join (1..32 | % { '{0:x2}' -f (Get-Random -Max 256) }); $jwt
```

Guarda as duas num gestor de senhas. Só têm letras e números, por isso não dão problemas nos ficheiros de configuração.

## 5. Criar a base de dados e o utilizador

O MySQL 5.6 **não suporta** `CREATE USER IF NOT EXISTS` nem `ALTER USER`. Usa esta versão, que funciona no 5.6 (no MySQL 8 usa antes o `scripts\criar-base.sql`):

```powershell
$sql = @"
CREATE DATABASE IF NOT EXISTS transporte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'localhost' IDENTIFIED BY '$senhaBD';
GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'127.0.0.1' IDENTIFIED BY '$senhaBD';
FLUSH PRIVILEGES;
"@
$sql | & "$bin\mysql.exe" -u root -p
```

Confirma que o novo utilizador entra:

```powershell
& "$bin\mysql.exe" -u transporte_app -p"$senhaBD" -e "USE transporte; SELECT 1;"
```

## 6. Ficheiros de configuração

```powershell
cd C:\TransporteApp
copy scripts\.env.example .env
copy scripts\backup.cnf.example scripts\backup.cnf
notepad .env
```

No `.env`, com os caminhos deste cliente:

```
NODE_ENV=production
PORT=3100
DATABASE_URL="mysql://transporte_app:COLA_AQUI_A_SENHA_DA_BASE@127.0.0.1:3306/transporte"
JWT_SECRET=COLA_AQUI_O_JWT
WEB_DIR=web
MYSQLDUMP_PATH='C:\Program Files (x86)\Msys\MysqlServer\bin\mysqldump.exe'
MYSQL_PATH='C:\Program Files (x86)\Msys\MysqlServer\bin\mysql.exe'
MYSQL_CNF='C:\TransporteApp\scripts\backup.cnf'
BACKUP_DIR_INICIAL='C:\TransporteApp\backups'
ADMIN_SENHA=senha temporária do admin
CHECKPOINT_DISABLE=1
PRISMA_HIDE_UPDATE_MESSAGE=1
```

Os caminhos vão entre **aspas simples**. Com aspas duplas, o Node transforma a sequência barra-n numa mudança de linha e o caminho fica estragado.

No `scripts\backup.cnf`:

```
[client]
user=transporte_app
password=COLA_AQUI_A_SENHA_DA_BASE
host=127.0.0.1
port=3306
default-character-set=utf8mb4
```

Protege os dois ficheiros, que têm senhas:

```powershell
icacls C:\TransporteApp\.env /inheritance:r /grant:r "*S-1-5-18:R" "*S-1-5-32-544:F"
icacls C:\TransporteApp\scripts\backup.cnf /inheritance:r /grant:r "*S-1-5-18:R" "*S-1-5-32-544:F"
```

## 7. Criar as tabelas e o utilizador admin

```powershell
cd C:\TransporteApp
$env:CHECKPOINT_DISABLE = "1"
node node_modules\prisma\build\index.js migrate deploy --schema=prisma\schema.prisma
node dist\prisma\seed.js
```

O primeiro comando deve terminar com "All migrations have been successfully applied"; o segundo com "Seed: admin, empresa e configuração de cópias garantidos".

Testa que o sistema arranca, antes de o pôr como serviço:

```powershell
node dist\main.js
```

Abre `http://127.0.0.1:3100/` noutra janela. Se aparecer o ecrã de entrada, fecha com Ctrl+C.

## 8. Instalar o serviço do Windows

O serviço faz o sistema arrancar com o computador e reiniciar sozinho se parar.

```powershell
cd C:\TransporteApp
$node = (Get-Command node.exe).Source
scripts\nssm.exe install TransporteApp "$node" C:\TransporteApp\dist\main.js
scripts\nssm.exe set TransporteApp AppDirectory C:\TransporteApp
scripts\nssm.exe set TransporteApp DisplayName "Transporte Escolar"
scripts\nssm.exe set TransporteApp Start SERVICE_AUTO_START
scripts\nssm.exe set TransporteApp AppStdout C:\TransporteApp\logs\out.log
scripts\nssm.exe set TransporteApp AppStderr C:\TransporteApp\logs\err.log
scripts\nssm.exe set TransporteApp AppRotateFiles 1
scripts\nssm.exe set TransporteApp AppRotateBytes 5242880
scripts\nssm.exe set TransporteApp AppExit Default Restart
scripts\nssm.exe set TransporteApp AppRestartDelay 5000
```

Se o MySQL tiver serviço próprio (aqui chama-se `MysqlKsoft`), diz ao sistema para arrancar depois dele. Se não houver serviço, **salta esta linha**: o sistema tenta ligar-se à base durante 1 minuto ao arrancar e o NSSM reinicia-o se for preciso.

```powershell
scripts\nssm.exe set TransporteApp DependOnService MysqlKsoft
scripts\nssm.exe start TransporteApp
```

Confirma:

```powershell
(Invoke-WebRequest http://127.0.0.1:3100/api/health -UseBasicParsing).StatusCode   # tem de dar 200
```

## 9. Atalho e arranque

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\TransporteApp\scripts\criar-atalho.ps1
```

**Reinicia o Windows** e confirma que o atalho "Transporte Escolar" abre o sistema sozinho, sem ninguém iniciar nada.

## 10. Configuração com o cliente

No sistema, como `admin`:

1. Configuração › Empresa: dados, logótipo e o separador Financeiro (dia limite, multa, taxas).
2. Configuração › Anos lectivos: criar e activar o ano.
3. Rotas: uma linha por rota, com motorista, viatura, lugares e mensalidade.
4. Configuração › Cópias de segurança: indicar a pasta da pen, carregar em "Verificar pasta" e depois em "Fazer cópia agora". Confirmar que o ficheiro aparece na pen.
5. Alunos: importar o Excel ou registar à mão.
6. O cliente troca a senha do `admin` (menu em baixo à esquerda › Senha).

## 11. Antes de devolver o computador

- Dados de teste apagados. O mais simples é apagar e recriar a base, e repetir o passo 7:
  ```powershell
  & "$bin\mysql.exe" -u root -p -e "DROP DATABASE transporte; CREATE DATABASE transporte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  ```
- Os outros programas do cliente continuam a funcionar.
- `C:\copia-antes-instalacao` guardada até o termo de aceitação estar assinado.

---

## Se alguma coisa falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `migrate deploy` dá erro de ligação | senha ou porta erradas no `.env` | testar com `mysql.exe -u transporte_app -p` |
| `You have an error in your SQL syntax ... IF NOT EXISTS` | MySQL 5.6 com a sintaxe do 8 | usar o SQL do passo 5 |
| `Unknown column type JSON` | versão antiga do pacote | usar um ZIP posterior a 22/09/2026 |
| `Error: P3009 ... migration ... failed` | uma tentativa anterior falhou a meio e deixou marca na base | ver "Repetir uma instalação que falhou", em baixo |
| O serviço não arranca | ver `C:\TransporteApp\logs\err.log` | quase sempre é o `.env` |
| `ECONNREFUSED` depois de reiniciar | o MySQL ainda não tinha arrancado | `DependOnService` no passo 8 |
| A cópia de segurança falha | caminho do `mysqldump` ou `backup.cnf` errados | ver o histórico em Configuração › Cópias de segurança |
| A cópia falha com `RELOAD or FLUSH_TABLES` | MySQL 8.0.32 ou mais recente | `GRANT FLUSH_TABLES ON *.* TO 'transporte_app'@'localhost';` |
| Acentos estragados nas listas | base criada sem `utf8mb4` | recriar a base como no passo 5 |
| A porta 3100 está ocupada | outro programa | `netstat -ano \| findstr :3100`, mudar `PORT` no `.env` e no atalho |

## Repetir uma instalação que falhou (erro P3009)

Se uma tentativa anterior falhou a meio das migrations, o Prisma guarda essa marca na base e recusa-se a continuar, mesmo já com o problema resolvido:

```
Error: P3009
The `20260917094730_init` migration started at ... failed
```

**Se a base ainda não tem dados reais** (é o caso quando nunca chegaste a entrar no sistema), a saída limpa é recriá-la:

```powershell
$bin = "C:\Program Files (x86)\KSoft\MysqlServer\bin"
& "$bin\mysql.exe" -u root -p -e "DROP DATABASE transporte; CREATE DATABASE transporte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

cd C:\TransporteApp
$env:CHECKPOINT_DISABLE = "1"
node node_modules\prisma\build\index.js migrate deploy --schema=prisma\schema.prisma
node dist\prisma\seed.js
```

As permissões do `transporte_app` continuam válidas: os `GRANT` não se perdem quando a base é apagada.

🛑 **Se a base já tiver dados reais** (alunos, pagamentos), não faças isto. Restaura primeiro a última cópia de segurança e só depois trata da migration.

Confirma primeiro se há dados:

```powershell
& "$bin\mysql.exe" -u root -p -e "SELECT COUNT(*) FROM transporte.Aluno;"
```

O instalador faz esta recuperação sozinho, mas só quando a base está vazia.

## Actualizar mais tarde

```powershell
C:\TransporteApp\scripts\backup.bat
C:\TransporteApp\scripts\nssm.exe stop TransporteApp
robocopy C:\TransporteApp_novo\dist C:\TransporteApp\dist /MIR
robocopy C:\TransporteApp_novo\web C:\TransporteApp\web /MIR
robocopy C:\TransporteApp_novo\prisma C:\TransporteApp\prisma /MIR
robocopy C:\TransporteApp_novo\node_modules C:\TransporteApp\node_modules /MIR
cd C:\TransporteApp
node node_modules\prisma\build\index.js migrate deploy --schema=prisma\schema.prisma
C:\TransporteApp\scripts\nssm.exe start TransporteApp
```

O `.env`, o `backup.cnf` e a base de dados não se tocam.
