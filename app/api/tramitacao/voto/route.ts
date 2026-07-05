import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { proposicaoComissaoId, vereadorId, aprovado } = await req.json();

  await prisma.votoParecerVereador.upsert({
    where: { proposicaoComissaoId_vereadorId: { proposicaoComissaoId, vereadorId } },
    update: { aprovado },
    create: { proposicaoComissaoId, vereadorId, aprovado },
  });

  return NextResponse.json({ ok: true });
}
