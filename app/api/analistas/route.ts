import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { temPermissao } from "@/lib/permissoes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await prisma.analista.findMany({
    orderBy: { nome: "asc" },
    include: { comissao: true },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeGerenciarVereadores")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const data = await prisma.analista.create({ data: body });

  await registrarAuditoria({
    acao: "criar_analista",
    entidade: "Analista",
    entidadeId: data.id,
    referencia: data.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(data);
}
