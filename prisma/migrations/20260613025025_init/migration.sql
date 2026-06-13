-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "perfil" TEXT NOT NULL DEFAULT 'operador',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vereador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "partido" TEXT NOT NULL,
    "legislatura" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Comissao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'permanente',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ComissaoMembro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comissaoId" TEXT NOT NULL,
    "vereadorId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComissaoMembro_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "Comissao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComissaoMembro_vereadorId_fkey" FOREIGN KEY ("vereadorId") REFERENCES "Vereador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "comissaoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analista_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "Comissao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposicao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "ementa" TEXT NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "autorVereadorId" TEXT,
    "autorExterno" TEXT,
    "dataEntrada" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'em_tramitacao',
    "dispensaParecer" BOOLEAN NOT NULL DEFAULT false,
    "regimeUrgencia" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Proposicao_autorVereadorId_fkey" FOREIGN KEY ("autorVereadorId") REFERENCES "Vereador" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposicaoComissao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposicaoId" TEXT NOT NULL,
    "comissaoId" TEXT NOT NULL,
    "analistaId" TEXT,
    "ordem" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "parecer" TEXT,
    "parecerTexto" TEXT,
    "parecerConjunto" BOOLEAN NOT NULL DEFAULT false,
    "dataEnvio" DATETIME,
    "dataVotacao" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposicaoComissao_proposicaoId_fkey" FOREIGN KEY ("proposicaoId") REFERENCES "Proposicao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProposicaoComissao_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "Comissao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProposicaoComissao_analistaId_fkey" FOREIGN KEY ("analistaId") REFERENCES "Analista" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VotoParecerVereador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposicaoComissaoId" TEXT NOT NULL,
    "vereadorId" TEXT NOT NULL,
    "aprovado" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VotoParecerVereador_proposicaoComissaoId_fkey" FOREIGN KEY ("proposicaoComissaoId") REFERENCES "ProposicaoComissao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VotoParecerVereador_vereadorId_fkey" FOREIGN KEY ("vereadorId") REFERENCES "Vereador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Emenda" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposicaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autorVereadorId" TEXT,
    "autorNome" TEXT,
    "artigo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Emenda_proposicaoId_fkey" FOREIGN KEY ("proposicaoId") REFERENCES "Proposicao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Emenda_autorVereadorId_fkey" FOREIGN KEY ("autorVereadorId") REFERENCES "Vereador" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" DATETIME NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER,
    "ano" INTEGER,
    "local" TEXT,
    "status" TEXT NOT NULL DEFAULT 'agendada',
    "ata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PautaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessaoId" TEXT NOT NULL,
    "proposicaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "resultado" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PautaItem_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PautaItem_proposicaoId_fkey" FOREIGN KEY ("proposicaoId") REFERENCES "Proposicao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoMembro_comissaoId_papel_key" ON "ComissaoMembro"("comissaoId", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "Analista_comissaoId_key" ON "Analista"("comissaoId");

-- CreateIndex
CREATE UNIQUE INDEX "VotoParecerVereador_proposicaoComissaoId_vereadorId_key" ON "VotoParecerVereador"("proposicaoComissaoId", "vereadorId");
