import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Constrói a sequência de etapas de uma proposição (mesma lógica do stepper no cliente)
function buildEtapas(prop: {
  dispensaParecer: boolean;
  numVotacoes: number;
  destinoFinal: string;
  comissoes: { ordem: number }[];
}): string[] {
  const etapas = ["protocolado"];

  if (!prop.dispensaParecer && prop.comissoes.length > 0) {
    prop.comissoes.forEach(c => etapas.push(`comissao${c.ordem}`));
    etapas.push("pronto_votar");
  }

  etapas.push("primeira_votacao");
  if (prop.numVotacoes >= 2) etapas.push("segunda_votacao");
  etapas.push(prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao");

  return etapas;
}

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
      resultado: "comissao",
    })),
  });

  const proposicoes = await prisma.proposicao.findMany({
    where: { id: { in: novas } },
    include: { comissoes: { orderBy: { ordem: "asc" } } },
  });

  for (const prop of proposicoes) {
    const etapas = buildEtapas(prop);
    const idxAtual = etapas.indexOf(prop.etapaAtual);

    // Etapas finais ou de votação específica: não mexer
    const etapasFixas = ["segunda_votacao", "aguardando_sancao", "sancionada", "vetada", "promulgada", "rejeitada"];
    if (etapasFixas.includes(prop.etapaAtual)) continue;

    // Etapas intermediárias (comissaoN, primeira_votacao): a proposição já está na etapa certa
    // para a sessão atual — não auto-avançar, o stepper da sessão decide o próximo passo
    if (prop.etapaAtual.startsWith("comissao") || prop.etapaAtual === "primeira_votacao") {
      // Garante status em tramitação
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { status: "em_tramitacao" },
      });
      continue;
    }

    // protocolado ou pronto_votar → avançar para a próxima etapa
    if (idxAtual >= 0 && idxAtual < etapas.length - 1) {
      const proximaEtapa = etapas[idxAtual + 1];
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: proximaEtapa, status: "em_tramitacao" },
      });
    }
  }

  return NextResponse.json({ adicionadas: novas.length, duplicadas: proposicaoIds.length - novas.length });
}
