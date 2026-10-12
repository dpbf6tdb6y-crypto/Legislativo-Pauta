import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";

// remove um andamento lançado por engano (o status do pedido não é revertido automaticamente)
export async function DELETE(_: Request, { params }: { params: { id: string; aid: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const a = await prisma.andamentoPedido.findFirst({ where: { id: params.aid, pedidoId: params.id } });
  if (!a) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.andamentoPedido.delete({ where: { id: params.aid } });

  await registrarAuditoria({
    acao: "excluir_andamento_pedido_vereador",
    entidade: "PedidoVereador",
    entidadeId: params.id,
    referencia: a.descricao.slice(0, 60),
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json({ ok: true });
}
