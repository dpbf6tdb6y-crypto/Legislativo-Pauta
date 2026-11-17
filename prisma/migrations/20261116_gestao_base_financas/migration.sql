-- CreateTable
CREATE TABLE "fin_prefeitura" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "ibge" INTEGER NOT NULL,
    "conector" TEXT NOT NULL,
    "conectorConfig" TEXT NOT NULL DEFAULT '{}',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_prefeitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_coleta" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "portalAtualizadoEm" TEXT NOT NULL DEFAULT '',
    "resumo" TEXT NOT NULL DEFAULT '{}',
    "erros" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "fin_coleta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_arquivo_bruto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "coletaId" INTEGER NOT NULL,
    "fonte" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "baixadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apagadoEm" TIMESTAMP(3),

    CONSTRAINT "fin_arquivo_bruto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_despesa_orgao_mes" (
    "prefeituraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "orgaoCod" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "dotInicial" BIGINT NOT NULL,
    "dotAtual" BIGINT NOT NULL,
    "empenhado" BIGINT NOT NULL,
    "liquidado" BIGINT NOT NULL,
    "pago" BIGINT NOT NULL,
    "coletaId" INTEGER NOT NULL,

    CONSTRAINT "fin_despesa_orgao_mes_pkey" PRIMARY KEY ("prefeituraId","ano","mes","orgaoCod")
);

-- CreateTable
CREATE TABLE "fin_empenho" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "idOrigem" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "orgao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "credorDoc" TEXT NOT NULL,
    "credorNome" TEXT NOT NULL,
    "processo" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "contaDespesa" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "subfuncao" TEXT NOT NULL,
    "programa" TEXT NOT NULL,
    "projeto" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "contratoCitado" TEXT,
    "valor" BIGINT NOT NULL,
    "anulado" BIGINT NOT NULL,
    "aLiquidar" BIGINT NOT NULL,
    "aPagar" BIGINT NOT NULL,
    "inconsistencia" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_empenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_liquidacao" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "idOrigem" INTEGER NOT NULL,
    "empenhoId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" BIGINT NOT NULL,

    CONSTRAINT "fin_liquidacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_pagamento" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "idOrigem" INTEGER NOT NULL,
    "empenhoId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" BIGINT NOT NULL,

    CONSTRAINT "fin_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_retencao_leitura" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "pagamentoIdOrigem" INTEGER NOT NULL,
    "total" BIGINT NOT NULL,
    "itens" INTEGER NOT NULL,
    "lidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_retencao_leitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_retencao" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "pagamentoIdOrigem" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "valor" BIGINT NOT NULL,

    CONSTRAINT "fin_retencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_resto_pagar" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "idOrigem" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "anoOrigem" INTEGER NOT NULL,
    "exercicio" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "empenhoIdOrigem" INTEGER NOT NULL,
    "empenhoNumero" TEXT NOT NULL,
    "orgaoCod" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "credorDoc" TEXT NOT NULL,
    "credorNome" TEXT NOT NULL,
    "inscrito" BIGINT NOT NULL,
    "anulado" BIGINT NOT NULL,
    "liquidado" BIGINT NOT NULL,
    "pago" BIGINT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_resto_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_contrato" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "idOrigem" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "assinatura" TIMESTAMP(3),
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "publicacaoData" TIMESTAMP(3),
    "publicacaoVeiculo" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "valorInicial" BIGINT NOT NULL,
    "valorAtual" BIGINT NOT NULL,
    "processo" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "fornecedorDoc" TEXT NOT NULL,
    "fornecedorNome" TEXT NOT NULL,

    CONSTRAINT "fin_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_ligacao_contrato_empenho" (
    "prefeituraId" TEXT NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "empenhoId" INTEGER NOT NULL,
    "certeza" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "fin_ligacao_contrato_empenho_pkey" PRIMARY KEY ("prefeituraId","contratoId","empenhoId")
);

-- CreateTable
CREATE TABLE "fin_receita_conta_mes" (
    "prefeituraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "contaCod" TEXT NOT NULL,
    "contaPai" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "redutora" BOOLEAN NOT NULL,
    "previstoInicial" BIGINT NOT NULL,
    "previstoAtual" BIGINT NOT NULL,
    "arrecAnterior" BIGINT NOT NULL,
    "arrecMes" BIGINT NOT NULL,
    "arrecAteMes" BIGINT NOT NULL,

    CONSTRAINT "fin_receita_conta_mes_pkey" PRIMARY KEY ("prefeituraId","ano","mes","contaCod")
);

