// Pacote A: cálculos do painel do prefeito e regras de execução (E1, E2, E3, R1).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import {
  confiancaDados, execucao, pessoalLRF, resumoReceita, rgfEsperado, seloGeral, tempoDecorridoBp, ultimos12Meses,
  type ContaReceita, type IndicadorFiscalLido, type OrgaoAno,
} from '@/lib/financas/painel/fiscal';
import { descricaoLegivel, nomeCurtoReceita } from '@/lib/financas/painel/nomesReceita';
import { executarRegras, previaRegra, registrarRegras } from '@/lib/financas/regras/motor';

const rgf = (ano: number, periodo: number, kv: Record<string, string>): IndicadorFiscalLido[] =>
  Object.entries(kv).map(([chave, valor]) => ({ ano, periodo, relatorio: 'RGF', chave, valor }));
const LIM = { limite_alerta_pct: '48.6', limite_prudencial_pct: '51.3', limite_max_pct: '54' };

describe('pessoal × RCL (RGF do Executivo)', () => {
  // números do RGF de Nova Lima, 2º quadrimestre de 2026 (públicos, SICONFI)
  const ind = [
    ...rgf(2026, 1, { rcl: '1579967939.88', dtp: '488720540.54', dtp_pct: '31.1', ...LIM }),
    ...rgf(2026, 2, { rcl: '1568987153.71', rcl_ajustada: '1560794069.71', dtp: '498019293.83', dtp_pct: '31.91', ...LIM }),
  ];
  it('usa o quadrimestre mais recente e a RCL ajustada, com margens em centavos', () => {
    const p = pessoalLRF(ind)!;
    expect([p.ano, p.quadrimestre]).toEqual([2026, 2]);
    expect(p.rcl).toBe(156079406971n);
    expect(p.pctBp).toBe(3191n);
    expect(p.nivel).toBe('abaixo');
    // 1.560.794.069,71 × 48,6% = 758.545.917,87 ; − 498.019.293,83
    expect(p.limites[0].valor).toBe(75854591787n);
    expect(p.limites[0].margem).toBe(26052662404n);
    expect(p.folgaMensalAteAlerta).toBe(26052662404n / 12n);
  });
  it('classifica a faixa pelos limites do próprio RGF (Executivo: 48,6 / 51,3 / 54)', () => {
    const com = (pct: string) => pessoalLRF(rgf(2026, 2, { rcl: '1000', dtp: '1', dtp_pct: pct, ...LIM }))!.nivel;
    expect(com('48.59')).toBe('abaixo');
    expect(com('48.6')).toBe('alerta');
    expect(com('51.3')).toBe('prudencial');
    expect(com('54')).toBe('maximo');
    expect(pessoalLRF(rgf(2026, 2, { rcl: '1000', dtp: '600', dtp_pct: '60', ...LIM }))!.folgaMensalAteAlerta).toBeNull();
  });
  it('sem RGF completo não inventa número', () => {
    expect(pessoalLRF([])).toBeNull();
    expect(pessoalLRF(rgf(2026, 2, { rcl: '1000', dtp_pct: '30' }))).toBeNull();
  });
});

describe('execução do orçamento', () => {
  const o = (orgaoNome: string, dotInicial: bigint, dotAtual: bigint, empenhado: bigint, pago: bigint): OrgaoAno =>
    ({ orgaoCod: orgaoNome.slice(0, 2), orgaoNome, dotInicial, dotAtual, empenhado, liquidado: pago, pago });
  const orgaos = [
    o('CÂMARA MUNICIPAL DE TESTE', 100n, 100n, 90n, 80n),
    o('SECRETARIA DE OBRAS', 1000n, 1200n, 600n, 300n),
    o('SECRETARIA DE SAÚDE', 1000n, 1000n, 400n, 200n),
  ];
  it('separa a Câmara do Executivo e calcula empenhado e variação da LOA', () => {
    const e = execucao(2026, orgaos, new Date(2026, 6, 2))!;
    expect(e.executivo.dotAtual).toBe(2200n);
    expect(e.legislativo?.pago).toBe(80n);
    expect(e.municipio.pago).toBe(580n);
    expect(e.empenhadoBp).toBe(4545n);      // 1000 / 2200
    expect(e.variacaoDotacao).toBe(200n);
    expect(e.variacaoDotacaoBp).toBe(1000n); // 200 / 2000
  });
  it('parte do ano decorrida', () => {
    expect(tempoDecorridoBp(2026, new Date(2026, 0, 1))).toBe(0n);
    expect(tempoDecorridoBp(2025, new Date(2026, 5, 1))).toBe(10000n);
    expect(tempoDecorridoBp(2026, new Date(2026, 6, 2))).toBe(4986n); // 182 de 365 dias
  });
});

