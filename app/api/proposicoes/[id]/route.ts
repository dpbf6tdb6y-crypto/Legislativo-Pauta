import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const data = await prisma.proposicao.findUnique({
    where: { id: params.id },
    include: {
      autorVereador: true,
      comissoes: {
        include: {
          comissao: { include: { membros: { include: { vereador: true } } } },
          analista: true,
          votos: { include: { vereador: true } },
        },
        orderBy: { ordem: "asc" },
      },
      emendas: { include: { autorVereador: true } },
    },
  });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { comissoes, ...rest } = body;
  if (rest.dataEntrada) rest.dataEntrada = new Date(rest.dataEntrada);
  const data = await prisma.proposicao.update({ where: { id: params.id }, data: rest });
  if (comissoes !== undefined) {
    await prisma.proposicaoComissao.deleteMany({ where: { proposicaoId: params.id } });
    if (comissoes.length > 0) {
      await prisma.proposicaoComissao.createMany({
        data: comissoes.map((c: { comissaoId: string; ordem: number; parecerConjunto?: boolean }) => ({
          proposicaoId: params.id,
          comissaoId: c.comissaoId,
          ordem: c.ordem,
          parecerConjunto: c.parecerConjunto ?? false,
        })),
      });
    }
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.proposicao.update({ where: { id: params.id }, data: { status: "arquivada" } });
  return NextResponse.json({ ok: true });
}
