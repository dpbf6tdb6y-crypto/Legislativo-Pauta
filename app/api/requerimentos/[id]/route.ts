import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const item = await prisma.requerimento.findUnique({
    where: { id: params.id },
    include: { vereador: true },
  });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.requerimento.update({
    where: { id: params.id },
    data: {
      numero: body.numero,
      ano: parseInt(body.ano) || new Date().getFullYear(),
      tipo: body.tipo,
      descricao: body.descricao,
      vereadorId: body.vereadorId || null,
      autorNome: body.autorNome || null,
      status: body.status,
      dataEnvio: body.dataEnvio ? new Date(body.dataEnvio) : null,
      fluxo: body.fluxo ?? undefined,
    },
    include: { vereador: true },
  });

  await registrarAuditoria({
    acao: "atualizar_requerimento",
    entidade: "Requerimento",
    entidadeId: item.id,
    referencia: `${item.tipo} ${item.numero}/${item.ano}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const item = await prisma.requerimento.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_requerimento",
    entidade: "Requerimento",
    entidadeId: item.id,
    referencia: `${item.tipo} ${item.numero}/${item.ano}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
