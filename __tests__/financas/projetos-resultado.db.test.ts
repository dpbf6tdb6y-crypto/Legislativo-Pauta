// Fase C: riscos, indicadores de resultado, agrupamento por eixo/bairro.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { atorDe, criarProjeto, mudarFase } from '@/lib/financas/projetos/acoes';
import { acompanhamento, agruparPor, alertasDeAcompanhamento, carteira, projetosDaSecretaria, SEM_VALOR, sugestoesProjetos } from '@/lib/financas/projetos/dados';
import { alertasResultado, criarIndicador, fmtNum, lerNumero, progresso, registrarLeitura, ultimaLeitura, type IndicadorBase } from '@/lib/financas/projetos/indicadores';
import { alertasRisco, atualizarRisco, criarRisco, gravidade } from '@/lib/financas/projetos/riscos';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-24');

// ---------------------------------------------------------------- regras puras
// ---------------------------------------------------------------- com banco
const P = 'res-teste';
const gestor = atorDe({ nome: 'Prefeito', perfil: 'prefeito', orgaoCod: '' });
const sec09 = atorDe({ nome: 'Ana (Educação)', perfil: 'secretaria', orgaoCod: '09' });
const sec12 = atorDe({ nome: 'Beto (Saúde)', perfil: 'secretaria', orgaoCod: '12' });
const auditor = atorDe({ nome: 'Auditor', perfil: 'auditor', orgaoCod: '' });
let id = 0, concluido = 0;

beforeAll(async () => {
  await prismaSistema.prefeitura.upsert({ where: { id: P }, create: { id: P, nome: P, uf: 'MG', ibge: 9, conector: 'arquivo' }, update: {} });
  const linha = (orgaoCod: string, orgaoNome: string) => ({ prefeituraId: P, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: 100n, dotAtual: 100n, empenhado: 10n, liquidado: 10n, pago: 0n, coletaId: 0 });
  await dbDa(P).despesaOrgaoMes.createMany({ data: [linha('09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO'), linha('12', 'SECRETARIA MUNICIPAL DE SAÚDE')] });
  const db = dbDa(P);
  const base = { tipo: 'obra', orcamento: '1000000,00', inicioPrevisto: '2026-01-01', fimPrevisto: '2027-06-30', eixo: 'Educação', bairro: 'Vila Nova' };
  id = (await criarProjeto(db, gestor, { ...base, titulo: 'Escola integrada', secretariaLider: '09' })).id;
  await mudarFase(db, gestor, id, 'aprovado'); await mudarFase(db, gestor, id, 'execucao');
  concluido = (await criarProjeto(db, gestor, { ...base, titulo: 'Quadra poliesportiva', secretariaLider: '09', fimPrevisto: '2026-06-30' })).id;
  await mudarFase(db, gestor, concluido, 'aprovado'); await mudarFase(db, gestor, concluido, 'execucao'); await mudarFase(db, gestor, concluido, 'concluido');
});

