import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { senha } = await req.json();
  if (!senha) return NextResponse.json({ error: "Informe a senha" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user?.email ?? "" } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });

  return NextResponse.json({ ok: true });
}
