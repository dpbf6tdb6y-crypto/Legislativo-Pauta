import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { nome, sigla, tipo, membros } = body;
  const comissao = await prisma.comissao.update({ where: { id: params.id }, data: { nome, sigla, tipo } });
  if (membros) {
    await prisma.comissaoMembro.deleteMany({ where: { comissaoId: params.id } });
    await prisma.comissaoMembro.createMany({
      data: membros.map((m: { vereadorId: string; papel: string }) => ({
        comissaoId: params.id,
        vereadorId: m.vereadorId,
        papel: m.papel,
      })),
    });
  }

  await registrarAuditoria({
    acao: "atualizar_comissao",
    entidade: "Comissao",
    entidadeId: comissao.id,
    referencia: comissao.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const comissao = await prisma.comissao.update({ where: { id: params.id }, data: { ativa: false } });

  await registrarAuditoria({
    acao: "excluir_comissao",
    entidade: "Comissao",
    entidadeId: comissao.id,
    referencia: comissao.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
