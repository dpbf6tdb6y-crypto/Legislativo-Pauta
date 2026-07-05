import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { proposicoes, pareceres } = await req.json();

  let criados = 0;
  let atualizados = 0;
  let erros = 0;

  // Criar novas proposições (da seção Apresentação)
  for (const item of (proposicoes || [])) {
    try {
      await prisma.segov.create({
        data: {
          tipo: item.tipo,
          numero: String(item.numero),
          ano: parseInt(item.ano),
          ementa: item.ementa?.trim() || "(sem ementa)",
          vereadorId: item.vereadorId || null,
          autorNome: item.autorNome || null,
          status: "Aguardando",
          observacao: item.observacao || null,
          dataEnvio: item.dataEnvio ? new Date(item.dataEnvio) : null,
        },
      });
      criados++;
    } catch {
      erros++;
    }
  }

  // Atualizar/criar com dados do parecer (da seção Leitura de Pareceres)
  for (const item of (pareceres || [])) {
    try {
      const existente = await prisma.segov.findFirst({
        where: { tipo: item.tipo, numero: String(item.numero), ano: parseInt(item.ano) },
      });

      if (existente) {
        await prisma.segov.update({
          where: { id: existente.id },
          data: {
            parecerComissao: item.parecerComissao || null,
            parecerConjunto: !!item.parecerConjunto,
            proxComissao: item.proxComissao || null,
            dataParecere: item.dataParecere ? new Date(item.dataParecere) : null,
            status: "Com Parecer",
          },
        });
        atualizados++;
      } else {
        // Proposição ainda não está no SEGOV — cria com dados do parecer
        await prisma.segov.create({
          data: {
            tipo: item.tipo,
            numero: String(item.numero),
            ano: parseInt(item.ano),
            ementa: item.ementa?.trim() || "(sem ementa)",
            autorNome: item.autorNome || null,
            status: "Com Parecer",
            parecerComissao: item.parecerComissao || null,
            parecerConjunto: !!item.parecerConjunto,
            proxComissao: item.proxComissao || null,
            dataParecere: item.dataParecere ? new Date(item.dataParecere) : null,
          },
        });
        criados++;
      }
    } catch {
      erros++;
    }
  }

  return NextResponse.json({ criados, atualizados, erros });
}
