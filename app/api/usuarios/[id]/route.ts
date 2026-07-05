import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const data: any = {
    nome: body.nome,
    perfil: body.perfil === "admin" ? "admin" : "operador",
    ativo: !!body.ativo,
  };

  if (body.novaSenha) {
    if (String(body.novaSenha).length < 6) {
      return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
    }
    data.senha = await bcrypt.hash(body.novaSenha, 10);
  }

  const usuario = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true },
  });

  await registrarAuditoria({
    acao: "atualizar_usuario",
    entidade: "User",
    entidadeId: usuario.id,
    referencia: usuario.nome,
    detalhes: { perfil: usuario.perfil, ativo: usuario.ativo },
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(usuario);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if ((session.user as any).id === params.id) return NextResponse.json({ error: "Não é possível excluir o próprio usuário." }, { status: 400 });

  const usuario = await prisma.user.delete({ where: { id: params.id } });

  await registrarAuditoria({
    acao: "excluir_usuario",
    entidade: "User",
    entidadeId: usuario.id,
    referencia: usuario.nome,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
