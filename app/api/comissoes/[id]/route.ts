import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { nome, sigla, tipo, membros } = body;
  await prisma.comissao.update({ where: { id: params.id }, data: { nome, sigla, tipo } });
  if (membros) {
    await prisma.comissaoMembro.deleteMany({ where: { comissaoId: params.id } });
    await prisma.comissaoMembro.createMany({
      data: membros.map((m: { vereadorId: string; papel: string }) => ({
        comissaoId: params.id,
        vereadorId: m.vereadorId,
        papel: m.papel,
      })),
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.comissao.update({ where: { id: params.id }, data: { ativa: false } });
  return NextResponse.json({ ok: true });
}
