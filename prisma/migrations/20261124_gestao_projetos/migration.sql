-- CreateTable
CREATE TABLE "fin_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'media',
    "fase" TEXT NOT NULL DEFAULT 'ideia',
    "eixo" TEXT NOT NULL DEFAULT '',
    "bairro" TEXT NOT NULL DEFAULT '',
    "fonteRecurso" TEXT NOT NULL DEFAULT '',
    "orcamento" BIGINT,
    "inicioPrevisto" TIMESTAMP(3),
    "fimPrevisto" TIMESTAMP(3),
    "fimPrevistoOriginal" TIMESTAMP(3),
    "inicioReal" TIMESTAMP(3),
    "fimReal" TIMESTAMP(3),
    "criadoPor" TEXT NOT NULL,
    "criadoPorPerfil" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadoPor" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "motivoFase" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "fin_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_risco_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "probabilidade" INTEGER NOT NULL,
    "impacto" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "mitigacao" TEXT NOT NULL DEFAULT '',
    "responsavel" TEXT NOT NULL DEFAULT '',
    "prazoMitigacao" TIMESTAMP(3),
    "motivoEncerra" TEXT NOT NULL DEFAULT '',
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_risco_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_indicador_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT '',
    "sentido" TEXT NOT NULL DEFAULT 'maior',
    "linhaBase" DOUBLE PRECISION NOT NULL,
    "meta" DOUBLE PRECISION NOT NULL,
    "prazoMeta" TIMESTAMP(3),
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_indicador_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_leitura_indicador" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "indicadorId" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nota" TEXT NOT NULL DEFAULT '',
    "por" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_leitura_indicador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_vinculo_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "contratoId" INTEGER,
    "programa" TEXT NOT NULL DEFAULT '',
    "acao" TEXT NOT NULL DEFAULT '',
    "orgaoCod" TEXT NOT NULL DEFAULT '',
    "orgaoEmpenho" TEXT NOT NULL DEFAULT '',
    "desde" TIMESTAMP(3),
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_vinculo_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_projeto_secretaria" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "orgaoCod" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "fin_projeto_secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_etapa_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "marco" BOOLEAN NOT NULL DEFAULT false,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "inicioPrevisto" TIMESTAMP(3),
    "fimPrevisto" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "fin_etapa_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_evento_projeto" (
    "id" SERIAL NOT NULL,
    "prefeituraId" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "por" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_evento_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fin_projeto_prefeituraId_fase_idx" ON "fin_projeto"("prefeituraId", "fase");

-- CreateIndex
CREATE INDEX "fin_risco_projeto_prefeituraId_projetoId_idx" ON "fin_risco_projeto"("prefeituraId", "projetoId");

-- CreateIndex
CREATE INDEX "fin_indicador_projeto_prefeituraId_projetoId_idx" ON "fin_indicador_projeto"("prefeituraId", "projetoId");

-- CreateIndex
CREATE INDEX "fin_leitura_indicador_prefeituraId_indicadorId_idx" ON "fin_leitura_indicador"("prefeituraId", "indicadorId");

-- CreateIndex
CREATE INDEX "fin_vinculo_projeto_prefeituraId_projetoId_idx" ON "fin_vinculo_projeto"("prefeituraId", "projetoId");

-- CreateIndex
CREATE INDEX "fin_vinculo_projeto_prefeituraId_contratoId_idx" ON "fin_vinculo_projeto"("prefeituraId", "contratoId");

-- CreateIndex
CREATE INDEX "fin_projeto_secretaria_prefeituraId_orgaoCod_idx" ON "fin_projeto_secretaria"("prefeituraId", "orgaoCod");

-- CreateIndex
CREATE UNIQUE INDEX "fin_projeto_secretaria_projetoId_orgaoCod_key" ON "fin_projeto_secretaria"("projetoId", "orgaoCod");

-- CreateIndex
CREATE INDEX "fin_etapa_projeto_prefeituraId_projetoId_idx" ON "fin_etapa_projeto"("prefeituraId", "projetoId");

-- CreateIndex
CREATE INDEX "fin_evento_projeto_prefeituraId_projetoId_idx" ON "fin_evento_projeto"("prefeituraId", "projetoId");

-- AddForeignKey
ALTER TABLE "fin_risco_projeto" ADD CONSTRAINT "fin_risco_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_indicador_projeto" ADD CONSTRAINT "fin_indicador_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_leitura_indicador" ADD CONSTRAINT "fin_leitura_indicador_indicadorId_fkey" FOREIGN KEY ("indicadorId") REFERENCES "fin_indicador_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_vinculo_projeto" ADD CONSTRAINT "fin_vinculo_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_projeto_secretaria" ADD CONSTRAINT "fin_projeto_secretaria_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_etapa_projeto" ADD CONSTRAINT "fin_etapa_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_evento_projeto" ADD CONSTRAINT "fin_evento_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "fin_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

