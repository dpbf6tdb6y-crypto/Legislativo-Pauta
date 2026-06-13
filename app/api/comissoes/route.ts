import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await prisma.comissao.findMany({
    orderBy: { nome: "asc" },
    include: {
      membros: { include: { vereador: true } },
      analistas: true,
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { nome, sigla, tipo, membros } = body;
  const comissao = await prisma.comissao.create({ data: { nome, sigla, tipo } });
  if (membros?.length) {
    await prisma.comissaoMembro.createMany({
      data: membros.map((m: { vereadorId: string; papel: string }) => ({
        comissaoId: comissao.id,
        vereadorId: m.vereadorId,
        papel: m.papel,
      })),
    });
  }
  return NextResponse.json(comissao);
}
