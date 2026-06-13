import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const status = searchParams.get("status");

  const data = await prisma.proposicao.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      autorVereador: true,
      comissoes: {
        include: { comissao: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { comissoes, ...rest } = body;
  const proposicao = await prisma.proposicao.create({
    data: { ...rest, dataEntrada: new Date(rest.dataEntrada) },
  });
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
  return NextResponse.json(proposicao);
}
