import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET() {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const indicacoes = await prisma.indicacaoCargo.findMany({
    orderBy: { createdAt: "desc" },
    include: { vereador: true, empresa: true },
  });
  return NextResponse.json(indicacoes);
}

export async function POST(req: Request) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const indicado = String(body.indicado || "").trim();
  const cargo = String(body.cargo || "").trim();
  if (!indicado || !cargo) return NextResponse.json({ error: "Preencha indicado e cargo" }, { status: 400 });

  const indicacao = await prisma.indicacaoCargo.create({
    data: {
      vereadorId: body.vereadorId || null,
      indicado,
      empresaId: body.empresaId || null,
      cargo,
      salario: body.salario != null && body.salario !== "" ? Number(body.salario) : null,
      status: body.status || "Aguardando",
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFim: body.dataFim ? new Date(body.dataFim) : null,
    },
    include: { vereador: true, empresa: true },
  });

  await registrarAuditoria({
    acao: "criar_indicacao_cargo",
    entidade: "IndicacaoCargo",
    entidadeId: indicacao.id,
    referencia: indicacao.indicado,
    detalhes: { cargo: indicacao.cargo, status: indicacao.status },
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });

  return NextResponse.json(indicacao, { status: 201 });
}
