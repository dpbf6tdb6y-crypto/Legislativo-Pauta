import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { STATUS_PEDIDO, STATUS_FECHADOS, referenciaValida } from "@/lib/pedidos";

function dataOuNull(v: unknown) {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const INCLUDE = {
  vereador: { select: { id: true, nome: true, apelido: true } },
  andamentos: { orderBy: [{ data: "desc" as const }, { createdAt: "desc" as const }] },
};

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const pedido = await prisma.pedidoVereador.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!pedido) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(pedido);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const atual = await prisma.pedidoVereador.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const b = await req.json();
  const tipo = String(b.tipo || "").trim();
  const descricao = String(b.descricao || "").trim();
  const dataPedido = dataOuNull(b.dataPedido);
  if (!tipo || !descricao || !dataPedido)
    return NextResponse.json({ error: "Preencha o tipo, a descrição e a data do pedido" }, { status: 400 });
  if (b.referencia !== undefined && b.referencia !== null && b.referencia !== "" && referenciaValida(b.referencia) === null)
    return NextResponse.json({ error: "A referência interna deve ser um número de 1 a 5" }, { status: 400 });

  const status = STATUS_PEDIDO.includes(b.status) ? b.status : atual.status;
  // fecha ao entrar num status final (mantém a data informada ou a anterior); reabre limpando a data
  let dataFechamento: Date | null = null;
  if (STATUS_FECHADOS.includes(status)) dataFechamento = dataOuNull(b.dataFechamento) || atual.dataFechamento || new Date();

  const pedido = await prisma.pedidoVereador.update({
    where: { id: params.id },
    data: {
      vereadorId: b.vereadorId || null,
      tipo,
      descricao,
      endereco: String(b.endereco || "").trim() || null,
      dataPedido,
      prazo: dataOuNull(b.prazo),
      status,
      referencia: referenciaValida(b.referencia),
      dataFechamento,
    },
    include: INCLUDE,
  });

  await registrarAuditoria({
    acao: "atualizar_pedido_vereador",
    entidade: "PedidoVereador",
    entidadeId: pedido.id,
    referencia: pedido.tipo,
    detalhes: { status: pedido.status, referencia: pedido.referencia },
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json(pedido);
}

// exclui o pedido e todos os seus andamentos (cascata no banco)
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const existe = await prisma.pedidoVereador.findUnique({ where: { id: params.id } });
  if (!existe) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.pedidoVereador.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_pedido_vereador",
    entidade: "PedidoVereador",
    entidadeId: params.id,
    referencia: existe.tipo,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json({ ok: true });
}
