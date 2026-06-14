import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
  const { proposicaoId } = await req.json();

  const prop = await prisma.proposicao.findUnique({
    where: { id: proposicaoId },
    include: { comissoes: { orderBy: { ordem: "asc" } } },
  });

  if (!prop) return NextResponse.json({ ok: false }, { status: 404 });

  // Remove da pauta
  await prisma.pautaItem.deleteMany({ where: { proposicaoId } });

  // Volta uma etapa no fluxo (para que reapareça em "A Pautar" no estado correto)
  const etapas = buildEtapas(prop);
  const idxAtual = etapas.indexOf(prop.etapaAtual);
  const etapaAnterior = idxAtual > 0 ? etapas[idxAtual - 1] : "protocolado";

  await prisma.proposicao.update({
    where: { id: proposicaoId },
    data: { etapaAtual: etapaAnterior, status: "em_tramitacao" },
  });

  return NextResponse.json({ ok: true });
}
