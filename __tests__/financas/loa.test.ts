// Equilíbrio da LOA e projeção de fechamento da receita (tela "Orçamento e metas"). Funções puras, sem banco.
import { describe, expect, it } from 'vitest';
import { equilibrioLOA, projecaoReceita, resumoReceita, type ContaReceita, type Totais } from '@/lib/financas/painel/fiscal';

const c = (contaCod: string, contaPai: string, nome: string, ini: bigint, atual: bigint, arrec: bigint): ContaReceita =>
  ({ contaCod, contaPai, nome, previstoInicial: ini, previstoAtual: atual, arrecAteMes: arrec });
const contas = [
  c('1000000000', '', 'RECEITAS CORRENTES', 900n, 1000n, 600n),
  c('1100000000', '1000000000', 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', 900n, 1000n, 600n),
  c('2000000000', '', 'RECEITAS DE CAPITAL', 100n, 100n, 20n),
  c('2400000000', '2000000000', 'TRANSFERÊNCIAS DE CAPITAL', 100n, 100n, 20n),
  c('90000000000', '', 'DEDUÇÕES DA RECEITA', 100n, 100n, 70n),
  c('91700000000', '90000000000', 'DEDUÇÕES TRANSFERÊNCIAS CORRENTES', 100n, 100n, 70n),
];
const rec = resumoReceita(2026, 10, contas)!;
const desp = (dotInicial: bigint, dotAtual: bigint): Totais => ({ dotInicial, dotAtual, empenhado: 0n, liquidado: 0n, pago: 0n });

describe('equilíbrio da LOA', () => {
  it('receita líquida prevista = correntes + capital − deduções, inicial e atualizada', () => {
    const e = equilibrioLOA(rec, desp(900n, 1000n))!;
    expect(e.recIni).toBe(900n);   // 900 + 100 − 100
    expect(e.recAtual).toBe(1000n); // 1000 + 100 − 100
  });
  it('LOA equilibrada na aprovação e despesa autorizada acima da receita prevista depois dos créditos', () => {
    const e = equilibrioLOA(rec, desp(900n, 1100n))!;
    expect(e.difIni).toBe(0n);
    expect(e.creditos).toBe(200n);
    expect(e.difAtual).toBe(100n);
    expect(e.difAtualBp).toBe(1000n); // 10%
  });
  it('despesa dentro da receita prevista: diferença negativa', () => {
    expect(equilibrioLOA(rec, desp(900n, 950n))!.difAtual).toBe(-50n);
  });
  it('sem receita ou sem despesa coletada: não calcula', () => {
    expect(equilibrioLOA(null, desp(1n, 1n))).toBeNull();
    expect(equilibrioLOA(rec, null)).toBeNull();
  });
});

describe('projeção de fechamento da receita', () => {
  const base = { previstoAtual: 1000n, despAtual: 1100n };
  it('repete a distribuição do ano anterior (50% já tinha entrado → dobra o realizado)', () => {
    const p = projecaoReceita({ ...base, realizado: 400n, anteriorAteMes: 500n, anteriorAno: 1000n })!;
    expect(p.fracaoBp).toBe(5000n);
    expect(p.projetada).toBe(800n);
    expect(p.contraPrevisao).toBe(-200n);
    expect(p.contraPrevisaoBp).toBe(8000n); // 80% da previsão
    expect(p.contraDespesa).toBe(-300n);
  });
  it('sem série do ano anterior (ou dados incoerentes): não projeta', () => {
    expect(projecaoReceita({ ...base, realizado: 400n, anteriorAteMes: 0n, anteriorAno: 1000n })).toBeNull();
    expect(projecaoReceita({ ...base, realizado: 400n, anteriorAteMes: 500n, anteriorAno: 0n })).toBeNull();
    expect(projecaoReceita({ ...base, realizado: 0n, anteriorAteMes: 500n, anteriorAno: 1000n })).toBeNull();
    expect(projecaoReceita({ ...base, realizado: 400n, anteriorAteMes: 1200n, anteriorAno: 1000n })).toBeNull();
  });
});
