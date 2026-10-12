-- Acesso por menu (visualizar/cadastrar) e opção de fluxo resumido nas proposições
ALTER TABLE "User" ADD COLUMN "acessos" TEXT,
ADD COLUMN "fluxoResumido" BOOLEAN NOT NULL DEFAULT false;
