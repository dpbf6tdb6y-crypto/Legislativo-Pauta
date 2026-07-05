import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const [emailConf, frequenciaConf, ultimoConf] = await Promise.all([
    prisma.config.findUnique({ where: { chave: "backup_email" } }),
    prisma.config.findUnique({ where: { chave: "backup_frequencia" } }),
    prisma.config.findUnique({ where: { chave: "backup_ultimo" } }),
  ]);

  return NextResponse.json({
    email: emailConf?.valor ?? "",
    frequencia: frequenciaConf?.valor ?? "desativado",
    ultimo: ultimoConf?.valor ?? null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { email, frequencia } = await req.json();

  const FREQUENCIAS_VALIDAS = ["diario", "a_cada_2_dias", "semanal", "mensal", "desativado"];
  if (!FREQUENCIAS_VALIDAS.includes(frequencia)) {
    return NextResponse.json({ error: "Frequência inválida" }, { status: 400 });
  }

  await Promise.all([
    prisma.config.upsert({
      where: { chave: "backup_email" },
      update: { valor: email },
      create: { chave: "backup_email", valor: email },
    }),
    prisma.config.upsert({
      where: { chave: "backup_frequencia" },
      update: { valor: frequencia },
      create: { chave: "backup_frequencia", valor: frequencia },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
