import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoDoMenu } from "@/lib/acessos";
import { PERFIS, pode as perfilPode } from "@/lib/financas/perfis";
import { removerFolhaDoPainel } from "@/lib/financas/painelAnterior";

// Entrega o painel anterior só pra quem está logado. O HTML gerado embute
// os valores de cada servidor — por isso fica em private/ (fora de
// public/, que o Next serve sem login) e é lido do disco aqui.
// A lista por servidor só vai para quem tem a permissão de folha no Compliance.
export const dynamic = "force-dynamic";

const ARQUIVO = path.join(process.cwd(), "private", "fazenda", "painel.html");

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // só quem tem o menu "Compliance" liberado (conferido no cadastro, não na sessão); o perfil Secretaria vê só os próprios pontos
  const usuario = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { perfil: true, ativo: true, acessos: true, podeVerIndicacoes: true, podeCriar: true, podeEditar: true, podeExcluir: true, podeUsarMicrofone: true, gestaoPerfil: true },
  });
  const semPermissao = () => new NextResponse(
    '<!DOCTYPE html><meta charset="utf-8"><p style="font:14px sans-serif;padding:24px;color:#555">' +
      "Você não tem permissão para ver este painel.</p>",
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
  if (!usuario || !usuario.ativo || !acessoDoMenu(usuario as any, "gestao").ver || usuario.gestaoPerfil === "secretaria") return semPermissao();

  try {
    let html = await readFile(ARQUIVO, "utf-8");
    const perfilCompliance = usuario.gestaoPerfil && PERFIS[usuario.gestaoPerfil] ? usuario.gestaoPerfil : undefined;
    if (!perfilPode(perfilCompliance, "folha")) {
      const limpo = removerFolhaDoPainel(html);
      if (limpo === null) return semPermissao();
      html = limpo;
    }
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
