import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { sessaoId, proposicaoIds, secao = "votacao" } = await req.json();

  const itensExistentes = await prisma.pautaItem.findMany({
    where: { sessaoId },
    orderBy: { ordem: "asc" },
  });

  const jaAdicionadas = new Set(itensExistentes.map((i) => i.proposicaoId));
  const novas = (proposicaoIds as string[]).filter((id) => !jaAdicionadas.has(id));

  if (novas.length === 0) {
    return NextResponse.json({ adicionadas: 0, duplicadas: proposicaoIds.length });
  }

  const proximaOrdem = itensExistentes.length + 1;
  await prisma.pautaItem.createMany({
    data: novas.map((proposicaoId, i) => ({
      sessaoId,
      proposicaoId,
      secao,
      ordem: proximaOrdem + i,
    })),
  });

  // Buscar proposições com suas comissões para definir etapa inicial
  const proposicoes = await prisma.proposicao.findMany({
    where: { id: { in: novas } },
    include: { comissoes: { orderBy: { ordem: "asc" } } },
  });

  for (const prop of proposicoes) {
    const primeiraComissao = prop.comissoes[0];

    if (primeiraComissao) {
      // Tem comissão → vai direto para tramitação na comissão 1
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: "comissao1", status: "em_tramitacao" },
      });
      await prisma.proposicaoComissao.update({
        where: { id: primeiraComissao.id },
        data: { status: "em_analise" },
      });
    } else {
      // Sem comissão → fica em pautado aguardando votação
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: "pautado", status: "em_tramitacao" },
      });
    }
  }

  return NextResponse.json({ adicionadas: novas.length, duplicadas: proposicaoIds.length - novas.length });
}
