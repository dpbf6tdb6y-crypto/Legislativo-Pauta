// Robô único: leitura dos relatórios consolidados, anexos do RREO, travas, conferência com o oficial e selos.
// Arquivos-gabarito públicos: portal de Nova Lima (ago/2026) e SICONFI (RREO do 4º bimestre de 2026).
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { lerDespesaFuncaoXml, lerDespesaNaturezaXml, lerReceitaXml } from '@/lib/financas/conectores/abaco/leitores';
import { extrairCaixa, extrairFuncoes, extrairGrupos, extrairRestos, extrairRreoSimplificado, FUNCOES_GOVERNO, nomeFuncao, periodosHomologados, populacaoDe } from '@/lib/financas/conectores/siconfi';
import { conferirListaContratos, conferirSomaReceita, conferirVolumeFolha } from '@/lib/financas/coleta/travas';
import { compararBimestre } from '@/lib/financas/coleta/conferenciaOficial';
import { seloDoItem } from '@/lib/financas/coleta/selos';

const G = (n: string) => fs.readFileSync(`__tests__/financas/fixtures/abaco/${n}`, 'utf-8');
const S = (n: string) => JSON.parse(fs.readFileSync(path.resolve('__tests__/financas/fixtures/siconfi', `rreo_3144805_2026_b4_anexo${n}.json`), 'utf-8')).items;
const soma = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const mapa = (xs: { chave: string; valor: string }[]) => Object.fromEntries(xs.map((x) => [x.chave, x.valor]));

describe('relatórios consolidados do portal (ago/2026)', () => {
  const nat = lerDespesaNaturezaXml(G('despesa_natureza_2026-08.xml'), 2026, 8);
  const fun = lerDespesaFuncaoXml(G('despesa_funcao_2026-08.xml'), 2026, 8);
  it('natureza e função somam o mesmo que a despesa por órgão do mês', () => {
    for (const xs of [nat, fun]) {
      expect(soma(xs.map((x) => x.empenhado))).toBe(6162256603n);
      expect(soma(xs.map((x) => x.liquidado))).toBe(15013871864n);
      expect(soma(xs.map((x) => x.pago))).toBe(14382397877n);
    }
    expect(nat).toHaveLength(53);
    expect(fun).toHaveLength(64);
  });
  it('mantém os códigos como texto (zero à esquerda)', () => {
    expect(fun[0]).toMatchObject({ funcaoCod: '04', subfuncaoCod: '129', funcaoNome: 'ADMINISTRAÇÃO' });
    expect(nat[0].naturezaCod).toBe('317170');
  });
  it('recusa arquivo com filtro diferente do pedido', () => {
    expect(() => lerDespesaNaturezaXml(G('despesa_natureza_2026-08.xml'), 2026, 7)).toThrow(/filtro/);
    expect(() => lerDespesaFuncaoXml(G('despesa_funcao_2026-08.xml'), 2025, 8)).toThrow(/filtro/);
  });
  it('mesma função/subfunção em duas linhas (2020): soma em uma só, sem perder valor', () => {
    const linha = (sub: string, ini: string, emp: string, liq: string, pago: string) =>
      `<SDTDespesaFuncao xmlns="x"><DespesaFuncaoCod>04</DespesaFuncaoCod><DespesaFuncaoNome>ADMINISTRAÇÃO</DespesaFuncaoNome><DespesaSubFuncaoCod>${sub}</DespesaSubFuncaoCod><DespesaSubFuncaoNome>ADMINISTRAÇÃO GERAL</DespesaSubFuncaoNome>` +
      `<DespesaFuncaoOrcValorInicial>${ini}</DespesaFuncaoOrcValorInicial><DespesaFuncaoOrcValorAtual>${ini}</DespesaFuncaoOrcValorAtual><DespesaFuncaoEmpTot>${emp}</DespesaFuncaoEmpTot><DespesaFuncaoLiqTot>${liq}</DespesaFuncaoLiqTot><DespesaFuncaoPagTot>${pago}</DespesaFuncaoPagTot></SDTDespesaFuncao>`;
    const arq = `<Export><Filtros><Ano>2020</Ano></Filtros><SDTDespesaFuncaoCollection xmlns="x">${linha('122', '66339953.00', '75304263.76', '73060676.96', '69677640.93')}${linha('122', '1318000.00', '0.00', '0.00', '0.00')}${linha('129', '13520990.00', '6716532.27', '6716532.27', '6716532.27')}</SDTDespesaFuncaoCollection></Export>`;
    const r = lerDespesaFuncaoXml(arq, 2020, 0);
    expect(r).toHaveLength(2);
    const geral = r.find((x) => x.subfuncaoCod === '122')!;
    expect(geral.dotInicial).toBe(6633995300n + 131800000n);
    expect(geral.empenhado).toBe(7530426376n);
    expect(soma(r.map((x) => x.empenhado))).toBe(7530426376n + 671653227n);
  });
});

