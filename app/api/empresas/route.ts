import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function GET() {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const empresas = await prisma.empresa.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(empresas);
}

export async function POST(req: Request) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const nome = String(body.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da empresa" }, { status: 400 });

  try {
    const empresa = await prisma.empresa.create({ data: { nome } });
    await registrarAuditoria({
      acao: "criar_empresa",
      entidade: "Empresa",
      entidadeId: empresa.id,
      referencia: empresa.nome,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
    });
    return NextResponse.json(empresa, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma empresa com esse nome." }, { status: 409 });
    throw e;
  }
}
