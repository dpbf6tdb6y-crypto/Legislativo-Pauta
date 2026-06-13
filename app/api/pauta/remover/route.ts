import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { proposicaoId } = await req.json();

  await prisma.pautaItem.deleteMany({ where: { proposicaoId } });

  // Reset todas as comissões desta proposição para aguardando
  await prisma.proposicaoComissao.updateMany({
    where: { proposicaoId },
    data: { status: "aguardando", parecer: null, parecerTexto: null },
  });

  await prisma.proposicao.update({
    where: { id: proposicaoId },
    data: { etapaAtual: "protocolado", status: "em_tramitacao" },
  });

  return NextResponse.json({ ok: true });
}
