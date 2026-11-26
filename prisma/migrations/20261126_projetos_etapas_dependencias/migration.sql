-- Projetos: responsabilidade de cada secretaria e dependências entre etapas.
-- Só acrescenta colunas, todas com valor padrão ou opcionais: os registros existentes não mudam.
ALTER TABLE "fin_projeto_secretaria" ADD COLUMN "atuacao" TEXT NOT NULL DEFAULT '',
ADD COLUMN "atribuicao" TEXT NOT NULL DEFAULT '',
ADD COLUMN "aporte" BIGINT;

ALTER TABLE "fin_etapa_projeto" ADD COLUMN "orgaoCod" TEXT NOT NULL DEFAULT '',
ADD COLUMN "dependeDe" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
