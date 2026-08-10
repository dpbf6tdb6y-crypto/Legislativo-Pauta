-- Permissões granulares por usuário (perfil "leitor" some com todas em false)
ALTER TABLE "User" ADD COLUMN "podeCriar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeEditar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeExcluir" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeImportar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeExportar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeGerenciarVereadores" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "podeVerAuditoria" BOOLEAN NOT NULL DEFAULT true;
