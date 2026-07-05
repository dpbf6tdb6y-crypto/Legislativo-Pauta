import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enviarResetSenha } from "@/lib/email";
import { registrarAuditoria } from "@/lib/auditoria";
import crypto from "crypto";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const alvo = await prisma.user.findUnique({ where: { id: params.id } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (!alvo.ativo) return NextResponse.json({ error: "Este usuário está inativo." }, { status: 400 });

  await prisma.resetSenha.updateMany({
    where: { email: alvo.email, usado: false },
    data: { usado: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.resetSenha.create({ data: { token, email: alvo.email, expiraEm } });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  await enviarResetSenha({ para: alvo.email, nome: alvo.nome, token, baseUrl });

  await registrarAuditoria({
    acao: "enviar_reset_senha",
    entidade: "User",
    entidadeId: alvo.id,
    referencia: alvo.nome,
    detalhes: { email: alvo.email },
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true, message: `E-mail de redefinição enviado para ${alvo.email}!` });
}
