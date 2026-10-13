import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoDoMenu } from "@/lib/acessos";

// Entrega o painel Fazenda só pra quem está logado. O HTML gerado embute
// nome e salário de cada servidor — por isso fica em private/ (fora de
// public/, que o Next serve sem login) e é lido do disco aqui.
export const dynamic = "force-dynamic";

const ARQUIVO = path.join(process.cwd(), "private", "fazenda", "painel.html");

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // o painel traz nome e salário de cada servidor: só quem tem o menu "Gestão - $$$" liberado (conferido no cadastro, não na sessão)
  const usuario = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { perfil: true, ativo: true, acessos: true, podeVerIndicacoes: true, podeCriar: true, podeEditar: true, podeExcluir: true, podeUsarMicrofone: true },
  });
  if (!usuario || !usuario.ativo || !acessoDoMenu(usuario as any, "gestao").ver) {
    return new NextResponse(
      '<!DOCTYPE html><meta charset="utf-8"><p style="font:14px sans-serif;padding:24px;color:#555">' +
        "Você não tem permissão para ver o painel de Gestão.</p>",
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  try {
    let html = await readFile(ARQUIVO, "utf-8");
    // pesquisa por pergunta/microfone: Master e Admin sempre; os demais conforme a permissão do cadastro
    const pode = usuario.perfil === "master" || usuario.perfil === "admin" || usuario.podeUsarMicrofone !== false;
    if (!pode) html = "<script>window.__SEM_PESQUISA=1</script>" + html;   // o painel não tem <head>: o script vai antes de tudo
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
