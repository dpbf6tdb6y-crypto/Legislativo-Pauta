// Data de cada fonte de dados, pela prova de que ela foi baixada (ArquivoBruto) — e não pela "última coleta".
// Motivo: uma coleta parcial (ex.: só SICONFI) ou uma coleta que travou no meio fazia o painel dizer
// "dados atualizados" enquanto a despesa e a receita continuavam velhas.
import type { DbPrefeitura } from '@/lib/financas/db';

export interface FonteDado { chave: string; nome: string; baixadoEm: Date | null; portal: string; diaria: boolean }

// tipo do ArquivoBruto -> nome para a tela. "diaria" = entra na coleta de toda noite (a idade dela importa todo dia).
const FONTES: { chave: string; nome: string; tipos: string[]; diaria: boolean }[] = [
  { chave: 'despesa', nome: 'Despesa por secretaria', tipos: ['despesa_orgao'], diaria: true },
  { chave: 'receita', nome: 'Receita', tipos: ['receitas'], diaria: true },
  { chave: 'contratos', nome: 'Contratos', tipos: ['contratos'], diaria: true },
  { chave: 'restos', nome: 'Restos a pagar', tipos: ['restos_a_pagar'], diaria: true },
];

export async function frescorFontes(db: DbPrefeitura): Promise<FonteDado[]> {
  const grupos = await db.arquivoBruto.groupBy({ by: ['tipo'], _max: { baixadoEm: true } });
  const out: FonteDado[] = [];
  for (const f of FONTES) {
    const datas = grupos.filter((g) => f.tipos.includes(g.tipo)).map((g) => g._max.baixadoEm).filter((d): d is Date => !!d);
    const baixadoEm = datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;
    let portal = '';
    if (baixadoEm) {
      // a data que o próprio portal informava na coleta que baixou o arquivo (vazia se a coleta travou antes de anotar)
      const arq = await db.arquivoBruto.findFirst({ where: { tipo: { in: f.tipos }, baixadoEm }, select: { coletaId: true } });
      const col = arq ? await db.coleta.findFirst({ where: { id: arq.coletaId }, select: { portalAtualizadoEm: true } }) : null;
      portal = col?.portalAtualizadoEm ?? '';
    }
    out.push({ chave: f.chave, nome: f.nome, baixadoEm, portal, diaria: f.diaria });
  }
  // empenhos não guardam arquivo bruto (vêm um a um); vale a última atualização gravada
  const emp = await db.empenho.aggregate({ _max: { atualizadoEm: true } });
  out.splice(3, 0, { chave: 'empenhos', nome: 'Empenhos', baixadoEm: emp._max.atualizadoEm ?? null, portal: '', diaria: true });
  return out;
}

export const idadeDias = (d: Date | null, hoje: Date) => (d ? (hoje.getTime() - d.getTime()) / 86400000 : Infinity);

/** "16/11 01:46" */
export const dataCurta = (d: Date) => `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

/** Texto curto da data dos dados de despesa e receita (os que mais mudam e que a conferência usa). */
export function textoDadosDe(fs: FonteDado[]) {
  const d = fs.find((f) => f.chave === 'despesa');
  if (!d?.baixadoEm) return 'sem coleta de despesa';
  return `despesa baixada em ${dataCurta(d.baixadoEm)}${d.portal ? ` (portal atualizado em ${d.portal})` : ''}`;
}

/**
 * Coletas que começaram e não terminaram nos últimos 7 dias: as já marcadas como "interrompida"
 * e as "rodando" há mais de N horas (o processo morreu e nenhuma coleta nova passou para marcar).
 */
export async function coletasInterrompidas(db: DbPrefeitura, hoje: Date, horas = 6) {
  return db.coleta.findMany({
    where: {
      inicio: { gt: new Date(hoje.getTime() - 7 * 86400000) },
      OR: [{ status: 'interrompida' }, { status: 'rodando', inicio: { lt: new Date(hoje.getTime() - horas * 3600000) } }],
    },
    orderBy: { inicio: 'desc' }, select: { id: true, inicio: true },
  });
}

/** Status de coleta que terminou (bem ou mal) e tem resumo. */
export const STATUS_TERMINADA = ['ok', 'divergencia', 'falha'];