-- CreateIndex
CREATE INDEX "fin_coleta_prefeituraId_inicio_idx" ON "fin_coleta"("prefeituraId", "inicio");

-- CreateIndex
CREATE INDEX "fin_arquivo_bruto_prefeituraId_tipo_baixadoEm_idx" ON "fin_arquivo_bruto"("prefeituraId", "tipo", "baixadoEm");

-- CreateIndex
CREATE INDEX "fin_empenho_prefeituraId_credorDoc_idx" ON "fin_empenho"("prefeituraId", "credorDoc");

-- CreateIndex
CREATE INDEX "fin_empenho_prefeituraId_data_idx" ON "fin_empenho"("prefeituraId", "data");

-- CreateIndex
CREATE INDEX "fin_empenho_prefeituraId_ano_idx" ON "fin_empenho"("prefeituraId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "fin_empenho_prefeituraId_idOrigem_key" ON "fin_empenho"("prefeituraId", "idOrigem");

-- CreateIndex
CREATE INDEX "fin_liquidacao_prefeituraId_data_idx" ON "fin_liquidacao"("prefeituraId", "data");

-- CreateIndex
CREATE INDEX "fin_liquidacao_empenhoId_idx" ON "fin_liquidacao"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "fin_liquidacao_prefeituraId_idOrigem_key" ON "fin_liquidacao"("prefeituraId", "idOrigem");

-- CreateIndex
CREATE INDEX "fin_pagamento_prefeituraId_data_idx" ON "fin_pagamento"("prefeituraId", "data");

-- CreateIndex
CREATE INDEX "fin_pagamento_empenhoId_idx" ON "fin_pagamento"("empenhoId");

-- CreateIndex
CREATE UNIQUE INDEX "fin_pagamento_prefeituraId_idOrigem_key" ON "fin_pagamento"("prefeituraId", "idOrigem");

-- CreateIndex
CREATE UNIQUE INDEX "fin_retencao_leitura_prefeituraId_pagamentoIdOrigem_key" ON "fin_retencao_leitura"("prefeituraId", "pagamentoIdOrigem");

-- CreateIndex
CREATE UNIQUE INDEX "fin_retencao_prefeituraId_pagamentoIdOrigem_seq_key" ON "fin_retencao"("prefeituraId", "pagamentoIdOrigem", "seq");

-- CreateIndex
CREATE INDEX "fin_resto_pagar_prefeituraId_exercicio_idx" ON "fin_resto_pagar"("prefeituraId", "exercicio");

-- CreateIndex
CREATE INDEX "fin_resto_pagar_prefeituraId_empenhoIdOrigem_idx" ON "fin_resto_pagar"("prefeituraId", "empenhoIdOrigem");

-- CreateIndex
CREATE UNIQUE INDEX "fin_resto_pagar_prefeituraId_idOrigem_key" ON "fin_resto_pagar"("prefeituraId", "idOrigem");

-- CreateIndex
CREATE INDEX "fin_contrato_prefeituraId_fornecedorDoc_idx" ON "fin_contrato"("prefeituraId", "fornecedorDoc");

-- CreateIndex
CREATE UNIQUE INDEX "fin_contrato_prefeituraId_idOrigem_key" ON "fin_contrato"("prefeituraId", "idOrigem");

-- CreateIndex
CREATE INDEX "fin_ligacao_contrato_empenho_prefeituraId_empenhoId_idx" ON "fin_ligacao_contrato_empenho"("prefeituraId", "empenhoId");

-- AddForeignKey
ALTER TABLE "fin_liquidacao" ADD CONSTRAINT "fin_liquidacao_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "fin_empenho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_pagamento" ADD CONSTRAINT "fin_pagamento_empenhoId_fkey" FOREIGN KEY ("empenhoId") REFERENCES "fin_empenho"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prefeitura acompanhada pela coleta (Portal da Transparência da Ábaco)
INSERT INTO "fin_prefeitura" ("id", "nome", "uf", "ibge", "conector", "conectorConfig")
VALUES ('nova-lima', 'Prefeitura Municipal de Nova Lima', 'MG', 3144805, 'abaco',
        '{"base":"https://mgnl.abaco.com.br/transparencia/servlet","pausaMs":150,"paralelo":3}')
ON CONFLICT ("id") DO NOTHING;
