import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { temPermissao } from "@/lib/permissoes";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeEditar")) return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });

  const body = await req.json();
  const opcao = await prisma.configOpcao.update({ where: { id: params.id }, data: body });
  return NextResponse.json(opcao);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeExcluir")) return NextResponse.json({ error: "Sem permissão para excluir" }, { status: 403 });

  await prisma.configOpcao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
