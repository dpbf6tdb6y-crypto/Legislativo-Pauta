import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { proposicaoComissaoId, parecer, parecerTexto, analistaId } = await req.json();

  const data = await prisma.proposicaoComissao.update({
    where: { id: proposicaoComissaoId },
    data: {
      parecer,
      parecerTexto,
      analistaId,
      status: "em_analise",
      dataEnvio: new Date(),
    },
  });

  return NextResponse.json(data);
}
