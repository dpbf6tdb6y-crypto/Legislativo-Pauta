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

// ───────── tabela: secretaria pelos empenhos, prazo, filtros e ordenação ─────────
import { agregarLigacoes, filtrarContratos, ordenarContratos, prazoContrato, type LinhaContrato } from '@/lib/financas/painel/contratos';

const l = (id: number, over: Partial<LinhaContrato> = {}): LinhaContrato => ({
  id, numero: String(id).padStart(3, '0'), ano: 2026, situacao: SITUACAO_VIGENTE, objeto: 'Limpeza', fornecedorNome: 'Alfa', fornecedorDoc: '111',
  inicio: dia(2026, 1, 1), fim: dia(2027, 1, 1), valorAtual: 100n, secretaria: null, outrasSecretarias: 0, empenhado: 0n, pago: 0n, alta: 0, media: 0, ...over,
});

describe('agregarLigacoes', () => {
  it('escolhe a secretaria que mais empenhou e conta as outras', () => {
    const r = agregarLigacoes([
      { certeza: 'alta', empenho: { orgao: 'SAÚDE', liquido: 300n, pago: 100n } },
      { certeza: 'media', empenho: { orgao: 'EDUCAÇÃO', liquido: 500n, pago: 0n } },
      { certeza: 'alta', empenho: { orgao: 'SAÚDE', liquido: 400n, pago: 50n } },
    ]);
    expect(r).toMatchObject({ empenhado: 1200n, pago: 150n, alta: 2, media: 1, secretaria: 'SAÚDE', outras: 1 });
  });
  it('sem empenho ligado: sem secretaria', () => {
    expect(agregarLigacoes([])).toMatchObject({ secretaria: null, outras: 0, empenhado: 0n });
  });
});

describe('prazoContrato', () => {
  it('textos e cores', () => {
    expect(prazoContrato(dia(2026, 12, 1), SITUACAO_VIGENTE, hoje)).toMatchObject({ dias: 14, texto: 'vence em 14 dias', tom: 'vermelho' });
    expect(prazoContrato(dia(2027, 1, 5), SITUACAO_VIGENTE, hoje)).toMatchObject({ tom: 'ambar' });
    expect(prazoContrato(dia(2026, 11, 17), SITUACAO_VIGENTE, hoje).texto).toBe('vence hoje');
    expect(prazoContrato(dia(2026, 11, 10), SITUACAO_VIGENTE, hoje)).toMatchObject({ texto: 'vencido há 7 dias', tom: 'vermelho' });
    expect(prazoContrato(dia(2026, 11, 10), 'Contrato Encerrado', hoje).tom).toBe('cinza');
    expect(prazoContrato(dia(2027, 6, 1), SITUACAO_VIGENTE, hoje)).toMatchObject({ tom: 'verde' });
    expect(prazoContrato(null, SITUACAO_VIGENTE, hoje)).toMatchObject({ dias: null, texto: 'sem data de fim' });
  });
});

describe('filtrarContratos', () => {
  const linhas = [
    l(1, { secretaria: 'SAÚDE', fornecedorNome: 'Médica Ltda', fornecedorDoc: '12345678000100', objeto: 'Gases medicinais', valorAtual: 500000n, fim: dia(2026, 12, 1) }),
    l(2, { secretaria: 'EDUCAÇÃO', fornecedorNome: 'Escola SA', valorAtual: 100n, fim: null }),
    l(3, { situacao: 'Contrato Encerrado', fim: dia(2026, 10, 1) }),
  ];
  it('contrato n/ano, credor sem acento ou CNPJ, objeto', () => {
    expect(filtrarContratos(linhas, { contrato: '1/2026' }, hoje).map((x) => x.id)).toEqual([1]);
    expect(filtrarContratos(linhas, { credor: 'medica' }, hoje).map((x) => x.id)).toEqual([1]);
    expect(filtrarContratos(linhas, { credor: '12.345.678/0001-00' }, hoje).map((x) => x.id)).toEqual([1]);
    expect(filtrarContratos(linhas, { objeto: 'GASES' }, hoje).map((x) => x.id)).toEqual([1]);
  });
  it('situação, secretaria (inclui "sem") e valor mínimo em reais', () => {
    expect(filtrarContratos(linhas, { situacao: 'Contrato Encerrado' }, hoje).map((x) => x.id)).toEqual([3]);
    expect(filtrarContratos(linhas, { secretaria: 'EDUCAÇÃO' }, hoje).map((x) => x.id)).toEqual([2]);
    expect(filtrarContratos(linhas, { secretaria: '__sem' }, hoje).map((x) => x.id)).toEqual([3]);
    expect(filtrarContratos(linhas, { valorMin: '4.000,00' }, hoje).map((x) => x.id)).toEqual([1]);
  });
  it('prazo: até 30/90 dias, vencidos, sem data de fim', () => {
    expect(filtrarContratos(linhas, { prazo: '30' }, hoje).map((x) => x.id)).toEqual([1]);
    expect(filtrarContratos(linhas, { prazo: 'vencido' }, hoje).map((x) => x.id)).toEqual([3]);
    expect(filtrarContratos(linhas, { prazo: 'semfim' }, hoje).map((x) => x.id)).toEqual([2]);
  });
});

describe('ordenarContratos', () => {
  const linhas = [
    l(1, { valorAtual: 300n, secretaria: 'SAÚDE', fim: dia(2027, 5, 1) }),
    l(2, { valorAtual: 900n, secretaria: null, fim: null }),
    l(3, { valorAtual: 100n, secretaria: 'EDUCAÇÃO', fim: dia(2026, 12, 1) }),
  ];
  it('valor do maior para o menor e do menor para o maior', () => {
    expect(ordenarContratos(linhas, 'valor', 'desc').map((x) => x.id)).toEqual([2, 1, 3]);
    expect(ordenarContratos(linhas, 'valor', 'asc').map((x) => x.id)).toEqual([3, 1, 2]);
  });
  it('sem secretaria / sem data ficam sempre no fim, nos dois sentidos', () => {
    expect(ordenarContratos(linhas, 'secretaria', 'asc').map((x) => x.id)).toEqual([3, 1, 2]);
    expect(ordenarContratos(linhas, 'secretaria', 'desc').map((x) => x.id)).toEqual([1, 3, 2]);
    expect(ordenarContratos(linhas, 'prazo', 'asc').map((x) => x.id)).toEqual([3, 1, 2]);
    expect(ordenarContratos(linhas, 'prazo', 'desc').map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it('contrato: ano e número', () => {
    expect(ordenarContratos([l(5, { ano: 2025 }), l(9), l(2)], 'contrato', 'desc').map((x) => x.id)).toEqual([9, 2, 5]);
  });
});
