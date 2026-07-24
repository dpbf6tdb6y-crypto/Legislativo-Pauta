-- Redesigns Requerimento to track legislative Requerimento/Moção/Indicação
-- (table was empty in production at the time of this change)

-- DropIndex
DROP INDEX IF EXISTS "Requerimento_referencia_key";

-- AlterTable
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "referencia";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "data";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "texto";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "relevancia";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "origem";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "categoria";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "secretaria";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "dataConclusao";
ALTER TABLE "Requerimento" DROP COLUMN IF EXISTS "documentos";

ALTER TABLE "Requerimento" ADD COLUMN "numero" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Requerimento" ADD COLUMN "ano" INTEGER NOT NULL DEFAULT 2026;
ALTER TABLE "Requerimento" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'REQ';
ALTER TABLE "Requerimento" ADD COLUMN "descricao" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Requerimento" ADD COLUMN "autorNome" TEXT;
ALTER TABLE "Requerimento" ADD COLUMN "dataEnvio" TIMESTAMP(3);
ALTER TABLE "Requerimento" ADD COLUMN "fluxo" JSONB;

ALTER TABLE "Requerimento" ALTER COLUMN "numero" DROP DEFAULT;
ALTER TABLE "Requerimento" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "Requerimento" ALTER COLUMN "descricao" DROP DEFAULT;
