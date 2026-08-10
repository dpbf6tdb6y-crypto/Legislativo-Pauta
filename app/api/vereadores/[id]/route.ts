import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const antes = await prisma.vereador.findUnique({ where: { id: params.id } });
  if (!antes) return NextResponse.json({ error: "Vereador não encontrado" }, { status: 404 });

  const estaReativando = body.ativo === true && antes.ativo === false;
  if (estaReativando && !["admin", "master"].includes((session.user as any).perfil)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const data = await prisma.vereador.update({ where: { id: params.id }, data: body });

  if (typeof body.ativo === "boolean" && body.ativo !== antes.ativo) {
    await registrarAuditoria({
      acao: body.ativo ? "ativar_vereador" : "inativar_vereador",
      entidade: "Vereador",
      entidadeId: data.id,
      referencia: data.nome,
      detalhes: { ativoAnterior: antes.ativo, ativoNovo: body.ativo },
      usuarioId: (session.user as any).id,
      usuarioNome: session.user?.name ?? undefined,
    });
  } else {
    await registrarAuditoria({
      acao: "atualizar_vereador",
      entidade: "Vereador",
      entidadeId: data.id,
      referencia: data.nome,
      usuarioId: (session.user as any).id,
      usuarioNome: session.user?.name ?? undefined,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const antes = await prisma.vereador.findUnique({ where: { id: params.id } });
  const data = await prisma.vereador.update({ where: { id: params.id }, data: { ativo: false } });

  await registrarAuditoria({
    acao: "inativar_vereador",
    entidade: "Vereador",
    entidadeId: data.id,
    referencia: data.nome,
    detalhes: { ativoAnterior: antes?.ativo ?? true, ativoNovo: false },
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
