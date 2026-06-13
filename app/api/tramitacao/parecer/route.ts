import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { proposicaoComissaoId, parecer, parecerTexto, analistaId } = await req.json();

  await prisma.proposicaoComissao.update({
    where: { id: proposicaoComissaoId },
    data: {
      parecer,
      parecerTexto,
      ...(analistaId ? { analistaId } : {}),
      status: parecer === "contrario" ? "rejeitado" : "aprovado",
      dataVotacao: new Date(),
    },
  });

  const tram = await prisma.proposicaoComissao.findUnique({
    where: { id: proposicaoComissaoId },
    include: {
      proposicao: { include: { comissoes: { orderBy: { ordem: "asc" } } } },
    },
  });

  if (!tram) return NextResponse.json({ ok: true });

  const prop = tram.proposicao;

  if (parecer === "contrario") {
    await prisma.proposicao.update({
      where: { id: prop.id },
      data: { status: "rejeitada", etapaAtual: "rejeitada" },
    });
  } else {
    const currentIdx = prop.comissoes.findIndex(c => c.id === proposicaoComissaoId);
    const nextComissao = prop.comissoes[currentIdx + 1];

    if (nextComissao) {
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: `comissao${nextComissao.ordem}` },
      });
      await prisma.proposicaoComissao.update({
        where: { id: nextComissao.id },
        data: { status: "em_analise" },
      });
    } else {
      await prisma.proposicao.update({
        where: { id: prop.id },
        data: { etapaAtual: "pronto_votar" },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
