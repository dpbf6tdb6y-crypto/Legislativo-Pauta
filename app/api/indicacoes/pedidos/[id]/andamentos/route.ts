import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { STATUS_PEDIDO, STATUS_FECHADOS } from "@/lib/pedidos";

// novo andamento: gera uma linha no histórico e, se trouxer status, atualiza o status do pedido
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const pedido = await prisma.pedidoVereador.findUnique({ where: { id: params.id } });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const b = await req.json();
  const descricao = String(b.descricao || "").trim();
  const data = b.data ? new Date(String(b.data)) : new Date();
  if (!descricao) return NextResponse.json({ error: "Descreva o andamento" }, { status: 400 });
  if (isNaN(data.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const novoStatus: string | null = STATUS_PEDIDO.includes(b.status) && b.status !== pedido.status ? b.status : null;

  const [andamento] = await prisma.$transaction([
    prisma.andamentoPedido.create({
      data: { pedidoId: params.id, data, descricao, status: novoStatus },
    }),
    prisma.pedidoVereador.update({
      where: { id: params.id },
      data: novoStatus
        ? { status: novoStatus, dataFechamento: STATUS_FECHADOS.includes(novoStatus) ? data : null }
        : { updatedAt: new Date() },
    }),
  ]);

  await registrarAuditoria({
    acao: "andamento_pedido_vereador",
    entidade: "PedidoVereador",
    entidadeId: params.id,
    referencia: pedido.tipo,
    detalhes: { descricao, novoStatus },
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json(andamento, { status: 201 });
}
