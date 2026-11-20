// Quais meses de folha a coleta da noite precisa buscar, para a tabela de Pessoal ficar sempre completa e com o mês mais recente.
//  - o mês corrente é sondado (se o portal ainda não publicou, a coleta não grava nada);
//  - o último mês fechado é refeito sempre (o portal pode corrigir lançamentos);
//  - o penúltimo, só na coleta completa (a rotina do SEGOV sempre pede o penúltimo);
//  - qualquer mês incompleto (linhas guardadas ≠ linhas do portal) ou faltando entre o primeiro mês guardado e o último fechado.
// Sem nenhuma folha guardada, só busca o último fechado: a carga dos 12 meses é a opção --inicial.

import type { DbPrefeitura } from '@/lib/financas/db';

export const anoMesDe = (ano: number, mes0: number) => {
  const d = new Date(Date.UTC(ano, mes0, 1)); // mes0 pode ser negativo ou > 11
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export interface MesGuardado { anoMes: string; linhasPortal: number; linhasGuardadas: number }

export function mesesDeFolhaPendentes(guardados: MesGuardado[], hoje: Date, completa = false): string[] {
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const corrente = anoMesDe(a, m), fechado = anoMesDe(a, m - 1), penultimo = anoMesDe(a, m - 2);
  const querer = new Set<string>([corrente, fechado]);
  if (completa) querer.add(penultimo);

  const tem = new Map(guardados.map((g) => [g.anoMes, g]));
  for (const g of guardados) if (g.linhasGuardadas !== g.linhasPortal || g.linhasPortal === 0) querer.add(g.anoMes);
  // lacunas: meses fechados sem folha entre o primeiro guardado e o último fechado
  const primeiro = guardados.map((g) => g.anoMes).sort()[0];
  if (primeiro) {
    for (let i = 0; i < 240; i++) {
      const am = anoMesDe(a, m - 1 - i);
      if (am < primeiro) break;
      if (!tem.has(am)) querer.add(am);
    }
  }
  return [...querer].sort().reverse(); // o mais recente primeiro
}



/** Meses de folha guardados, com a contagem REAL de linhas (não a que a coleta anotou). */
export async function carregarMesesGuardados(db: DbPrefeitura): Promise<MesGuardado[]> {
  const [meses, contagem] = await Promise.all([db.folhaMes.findMany(), db.folhaLinha.groupBy({ by: ['anoMes'], _count: { _all: true } })]);
  return meses.map((m) => ({ anoMes: m.anoMes, linhasPortal: m.linhasPortal, linhasGuardadas: contagem.find((c) => c.anoMes === m.anoMes)?._count._all ?? 0 }));
}
