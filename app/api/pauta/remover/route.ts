import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { temPermissao } from "@/lib/permissoes";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeEditar")) return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });

  const { proposicaoId, sessaoId } = await req.json();

  await prisma.pautaItem.deleteMany({
    where: sessaoId ? { proposicaoId, sessaoId } : { proposicaoId },
  });

  return NextResponse.json({ ok: true });
}
