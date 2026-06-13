import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const sessao = await prisma.sessao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        include: {
          proposicao: {
            include: { comissoes: { orderBy: { ordem: "asc" } } },
          },
        },
      },
    },
  });

  if (!sessao) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  await prisma.sessao.update({ where: { id: params.id }, data: { status: "encerrada" } });

  for (const item of sessao.itens) {
    const prop = item.proposicao;
    const resultado = item.resultado;

    if (item.secao === "votacao") {
      if (resultado === "aprovado") {
        const ehFinal =
          (prop.etapaAtual === "primeira_votacao" && prop.numVotacoes === 1) ||
          prop.etapaAtual === "segunda_votacao" ||
          (prop.etapaAtual === "pautado" && prop.numVotacoes === 1);

        if (ehFinal) {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: "aguardando_sancao", status: "aguardando_sancao" },
          });
        } else if (prop.etapaAtual === "primeira_votacao" && prop.numVotacoes >= 2) {
          // Precisa de 2ª votação em sessão futura
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: "segunda_votacao" },
          });
        }
      } else if (resultado === "rejeitado") {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { status: "rejeitada", etapaAtual: "rejeitada" },
        });
      } else if (resultado === "adiado") {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "pronto_votar" },
        });
      }
    } else if (item.secao === "parecer") {
      // Após leitura do parecer na sessão, avança para próxima comissão ou pronto_votar
      const comissaoAtualIdx = prop.comissoes.findIndex(
        c => `comissao${c.ordem}` === prop.etapaAtual && c.status === "aprovado"
      );
      if (comissaoAtualIdx >= 0) {
        const proxima = prop.comissoes[comissaoAtualIdx + 1];
        if (proxima) {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: `comissao${proxima.ordem}` },
          });
          await prisma.proposicaoComissao.update({
            where: { id: proxima.id },
            data: { status: "em_analise" },
          });
        } else {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: "pronto_votar" },
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
