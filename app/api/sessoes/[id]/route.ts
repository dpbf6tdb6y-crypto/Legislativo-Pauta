import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await prisma.sessao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        include: {
          proposicao: {
            include: {
              autores: { include: { vereador: true } },
              comissoes: { include: { comissao: true }, orderBy: { ordem: "asc" } },
            },
          },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.pautaItem.deleteMany({ where: { sessaoId: params.id } });
  const sessao = await prisma.sessao.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_sessao",
    entidade: "Sessao",
    entidadeId: sessao.id,
    referencia: `${sessao.tipo} — ${new Date(sessao.data).toLocaleDateString("pt-BR")}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { itens, ...rest } = body;
  if (rest.data) rest.data = new Date(rest.data);
  const data = await prisma.sessao.update({ where: { id: params.id }, data: rest });

  if (itens) {
    await prisma.pautaItem.deleteMany({ where: { sessaoId: params.id } });
    await prisma.pautaItem.createMany({
      data: itens.map((item: { proposicaoId: string; ordem: number; secao?: string; resultado?: string; observacoes?: string }) => ({
        sessaoId: params.id,
        proposicaoId: item.proposicaoId,
        ordem: item.ordem,
        secao: item.secao ?? "votacao",
        resultado: item.resultado,
        observacoes: item.observacoes,
      })),
    });
  }

  await registrarAuditoria({
    acao: "atualizar_sessao",
    entidade: "Sessao",
    entidadeId: data.id,
    referencia: `${data.tipo} — ${new Date(data.data).toLocaleDateString("pt-BR")}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(data);
}
