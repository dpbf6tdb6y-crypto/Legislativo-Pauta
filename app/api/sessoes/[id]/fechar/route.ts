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
    if (!resultado) continue;

    switch (resultado) {
      case "comissao": {
        // Marca comissão atual como concluída e avança para a próxima (ou pronto_votar)
        const atual = prop.comissoes.find(c => c.status === "em_analise") ?? prop.comissoes.find(c => c.status === "pendente");
        if (atual) {
          await prisma.proposicaoComissao.update({ where: { id: atual.id }, data: { status: "concluido" } });
        }
        const proxima = prop.comissoes.find(c => c.status === "pendente" && c.ordem > (atual?.ordem ?? 0));
        if (proxima) {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: `comissao${proxima.ordem}`, status: "em_tramitacao" },
          });
          await prisma.proposicaoComissao.update({ where: { id: proxima.id }, data: { status: "em_analise" } });
        } else {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: "pronto_votar", status: "em_tramitacao" },
          });
        }
        break;
      }
      case "parecer_conjunto": {
        // Parecer conjunto: marca todas comissões como em_analise
        const pendentes = prop.comissoes.filter(c => c.status === "pendente");
        if (pendentes.length > 0) {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: `comissao${pendentes[0].ordem}`, status: "em_tramitacao" },
          });
          for (const c of pendentes) {
            await prisma.proposicaoComissao.update({
              where: { id: c.id },
              data: { status: "em_analise", parecerConjunto: true },
            });
          }
        }
        break;
      }
      case "dispensa_parecer": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "primeira_votacao", status: "em_tramitacao", dispensaParecer: true },
        });
        break;
      }
      case "dispensa_intersticio": {
        // Dispensa do interstício: avança da primeira para segunda votação diretamente
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "segunda_votacao", status: "em_tramitacao" },
        });
        break;
      }
      case "primeira_votacao": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "primeira_votacao", status: "em_tramitacao" },
        });
        break;
      }
      case "segunda_votacao": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "segunda_votacao", status: "em_tramitacao" },
        });
        break;
      }
      case "votacao1": {
        // Primeira votação realizada e aprovada
        if ((prop.numVotacoes ?? 1) <= 1) {
          const destino = prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao";
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: destino, status: destino },
          });
        } else {
          await prisma.proposicao.update({
            where: { id: prop.id },
            data: { etapaAtual: "segunda_votacao", status: "em_tramitacao" },
          });
        }
        break;
      }
      case "votacao2": {
        // Segunda votação realizada e aprovada
        const destino = prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao";
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: destino, status: destino },
        });
        break;
      }
      case "aprovado": {
        const destino = prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao";
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: destino, status: destino },
        });
        break;
      }
      case "reprovado": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "rejeitada", status: "rejeitada" },
        });
        break;
      }
      case "promulgacao": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "promulgada", status: "promulgada", destinoFinal: "promulgacao" },
        });
        break;
      }
      case "sancao": {
        await prisma.proposicao.update({
          where: { id: prop.id },
          data: { etapaAtual: "aguardando_sancao", status: "aguardando_sancao" },
        });
        break;
      }
    }
  }

  return NextResponse.json({ ok: true });
}
