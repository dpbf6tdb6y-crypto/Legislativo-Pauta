import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { menuDaRota, MENUS } from "@/lib/acessos";

// Registro discreto de quem abriu o sistema (usuário, menu, horário). Não aparece na tela de Auditoria;
// serve só para consulta direta. Um registro por usuário e menu a cada 30 minutos.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 204 });
  const u = session.user as any;
  try {
    const { rota } = await req.json().catch(() => ({ rota: "" }));
    const caminho = String(rota || "").slice(0, 200);
    const chave = menuDaRota(caminho);
    const menu = chave ? (MENUS.find(m => m.chave === chave)?.label ?? chave) : "Outros";
    const desde = new Date(Date.now() - 30 * 60 * 1000);
    const recente = await prisma.auditLog.findFirst({
      where: { acao: "acesso", usuarioId: u.id, referencia: menu, criadoEm: { gte: desde } },
      select: { id: true },
    });
    if (!recente) {
      await prisma.auditLog.create({
        data: {
          acao: "acesso",
          entidade: "Acesso",
          referencia: menu,
          detalhes: JSON.stringify({ rota: caminho, aparelho: (req.headers.get("user-agent") || "").slice(0, 160) }),
          usuarioId: u.id,
          usuarioNome: u.name || u.email || null,
        },
      });
    }
  } catch {
    // registro de acesso nunca atrapalha o uso
  }
  return new NextResponse(null, { status: 204 });
}
