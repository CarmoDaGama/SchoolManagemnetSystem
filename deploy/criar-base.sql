-- Base e utilizador dedicados. Usar com:
--   mysql.exe -u root -p < criar-base.sql
-- Trocar TROCAR_SENHA_FORTE pela senha escolhida (só letras e números).
--
-- Este ficheiro é para MySQL 5.7.6 ou mais recente.
-- Em MySQL 5.6 (ou anterior) não existem CREATE USER IF NOT EXISTS nem ALTER USER:
-- usar antes as duas linhas comentadas no fim.

CREATE DATABASE IF NOT EXISTS transporte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'transporte_app'@'localhost' IDENTIFIED BY 'TROCAR_SENHA_FORTE';
CREATE USER IF NOT EXISTS 'transporte_app'@'127.0.0.1' IDENTIFIED BY 'TROCAR_SENHA_FORTE';
GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'localhost';
GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'127.0.0.1';

-- MySQL 8.0.32 ou mais recente: o mysqldump precisa deste privilégio para as cópias de segurança.
-- Em versões anteriores dá erro e pode ser ignorado.
GRANT FLUSH_TABLES ON *.* TO 'transporte_app'@'localhost';
GRANT FLUSH_TABLES ON *.* TO 'transporte_app'@'127.0.0.1';

FLUSH PRIVILEGES;

-- MySQL 5.6, em vez dos CREATE USER e dos GRANT acima:
-- GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'localhost' IDENTIFIED BY 'TROCAR_SENHA_FORTE';
-- GRANT ALL PRIVILEGES ON transporte.* TO 'transporte_app'@'127.0.0.1' IDENTIFIED BY 'TROCAR_SENHA_FORTE';
-- FLUSH PRIVILEGES;
