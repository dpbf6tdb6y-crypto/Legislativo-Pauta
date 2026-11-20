// Regras do Pacote C (vieram do compliance.gavix): O1, E5, E6, F2, C5 e RP1. Precisam de banco: só rodam com FIN_TESTE_BANCO=1 (CI).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarRegras, previaRegra, registrarRegras } from '@/lib/financas/regras/motor';

describe('regras do Pacote C: nascem propostas e só apontam com a aprovação', () => {
  const P = 'pacote-c-teste';
  const emp = (idOrigem: number, credorDoc: string, conta: string, valor: bigint, extra: Record<string, unknown> = {}) => ({
    prefeituraId: P, idOrigem, numero: String(idOrigem), data: new Date(2026, 2, 1), ano: 2026, tipo: 'ORDINARIO', orgao: '02', unidade: '1',
    credorDoc, credorNome: `CREDOR ${credorDoc}`, processo: '', natureza: 'X', contaDespesa: conta, fonte: '', funcao: '', subfuncao: '', programa: '', projeto: '',
    descricao: '', valor, anulado: 0n, aLiquidar: 0n, aPagar: 0n, ...extra,
  });
  const SERV = '339039 - OUTROS SERVIÇOS DE TERCEIROS - PJ';

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 2, 12));
    await prismaSistema.prefeitura.upsert({ where: { id: P }, create: { id: P, nome: P, uf: 'MG', ibge: 4, conector: 'arquivo' }, update: {} });
    const db = dbDa(P);
    await db.despesaOrgaoMes.createMany({
      data: [
        { prefeituraId: P, ano: 2026, mes: 0, orgaoCod: '01', orgaoNome: 'CÂMARA MUNICIPAL', dotInicial: 10000n, dotAtual: 10000n, empenhado: 9000n, liquidado: 9000n, pago: 9000n, coletaId: 0 },
        { prefeituraId: P, ano: 2026, mes: 0, orgaoCod: '02', orgaoNome: 'SECRETARIA DE OBRAS', dotInicial: 100000n, dotAtual: 130000n, empenhado: 131000n, liquidado: 70000n, pago: 60000n, coletaId: 0 },
      ],
    });
    // receita líquida: previsão 180.000 → 185.000 (+5.000); despesa 110.000 → 140.000 (+30.000)
    const conta = (contaCod: string, contaPai: string, ini: bigint, atual: bigint, arrec: bigint) =>
      ({ prefeituraId: P, ano: 2026, mes: 6, contaCod, contaPai, nome: contaCod, redutora: false, previstoInicial: ini, previstoAtual: atual, arrecAnterior: 0n, arrecMes: 0n, arrecAteMes: arrec });
    await db.receitaContaMes.createMany({ data: [conta('1000000000', '', 200000n, 205000n, 90000n), conta('90000000000', '', 20000n, 20000n, 10000n)] });
    const ind = (periodo: number, chave: string, valor: string) => ({ prefeituraId: P, ano: 2026, periodo, relatorio: 'RREO', chave, valor, coletaId: 0 });
    await db.indicadorFiscal.createMany({
      data: [ind(4, 'saldo_exercicios_anteriores', '100.00'), ind(4, 'primario_meta', '1000.00'), ind(4, 'primario_apurado', '-500.00')],
    });
    const rp = (idOrigem: number, tipo: string, inscrito: bigint, anulado: bigint, pago: bigint) =>
      ({ prefeituraId: P, idOrigem, numero: String(idOrigem), anoOrigem: 2025, exercicio: 2026, tipo, empenhoIdOrigem: idOrigem, empenhoNumero: String(idOrigem), orgaoCod: '02', orgaoNome: 'OBRAS', credorDoc: '1', credorNome: 'A', inscrito, anulado, liquidado: 0n, pago });
    await db.restoPagar.createMany({ data: [rp(1, 'N', 100000n, 30000n, 20000n), rp(2, 'P', 50000n, 0n, 50000n)] });
    // C5: 3 empenhos ordinários do mesmo credor em serviços PJ (somam 90.000); outro com contrato citado; folha; estimativos
    await db.empenho.createMany({
      data: [
        emp(1, '111', SERV, 30000n), emp(2, '111', SERV, 30000n), emp(3, '111', SERV, 30000n),
        emp(4, '222', SERV, 90000n, { contratoCitado: '0001/2026' }),
        emp(5, '333', '319011 - VENCIMENTOS', 40000n), emp(6, '333', '319011 - VENCIMENTOS', 40000n), emp(7, '333', '319011 - VENCIMENTOS', 40000n),
        emp(8, '444', SERV, 30000n, { tipo: 'ESTIMATIVO' }), emp(9, '444', SERV, 30000n, { tipo: 'ESTIMATIVO' }), emp(10, '444', SERV, 30000n, { tipo: 'ESTIMATIVO' }),
      ],
    });
    await registrarRegras(P);
  });
  afterAll(() => vi.useRealTimers());

  const NOVAS = ['O1', 'E6', 'E5', 'F2', 'C5', 'RP1'];
  const param = (codigo: string, p: object) => dbDa(P).regra.updateMany({ where: { codigo }, data: { parametros: JSON.stringify(p) } });

  it('aparecem como "proposta"; as que dependem de um valor seu não apontam sem ele', async () => {
    const regs = await dbDa(P).regra.findMany({ where: { codigo: { in: NOVAS } } });
    expect(regs).toHaveLength(NOVAS.length);
    expect(regs.every((r) => r.estado === 'proposta')).toBe(true);
    for (const c of ['E5', 'C5', 'RP1']) expect(await previaRegra(P, c)).toHaveLength(0);
  });
  it('O1 acha o órgão que empenhou acima da dotação; a Câmara, que não passou, não entra', async () => {
    const a = await previaRegra(P, 'O1');
    expect(a).toHaveLength(1);
    expect(a[0].resumo).toContain('SECRETARIA DE OBRAS');
    expect(a[0].valorEncontrado).toBe('R$ 10,00');
  });
  it('E6: aumento de 30.000 na despesa − 5.000 de receita nova − 10.000 de saldo anterior = 15.000 sem cobertura', async () => {
    const a = await previaRegra(P, 'E6');
    expect(a).toHaveLength(1);
    expect(a[0].valorEncontrado).toBe('R$ 150,00');
  });
  it('E5 usa o percentual informado, órgão a órgão (Obras +30%)', async () => {
    await param('E5', { percentual: 40 });
    expect(await previaRegra(P, 'E5')).toHaveLength(0);
    await param('E5', { percentual: 20 });
    expect((await previaRegra(P, 'E5')).map((x) => x.valorEncontrado)).toEqual(['30,0%']);
  });
  it('F2 compara o primário apurado com a meta da LDO', async () => {
    const a = await previaRegra(P, 'F2');
    expect(a).toHaveLength(1);
    expect(a[0].valorEncontrado).toBe('-R$ 500,00');
  });
  it('RP1: 30% dos restos a pagar não processados foram cancelados (os processados não contam)', async () => {
    await param('RP1', { percentual: 40 });
    expect(await previaRegra(P, 'RP1')).toHaveLength(0);
    await param('RP1', { percentual: 20 });
    const a = await previaRegra(P, 'RP1');
    expect(a).toHaveLength(1);
    expect(a[0].valorEncontrado).toBe('30,0%');
  });
  it('C5 soma só empenhos ordinários, sem contrato, em compras e serviços; folha, estimativos e contratos ficam de fora', async () => {
    await param('C5', { limiteReais: 1000, minEmpenhos: 3 });
    expect(await previaRegra(P, 'C5')).toHaveLength(0); // R$ 900,00 não passa de R$ 1.000,00
    await param('C5', { limiteReais: 500, minEmpenhos: 3 });
    const a = await previaRegra(P, 'C5');
    expect(a).toHaveLength(1);
    expect(a[0].resumo).toContain('CREDOR 111');
    expect(a[0].valorEncontrado).toBe('R$ 900,00');
  });
  it('aprovadas, geram apontamento "para análise" uma única vez', async () => {
    const db = dbDa(P);
    await db.regra.updateMany({ where: { codigo: { in: NOVAS } }, data: { estado: 'aprovada', decididoPor: 'teste' } });
    await executarRegras(P);
    const ap = await db.apontamento.findMany({ orderBy: { regraCodigo: 'asc' } });
    expect(ap.map((x) => x.regraCodigo)).toEqual(['C5', 'E5', 'E6', 'F2', 'O1', 'RP1']);
    expect(ap.every((x) => x.status === 'para_analise')).toBe(true);
    await executarRegras(P);
    expect(await db.apontamento.count()).toBe(6);
  });
});
