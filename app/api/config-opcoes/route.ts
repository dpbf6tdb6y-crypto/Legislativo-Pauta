import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const incluirInativos = searchParams.get("incluirInativos") === "1";
  const opcoes = await prisma.configOpcao.findMany({
    where: { ...(tipo ? { tipo } : {}), ...(incluirInativos ? {} : { ativo: true }) },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json(opcoes);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { tipo, nome, codigo } = body;
  if (!tipo || !nome) return NextResponse.json({ error: "tipo e nome obrigatórios" }, { status: 400 });
  const count = await prisma.configOpcao.count({ where: { tipo } });
  const opcao = await prisma.configOpcao.create({ data: { tipo, nome: nome.trim(), codigo: codigo || null, ordem: count } });
  return NextResponse.json(opcao, { status: 201 });
}
