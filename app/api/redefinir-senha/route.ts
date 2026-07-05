import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { token, senha } = await req.json();

  if (!token || !senha) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  if (senha.length < 6) return NextResponse.json({ erro: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });

  const reset = await prisma.resetSenha.findUnique({ where: { token } });

  if (!reset || reset.usado || reset.expiraEm < new Date()) {
    return NextResponse.json({ erro: "Link inválido ou expirado." }, { status: 400 });
  }

  const hash = await bcrypt.hash(senha, 10);

  await prisma.user.update({
    where: { email: reset.email },
    data: { senha: hash },
  });

  await prisma.resetSenha.update({
    where: { token },
    data: { usado: true },
  });

  return NextResponse.json({ ok: true });
}
