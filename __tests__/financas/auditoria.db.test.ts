// Auditoria por secretaria: prazos, histórico, sugestões e isolamento entre prefeituras.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { criarPonto, definirResponsavel, lerData, mudarStatus, registrarEvento, registrarReuniao } from '@/lib/financas/auditoria/acoes';
import { fichaSecretaria, visaoGeral } from '@/lib/financas/auditoria/dados';
import { mudancasDesde, ordenarPontos, resumoPontos, situacaoPrazo, sugerirOrgao, sugestoesSecretaria } from '@/lib/financas/auditoria/regras';

const d = (a: number, m: number, dia: number) => new Date(a, m - 1, dia, 12);
const HOJE = d(2026, 11, 16);

describe('prazos e ordem', () => {
  it('situação do prazo só vale para ponto aguardando a secretaria', () => {
    expect(situacaoPrazo({ status: 'aberto', prazo: d(2026, 11, 15) }, HOJE)).toBe('atrasado');
    expect(situacaoPrazo({ status: 'aberto', prazo: d(2026, 11, 16) }, HOJE)).toBe('vence_em_breve');
    expect(situacaoPrazo({ status: 'aberto', prazo: d(2026, 11, 23) }, HOJE)).toBe('vence_em_breve');
    expect(situacaoPrazo({ status: 'aberto', prazo: d(2026, 11, 24) }, HOJE)).toBe('no_prazo');
    expect(situacaoPrazo({ status: 'aberto', prazo: null }, HOJE)).toBe('sem_prazo');
    expect(situacaoPrazo({ status: 'respondido', prazo: d(2026, 1, 1) }, HOJE)).toBe('encerrado');
  });
  it('resumo e ordem: atrasados primeiro, encerrados por último', () => {
    const ps = [
      { id: 1, status: 'resolvido', prazo: d(2026, 1, 1), criadoEm: d(2026, 1, 1) },
      { id: 2, status: 'aberto', prazo: null, criadoEm: d(2026, 2, 1) },
      { id: 3, status: 'aberto', prazo: d(2026, 11, 1), criadoEm: d(2026, 3, 1) },
      { id: 4, status: 'respondido', prazo: null, criadoEm: d(2026, 4, 1) },
      { id: 5, status: 'aberto', prazo: d(2026, 10, 1), criadoEm: d(2026, 5, 1) },
    ];
    expect(resumoPontos(ps, HOJE)).toEqual({ abertos: 3, atrasados: 2, venceEmBreve: 0, respondidos: 1, resolvidos: 1 });
    expect(ordenarPontos(ps, HOJE).map((p) => p.id)).toEqual([5, 3, 2, 4, 1]);
  });
  it('o que mudou desde a última reunião', () => {
    const ev = [{ quando: d(2026, 11, 1) }, { quando: d(2026, 11, 10) }, { quando: d(2026, 11, 5) }];
    expect(mudancasDesde(ev, d(2026, 11, 5)).map((e) => e.quando.getDate())).toEqual([10]);
    expect(mudancasDesde(ev, null)).toHaveLength(3);
  });
  it('lê a data do formulário sem cair no dia anterior', () => {
    expect(lerData('2026-12-01')?.toLocaleDateString('pt-BR')).toBe('01/12/2026');
    expect(lerData('01/12/2026')).toBeNull();
    expect(lerData('')).toBeNull();
  });
});