describe('riscos', () => {
  let riscoId = 0;
  it('quem pode mexer registra; auditor não; a gravidade e o histórico saem do cadastro', async () => {
    const db = dbDa(P);
    await expect(criarRisco(db, auditor, id, { titulo: 'x', probabilidade: 2, impacto: 2 })).rejects.toThrow(/Sem permissão/);
    await expect(criarRisco(db, sec09, id, { titulo: 'x', probabilidade: 2, impacto: 2 })).rejects.toThrow(/Só o prefeito ou o controlador/); // nem a coordenadora
    await expect(criarRisco(db, gestor, id, { titulo: '  ', probabilidade: 2, impacto: 2 })).rejects.toThrow(/uma frase/);
    await expect(criarRisco(db, gestor, id, { titulo: 'x', probabilidade: 5, impacto: 2 })).rejects.toThrow(/Probabilidade/);
    await expect(criarRisco(db, sec12, id, { titulo: 'x', probabilidade: 2, impacto: 2 })).rejects.toThrow(/Projeto não encontrado/); // a Saúde não participa
    await expect(criarRisco(db, gestor, concluido, { titulo: 'x', probabilidade: 2, impacto: 2 })).rejects.toThrow(/encerrado/);
    const r = await criarRisco(db, gestor, id, { titulo: 'Licitação deserta', probabilidade: 3, impacto: 3 });
    riscoId = r.id;
    const ev = await db.eventoProjeto.findFirst({ where: { projetoId: id, tipo: 'risco' } });
    expect(ev!.texto).toMatch(/gravidade alta/);
    expect(ev!.por).toBe('Prefeito');
  });

  it('risco alto sem plano alerta; o plano resolve e passa o risco a "em mitigação"', async () => {
    const db = dbDa(P);
    const ac = await acompanhamento(db, [id]);
    expect(alertasRisco(ac.riscosDe(id), HOJE).map((a) => a.codigo)).toEqual([`risco_sem_plano:${riscoId}`]);
    await expect(atualizarRisco(db, gestor, id, riscoId, 'plano', { mitigacao: ' ' })).rejects.toThrow(/o que será feito/);
    await atualizarRisco(db, gestor, id, riscoId, 'plano', { mitigacao: 'Republicar o edital com preço revisto', responsavel: 'Ana', prazoMitigacao: '2026-12-15' });
    const r = (await acompanhamento(db, [id])).riscosDe(id)[0];
    expect(r).toMatchObject({ status: 'mitigando', responsavel: 'Ana' });
    expect(alertasRisco([r], HOJE)).toEqual([]);
  });

  it('reavaliar muda a gravidade; ocorreu e encerrar exigem texto; reabrir também; encerrado não aceita reavaliação', async () => {
    const db = dbDa(P);
    await atualizarRisco(db, gestor, id, riscoId, 'reavaliar', { probabilidade: 1, impacto: 2, motivo: 'Edital revisto' });
    expect((await db.eventoProjeto.findFirst({ where: { projetoId: id, tipo: 'risco' }, orderBy: { id: 'desc' } }))!.texto).toMatch(/probabilidade alta → baixa, impacto alto → médio. Edital revisto/);
    await expect(atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'ocorreu' })).rejects.toThrow(/o que aconteceu/);
    await expect(atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'inventado' })).rejects.toThrow(/inválida/);
    await atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'ocorreu', motivo: 'Segunda licitação também deserta' });
    const ac = await acompanhamento(db, [id]);
    expect(alertasRisco(ac.riscosDe(id), HOJE)[0]).toMatchObject({ nivel: 'alto', codigo: `risco_ocorreu:${riscoId}` });
    await expect(atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'encerrado' })).rejects.toThrow(/por que o risco foi encerrado/);
    await atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'encerrado', motivo: 'Contrato assinado' });
    await expect(atualizarRisco(db, gestor, id, riscoId, 'reavaliar', { probabilidade: 2, impacto: 2 })).rejects.toThrow(/reabra/);
    await expect(atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'aberto' })).rejects.toThrow(/reaberto/);
    await atualizarRisco(db, gestor, id, riscoId, 'status', { status: 'aberto', motivo: 'Contrato rescindido' });
    expect((await db.riscoProjeto.findFirst({ where: { id: riscoId } }))!.status).toBe('aberto');
    await expect(atualizarRisco(db, gestor, id + 999, riscoId, 'status', { status: 'aberto' })).rejects.toThrow(/Projeto não encontrado/);
  });

  it('risco que ocorreu vira assunto para cobrar da secretaria líder', async () => {
    const db = dbDa(P);
    await atualizarRisco(db, gestor, id, (await db.riscoProjeto.findFirst({ where: { projetoId: id } }))!.id, 'status', { status: 'ocorreu', motivo: 'Fornecedor desistiu' });
    const ps = await projetosDaSecretaria(db, '09', HOJE);
    const s = sugestoesProjetos(ps);
    expect(s.some((x) => x.titulo.includes('Escola integrada') && /se concretizou/.test(x.descricao))).toBe(true);
    expect(sugestoesProjetos(await projetosDaSecretaria(db, '12', HOJE))).toEqual([]);
  });
});

