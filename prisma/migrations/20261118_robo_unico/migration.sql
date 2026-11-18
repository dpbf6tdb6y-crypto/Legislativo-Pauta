-- Robô único: relatórios consolidados de natureza e função e a conferência com o RREO homologado.

-- CreateTable
CREATE TABLE "fin_despesa_natureza_mes" (
    "prefeituraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "naturezaCod" TEXT NOT NULL,
    "naturezaNome" TEXT NOT NULL,
    "dotInicial" BIGINT NOT NULL,
    "dotAtual" BIGINT NOT NULL,
    "empenhado" BIGINT NOT NULL,
    "liquidado" BIGINT NOT NULL,
    "pago" BIGINT NOT NULL,
    "coletaId" INTEGER NOT NULL,

    CONSTRAINT "fin_despesa_natureza_mes_pkey" PRIMARY KEY ("prefeituraId","ano","mes","naturezaCod")
);

-- CreateTable
CREATE TABLE "fin_despesa_funcao_mes" (
    "prefeituraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "funcaoCod" TEXT NOT NULL,
    "funcaoNome" TEXT NOT NULL,
    "subfuncaoCod" TEXT NOT NULL,
    "subfuncaoNome" TEXT NOT NULL,
    "dotInicial" BIGINT NOT NULL,
    "dotAtual" BIGINT NOT NULL,
    "empenhado" BIGINT NOT NULL,
    "liquidado" BIGINT NOT NULL,
    "pago" BIGINT NOT NULL,
    "coletaId" INTEGER NOT NULL,

    CONSTRAINT "fin_despesa_funcao_mes_pkey" PRIMARY KEY ("prefeituraId","ano","mes","funcaoCod","subfuncaoCod")
);

-- CreateTable
CREATE TABLE "fin_conferencia_oficial" (
    "prefeituraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "bimestre" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "oficial" BIGINT NOT NULL,
    "portal" BIGINT NOT NULL,
    "diferenca" BIGINT NOT NULL,
    "confere" BOOLEAN NOT NULL,
    "coletaId" INTEGER NOT NULL,
    "conferidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_conferencia_oficial_pkey" PRIMARY KEY ("prefeituraId","ano","bimestre","item")
);
