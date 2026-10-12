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

// fim do dia, para filtros "até"
function fimDoDia(v: string | null) {
  const d = dataOuNull(v);
  if (!d) return undefined;
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: Request) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const u = new URL(req.url).searchParams;
  const where: any = {};
  if (u.get("vereadorId")) where.vereadorId = u.get("vereadorId");
  if (u.get("tipo")) where.tipo = { equals: u.get("tipo"), mode: "insensitive" };
  if (u.get("status")) where.status = u.get("status");
  const ref = referenciaValida(u.get("referencia"));
  if (ref) where.referencia = ref;

  const de = dataOuNull(u.get("de")), ate = fimDoDia(u.get("ate"));
  if (de || ate) where.dataPedido = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) };
  const fDe = dataOuNull(u.get("fechamentoDe")), fAte = fimDoDia(u.get("fechamentoAte"));
  if (fDe || fAte) where.dataFechamento = { ...(fDe ? { gte: fDe } : {}), ...(fAte ? { lte: fAte } : {}) };

  const pedidos = await prisma.pedidoVereador.findMany({
    where,
    orderBy: [{ dataPedido: "desc" }, { createdAt: "desc" }],
    include: {
      vereador: { select: { id: true, nome: true, apelido: true } },
      andamentos: { orderBy: [{ data: "desc" }, { createdAt: "desc" }] },
    },
  });

  // última atualização = o mais recente entre o pedido e seus andamentos
  const lista = pedidos.map((p) => {
    const datas = [p.updatedAt.getTime(), ...p.andamentos.map((a) => a.data.getTime())];
    return { ...p, ultimaAtualizacao: new Date(Math.max(...datas)).toISOString() };
  });
  return NextResponse.json(lista);
}

export async function POST(req: Request) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const b = await req.json();
  const tipo = String(b.tipo || "").trim();
  const descricao = String(b.descricao || "").trim();
  const dataPedido = dataOuNull(b.dataPedido);
  if (!tipo || !descricao || !dataPedido)
    return NextResponse.json({ error: "Preencha o tipo, a descrição e a data do pedido" }, { status: 400 });

  const status = STATUS_PEDIDO.includes(b.status) ? b.status : "Em andamento";
  if (b.referencia !== undefined && b.referencia !== null && b.referencia !== "" && referenciaValida(b.referencia) === null)
    return NextResponse.json({ error: "A referência interna deve ser um número de 1 a 5" }, { status: 400 });

  const pedido = await prisma.pedidoVereador.create({
    data: {
      vereadorId: b.vereadorId || null,
      tipo,
      descricao,
      endereco: String(b.endereco || "").trim() || null,
      dataPedido,
      prazo: dataOuNull(b.prazo),
      status,
      referencia: referenciaValida(b.referencia),
      dataFechamento: STATUS_FECHADOS.includes(status) ? dataOuNull(b.dataFechamento) || new Date() : null,
    },
    include: { vereador: { select: { id: true, nome: true, apelido: true } }, andamentos: true },
  });

  await registrarAuditoria({
    acao: "criar_pedido_vereador",
    entidade: "PedidoVereador",
    entidadeId: pedido.id,
    referencia: pedido.tipo,
    detalhes: { status: pedido.status, referencia: pedido.referencia },
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json(pedido, { status: 201 });
}