describe('indicadores no banco', () => {
  let indId = 0;
  it('cria o indicador com sentido automático e registra medições que não se editam', async () => {
    const db = dbDa(P);
    await expect(criarIndicador(db, gestor, id, { nome: '', linhaBase: 1, meta: 2 })).rejects.toThrow(/nome ao indicador/);
    await expect(criarIndicador(db, gestor, id, { nome: 'X', linhaBase: 5, meta: '5' })).rejects.toThrow(/diferente/);
    await expect(criarIndicador(db, auditor, id, { nome: 'X', linhaBase: 1, meta: 2 })).rejects.toThrow(/Sem permissão/);
    await expect(criarIndicador(db, sec09, id, { nome: 'X', linhaBase: 1, meta: 2 })).rejects.toThrow(/Só o prefeito ou o controlador/);
    const i = await criarIndicador(db, gestor, id, { nome: 'Alunos atendidos', unidade: 'alunos', linhaBase: '200', meta: '600', prazoMeta: '2027-07-01' });
    indId = i.id;
    expect(i.sentido).toBe('maior');
    expect((await criarIndicador(db, gestor, id, { nome: 'Tempo de espera', unidade: 'dias', linhaBase: '45', meta: '15' })).sentido).toBe('menor');
    await expect(registrarLeitura(db, gestor, id, indId, { valor: 'abc' })).rejects.toThrow(/números/);
    await expect(registrarLeitura(db, gestor, id, indId, { valor: '300', data: '2027-12-31' }, HOJE)).rejects.toThrow(/futuro/);
    await expect(registrarLeitura(db, gestor, id, indId + 999, { valor: '300' })).rejects.toThrow(/não encontrado/);
    await registrarLeitura(db, gestor, id, indId, { valor: '300', data: '2026-10-01', nota: 'Censo escolar' }, HOJE);
    await registrarLeitura(db, gestor, id, indId, { valor: '1.000', data: '2026-11-01' }, HOJE);
    const ind0 = (await acompanhamento(db, [id])).indicadoresDe(id).find((x) => x.id === indId)!;
    expect(ind0.leituras.map((l) => l.valor)).toEqual([300, 1000]);
    expect(progresso(ind0, ultimaLeitura(ind0.leituras)!.valor)).toBe(200);
    const ev = await db.eventoProjeto.findMany({ where: { projetoId: id, tipo: 'resultado' }, orderBy: { id: 'asc' } });
    expect(ev.at(-2)!.texto).toMatch(/Medição de “Alunos atendidos”: 300 alunos em 01\/10\/2026 \(25% do caminho até a meta\)\. Censo escolar/);
  });

  it('o resultado se mede depois de concluído; projeto cancelado não aceita', async () => {
    const db = dbDa(P);
    const i = await criarIndicador(db, gestor, concluido, { nome: 'Alunos na quadra', unidade: 'alunos', linhaBase: 0, meta: 300 });
    await registrarLeitura(db, gestor, concluido, i.id, { valor: '90', data: '2026-11-10' }, HOJE);
    const ac = await acompanhamento(db, [concluido]);
    expect(alertasResultado('concluido', ac.indicadoresDe(concluido), HOJE)[0]).toMatchObject({ nivel: 'medio', codigo: `meta_nao_atingida:${i.id}` });
    const cancel = (await criarProjeto(db, gestor, { titulo: 'Cancelado', tipo: 'obra', secretariaLider: '09' })).id;
    await mudarFase(db, gestor, cancel, 'cancelado', 'sem verba');
    await expect(criarIndicador(db, gestor, cancel, { nome: 'X', linhaBase: 1, meta: 2 })).rejects.toThrow(/cancelado/);
  });

  it('a carteira reúne os alertas de risco e meta, e filtra por eixo e bairro', async () => {
    const db = dbDa(P);
    const ps = await carteira(db, gestor, HOJE);
    const m = await alertasDeAcompanhamento(db, ps, HOJE);
    expect(m.get(id)!.some((a) => a.codigo.startsWith('risco_ocorreu'))).toBe(true);
    expect(m.get(concluido)!.some((a) => a.codigo.startsWith('meta_nao_atingida'))).toBe(true);
    expect((await carteira(db, gestor, HOJE, { eixo: 'educação' })).length).toBe(2);
    expect((await carteira(db, gestor, HOJE, { bairro: 'Vila Nova' })).length).toBe(2);
    expect((await carteira(db, gestor, HOJE, { bairro: SEM_VALOR })).map((p) => p.titulo)).toEqual(['Cancelado']);
    expect((await carteira(db, gestor, HOJE, { eixo: 'Inexistente' })).length).toBe(0);
    // quem não participa não vê riscos nem metas de projeto alheio
    expect((await carteira(db, sec12, HOJE)).length).toBe(0);
  });
});

