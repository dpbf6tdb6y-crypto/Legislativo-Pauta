import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, podeVerIndicacoes: true, createdAt: true },
  });
  return NextResponse.json(usuarios);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const meuPerfil = (session.user as any).perfil;
  if (!["admin", "master"].includes(meuPerfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const nome = String(body.nome || "");
  const email = String(body.email || "").trim().toLowerCase();
  const perfil = body.perfil === "admin" ? "admin" : "operador";
  const senha = String(body.senha || "");

  if (perfil === "admin" && meuPerfil !== "master") {
    return NextResponse.json({ error: "Apenas o Master pode criar usuários Administradores." }, { status: 403 });
  }
  if (!nome || !email || !senha) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  if (senha.length < 6) return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });

  try {
    const podeVerIndicacoes = !!body.podeVerIndicacoes;
    const usuario = await prisma.user.create({
      data: { nome, email, perfil, senha: await bcrypt.hash(senha, 10), podeVerIndicacoes },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true, podeVerIndicacoes: true },
    });

    await registrarAuditoria({
      acao: "criar_usuario",
      entidade: "User",
      entidadeId: usuario.id,
      referencia: usuario.nome,
      detalhes: { email: usuario.email, perfil: usuario.perfil },
      usuarioId: (session.user as any).id,
      usuarioNome: session.user?.name ?? undefined,
    });

    return NextResponse.json(usuario, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
    throw e;
  }
}
