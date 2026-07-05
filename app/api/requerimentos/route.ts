import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const itens = await prisma.requerimento.findMany({
    include: { vereador: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(itens);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const ano = new Date().getFullYear();
  const count = await prisma.requerimento.count();
  const referencia = `REQ-${String(count + 1).padStart(3, "0")}/${ano}`;
  const item = await prisma.requerimento.create({
    data: {
      referencia,
      data: new Date(body.data),
      texto: body.texto,
      status: body.status || "Aguardando",
      relevancia: body.relevancia || null,
      vereadorId: body.vereadorId || null,
      origem: body.origem || null,
      categoria: body.categoria || null,
      secretaria: body.secretaria || null,
      dataConclusao: body.dataConclusao ? new Date(body.dataConclusao) : null,
      documentos: body.documentos || null,
    },
    include: { vereador: true },
  });

  await registrarAuditoria({
    acao: "criar_requerimento",
    entidade: "Requerimento",
    entidadeId: item.id,
    referencia: item.referencia,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json(item, { status: 201 });
}
