import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const poder = searchParams.get("poder");
  const apenasAtivos = searchParams.get("ativo") !== "false";

  const data = await prisma.vereador.findMany({
    where: {
      ...(apenasAtivos ? { ativo: true } : {}),
      ...(poder ? { poder } : {}),
    },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const data = await prisma.vereador.create({ data: body });

  await registrarAuditoria({
    acao: "criar_vereador",
    entidade: "Vereador",
    entidadeId: data.id,
    referencia: data.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(data);
}
