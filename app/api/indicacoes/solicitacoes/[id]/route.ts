import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const solicitacao = await prisma.solicitacaoRelatorio.findUnique({ where: { id: params.id } });
  if (!solicitacao) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (solicitacao.solicitanteId !== usuario.id && solicitacao.aprovadorId !== usuario.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json(solicitacao);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const solicitacao = await prisma.solicitacaoRelatorio.findUnique({ where: { id: params.id } });
  if (!solicitacao) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (solicitacao.aprovadorId !== usuario.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (solicitacao.status !== "pendente") return NextResponse.json({ error: "Solicitação já respondida" }, { status: 400 });

  const { status } = await req.json();
  if (!["aprovado", "negado"].includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const atualizada = await prisma.solicitacaoRelatorio.update({
    where: { id: params.id },
    data: { status, respondidoEm: new Date() },
  });

  return NextResponse.json(atualizada);
}