describe('receita', () => {
  const c = (contaCod: string, contaPai: string, nome: string, prev: bigint, arrec: bigint): ContaReceita =>
    ({ contaCod, contaPai, nome, previstoInicial: prev, previstoAtual: prev, arrecAteMes: arrec });
  const contas = [
    c('1000000000', '', 'RECEITAS CORRENTES', 1000n, 800n),
    c('1100000000', '1000000000', 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', 400n, 300n),
    c('1114511100', '1100000000', 'IMPOSTO SOBRE SERVIÇOS DE QUALQUER NATUREZA - ISSQN - PRINCIPAL', 300n, 250n),
    c('1114511300', '1100000000', 'IMPOSTO SOBRE SERVIÇOS DE QUALQUER NATUREZA - DÍVIDA ATIVA', 100n, 50n),
    c('1700000000', '1000000000', 'TRANSFERÊNCIAS CORRENTES', 600n, 500n),
    c('1711511100', '1700000000', 'COTA-PARTE DO FUNDO DE PARTICIPAÇÃO DOS MUNICÍPIOS - COTA MENSAL - PRINCIPAL', 600n, 500n),
    c('2000000000', '', 'RECEITAS DE CAPITAL', 100n, 20n),
    c('2400000000', '2000000000', 'TRANSFERÊNCIAS DE CAPITAL', 100n, 20n),
    c('90000000000', '', 'DEDUÇÕES DA RECEITA', 100n, 70n),
    c('91700000000', '90000000000', 'DEDUÇÕES TRANSFERÊNCIAS CORRENTES', 100n, 70n),
  ];
  it('receita líquida = correntes + capital − deduções; grupos por origem', () => {
    const r = resumoReceita(2026, 10, contas)!;
    expect(r.liquida.arrecadado).toBe(750n);
    expect(r.liquida.previstoAtual).toBe(1000n);
    expect(r.grupos.map((g) => g.cod)).toEqual(['1700000000', '1100000000', '2400000000']);
  });
  it('principais fontes juntam principal e dívida ativa pelo nome curto, sem as deduções', () => {
    const r = resumoReceita(2026, 10, contas)!;
    expect(r.fontes.map((f) => [f.nome, f.arrecadado])).toEqual([['FPM', 500n], ['ISS', 300n], ['Transferências de Capital', 20n]]);
    expect(r.fontes[1].contas).toBe(2);
  });
  it('nomes curtos pela descrição oficial da STN', () => {
    expect(nomeCurtoReceita('COTA-PARTE DA COMPENSAÇÃO FINANCEIRA PELA EXPLORAÇÃO DE RECURSOS MINERAIS - CFEM')).toBe('CFEM (mineração)');
    expect(nomeCurtoReceita('TRANSFERÊNCIAS DE RECURSOS DO BLOCO DE MANUTENÇÃO DAS AÇÕES E SERVIÇOS PÚBLICOS DE SAÚDE – ATENÇÃO P')).toBe('SUS');
    expect(nomeCurtoReceita('REMUNERAÇÃO DE DEPOSITOS BANCARIOS - GERAL - PRINCIPAL')).toBe('Rendimentos de aplicações');
    expect(nomeCurtoReceita('ALIENAÇÃO DE BENS MÓVEIS')).toBeNull();
    expect(descricaoLegivel('RECEITA PATRIMONIAL - PRINCIPAL')).toBe('Receita Patrimonial');
  });
});

describe('confiança dos dados e selo', () => {
  it('RGF esperado: 30 dias após o fim do quadrimestre', () => {
    expect(rgfEsperado(new Date(2026, 10, 16))).toMatchObject({ ano: 2026, quadrimestre: 2 });
    expect(rgfEsperado(new Date(2026, 8, 29))).toMatchObject({ ano: 2026, quadrimestre: 1 });
    expect(rgfEsperado(new Date(2026, 1, 1))).toMatchObject({ ano: 2025, quadrimestre: 3 });
  });
  it('últimos 12 meses fechados', () => {
    const m = ultimos12Meses(new Date(2026, 10, 16));
    expect([m[0], m[11], m.length]).toEqual(['2025/11', '2026/10', 12]);
    expect(ultimos12Meses(new Date(2026, 0, 10))).toEqual(Array.from({ length: 12 }, (_, i) => `2025/${String(i + 1).padStart(2, '0')}`));
  });
  it('aponta mês de folha faltando, RGF atrasado, coleta velha e coleta travada', () => {
    const hoje = new Date(2026, 10, 16, 12);
    const folha = [{ anoMes: '2026/09', linhasPortal: 10, linhasColetadas: 10 }, { anoMes: '2026/10', linhasPortal: 10, linhasColetadas: 9 }]; // o último fechado está incompleto
    const it_ = confiancaDados({
      hoje, ultimaColeta: { status: 'ok', fim: new Date(2026, 10, 10) }, coletaRodando: { inicio: new Date(2026, 10, 15, 23) },
      rgf: { ano: 2026, quadrimestre: 1 }, folhaMeses: folha,
    });
    const t = it_.map((i) => `${i.nivel}:${i.titulo} ${i.detalhe}`).join('\n');
    expect(t).toMatch(/observacao:Dados com 6 dias/);
    expect(t).toMatch(/observacao:Coleta em andamento há muito tempo/);
    expect(t).toMatch(/observacao:RGF do 2º quadrimestre de 2026 não consta/);
    expect(t).toMatch(/observacao:Folha do mês mais recente incompleta.*Falta a folha de 2026\/10.*linhas a menos que o portal: 2026\/10/);
    // com o último fechado completo (ou um mês mais novo), a folha está em dia
    const ok_ = confiancaDados({ hoje, ultimaColeta: null, coletaRodando: null, rgf: { ano: 2026, quadrimestre: 1 }, folhaMeses: [{ anoMes: '2026/11', linhasPortal: 10, linhasColetadas: 10 }] });
    expect(ok_.find((i) => /Folha/.test(i.titulo))).toMatchObject({ nivel: 'ok', titulo: 'Folha do mês mais recente completa' });
  });
  it('sem permissão de folha ou de orçamento, não fala da folha nem do RGF', () => {
    const it_ = confiancaDados({ hoje: new Date(2026, 10, 16), ultimaColeta: null, coletaRodando: null, rgf: undefined, folhaMeses: null });
    expect(it_.some((i) => /folha|RGF/i.test(i.titulo))).toBe(false);
    expect(confiancaDados({ hoje: new Date(2026, 10, 16), ultimaColeta: null, coletaRodando: null, rgf: null, folhaMeses: null }).some((i) => /RGF/.test(i.titulo))).toBe(true);
    expect(it_[0].nivel).toBe('atencao');
  });
  it('o selo assume o pior nível das frases', () => {
    expect(seloGeral([]).titulo).toBe('Tudo em dia');
    expect(seloGeral([{ nivel: 'ok', texto: '' }, { nivel: 'observacao', texto: '' }]).nivel).toBe('observacao');
    expect(seloGeral([{ nivel: 'atencao', texto: '' }, { nivel: 'observacao', texto: '' }]).titulo).toBe('Atenção');
  });
});

describe('regras de execução: nascem propostas e exigem o percentual de quem aprova', () => {
  const P = 'painel-teste';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 2, 12)); // 49,9% do ano
    await prismaSistema.prefeitura.upsert({ where: { id: P }, create: { id: P, nome: P, uf: 'MG', ibge: 2, conector: 'arquivo' }, update: {} });
    const db = dbDa(P);
    await db.despesaOrgaoMes.createMany({
      data: [
        { prefeituraId: P, ano: 2026, mes: 0, orgaoCod: '01', orgaoNome: 'CÂMARA MUNICIPAL', dotInicial: 10000n, dotAtual: 10000n, empenhado: 9000n, liquidado: 9000n, pago: 9000n, coletaId: 0 },
        { prefeituraId: P, ano: 2026, mes: 0, orgaoCod: '02', orgaoNome: 'SECRETARIA DE OBRAS', dotInicial: 100000n, dotAtual: 120000n, empenhado: 84000n, liquidado: 70000n, pago: 60000n, coletaId: 0 },
      ],
    });
    const conta = (contaCod: string, contaPai: string, previstoAtual: bigint, arrecAteMes: bigint) =>
      ({ prefeituraId: P, ano: 2026, mes: 6, contaCod, contaPai, nome: contaCod, redutora: false, previstoInicial: previstoAtual, previstoAtual, arrecAnterior: 0n, arrecMes: 0n, arrecAteMes });
    await db.receitaContaMes.createMany({ data: [conta('1000000000', '', 200000n, 70000n), conta('90000000000', '', 20000n, 5000n)] });
    await registrarRegras(P);
  });
  afterAll(() => vi.useRealTimers());

  it('as 4 regras aparecem como "proposta" e, sem percentual, a prévia não aponta nada', async () => {
    const regs = await dbDa(P).regra.findMany({ where: { codigo: { in: ['E1', 'E2', 'E3', 'R1'] } } });
    expect(regs.map((r) => r.estado)).toEqual(['proposta', 'proposta', 'proposta', 'proposta']);
    for (const c of ['E1', 'E2', 'E3', 'R1']) expect(await previaRegra(P, c)).toHaveLength(0);
    await executarRegras(P);
    expect(await dbDa(P).apontamento.count()).toBe(0);
  });

  it('com o percentual informado e aprovada, gera apontamento "para análise" uma vez só', async () => {
    const db = dbDa(P);
    const aprova = (codigo: string, p: object) => db.regra.updateMany({ where: { codigo }, data: { estado: 'aprovada', parametros: JSON.stringify(p), decididoPor: 'teste' } });
    // E1: empenhado 70% (84.000/120.000) × 49,9% do ano → 20,1 pontos acima
    await aprova('E1', { pontosAcima: 25 });
    expect(await previaRegra(P, 'E1')).toHaveLength(0);
    await aprova('E1', { pontosAcima: 15 });
    // E2: dotação do Executivo +20% sobre a LOA (a Câmara não entra)
    await aprova('E2', { percentual: 20 });
    expect(await previaRegra(P, 'E2')).toHaveLength(0);
    await aprova('E2', { percentual: 10 });
    // E3: receita líquida 65.000 × pago 69.000 (com a Câmara)
    await aprova('E3', { toleranciaPct: 0 });
    // E4: receita líquida 65.000 × empenhado 93.000 (com a Câmara: 9.000 + 84.000)
    await aprova('E4', { toleranciaPct: 0 });
    // R1: arrecadado 36,1% (65.000/180.000) × 49,9% do ano → 13,8 pontos abaixo
    await aprova('R1', { pontosAbaixo: 20 });
    await executarRegras(P);
    const ap = await db.apontamento.findMany({ orderBy: { regraCodigo: 'asc' } });
    expect(ap.map((a) => a.regraCodigo)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(ap.every((a) => a.status === 'para_analise')).toBe(true);
    expect(ap.find((a) => a.regraCodigo === 'E3')!.valorEncontrado).toBe('R$ 40,00');
    expect(ap.find((a) => a.regraCodigo === 'E4')!.valorEncontrado).toBe('R$ 280,00');
    expect(ap.find((a) => a.regraCodigo === 'E2')!.valorEncontrado).toBe('20,0%');
    await executarRegras(P);
    expect(await db.apontamento.count()).toBe(4);
  });

  it('outra prefeitura, com o mesmo percentual aprovado e sem dados, não herda os apontamentos', async () => {
    const O = 'painel-outra';
    await prismaSistema.prefeitura.upsert({ where: { id: O }, create: { id: O, nome: O, uf: 'MG', ibge: 3, conector: 'arquivo' }, update: {} });
    await registrarRegras(O);
    await dbDa(O).regra.updateMany({ where: { codigo: 'E2' }, data: { estado: 'aprovada', parametros: JSON.stringify({ percentual: 10 }) } });
    expect(await previaRegra(O, 'E2')).toHaveLength(0);
    await executarRegras(O);
    expect(await dbDa(O).apontamento.count()).toBe(0);
  });
});
