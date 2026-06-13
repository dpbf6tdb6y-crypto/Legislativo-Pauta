import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await prisma.sessao.findMany({
    orderBy: { data: "desc" },
    include: {
      itens: {
        include: { proposicao: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { itens, ...rest } = body;
  const sessao = await prisma.sessao.create({
    data: { ...rest, data: new Date(rest.data) },
  });
  if (itens?.length) {
    await prisma.pautaItem.createMany({
      data: itens.map((item: { proposicaoId: string; ordem: number }) => ({
        sessaoId: sessao.id,
        proposicaoId: item.proposicaoId,
        ordem: item.ordem,
      })),
    });
  }
  return NextResponse.json(sessao);
}
