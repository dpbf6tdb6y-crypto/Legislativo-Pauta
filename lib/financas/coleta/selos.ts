// Selo de cada número mostrado ao prefeito: de onde ele vem e até onde foi conferido.
import type { DbPrefeitura } from '@/lib/financas/db';
import { brl } from '@/lib/financas/dinheiro';

export type TipoSelo = 'oficial' | 'conferido' | 'provisorio' | 'divergente';
export interface Selo { tipo: TipoSelo; rotulo: string; detalhe: string }

const FIM_BIMESTRE = ['', 'fevereiro', 'abril', 'junho', 'agosto', 'outubro', 'dezembro'];
const ROTULO: Record<TipoSelo, string> = { oficial: 'Oficial', conferido: 'Conferido', provisorio: 'Provisório', divergente: 'Divergente' };
const selo = (tipo: TipoSelo, detalhe: string): Selo => ({ tipo, rotulo: ROTULO[tipo], detalhe });

export const SELO_OFICIAL = selo('oficial', 'Número do relatório homologado no SICONFI (Tesouro Nacional).');

export interface LinhaSelo { bimestre: number; item: string; rotulo: string; diferenca: bigint; confere: boolean }

/** Selo de um item pela conferência mais recente (o RREO homologado de maior bimestre). */
export function seloDoItem(linhas: LinhaSelo[], item: string): Selo {
  const doItem = linhas.filter((l) => l.item === item).sort((a, b) => b.bimestre - a.bimestre);
  const ult = doItem[0];
  if (!ult) return selo('provisorio', 'Dado do portal, ainda sem RREO homologado para comparar.');
  const mes = FIM_BIMESTRE[ult.bimestre];
  if (!ult.confere)
    return selo('divergente', `${brl(ult.diferenca < BigInt(0) ? -ult.diferenca : ult.diferenca)} ${ult.diferenca > BigInt(0) ? 'acima' : 'abaixo'} do RREO homologado até ${mes}. Confirmar com a Contabilidade.`);
  return selo('conferido', ult.bimestre === 6 ? `Igual ao RREO homologado do ano inteiro.` : `Igual ao RREO homologado até ${mes}. Os meses seguintes são provisórios até o próximo RREO.`);
}

/** Selos da execução do ano e a lista do que não confere no bimestre mais recente. */
export async function selosDaExecucao(db: DbPrefeitura, ano: number) {
  const linhas = await db.conferenciaOficial.findMany({ where: { ano }, orderBy: [{ bimestre: 'asc' }, { item: 'asc' }] });
  const ultimo = linhas.reduce((m, l) => Math.max(m, l.bimestre), 0);
  return {
    ano,
    ultimoBimestre: ultimo || null,
    receita: seloDoItem(linhas, 'receita'),
    empenhado: seloDoItem(linhas, 'empenhado'),
    liquidado: seloDoItem(linhas, 'liquidado'),
    pago: seloDoItem(linhas, 'pago'),
    divergencias: linhas.filter((l) => l.bimestre === ultimo && !l.confere),
  };
}
