import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data = await prisma.analista.update({ where: { id: params.id }, data: body });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.analista.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
