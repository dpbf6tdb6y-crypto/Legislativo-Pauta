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

  const proposicoes = await prisma.proposicao.findMany({
    where: { id: { in: novas } },
    include: { comissoes: { orderBy: { ordem: "asc" } } },
  });

  for (const prop of proposicoes) {
    const comissoesNaoAprovadas = prop.comissoes.filter(c => c.status !== "aprovado");

    if (prop.etapaAtual === "segunda_votacao") {
      // Já está marcada para 2ª votação, não mudar
    } else if (
      prop.etapaAtual === "pronto_votar" ||
      prop.dispensaParecer ||
      prop.comissoes.length === 0 ||
      comissoesNaoAprovadas.length === 0
    ) {
      // Pronto para votação (comissões concluídas ou dispensadas)
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: "primeira_votacao", status: "em_tramitacao" },
      });
    } else {
      // Tem comissão pendente → vai para comissão
      const primeira = comissoesNaoAprovadas[0];
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: `comissao${primeira.ordem}`, status: "em_tramitacao" },
      });
      await prisma.proposicaoComissao.update({
        where: { id: primeira.id },
        data: { status: "em_analise" },
      });
    }
  }

  return NextResponse.json({ adicionadas: novas.length, duplicadas: proposicaoIds.length - novas.length });
}
