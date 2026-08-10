-- Vereador: apelido + índices
ALTER TABLE "Vereador" ADD COLUMN "apelido" TEXT;
CREATE INDEX "Vereador_nome_idx" ON "Vereador"("nome");
CREATE INDEX "Vereador_ativo_idx" ON "Vereador"("ativo");

-- Proposicao: índices
CREATE INDEX "Proposicao_status_idx" ON "Proposicao"("status");
CREATE INDEX "Proposicao_ano_idx" ON "Proposicao"("ano");
CREATE INDEX "Proposicao_tipo_idx" ON "Proposicao"("tipo");

-- Segov: índices
CREATE INDEX "Segov_status_idx" ON "Segov"("status");
CREATE INDEX "Segov_ano_idx" ON "Segov"("ano");
CREATE INDEX "Segov_tipo_idx" ON "Segov"("tipo");
CREATE INDEX "Segov_vereadorId_idx" ON "Segov"("vereadorId");

-- Requerimento: índices
CREATE INDEX "Requerimento_status_idx" ON "Requerimento"("status");
CREATE INDEX "Requerimento_ano_idx" ON "Requerimento"("ano");
CREATE INDEX "Requerimento_tipo_idx" ON "Requerimento"("tipo");
CREATE INDEX "Requerimento_vereadorId_idx" ON "Requerimento"("vereadorId");

-- AuditLog: índices
CREATE INDEX "AuditLog_criadoEm_idx" ON "AuditLog"("criadoEm");
CREATE INDEX "AuditLog_entidade_idx" ON "AuditLog"("entidade");

-- Log de importações
CREATE TABLE "LogImportacao" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "arquivoNome" TEXT,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "detalhes" JSONB,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogImportacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogImportacao_createdAt_idx" ON "LogImportacao"("createdAt");
