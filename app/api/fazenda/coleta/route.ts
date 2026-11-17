import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoDoMenu } from "@/lib/acessos";
import { situacaoColeta } from "@/lib/financas/situacao";

// Situação da coleta dos dados financeiros (Gestão $$$). Só para quem tem o menu "Gestão - $$$"
// liberado, conferido no cadastro (não na sessão), igual ao painel.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const usuario = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { perfil: true, ativo: true, acessos: true, podeVerIndicacoes: true, podeCriar: true, podeEditar: true, podeExcluir: true },
  });
  if (!usuario || !usuario.ativo || !acessoDoMenu(usuario as any, "gestao").ver) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    return NextResponse.json(await situacaoColeta(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: `Não consegui ler a situação da coleta: ${e?.message ?? e}` }, { status: 500 });
  }
}
