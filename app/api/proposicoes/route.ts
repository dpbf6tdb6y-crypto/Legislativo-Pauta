import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const status = searchParams.get("status");

  const data = await prisma.proposicao.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ ano: "asc" }, { numero: "asc" }],
    include: {
      autores: { include: { vereador: true } },
      comissoes: {
        include: { comissao: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { comissoes, autorIds, ...rest } = body;
  const proposicao = await prisma.proposicao.create({
    data: { ...rest, dataEntrada: new Date(rest.dataEntrada) },
  });
  if (autorIds?.length) {
    await prisma.proposicaoAutor.createMany({
      data: autorIds.map((vereadorId: string) => ({ proposicaoId: proposicao.id, vereadorId })),
    });
  }
  if (comissoes?.length) {
    await prisma.proposicaoComissao.createMany({
      data: comissoes.map((c: { comissaoId: string; ordem: number; parecerConjunto?: boolean }) => ({
        proposicaoId: proposicao.id,
        comissaoId: c.comissaoId,
        ordem: c.ordem,
        parecerConjunto: c.parecerConjunto ?? false,
      })),
    });
  }

  await registrarAuditoria({
    acao: "criar_proposicao",
    entidade: "Proposicao",
    entidadeId: proposicao.id,
    referencia: `${proposicao.tipo} ${proposicao.numero}/${proposicao.ano}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(proposicao);
}
