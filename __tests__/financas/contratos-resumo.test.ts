// Resumo de contratos (tela "Contratos" da Gestão): totais, vencimentos em 90 dias, maiores fornecedores.
import { describe, expect, it } from 'vitest';
import { diasAte, resumoContratos, SITUACAO_VIGENTE, type ContratoResumivel } from '@/lib/financas/painel/contratos';

const hoje = new Date(2026, 10, 17); // 17/11/2026
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let n = 0;
const c = (forn: string, valor: bigint, fim: Date | null, situacao = SITUACAO_VIGENTE): ContratoResumivel =>
  ({ id: ++n, numero: String(n).padStart(3, '0'), ano: 2026, situacao, objeto: 'objeto', fornecedorNome: forn, fim, valorAtual: valor });

describe('diasAte', () => {
  it('conta dias de calendário, hoje = 0', () => {
    expect(diasAte(dia(2026, 11, 17), hoje)).toBe(0);
    expect(diasAte(dia(2026, 12, 17), hoje)).toBe(30);
    expect(diasAte(dia(2026, 11, 16), hoje)).toBe(-1);
  });
});

describe('resumoContratos', () => {
  const lista = [
    c('A', 1000n, dia(2026, 12, 1)),           // vence em 14 dias
    c('B', 500n, dia(2026, 11, 17)),           // vence hoje
    c('A', 300n, dia(2027, 6, 1)),             // vigente, longe
    c('C', 9000n, dia(2026, 11, 1), 'Contrato Encerrado'), // já terminou
    c('D', 200n, dia(2026, 12, 20)),           // 33 dias
    c('E', 100n, dia(2027, 3, 1)),             // 104 dias: fora da janela
    c('F', 50n, null),                         // vigente sem data de fim
  ];
  const r = resumoContratos(lista, hoje);
  it('totais: quantidade, valor e vigentes', () => {
    expect(r.quantidade).toBe(7);
    expect(r.valorTotal).toBe(11150n);
    expect(r.vigentes).toBe(6);
  });
  it('vencimentos: só vigentes em até 90 dias (inclui hoje), do mais próximo ao mais distante', () => {
    expect(r.vencimentos.map((v) => [v.fornecedorNome, v.dias])).toEqual([['B', 0], ['A', 14], ['D', 33]]);
    expect(r.valorVencendo).toBe(1700n);
  });
  it('maiores fornecedores somam os contratos do mesmo credor', () => {
    expect(r.fornecedores.slice(0, 2).map((f) => [f.nome, f.valor, f.contratos])).toEqual([['C', 9000n, 1], ['A', 1300n, 2]]);
  });
  it('lista vazia não quebra', () => {
    expect(resumoContratos([], hoje)).toMatchObject({ quantidade: 0, valorTotal: 0n, vigentes: 0, vencimentos: [], fornecedores: [] });
  });
});
