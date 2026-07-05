import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const meuPerfil = (session.user as any).perfil;
  if (!["admin", "master"].includes(meuPerfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const alvo = await prisma.user.findUnique({ where: { id: params.id } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // Somente master pode editar outro master
  if (alvo.perfil === "master" && meuPerfil !== "master") {
    return NextResponse.json({ error: "Apenas o Master pode editar este usuário." }, { status: 403 });
  }

  const body = await req.json();
  const perfilSolicitado = body.perfil === "master" ? "master" : body.perfil === "admin" ? "admin" : "operador";

  if ((perfilSolicitado === "admin" || perfilSolicitado === "master") && meuPerfil !== "master") {
    return NextResponse.json({ error: "Apenas o Master pode definir perfil Administrador." }, { status: 403 });
  }

  const data: any = {
    nome: body.nome,
    perfil: perfilSolicitado,
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
  const meuPerfil = (session.user as any).perfil;
  if (!["admin", "master"].includes(meuPerfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if ((session.user as any).id === params.id) return NextResponse.json({ error: "Não é possível excluir o próprio usuário." }, { status: 400 });

  const alvo = await prisma.user.findUnique({ where: { id: params.id } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // Master nunca pode ser excluído por ninguém
  if (alvo.perfil === "master") return NextResponse.json({ error: "O usuário Master não pode ser excluído." }, { status: 403 });
  // Admin só pode ser excluído pelo master
  if (alvo.perfil === "admin" && meuPerfil !== "master") {
    return NextResponse.json({ error: "Apenas o Master pode excluir usuários Administradores." }, { status: 403 });
  }

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
