import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIndicacoes } from "@/lib/indicacoes-auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  if (body.nome !== undefined) data.nome = String(body.nome).trim();
  if (body.ativo !== undefined) data.ativo = !!body.ativo;

  try {
    const empresa = await prisma.empresa.update({ where: { id: params.id }, data });
    await registrarAuditoria({
      acao: "atualizar_empresa",
      entidade: "Empresa",
      entidadeId: empresa.id,
      referencia: empresa.nome,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
    });
    return NextResponse.json(empresa);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma empresa com esse nome." }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioIndicacoes();
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const emUso = await prisma.indicacaoCargo.count({ where: { empresaId: params.id } });
  if (emUso > 0) {
    return NextResponse.json({ error: "Esta empresa está em uso em indicações e não pode ser excluída." }, { status: 400 });
  }

  const empresa = await prisma.empresa.delete({ where: { id: params.id } });
  await registrarAuditoria({
    acao: "excluir_empresa",
    entidade: "Empresa",
    entidadeId: empresa.id,
    referencia: empresa.nome,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  });
  return NextResponse.json({ ok: true });
}
