import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";

export async function POST(req: Request) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { aprovadorId } = await req.json();
  if (!aprovadorId) return NextResponse.json({ error: "Selecione quem deve aprovar" }, { status: 400 });
  if (aprovadorId === usuario.id) return NextResponse.json({ error: "Selecione outra pessoa para aprovar." }, { status: 400 });

  const aprovador = await prisma.user.findUnique({ where: { id: aprovadorId } });
  if (!aprovador || !aprovador.ativo || !(aprovador.perfil === "master" || aprovador.podeVerIndicacoes)) {
    return NextResponse.json({ error: "Aprovador inválido" }, { status: 400 });
  }

  const solicitacao = await prisma.solicitacaoRelatorio.create({
    data: {
      solicitanteId: usuario.id,
      solicitanteNome: usuario.nome,
      aprovadorId: aprovador.id,
      aprovadorNome: aprovador.nome,
    },
  });

  return NextResponse.json(solicitacao, { status: 201 });
}