describe('órgão do empenho', () => {
  const orgaos = [
    { orgaoCod: '09', orgaoNome: 'SECRETARIA MUNICIPAL DE EDUCAÇÃO' },
    { orgaoCod: '14', orgaoNome: 'SECRETARIA MUNICIPAL DE DESENVOLVIMENTO SOCIAL' },
    { orgaoCod: '21', orgaoNome: 'SECRETARIA MUNICIPAL DE DESENVOLVIMENTO ECONOMICO' },
    { orgaoCod: '04', orgaoNome: 'PROCURADORIA GERAL DO MUNICÍPIO' },
  ];
  it('acha pelo nome igual ou abreviado; não chuta quando não parece', () => {
    expect(sugerirOrgao('SECRETARIA MUNICIPAL DE EDUCACAO', orgaos)).toBe('09');
    expect(sugerirOrgao('SECRETARIA MUN. DE DESENVOLVIMENTO ECONOMICO, TRAB. E RENDA', orgaos)).toBe('21');
    expect(sugerirOrgao('PROCURADORIA GERAL DO MUNICÍPIO', orgaos)).toBe('04');
    expect(sugerirOrgao('CÂMARA MUNICIPAL DE NOVA LIMA', orgaos)).toBeNull();
    expect(sugerirOrgao('ENCARGOS GERAIS DO MUNICÍPIO', orgaos)).toBeNull();
  });
});

describe('sugestões só com fatos', () => {
  it('saldo negativo, contrato vencendo e apontamento viram sugestão; saldo positivo não', () => {
    const base = { orgaoCod: '09', ano: 2026, saldoTexto: 'x', contratosVencendo: [], apontamentos: [] };
    expect(sugestoesSecretaria({ ...base, saldoDotacao: 10n })).toHaveLength(0);
    const s = sugestoesSecretaria({
      ...base, saldoDotacao: -1n,
      contratosVencendo: [{ id: 7, numero: '12', ano: 2025, fornecedor: 'F', fim: d(2026, 12, 1), dias: 15 }],
      apontamentos: [{ id: 3, regraCodigo: 'C4', titulo: 't', resumo: 'r', baseLegal: 'b' }],
    });
    expect(s.map((x) => x.ref)).toEqual(['sugestao:saldo:09:2026', 'sugestao:contrato:7:2026-12-01', 'apontamento:3']);
    expect(JSON.stringify(s)).not.toMatch(/irregular/i);
  });
});

