import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await prisma.proposicao.findUnique({
    where: { id: params.id },
    include: {
      autores: { include: { vereador: true } },
      comissoes: {
        include: {
          comissao: { include: { membros: { include: { vereador: true } } } },
          analista: true,
          votos: { include: { vereador: true } },
        },
        orderBy: { ordem: "asc" },
      },
      emendas: { include: { autorVereador: true } },
    },
  });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { comissoes, autorIds, ...rest } = body;
  if (rest.dataEntrada) rest.dataEntrada = new Date(rest.dataEntrada);
  const data = await prisma.proposicao.update({ where: { id: params.id }, data: rest });
  if (autorIds !== undefined) {
    await prisma.proposicaoAutor.deleteMany({ where: { proposicaoId: params.id } });
    if (autorIds.length > 0) {
      await prisma.proposicaoAutor.createMany({
        data: autorIds.map((vereadorId: string) => ({ proposicaoId: params.id, vereadorId })),
      });
    }
  }
  if (comissoes !== undefined) {
    await prisma.proposicaoComissao.deleteMany({ where: { proposicaoId: params.id } });
    if (comissoes.length > 0) {
      await prisma.proposicaoComissao.createMany({
        data: comissoes.map((c: { comissaoId: string; ordem: number; parecerConjunto?: boolean }) => ({
          proposicaoId: params.id,
          comissaoId: c.comissaoId,
          ordem: c.ordem,
          parecerConjunto: c.parecerConjunto ?? false,
        })),
      });
    }
  }

  await registrarAuditoria({
    acao: "atualizar_proposicao",
    entidade: "Proposicao",
    entidadeId: data.id,
    referencia: `${data.tipo} ${data.numero}/${data.ano}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const data = await prisma.proposicao.update({ where: { id: params.id }, data: { status: "arquivada" } });

  await registrarAuditoria({
    acao: "arquivar_proposicao",
    entidade: "Proposicao",
    entidadeId: data.id,
    referencia: `${data.tipo} ${data.numero}/${data.ano}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
