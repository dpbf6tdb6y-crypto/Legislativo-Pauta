import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { temPermissao } from "@/lib/permissoes";
import { chaveProposicao, nomeDoTipo, siglaDoTipo, tipoAceito } from "@/lib/pauta-camara";

// Grava as proposições novas aprovadas na tela de revisão da pauta. Quem já existe no
// sistema (conferido de novo aqui, na hora de gravar) é pulado, nunca duplicado nem alterado.

type ItemRecebido = {
  tipo: string; numero: string | number; ano: number | string; ementa?: string
  autorNome?: string; vereadorId?: string | null; observacao?: string; dataEnvio?: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeImportar")) return NextResponse.json({ error: "Sem permissão para importar" }, { status: 403 });

  const { proposicoes } = (await req.json()) as { proposicoes?: ItemRecebido[] };
  const itens = Array.isArray(proposicoes) ? proposicoes : [];

  const anos = Array.from(new Set(itens.map(i => parseInt(String(i.ano))).filter(a => Number.isFinite(a))));
  // Foto do que já existia antes desta importação: o que for criado agora não conta como "já existe"
  const existentes = anos.length
    ? await prisma.segov.findMany({ where: { ano: { in: anos } }, select: { tipo: true, numero: true, ano: true } })
    : [];
  const jaNoSistema = new Set(existentes.map(e => chaveProposicao(e.tipo, e.numero, e.ano)));

  const criados: string[] = [];
  const jaExistiam: string[] = [];
  const erros: { ref: string; motivo: string }[] = [];

  for (const item of itens) {
    const sigla = siglaDoTipo(item.tipo);
    const ano = parseInt(String(item.ano));
    const numero = String(item.numero ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const ref = `${sigla ? nomeDoTipo(sigla) : item.tipo} ${item.numero}/${item.ano}`;

    if (!tipoAceito(sigla)) { erros.push({ ref, motivo: "Tipo fora do que a pauta importa hoje" }); continue; }
    if (!numero || !Number.isFinite(ano) || ano < 2000 || ano > 2100) { erros.push({ ref, motivo: "Número ou ano inválido" }); continue; }
    if (jaNoSistema.has(chaveProposicao(item.tipo, numero, ano))) { jaExistiam.push(ref); continue; }

    try {
      await prisma.segov.create({
        data: {
          tipo: nomeDoTipo(sigla!),
          numero,
          ano,
          ementa: item.ementa?.trim() || "(sem ementa)",
          vereadorId: item.vereadorId || null,
          autorNome: item.autorNome?.trim() || null,
          status: "Aguardando",
          observacao: item.observacao?.trim() || null,
          dataEnvio: item.dataEnvio ? new Date(item.dataEnvio) : null,
        },
      });
      criados.push(ref);
    } catch (e: any) {
      erros.push({ ref, motivo: "Não consegui gravar no banco" });
    }
  }

  const usuario = { usuarioId: (session.user as any).id, usuarioNome: session.user?.name ?? undefined };

  await registrarAuditoria({
    acao: "importar_segov",
    entidade: "Segov",
    detalhes: { criados, jaExistiam, erros },
    ...usuario,
  });

  await prisma.logImportacao.create({
    data: {
      origem: "segov_pauta",
      criados: criados.length,
      atualizados: 0,
      ignorados: jaExistiam.length,
      erros: erros.length,
      detalhes: { criados, jaExistiam, erros },
      ...usuario,
    },
  });

  return NextResponse.json({ criados: criados.length, atualizados: 0, ignorados: jaExistiam.length, erros: erros.length, jaExistiam, errosDetalhe: erros });
}
