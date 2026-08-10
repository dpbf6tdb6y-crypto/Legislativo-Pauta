import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const perfil = (session.user as any).perfil;
  if (!["admin", "master"].includes(perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { principalId, duplicadoId } = await req.json();
  if (!principalId || !duplicadoId || principalId === duplicadoId) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  const [principal, duplicado] = await Promise.all([
    prisma.vereador.findUnique({ where: { id: principalId } }),
    prisma.vereador.findUnique({ where: { id: duplicadoId } }),
  ]);
  if (!principal || !duplicado) return NextResponse.json({ error: "Vereador não encontrado" }, { status: 404 });

  // Relações sem restrição de unicidade envolvendo vereadorId — reatribuição direta em lote
  await prisma.$transaction([
    prisma.emenda.updateMany({ where: { autorVereadorId: duplicadoId }, data: { autorVereadorId: principalId } }),
    prisma.segov.updateMany({ where: { vereadorId: duplicadoId }, data: { vereadorId: principalId } }),
    prisma.requerimento.updateMany({ where: { vereadorId: duplicadoId }, data: { vereadorId: principalId } }),
    prisma.tag.updateMany({ where: { vereadorId: duplicadoId }, data: { vereadorId: principalId } }),
    prisma.indicacaoCargo.updateMany({ where: { vereadorId: duplicadoId }, data: { vereadorId: principalId } }),
  ]);

  // Relações com restrição de unicidade (proposicaoId+vereadorId, comissaoId+papel etc.) —
  // tenta reatribuir linha a linha; se já existir a combinação no principal, descarta a linha duplicada
  const autorias = await prisma.proposicaoAutor.findMany({ where: { vereadorId: duplicadoId } });
  for (const a of autorias) {
    try {
      await prisma.proposicaoAutor.update({ where: { id: a.id }, data: { vereadorId: principalId } });
    } catch {
      await prisma.proposicaoAutor.delete({ where: { id: a.id } });
    }
  }

  const votos = await prisma.votoParecerVereador.findMany({ where: { vereadorId: duplicadoId } });
  for (const v of votos) {
    try {
      await prisma.votoParecerVereador.update({ where: { id: v.id }, data: { vereadorId: principalId } });
    } catch {
      await prisma.votoParecerVereador.delete({ where: { id: v.id } });
    }
  }

  const membros = await prisma.comissaoMembro.findMany({ where: { vereadorId: duplicadoId } });
  for (const m of membros) {
    try {
      await prisma.comissaoMembro.update({ where: { id: m.id }, data: { vereadorId: principalId } });
    } catch {
      await prisma.comissaoMembro.delete({ where: { id: m.id } });
    }
  }

  // Duplicado é desativado (não excluído) para preservar rastreabilidade
  await prisma.vereador.update({
    where: { id: duplicadoId },
    data: { ativo: false, nome: `[Mesclado em ${principal.nome}] ${duplicado.nome}` },
  });

  await registrarAuditoria({
    acao: "mesclar_vereador",
    entidade: "Vereador",
    entidadeId: principalId,
    referencia: `${duplicado.nome} → ${principal.nome}`,
    usuarioId: (session.user as any).id,
    usuarioNome: session.user?.name ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
