// Situação da coleta da Gestão $$$ (tela /dashboard/fazenda/coleta): última coleta, data de cada fonte,
// totais gravados e a conferência com o portal. Valores em centavos viram texto (o JSON não leva BigInt).
import { dbDa, PREFEITURA_PADRAO } from './db';
import { conciliar } from './coleta/conciliacao';
import { coletasInterrompidas, frescorFontes, idadeDias } from './coleta/frescor';

export async function situacaoColeta(hoje = new Date(), prefeituraId = PREFEITURA_PADRAO) {
  const db = dbDa(prefeituraId);
  const ano = hoje.getFullYear();
  const [coletas, fontes, interrompidas] = await Promise.all([
    db.coleta.findMany({ orderBy: { id: 'desc' }, take: 10 }),
    frescorFontes(db),
    coletasInterrompidas(db, hoje),
  ]);
  const [empenhos, liquidacoes, pagamentos, retencoes, restos, contratos, ligacoes, arquivos] = await Promise.all([
    db.empenho.count({ where: { ano } }),
    db.liquidacao.count({ where: { empenho: { ano } } }),
    db.pagamento.count({ where: { empenho: { ano } } }),
    db.retencaoLeitura.count(),
    db.restoPagar.count({ where: { exercicio: ano } }),
    db.contrato.count(),
    db.ligacaoContratoEmpenho.groupBy({ by: ['certeza'], _count: { _all: true } }),
    db.arquivoBruto.aggregate({ where: { apagadoEm: null }, _count: { _all: true }, _sum: { bytes: true } }),
  ]);
  const inconsistentes = await db.empenho.count({ where: { ano, inconsistencia: { not: null } } });
  const conferencia = empenhos ? await conciliar(db, ano) : null;
  const oficial = await db.conferenciaOficial.findMany({ where: { ano }, orderBy: [{ bimestre: 'desc' }, { item: 'asc' }] });

  return {
    ano,
    coletas: coletas.map((c) => ({
      id: c.id, inicio: c.inicio, fim: c.fim, status: c.status, portalAtualizadoEm: c.portalAtualizadoEm,
      minutos: c.fim ? Math.round((c.fim.getTime() - c.inicio.getTime()) / 60000) : null,
      erros: c.erros,
    })),
    interrompidas: interrompidas.length,
    fontes: fontes.map((f) => ({
      nome: f.nome, baixadoEm: f.baixadoEm, portal: f.portal, diaria: f.diaria,
      atrasada: f.diaria && idadeDias(f.baixadoEm, hoje) > 2,
    })),
    totais: {
      empenhos, liquidacoes, pagamentos, retencoes, restos, contratos, inconsistentes,
      ligacoesAlta: ligacoes.find((l) => l.certeza === 'alta')?._count._all ?? 0,
      ligacoesMedia: ligacoes.find((l) => l.certeza === 'media')?._count._all ?? 0,
      arquivosNoDisco: arquivos._count._all,
      mbNoDisco: Math.round((arquivos._sum.bytes ?? 0) / 1048576),
    },
    conferencia,
    oficial: oficial.map((l) => ({
      bimestre: l.bimestre, item: l.item, rotulo: l.rotulo, confere: l.confere,
      oficial: l.oficial.toString(), portal: l.portal.toString(), diferenca: l.diferenca.toString(),
    })),
  };
}

export type SituacaoColeta = Awaited<ReturnType<typeof situacaoColeta>>;
