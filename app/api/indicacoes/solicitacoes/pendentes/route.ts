import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";

export async function GET() {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const pendentes = await prisma.solicitacaoRelatorio.findMany({
    where: { aprovadorId: usuario.id, status: "pendente" },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(pendentes);
}
