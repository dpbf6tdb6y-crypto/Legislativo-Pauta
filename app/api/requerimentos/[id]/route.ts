import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const item = await prisma.requerimento.findUnique({
    where: { id: params.id },
    include: { vereador: true },
  });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.requerimento.update({
    where: { id: params.id },
    data: {
      data: body.data ? new Date(body.data) : undefined,
      texto: body.texto,
      status: body.status,
      relevancia: body.relevancia ?? null,
      vereadorId: body.vereadorId || null,
      origem: body.origem ?? null,
      categoria: body.categoria ?? null,
      secretaria: body.secretaria ?? null,
      dataConclusao: body.dataConclusao ? new Date(body.dataConclusao) : null,
      documentos: body.documentos ?? null,
    },
    include: { vereador: true },
  });
  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.requerimento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
