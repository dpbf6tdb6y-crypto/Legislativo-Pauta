import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const indicacao = await prisma.indicacaoCargo.findUnique({
    where: { id: params.id },
    include: { vereador: true, empresa: true },
  });
  if (!indicacao) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(indicacao);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const indicacao = await prisma.indicacaoCargo.update({
    where: { id: params.id },
    data: {
      vereadorId: body.vereadorId || null,
      indicado: String(body.indicado || "").trim(),
      empresaId: body.empresaId || null,
      cargo: String(body.cargo || "").trim(),
      salario: body.salario != null && body.salario !== "" ? Number(body.salario) : null,
      status: body.status || "Aguardando",
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFim: body.dataFim ? new Date(body.dataFim) : null,
    },
    include: { vereador: true, empresa: true },
  });

  await registrarAuditoria({
    acao: "atualizar_indicacao_cargo",
    entidade: "IndicacaoCargo",
    entidadeId: indicacao.id,
    referencia: indicacao.indicado,
    detalhes: { cargo: indicacao.cargo, status: indicacao.status },
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json(indicacao);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const indicacao = await prisma.indicacaoCargo.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_indicacao_cargo",
    entidade: "IndicacaoCargo",
    entidadeId: indicacao.id,
    referencia: indicacao.indicado,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json({ ok: true });
}
