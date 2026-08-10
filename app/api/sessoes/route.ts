import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { temPermissao } from "@/lib/permissoes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await prisma.sessao.findMany({
    orderBy: { data: "desc" },
    include: {
      itens: {
        include: { proposicao: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeCriar")) return NextResponse.json({ error: "Sem permissão para cadastrar" }, { status: 403 });

  const body = await req.json();
  const { itens, ...rest } = body;
  const sessao = await prisma.sessao.create({
    data: { ...rest, data: new Date(rest.data) },
  });
  if (itens?.length) {
    await prisma.pautaItem.createMany({
      data: itens.map((item: { proposicaoId: string; ordem: number }) => ({
        sessaoId: sessao.id,
        proposicaoId: item.proposicaoId,
        ordem: item.ordem,
      })),
    });
  }

  await registrarAuditoria({
    acao: "criar_sessao",
    entidade: "Sessao",
    entidadeId: sessao.id,
    referencia: `${sessao.tipo} — ${new Date(sessao.data).toLocaleDateString("pt-BR")}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(sessao);
}
