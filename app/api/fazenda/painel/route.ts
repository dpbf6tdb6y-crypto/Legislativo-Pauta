import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";

// Entrega o painel Fazenda só pra quem está logado. O HTML gerado embute
// nome e salário de cada servidor — por isso fica em private/ (fora de
// public/, que o Next serve sem login) e é lido do disco aqui.
export const dynamic = "force-dynamic";

const ARQUIVO = path.join(process.cwd(), "private", "fazenda", "painel.html");

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const html = await readFile(ARQUIVO, "utf-8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(
      '<!DOCTYPE html><meta charset="utf-8"><p style="font:14px sans-serif;padding:24px;color:#555">' +
        "O painel ainda não foi gerado neste servidor.</p>",
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }
}