describe('fluxo de cobrança no banco', () => {
  const P = 'aud-teste', O = 'aud-outra';
  beforeAll(async () => {
    for (const id of [P, O])
      await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 4, conector: 'arquivo' }, update: {} });
    const linha = (orgaoCod: string, orgaoNome: string, dotAtual: bigint, empenhado: bigint) =>
      ({ prefeituraId: P, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: dotAtual, dotAtual, empenhado, liquidado: empenhado, pago: 0n, coletaId: 0 });
    await dbDa(P).despesaOrgaoMes.createMany({
      data: [linha('01', 'CÂMARA MUNICIPAL DE TESTE', 100n, 50n), linha('09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', 1000n, 1200n), linha('12', 'SECRETARIA MUNICIPAL DE SAÚDE', 1000n, 100n)],
    });
  });

  it('a Câmara não aparece na lista de secretarias cobradas', async () => {
    const v = await visaoGeral(dbDa(P), HOJE);
    expect(v.linhas.map((l) => l.orgaoCod)).toEqual(['09', '12']);
  });

  it('sugere o saldo negativo da Educação; depois de virar ponto, a sugestão some e não duplica', async () => {
    const db = dbDa(P);
    const f = (await fichaSecretaria(db, '09', HOJE))!;
    const sg = f.sugestoes.find((s) => s.ref.startsWith('sugestao:saldo'))!;
    expect(sg.titulo).toBe('Empenhado acima da dotação atualizada');
    const p1 = await criarPonto(db, 'Controlador', { orgaoCod: '09', titulo: sg.titulo, descricao: sg.descricao, baseLegal: sg.baseLegal, origemRef: sg.ref, origem: 'sugestao', prazo: d(2026, 11, 30) });
    const p2 = await criarPonto(db, 'Controlador', { orgaoCod: '09', titulo: sg.titulo, origemRef: sg.ref, origem: 'sugestao' });
    expect(p2.id).toBe(p1.id);
    expect((await fichaSecretaria(db, '09', HOJE))!.sugestoes.some((s) => s.ref === sg.ref)).toBe(false);
    expect(await db.pontoAuditoria.count()).toBe(1);
  });

  it('resposta → respondido; nova cobrança com prazo → aberto de novo; tudo no histórico', async () => {
    const db = dbDa(P);
    const p = (await db.pontoAuditoria.findFirst())!;
    await registrarEvento(db, 'Controlador', { pontoId: p.id, tipo: 'resposta', texto: 'Crédito suplementar em andamento', emNomeDe: 'Secretária de Educação' });
    expect((await db.pontoAuditoria.findFirst({ where: { id: p.id } }))!.status).toBe('respondido');
    await registrarEvento(db, 'Prefeito', { pontoId: p.id, tipo: 'cobranca', texto: 'Trazer o decreto', novoPrazo: d(2026, 12, 10) });
    const p2 = (await db.pontoAuditoria.findFirst({ where: { id: p.id } }))!;
    expect(p2.status).toBe('aberto');
    expect(p2.prazo?.toLocaleDateString('pt-BR')).toBe('10/12/2026');
    const ev = await db.eventoAuditoria.findMany({ where: { pontoId: p.id }, orderBy: { id: 'asc' } });
    expect(ev.map((e) => e.tipo)).toEqual(['criado', 'resposta', 'status', 'cobranca', 'prazo', 'status']);
    expect(ev[1].emNomeDe).toBe('Secretária de Educação');
    expect(ev[3].por).toBe('Prefeito');
  });

  it('encerrar exige dizer o que comprovou a solução', async () => {
    const db = dbDa(P);
    const p = (await db.pontoAuditoria.findFirst())!;
    await expect(mudarStatus(db, 'Controlador', p.id, 'resolvido')).rejects.toThrow(/comprovou/);
    await mudarStatus(db, 'Controlador', p.id, 'resolvido', 'Decreto 123/2026 publicado');
    expect((await db.pontoAuditoria.findFirst({ where: { id: p.id } }))!.status).toBe('resolvido');
    await expect(mudarStatus(db, 'Controlador', p.id, 'qualquer' as any)).rejects.toThrow(/inválido/);
  });

  it('responsável e reunião ficam registrados; a ficha mostra a última reunião', async () => {
    const db = dbDa(P);
    await definirResponsavel(db, 'Controlador', '12', 'Fulana de Tal', 'Secretária municipal');
    await definirResponsavel(db, 'Controlador', '12', 'Beltrana', 'Secretária municipal');
    expect(await db.responsavelSecretaria.count()).toBe(1);
    await registrarReuniao(db, 'Prefeito', '12', 'Prefeito, controlador, secretária', 'Combinado X');
    const f = (await fichaSecretaria(db, '12', HOJE))!;
    expect(f.responsavel?.nome).toBe('Beltrana');
    expect(f.ultimaReuniao).not.toBeNull();
    await expect(registrarReuniao(db, 'Prefeito', '99', '', '')).rejects.toThrow(/não encontrada/);
  });

  it('outra prefeitura não vê nem altera os pontos desta', async () => {
    const p = (await dbDa(P).pontoAuditoria.findFirst())!;
    const outra = dbDa(O);
    expect(await outra.pontoAuditoria.count()).toBe(0);
    expect(await outra.eventoAuditoria.count()).toBe(0);
    await expect(registrarEvento(outra, 'x', { pontoId: p.id, tipo: 'nota', texto: 'invasão' })).rejects.toThrow(/não encontrado/);
    await expect(mudarStatus(outra, 'x', p.id, 'cancelado', 'x')).rejects.toThrow(/não encontrado/);
    await expect(criarPonto(outra, 'x', { orgaoCod: '09', titulo: 'x' })).rejects.toThrow(/não encontrada/);
    expect(await dbDa(P).eventoAuditoria.count({ where: { texto: 'invasão' } })).toBe(0);
  });
});
