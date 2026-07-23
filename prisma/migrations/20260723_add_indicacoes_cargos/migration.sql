-- AlterTable
ALTER TABLE "User" ADD COLUMN "podeVerIndicacoes" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicacaoCargo" (
    "id" TEXT NOT NULL,
    "vereadorId" TEXT,
    "indicado" TEXT NOT NULL,
    "empresaId" TEXT,
    "cargo" TEXT NOT NULL,
    "salario" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Aguardando',
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicacaoCargo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nome_key" ON "Empresa"("nome");

-- AddForeignKey
ALTER TABLE "IndicacaoCargo" ADD CONSTRAINT "IndicacaoCargo_vereadorId_fkey" FOREIGN KEY ("vereadorId") REFERENCES "Vereador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicacaoCargo" ADD CONSTRAINT "IndicacaoCargo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SolicitacaoRelatorio" (
    "id" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "solicitanteNome" TEXT NOT NULL,
    "aprovadorId" TEXT NOT NULL,
    "aprovadorNome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "SolicitacaoRelatorio_pkey" PRIMARY KEY ("id")
);
