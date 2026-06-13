import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { proposicaoComissaoId, vereadorId, aprovado } = await req.json();

  await prisma.votoParecerVereador.upsert({
    where: { proposicaoComissaoId_vereadorId: { proposicaoComissaoId, vereadorId } },
    update: { aprovado },
    create: { proposicaoComissaoId, vereadorId, aprovado },
  });

  // Verificar se atingiu 2 votos de aprovação
  const votos = await prisma.votoParecerVereador.findMany({
    where: { proposicaoComissaoId },
  });
  const aprovados = votos.filter((v) => v.aprovado).length;

  if (aprovados >= 2) {
    await prisma.proposicaoComissao.update({
      where: { id: proposicaoComissaoId },
      data: { status: "aprovado", dataVotacao: new Date() },
    });
  }

  return NextResponse.json({ ok: true, aprovados });
}
