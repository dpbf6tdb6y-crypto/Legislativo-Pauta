import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const data = await prisma.analista.update({ where: { id: params.id }, data: body });

  await registrarAuditoria({
    acao: "atualizar_analista",
    entidade: "Analista",
    entidadeId: data.id,
    referencia: data.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const data = await prisma.analista.update({ where: { id: params.id }, data: { ativo: false } });

  await registrarAuditoria({
    acao: "excluir_analista",
    entidade: "Analista",
    entidadeId: data.id,
    referencia: data.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
