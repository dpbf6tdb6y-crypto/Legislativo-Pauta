import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enviarCodigoFonteEmail } from "@/lib/backup-codigo";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const destino = session.user?.email;
  if (!destino) return NextResponse.json({ error: "Usuário sem e-mail cadastrado" }, { status: 400 });

  try {
    await enviarCodigoFonteEmail(destino);
  } catch (err: any) {
    console.error("[backup-codigo] Erro ao enviar:", err);
    return NextResponse.json({ error: `Erro ao enviar o backup de código: ${err.message || "erro desconhecido"}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: `Código-fonte enviado para ${destino}!` });
}
