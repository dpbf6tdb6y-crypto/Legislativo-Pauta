import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
  return NextResponse.json(data);
}
