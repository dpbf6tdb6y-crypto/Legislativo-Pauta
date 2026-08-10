import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { temPermissao } from "@/lib/permissoes";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const item = await prisma.tag.findUnique({
    where: { id: params.id },
    include: { vereador: true },
  });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeEditar")) return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });

  const body = await req.json();
  const item = await prisma.tag.update({
    where: { id: params.id },
    data: {
      data: body.data ? new Date(body.data) : undefined,
      pedido: body.pedido,
      status: body.status,
      relevancia: body.relevancia ?? null,
      vereadorId: body.vereadorId || null,
      origem: body.origem ?? null,
      categoria: body.categoria ?? null,
      secretaria: body.secretaria ?? null,
      dataConclusao: body.dataConclusao ? new Date(body.dataConclusao) : null,
      documentos: body.documentos ?? null,
    },
    include: { vereador: true },
  });

  await registrarAuditoria({
    acao: "atualizar_tag",
    entidade: "Tag",
    entidadeId: item.id,
    referencia: item.referencia,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeExcluir")) return NextResponse.json({ error: "Sem permissão para excluir" }, { status: 403 });

  const item = await prisma.tag.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_tag",
    entidade: "Tag",
    entidadeId: item.id,
    referencia: item.referencia,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
