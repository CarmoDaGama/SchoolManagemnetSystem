-- CreateTable
CREATE TABLE `Utilizador` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `senhaHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OPERADOR') NOT NULL DEFAULT 'OPERADOR',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Utilizador_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Empresa` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `nome` VARCHAR(191) NOT NULL,
    `nif` VARCHAR(191) NULL,
    `endereco` VARCHAR(191) NULL,
    `telefone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `logotipo` LONGTEXT NULL,
    `moeda` VARCHAR(191) NOT NULL DEFAULT 'Kz',
    `diaLimite` INTEGER NOT NULL DEFAULT 10,
    `diasTolerancia` INTEGER NOT NULL DEFAULT 0,
    `tipoMulta` ENUM('PERCENTAGEM', 'VALOR_FIXO') NOT NULL DEFAULT 'PERCENTAGEM',
    `multaValor` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxaInscricao` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxaConfirmacao` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `configurada` BOOLEAN NOT NULL DEFAULT false,
    `actualizadoEm` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnoLectivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `anoInicio` INTEGER NOT NULL,
    `mesInicio` INTEGER NOT NULL DEFAULT 9,
    `mesesServico` INTEGER NOT NULL DEFAULT 10,
    `activo` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `AnoLectivo_nome_key`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `turno` ENUM('MANHA', 'TARDE', 'MANHA_E_TARDE') NOT NULL DEFAULT 'MANHA_E_TARDE',
    `motorista` VARCHAR(191) NULL,
    `telefoneMotorista` VARCHAR(191) NULL,
    `viatura` VARCHAR(191) NULL,
    `capacidade` INTEGER NOT NULL DEFAULT 30,
    `valorMensal` DECIMAL(12, 2) NOT NULL,
    `paragens` TEXT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Rota_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Encarregado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `telefone` VARCHAR(191) NOT NULL,
    `telefoneAlt` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `parentesco` VARCHAR(191) NULL,
    `morada` VARCHAR(191) NULL,

    INDEX `Encarregado_nome_idx`(`nome`),
    INDEX `Encarregado_telefone_idx`(`telefone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Aluno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `dataNascimento` DATE NULL,
    `genero` ENUM('M', 'F') NULL,
    `colegio` VARCHAR(191) NULL,
    `classe` VARCHAR(191) NULL,
    `turma` VARCHAR(191) NULL,
    `morada` VARCHAR(191) NULL,
    `pontoReferencia` VARCHAR(191) NULL,
    `observacoes` TEXT NULL,
    `encarregadoId` INTEGER NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Aluno_numero_key`(`numero`),
    INDEX `Aluno_nome_idx`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inscricao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alunoId` INTEGER NOT NULL,
    `anoLectivoId` INTEGER NOT NULL,
    `rotaId` INTEGER NOT NULL,
    `tipo` ENUM('NOVA', 'CONFIRMACAO') NOT NULL DEFAULT 'NOVA',
    `estado` ENUM('ACTIVA', 'SUSPENSA', 'CANCELADA') NOT NULL DEFAULT 'ACTIVA',
    `sentido` ENUM('IDA_E_VOLTA', 'SO_IDA', 'SO_VOLTA') NOT NULL DEFAULT 'IDA_E_VOLTA',
    `pontoRecolha` VARCHAR(191) NULL,
    `horaRecolha` VARCHAR(191) NULL,
    `mesEntrada` DATE NOT NULL,
    `valorMensal` DECIMAL(12, 2) NOT NULL,
    `valorEspecial` BOOLEAN NOT NULL DEFAULT false,
    `motivoValor` VARCHAR(191) NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Inscricao_rotaId_estado_idx`(`rotaId`, `estado`),
    UNIQUE INDEX `Inscricao_alunoId_anoLectivoId_key`(`alunoId`, `anoLectivoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cobranca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inscricaoId` INTEGER NOT NULL,
    `tipo` ENUM('INSCRICAO', 'CONFIRMACAO', 'MENSALIDADE') NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `referencia` DATE NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `vencimento` DATE NOT NULL,
    `estado` ENUM('PENDENTE', 'PAGA', 'ISENTA', 'ANULADA') NOT NULL DEFAULT 'PENDENTE',
    `motivo` VARCHAR(191) NULL,

    INDEX `Cobranca_estado_vencimento_idx`(`estado`, `vencimento`),
    INDEX `Cobranca_referencia_idx`(`referencia`),
    UNIQUE INDEX `Cobranca_inscricaoId_tipo_referencia_key`(`inscricaoId`, `tipo`, `referencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pagamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numeroRecibo` VARCHAR(191) NOT NULL,
    `inscricaoId` INTEGER NOT NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metodo` ENUM('NUMERARIO', 'TPA', 'TRANSFERENCIA', 'MULTICAIXA_EXPRESS') NOT NULL,
    `referenciaBanc` VARCHAR(191) NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `multa` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `desconto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `estado` ENUM('VALIDO', 'ANULADO') NOT NULL DEFAULT 'VALIDO',
    `motivoAnulacao` VARCHAR(191) NULL,
    `anuladoEm` DATETIME(3) NULL,
    `utilizadorId` INTEGER NOT NULL,
    `anuladoPorId` INTEGER NULL,

    UNIQUE INDEX `Pagamento_numeroRecibo_key`(`numeroRecibo`),
    INDEX `Pagamento_data_idx`(`data`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PagamentoItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pagamentoId` INTEGER NOT NULL,
    `cobrancaId` INTEGER NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `multa` DECIMAL(12, 2) NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConfigBackup` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `hora` VARCHAR(191) NOT NULL DEFAULT '13:00',
    `pastaLocal` VARCHAR(191) NOT NULL DEFAULT 'C:\TransporteApp\backups',
    `pastaExterna` VARCHAR(191) NULL,
    `retencaoDias` INTEGER NOT NULL DEFAULT 30,
    `actualizadoEm` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistoBackup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `origem` ENUM('AGENDADO', 'MANUAL', 'ANTES_RESTAURO') NOT NULL,
    `inicio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fim` DATETIME(3) NULL,
    `sucesso` BOOLEAN NOT NULL DEFAULT false,
    `ficheiro` VARCHAR(191) NULL,
    `tamanhoBytes` INTEGER NULL,
    `copiadoExterno` BOOLEAN NOT NULL DEFAULT false,
    `aviso` TEXT NULL,
    `utilizadorId` INTEGER NULL,

    INDEX `RegistoBackup_inicio_idx`(`inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sequencia` (
    `chave` VARCHAR(191) NOT NULL,
    `valor` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`chave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `utilizadorId` INTEGER NULL,
    `accao` VARCHAR(191) NOT NULL,
    `entidade` VARCHAR(191) NOT NULL,
    `entidadeId` VARCHAR(191) NOT NULL,
    `dados` LONGTEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entidade_entidadeId_idx`(`entidade`, `entidadeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Aluno` ADD CONSTRAINT `Aluno_encarregadoId_fkey` FOREIGN KEY (`encarregadoId`) REFERENCES `Encarregado`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inscricao` ADD CONSTRAINT `Inscricao_alunoId_fkey` FOREIGN KEY (`alunoId`) REFERENCES `Aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inscricao` ADD CONSTRAINT `Inscricao_anoLectivoId_fkey` FOREIGN KEY (`anoLectivoId`) REFERENCES `AnoLectivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inscricao` ADD CONSTRAINT `Inscricao_rotaId_fkey` FOREIGN KEY (`rotaId`) REFERENCES `Rota`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cobranca` ADD CONSTRAINT `Cobranca_inscricaoId_fkey` FOREIGN KEY (`inscricaoId`) REFERENCES `Inscricao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pagamento` ADD CONSTRAINT `Pagamento_inscricaoId_fkey` FOREIGN KEY (`inscricaoId`) REFERENCES `Inscricao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pagamento` ADD CONSTRAINT `Pagamento_utilizadorId_fkey` FOREIGN KEY (`utilizadorId`) REFERENCES `Utilizador`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pagamento` ADD CONSTRAINT `Pagamento_anuladoPorId_fkey` FOREIGN KEY (`anuladoPorId`) REFERENCES `Utilizador`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PagamentoItem` ADD CONSTRAINT `PagamentoItem_pagamentoId_fkey` FOREIGN KEY (`pagamentoId`) REFERENCES `Pagamento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PagamentoItem` ADD CONSTRAINT `PagamentoItem_cobrancaId_fkey` FOREIGN KEY (`cobrancaId`) REFERENCES `Cobranca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_utilizadorId_fkey` FOREIGN KEY (`utilizadorId`) REFERENCES `Utilizador`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