describe('anexos do RREO (mesmos números que o painel antigo lia)', () => {
  it('Anexo 06: caixa', () => {
    expect(mapa(extrairCaixa(S('06'), 2026, 4))).toMatchObject({
      caixa_liquida_ant: '457337820.43', caixa_liquida_ate: '307591264.25', caixa_bruta_ate: '320907169.31',
      caixa_rp_proc_ate: '2898147.81', caixa_depositos_ate: '10417757.25',
    });
  });
  it('Anexo 06: conta que não fecha não é gravada', () => {
    const mexido = S('06').map((i: any) => (i.cod_conta?.startsWith('DisponibilidadeDeCaixaBruta') ? { ...i, valor: i.valor + 1000 } : i));
    expect(extrairCaixa(mexido, 2026, 4)).toEqual([]);
  });
  it('Anexo 07: restos a pagar', () => {
    expect(mapa(extrairRestos(S('07'), 2026, 4))).toMatchObject({
      rp7_ant_proc: '2292488.77', rp7_insc_proc: '38995534.63', rp7_pagos_nproc: '63128504.96', rp7_canc_nproc: '26844629.99', rp7_saldo_total: '12347712.22',
    });
  });
  it('Anexo 01: liquidado por grupo; Anexo 02: liquidado por função', () => {
    expect(mapa(extrairGrupos(S('01'), 2026, 4))).toEqual({
      'grupo_liq:31': '314498769.95', 'grupo_liq:32': '908873.39', 'grupo_liq:33': '646586823.46',
      'grupo_liq:44': '149270089.22', 'grupo_liq:45': '36544343.73', 'grupo_liq:46': '2816641',
    });
    const f = mapa(extrairFuncoes(S('02'), 2026, 4));
    expect(f['funcao_liq:SAUDE']).toBe('207759954.61');
    expect(f['funcao_liq:ADMINISTRACAO']).toBe('267286794.8');
    expect(Object.keys(f).every((k) => FUNCOES_GOVERNO.includes(k.split(':')[1]))).toBe(true);
    expect(soma(Object.values(f).map((v) => BigInt(Math.round(Number(v) * 100))))).toBe(115062554075n);
  });
  it('população e homologação', () => {
    expect(populacaoDe(S('01'))).toBe(120959);
    const h = periodosHomologados([
      { instituicao: 'Prefeitura Municipal de Nova Lima - MG', periodicidade: 'B', periodo: 4, status_relatorio: 'HO' },
      { instituicao: 'Prefeitura Municipal de Nova Lima - MG', periodicidade: 'B', periodo: 5, status_relatorio: 'RE' },
      { instituicao: 'Câmara de Vereadores de Nova Lima - MG', periodicidade: 'Q', periodo: 3, status_relatorio: 'HO' },
      { instituicao: 'Prefeitura Municipal de Nova Lima - MG', periodicidade: 'Q', periodo: 2, status_relatorio: 'HO' },
    ]);
    expect([...h.rreo]).toEqual([4]);
    expect([...h.rgf]).toEqual([2]);
  });
});

