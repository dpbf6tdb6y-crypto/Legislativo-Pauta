// Folha por servidor: só o mês mais recente que o portal publicou (a tela de Pessoal mostra esse mês).
//  - o mês corrente é sondado e refeito a cada coleta (se o portal ainda não publicou, nada é gravado);
//  - o último mês fechado só é buscado se ainda não houver, guardado e completo, nenhum mês igual ou mais novo que ele.
// Meses antigos não são mais coletados nem refeitos.

import type { DbPrefeitura } from '@/lib/financas/db';

export const anoMesDe = (ano: number, mes0: number) => {
  const d = new Date(Date.UTC(ano, mes0, 1)); // mes0 pode ser negativo ou > 11
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export interface MesGuardado { anoMes: string; linhasPortal: number; linhasGuardadas: number }

export function mesesDeFolhaPendentes(guardados: MesGuardado[], hoje: Date): string[] {
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const corrente = anoMesDe(a, m), fechado = anoMesDe(a, m - 1);
  const completoRecente = guardados.some((g) => g.anoMes >= fechado && g.linhasPortal > 0 && g.linhasGuardadas === g.linhasPortal);
  return completoRecente ? [corrente] : [corrente, fechado];
}

/** Meses de folha guardados, com a contagem REAL de linhas (não a que a coleta anotou). */
export async function carregarMesesGuardados(db: DbPrefeitura): Promise<MesGuardado[]> {
  const [meses, contagem] = await Promise.all([db.folhaMes.findMany(), db.folhaLinha.groupBy({ by: ['anoMes'], _count: { _all: true } })]);
  return meses.map((m) => ({ anoMes: m.anoMes, linhasPortal: m.linhasPortal, linhasGuardadas: contagem.find((c) => c.anoMes === m.anoMes)?._count._all ?? 0 }));
}
