-- SRM: pedidos dos vereadores ao Executivo (módulo Ind.)
CREATE TABLE "PedidoVereador" (
    "id" TEXT NOT NULL,
    "vereadorId" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "endereco" TEXT,
    "dataPedido" TIMESTAMP(3) NOT NULL,
    "prazo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Em andamento',
    "referencia" INTEGER,
    "dataFechamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoVereador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AndamentoPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AndamentoPedido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PedidoVereador_vereadorId_idx" ON "PedidoVereador"("vereadorId");
CREATE INDEX "PedidoVereador_status_idx" ON "PedidoVereador"("status");
CREATE INDEX "PedidoVereador_dataPedido_idx" ON "PedidoVereador"("dataPedido");
CREATE INDEX "AndamentoPedido_pedidoId_idx" ON "AndamentoPedido"("pedidoId");

ALTER TABLE "PedidoVereador" ADD CONSTRAINT "PedidoVereador_vereadorId_fkey" FOREIGN KEY ("vereadorId") REFERENCES "Vereador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AndamentoPedido" ADD CONSTRAINT "AndamentoPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoVereador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
