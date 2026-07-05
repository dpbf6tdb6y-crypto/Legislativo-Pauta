import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await prisma.comissao.findMany({
    orderBy: { nome: "asc" },
    include: {
      membros: { include: { vereador: true } },
      analistas: true,
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { nome, sigla, tipo, membros } = body;
  const comissao = await prisma.comissao.create({ data: { nome, sigla, tipo } });
  if (membros?.length) {
    await prisma.comissaoMembro.createMany({
      data: membros.map((m: { vereadorId: string; papel: string }) => ({
        comissaoId: comissao.id,
        vereadorId: m.vereadorId,
        papel: m.papel,
      })),
    });
  }

  await registrarAuditoria({
    acao: "criar_comissao",
    entidade: "Comissao",
    entidadeId: comissao.id,
    referencia: comissao.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(comissao);
}