describe('travas da coleta', () => {
  const contas = lerReceitaXml(G('receitas_2026-10.xml'), 2026, 10);
  it('receita real do portal passa', () => expect(() => conferirSomaReceita(contas)).not.toThrow());
  it('conta adulterada é recusada', () => {
    const folha = contas.find((c) => !contas.some((x) => x.contaPai === c.contaCod) && c.arrecAteMes > 1000n)!;
    const ruim = contas.map((c) => (c === folha ? { ...c, arrecAteMes: c.arrecAteMes + 500n } : c));
    expect(() => conferirSomaReceita(ruim)).toThrow(/receita recusada/);
  });
  it('lista de contratos vazia ou encolhida é recusada', () => {
    expect(() => conferirListaContratos(0, 0)).toThrow(/vazia/);
    expect(() => conferirListaContratos(1500, 1775)).toThrow(/lista parcial/);
    expect(() => conferirListaContratos(1700, 1775)).not.toThrow();
    expect(() => conferirListaContratos(10, 0)).not.toThrow();
  });
  it('folha encolhida é recusada', () => {
    expect(() => conferirVolumeFolha('2026/09', 8000, 10650)).toThrow(/leitura parcial/);
    expect(() => conferirVolumeFolha('2026/09', 10651, 10650)).not.toThrow();
  });
});

describe('conferência com o RREO homologado', () => {
  const ind = new Map([...extrairRreoSimplificado(S('14'), 2026, 4), ...extrairGrupos(S('01'), 2026, 4), ...extrairFuncoes(S('02'), 2026, 4)]
    .map((i) => [i.chave, i.valor] as [string, string]));
  const portalIgual = {
    bimestre: 4,
    receita: 102610335986n,
    orgaos: { empenhado: 142576265569n, liquidado: 115062554075n, pago: 111138035607n },
    naturezas: new Map([['319011', 31449876995n], ['329021', 90887339n], ['339039', 64658682346n], ['449051', 14927008922n], ['459065', 3654434373n], ['469071', 281664100n]]),
    funcoes: null,
  };
  it('tudo igual: todas as linhas conferem', () => {
    const l = compararBimestre(ind, portalIgual);
    expect(l.map((x) => x.item)).toEqual(['receita', 'empenhado', 'liquidado', 'pago', 'natureza', 'grupo:31', 'grupo:32', 'grupo:33', 'grupo:44', 'grupo:45', 'grupo:46']);
    expect(l.every((x) => x.confere)).toBe(true);
  });
  it('o pago de hoje do portal aparece como divergência de R$ 14.090,31', () => {
    const l = compararBimestre(ind, { ...portalIgual, orgaos: { ...portalIgual.orgaos, pago: 111139444638n } });
    const p = l.find((x) => x.item === 'pago')!;
    expect(p).toMatchObject({ confere: false, diferenca: 1409031n });
  });
  it('função: compara nome a nome, inclusive a que só existe de um lado', () => {
    const funcoes = new Map([[nomeFuncao('SAÚDE'), 20775995461n], [nomeFuncao('EDUCAÇÃO'), 1n]]);
    const l = compararBimestre(ind, { ...portalIgual, naturezas: null, orgaos: null, receita: null, funcoes });
    expect(l.find((x) => x.item === 'funcao:SAUDE')?.confere).toBe(true);
    expect(l.find((x) => x.item === 'funcao:EDUCACAO')?.confere).toBe(false);
    expect(l.find((x) => x.item === 'funcao:URBANISMO')).toMatchObject({ confere: false, portal: 0n });
  });
  it('mês faltando: o item fica fora, não vira "confere"', () => {
    const l = compararBimestre(ind, { bimestre: 4, receita: null, orgaos: null, naturezas: null, funcoes: null });
    expect(l).toEqual([]);
  });
});

describe('selos', () => {
  const base = { rotulo: 'x', item: 'pago' };
  it('sem conferência: provisório', () => expect(seloDoItem([], 'pago').tipo).toBe('provisorio'));
  it('vale o bimestre mais recente', () => {
    const l = [{ ...base, bimestre: 3, confere: false, diferenca: 5n }, { ...base, bimestre: 4, confere: true, diferenca: 0n }];
    const s = seloDoItem(l, 'pago');
    expect(s.tipo).toBe('conferido');
    expect(s.detalhe).toMatch(/até agosto/);
  });
  it('divergente mostra o valor e o sentido', () => {
    const s = seloDoItem([{ ...base, bimestre: 4, confere: false, diferenca: 1409031n }], 'pago');
    expect(s.tipo).toBe('divergente');
    expect(s.detalhe).toMatch(/R\$ 14\.090,31 acima do RREO homologado até agosto/);
  });
});
