import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const data = await prisma.sessao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        include: {
          proposicao: {
            include: {
              autorVereador: true,
              comissoes: { include: { comissao: true }, orderBy: { ordem: "asc" } },
            },
          },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { itens, ...rest } = body;
  if (rest.data) rest.data = new Date(rest.data);
  const data = await prisma.sessao.update({ where: { id: params.id }, data: rest });

  if (itens) {
    await prisma.pautaItem.deleteMany({ where: { sessaoId: params.id } });
    await prisma.pautaItem.createMany({
      data: itens.map((item: { proposicaoId: string; ordem: number; secao?: string; resultado?: string; observacoes?: string }) => ({
        sessaoId: params.id,
        proposicaoId: item.proposicaoId,
        ordem: item.ordem,
        secao: item.secao ?? "votacao",
        resultado: item.resultado,
        observacoes: item.observacoes,
      })),
    });
  }
  return NextResponse.json(data);
}
