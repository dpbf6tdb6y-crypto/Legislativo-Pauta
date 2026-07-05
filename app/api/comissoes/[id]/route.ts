import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.comissao.update({ where: { id: params.id }, data: { ativa: false } });
  return NextResponse.json({ ok: true });
}
