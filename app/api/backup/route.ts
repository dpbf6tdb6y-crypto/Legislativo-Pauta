import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarBackupEmail, gerarBackupXlsx } from "@/lib/backup";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const configEmail = await prisma.config.findUnique({ where: { chave: "backup_email" } });
  if (!configEmail?.valor) {
    return NextResponse.json({ error: "E-mail de backup não configurado. Configure na aba Backup." }, { status: 400 });
  }

  try {
    await enviarBackupEmail(configEmail.valor);
    await prisma.config.upsert({
      where: { chave: "backup_ultimo" },
      update: { valor: new Date().toISOString() },
      create: { chave: "backup_ultimo", valor: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error("[backup] Erro ao enviar backup:", err);
    return NextResponse.json({ error: `Erro ao enviar o backup: ${err.message || "erro desconhecido"}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Backup enviado por e-mail com sucesso!" });
}

// Download direto (sem e-mail)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const buffer = await gerarBackupXlsx();
  const nomeArquivo = `backup_legislativo-pauta_${new Date().toISOString().split("T")[0]}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
