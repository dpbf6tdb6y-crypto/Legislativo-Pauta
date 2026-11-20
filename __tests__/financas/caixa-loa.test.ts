// LOA × receita (cobertura dos créditos adicionais) e caixa do ano (entrou × saiu, com restos a pagar). Funções puras, sem banco.
import { describe, expect, it } from 'vitest';
import { caixaDoAno, coberturaCreditos, equilibrioLOA, resumoReceita, type ContaReceita, type Totais } from '@/lib/financas/painel/fiscal';

const c = (contaCod: string, contaPai: string, nome: string, ini: bigint, atual: bigint, arrec: bigint): ContaReceita =>
  ({ contaCod, contaPai, nome, previstoInicial: ini, previstoAtual: atual, arrecAteMes: arrec });
// receita líquida prevista: 180.000 → 185.000 (+5.000)
const contas = [
  c('1000000000', '', 'RECEITAS CORRENTES', 200000n, 205000n, 90000n),
  c('90000000000', '', 'DEDUÇÕES DA RECEITA', 20000n, 20000n, 10000n),
];
const rec = resumoReceita(2026, 6, contas)!;
// despesa autorizada: 110.000 → 140.000 (+30.000)
const desp: Totais = { dotInicial: 110000n, dotAtual: 140000n, empenhado: 0n, liquidado: 0n, pago: 0n };

describe('cobertura dos créditos adicionais', () => {
  it('o que cresceu na despesa e não veio de previsão de receita nova é o que precisa de superávit/excesso/anulação', () => {
    const eq = equilibrioLOA(rec, desp)!;
    const k = coberturaCreditos(2026, eq, null);
    expect(k.aumentoDespesa).toBe(30000n);
    expect(k.aumentoReceita).toBe(5000n);
    expect(k.semReceitaNova).toBe(25000n);
    expect(k.semExplicacao).toBeNull(); // sem o saldo do RREO não dá para dizer
  });
  it('com o saldo de anos anteriores do RREO: sobra só o que ele não cobre; saldo maior cobre tudo', () => {
    const eq = equilibrioLOA(rec, desp)!;
    expect(coberturaCreditos(2026, eq, 10000n).semExplicacao).toBe(15000n);
    expect(coberturaCreditos(2026, eq, 25000n).semExplicacao).toBe(0n);
    expect(coberturaCreditos(2026, eq, 40000n).semExplicacao).toBe(0n);
  });
  it('despesa e receita crescendo juntas: nada fica sem receita nova', () => {
    const eq = equilibrioLOA(rec, { ...desp, dotAtual: 115000n })!;
    expect(coberturaCreditos(2026, eq, null).semReceitaNova).toBe(0n);
  });
});

describe('caixa do ano', () => {
  it('o pago do portal não inclui restos a pagar: com eles, saiu mais do que a conta do portal mostra', () => {
    const k = caixaDoAno(2026, 1000n, 1050n, 200n, null);
    expect(k.saidas).toBe(1250n);
    expect(k.diferenca).toBe(250n);
    expect(k.diferencaSemRP).toBe(50n);
    expect(k.semCobertura).toBeNull();
  });
  it('saldo de anos anteriores cobre a diferença, parcialmente ou por inteiro', () => {
    expect(caixaDoAno(2026, 1000n, 1050n, 200n, 100n).semCobertura).toBe(150n);
    expect(caixaDoAno(2026, 1000n, 1050n, 200n, 300n).semCobertura).toBe(0n);
  });
  it('receita maior que a saída: sobra (diferença negativa)', () => {
    expect(caixaDoAno(2026, 1000n, 700n, 100n, null).diferenca).toBe(-200n);
  });
});
