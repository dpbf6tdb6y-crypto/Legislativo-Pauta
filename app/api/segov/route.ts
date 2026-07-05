import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const status = searchParams.get("status");
  const vereadorId = searchParams.get("vereadorId");

  const data = await prisma.segov.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      ...(status ? { status } : {}),
      ...(vereadorId ? { vereadorId } : {}),
    },
    include: { vereador: true },
    orderBy: [{ ano: "desc" }, { numero: "asc" }],
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.segov.create({
    data: {
      numero: body.numero,
      ano: parseInt(body.ano) || new Date().getFullYear(),
      tipo: body.tipo,
      ementa: body.ementa,
      vereadorId: body.vereadorId || null,
      status: body.status || "Aguardando",
      dataEnvio: body.dataEnvio ? new Date(body.dataEnvio) : null,
      observacao: body.observacao || null,
    },
    include: { vereador: true },
  });
  return NextResponse.json(item);
}
