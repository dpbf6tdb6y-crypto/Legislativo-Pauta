import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarResetSenha } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ erro: "Email inválido." }, { status: 400 });

  const usuario = await prisma.user.findUnique({ where: { email } });

  // Sempre retorna sucesso para não revelar se o email existe
  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ ok: true });
  }

  await prisma.resetSenha.updateMany({
    where: { email, usado: false },
    data: { usado: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await prisma.resetSenha.create({ data: { token, email, expiraEm } });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  await enviarResetSenha({ para: email, nome: usuario.nome, token, baseUrl });

  return NextResponse.json({ ok: true });
}
