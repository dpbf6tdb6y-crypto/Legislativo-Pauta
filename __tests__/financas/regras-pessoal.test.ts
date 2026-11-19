// Regra P2: oscilação da folha entre meses. Sem banco: um banco de mentira com só o que a regra consulta.
import { describe, expect, it } from 'vitest';
import { REGRAS } from '@/lib/financas/regras/motor';

const P2 = REGRAS.find((r) => r.codigo === 'P2')!;
type Mes = { anoMes: string; linhasPortal: number; linhasColetadas: number };
const completo = (anoMes: string): Mes => ({ anoMes, linhasPortal: 100, linhasColetadas: 100 });
const bancoCom = (meses: Mes[], brutos: Record<string, bigint>) =>
  ({
    folhaMes: { findMany: async () => meses },
    folhaLinha: { aggregate: async ({ where }: { where: { anoMes: string } }) => ({ _sum: { bruto: brutos[where.anoMes] ?? null } }) },
  }) as any;

// valores em centavos
const BRUTOS: Record<string, bigint> = {
  '2026/07': 99_000_000n, // coleta incompleta: não entra
  '2026/08': 10_000_000n,
  '2026/09': 10_150_000n, // +1,5%
  '2026/10': 10_400_000n, // +2,46%
  '2026/11': 10_000_000n, // −3,84%
  '2026/12': 10_050_000n, // +0,5%
  '2027/01': 10_500_000n, // +4,47%, passando pela virada do ano
};
const MESES: Mes[] = [
  { anoMes: '2026/07', linhasPortal: 100, linhasColetadas: 60 },
  ...['2026/08', '2026/09', '2026/10', '2026/11', '2026/12', '2027/01'].map(completo),
];

describe('P2: oscilação da folha de pessoal', () => {
  it('nasce com 2% de limite (pedido do prefeito) e como regra a ser aprovada por uma pessoa', () => {
    expect(P2.parametrosPadrao).toEqual({ pctMax: 2 });
    expect(P2.baseLegal).toMatch(/não fixa limite/);
  });

  it('aponta variação acima de 2%, para mais e para menos, mês contra mês anterior', async () => {
    const a = await P2.avaliar(bancoCom(MESES, BRUTOS), { pctMax: 2 });
    expect(a.map((x) => x.chaveUnica)).toEqual(['P2:2026/10', 'P2:2026/11', 'P2:2027/01']);
    expect(a.map((x) => x.valorEncontrado)).toEqual(['+2,5%', '−3,8%', '+4,5%']);
    expect(a[0].resumo).toMatch(/Folha 2026\/10: bruto R\$\s104\.000,00 contra R\$\s101\.500,00 em 2026\/09/);
    expect(a[2].resumo).toMatch(/em 2026\/12/); // janeiro compara com dezembro do ano anterior
  });

  it('o limite é do controlador: com 5% nada passa; com 1% passa também setembro, mas não dezembro (+0,5%)', async () => {
    expect(await P2.avaliar(bancoCom(MESES, BRUTOS), { pctMax: 5 })).toHaveLength(0);
    const com1 = await P2.avaliar(bancoCom(MESES, BRUTOS), { pctMax: 1 });
    expect(com1.map((x) => x.chaveUnica)).toEqual(['P2:2026/09', 'P2:2026/10', 'P2:2026/11', 'P2:2027/01']);
  });

  it('mês com coleta incompleta não vira comparação, nem como base nem como alvo', async () => {
    const a = await P2.avaliar(bancoCom(MESES, BRUTOS), { pctMax: 2 });
    expect(a.some((x) => x.chaveUnica === 'P2:2026/07' || x.chaveUnica === 'P2:2026/08')).toBe(false);
  });

  it('sem mês anterior, sem folha ou com base zerada não inventa apontamento', async () => {
    expect(await P2.avaliar(bancoCom([], {}), { pctMax: 2 })).toEqual([]);
    expect(await P2.avaliar(bancoCom([completo('2026/10')], { '2026/10': 5n }), { pctMax: 2 })).toEqual([]);
    expect(await P2.avaliar(bancoCom([completo('2026/09'), completo('2026/10')], { '2026/09': 0n, '2026/10': 5n }), { pctMax: 2 })).toEqual([]);
  });
});

describe('E4: empenhado acima da receita', () => {
  const E4 = REGRAS.find((r) => r.codigo === 'E4')!;
  it('exige a tolerância antes de aprovar e não avalia sem ela', async () => {
    expect(E4.exigeParametro).toEqual(['toleranciaPct']);
    expect(await E4.avaliar({} as any, { toleranciaPct: null })).toEqual([]);
  });
  it('avisa que empenhar acima do arrecadado até a data pode ser legítimo', () => {
    expect(E4.descricao).toMatch(/comum/);
    expect(E4.baseLegal).toMatch(/art\. 9º \(limitação de empenho\)/);
  });
});
