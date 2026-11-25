// Carteira de projetos: regras de fase, semáforo, avanço, cronograma e o fluxo com várias secretarias.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { PERFIS, pode } from '@/lib/financas/perfis';
import { atorDe, adicionarEtapa, adicionarParceira, atualizarEtapa, criarProjeto, editarProjeto, mudarFase, projetoVisivel, registrarAtualizacao, removerParceira } from '@/lib/financas/projetos/acoes';
import { carteira, fichaProjeto, indicadores, porSecretaria } from '@/lib/financas/projetos/dados';
import { avaliarProjeto, avancoPct, impedimentoDeFase, transicoesPermitidas, type EtapaBase } from '@/lib/financas/projetos/regras';
import { montarEscala, posicaoBarra, posicaoMarco } from '@/lib/financas/projetos/gantt';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-24');
const et = (o: Partial<EtapaBase> = {}): EtapaBase => ({ titulo: 'Licitação', peso: 1, status: 'pendente', inicioPrevisto: null, fimPrevisto: null, ...o });

describe('fases', () => {
  it('só o aprovador aprova, conclui e cancela; a secretaria inicia, pausa e retoma', () => {
    expect(transicoesPermitidas('ideia', true)).toEqual(['estudo', 'aprovado', 'cancelado']);
    expect(transicoesPermitidas('ideia', false)).toEqual(['estudo']);
    expect(transicoesPermitidas('aprovado', false)).toEqual(['execucao']);
    expect(transicoesPermitidas('execucao', false)).toEqual(['paralisado']);
    expect(transicoesPermitidas('paralisado', false)).toEqual(['execucao']);
    expect(transicoesPermitidas('concluido', true)).toEqual([]);
    expect(transicoesPermitidas('cancelado', true)).toEqual([]);
  });

  it('aprovar exige orçamento e datas; concluir exige etapas fechadas', () => {
    const base = { fase: 'estudo', inicioPrevisto: null, fimPrevisto: null, atualizadoEm: HOJE, orcamento: null };
    expect(impedimentoDeFase(base, [], 'aprovado')).toMatch(/orçamento/);
    expect(impedimentoDeFase({ ...base, orcamento: 100n }, [], 'aprovado')).toMatch(/início e o fim/);
    expect(impedimentoDeFase({ ...base, orcamento: 100n, inicioPrevisto: d('2026-12-01'), fimPrevisto: d('2027-06-01') }, [], 'aprovado')).toBeNull();
    expect(impedimentoDeFase({ ...base, fase: 'execucao' }, [et({ status: 'andamento' }), et({ status: 'concluida' }), et({ status: 'cancelada' })], 'concluido')).toMatch(/1 etapa/);
    expect(impedimentoDeFase({ ...base, fase: 'execucao' }, [et({ status: 'concluida' }), et({ status: 'cancelada' })], 'concluido')).toBeNull();
    expect(impedimentoDeFase({ ...base, fase: 'concluido' }, [], 'execucao')).toMatch(/Não é possível/);
  });
});

describe('avanço', () => {
  it('conta o peso das etapas concluídas; cancelada sai da conta; sem etapa não se mede', () => {
    expect(avancoPct('execucao', [])).toBeNull();
    expect(avancoPct('execucao', [et({ peso: 1, status: 'concluida' }), et({ peso: 3 })])).toBe(25);
    expect(avancoPct('execucao', [et({ peso: 1, status: 'concluida' }), et({ peso: 3, status: 'cancelada' })])).toBe(100);
    expect(avancoPct('concluido', [])).toBe(100);
  });
});

describe('semáforo', () => {
  const p = (o: object = {}) => ({ fase: 'execucao', inicioPrevisto: d('2026-01-01'), fimPrevisto: d('2027-01-01'), atualizadoEm: d('2026-11-20'), orcamento: 1n, ...o });

  it('ideia, estudo, paralisado, concluído e cancelado não têm semáforo', () => {
    expect(avaliarProjeto(p({ fase: 'ideia', fimPrevisto: d('2020-01-01') }), [], HOJE).saude).toBe('planejamento');
    expect(avaliarProjeto(p({ fase: 'paralisado', fimPrevisto: d('2020-01-01') }), [], HOJE).saude).toBe('paralisado');
    expect(avaliarProjeto(p({ fase: 'concluido' }), [], HOJE).saude).toBe('concluido');
    expect(avaliarProjeto(p({ fase: 'cancelado' }), [], HOJE).saude).toBe('cancelado');
  });

  it('no prazo quando nada aponta problema', () => {
    const a = avaliarProjeto(p({ inicioPrevisto: d('2026-09-01') }), [et({ status: 'concluida', peso: 1 }), et({ status: 'pendente', peso: 1, fimPrevisto: d('2026-12-30') })], HOJE);
    expect(a).toEqual({ saude: 'no_prazo', motivos: [], diasAtraso: 0 });
  });

  it('atrasado: prazo final vencido ou etapa vencida, com os dias de atraso', () => {
    const a = avaliarProjeto(p({ fimPrevisto: d('2026-11-14') }), [], HOJE);
    expect(a.saude).toBe('atrasado'); expect(a.diasAtraso).toBe(10); expect(a.motivos[0]).toMatch(/10 dia/);
    const b = avaliarProjeto(p(), [et({ titulo: 'Obra', status: 'andamento', fimPrevisto: d('2026-11-04') })], HOJE);
    expect(b.saude).toBe('atrasado'); expect(b.diasAtraso).toBe(20); expect(b.motivos[0]).toMatch(/Obra/);
    // etapa concluída com prazo vencido não pesa mais
    expect(avaliarProjeto(p(), [et({ status: 'concluida', fimPrevisto: d('2026-11-04') })], HOJE).saude).toBe('no_prazo');
  });

  it('atenção: ritmo abaixo do calendário, etapa perto do prazo sem começar, sem atualização há 30 dias', () => {
    const ritmo = avaliarProjeto(p({ inicioPrevisto: d('2026-01-01'), fimPrevisto: d('2026-12-31') }), [et({ status: 'concluida' }), et(), et(), et()], HOJE);
    expect(ritmo.saude).toBe('atencao'); expect(ritmo.motivos.join()).toMatch(/Avanço de 25%/);
    const perto = avaliarProjeto(p(), [et({ titulo: 'Edital', fimPrevisto: d('2026-11-28') })], HOJE);
    expect(perto.saude).toBe('atencao'); expect(perto.motivos[0]).toMatch(/Edital.*4 dia/);
    const velho = avaliarProjeto(p({ atualizadoEm: d('2026-09-01') }), [], HOJE);
    expect(velho.saude).toBe('atencao'); expect(velho.motivos[0]).toMatch(/Sem atualização há 84/);
  });

  it('aprovado que não começou: atenção até 30 dias, atrasado depois', () => {
    expect(avaliarProjeto(p({ fase: 'aprovado', inicioPrevisto: d('2026-11-14') }), [], HOJE).saude).toBe('atencao');
    expect(avaliarProjeto(p({ fase: 'aprovado', inicioPrevisto: d('2026-10-01') }), [], HOJE).saude).toBe('atrasado');
    expect(avaliarProjeto(p({ fase: 'aprovado', inicioPrevisto: d('2026-12-01') }), [], HOJE).saude).toBe('no_prazo');
  });
});

describe('cronograma', () => {
  it('escala automática: pelo menos 12 meses, com o hoje marcado', () => {
    const e = montarEscala([d('2026-03-10'), d('2026-08-20')], HOJE);
    expect(e.inicio).toEqual(new Date(2026, 2, 1));
    expect(e.colunas).toHaveLength(12); // mar/2026 a fev/2027
    expect(e.grupos.map((g) => g.rotulo)).toEqual(['2026', '2027']);
    expect(e.hojePct).toBeGreaterThan(0); expect(e.hojePct).toBeLessThan(100);
    expect(e.colunas.reduce((t, c) => t + c.larguraPct, 0)).toBeCloseTo(100, 5);
  });

  it('mais de 24 meses vira trimestres; com ano fixo vai de janeiro a dezembro', () => {
    const e = montarEscala([d('2025-02-10'), d('2028-11-20')], HOJE);
    expect(e.colunas.length).toBeLessThan(24); expect(e.colunas[0].rotulo).toBe('1º tri');
    const a = montarEscala([], HOJE, 2027);
    expect(a.dias).toBe(365); expect(a.hojePct).toBeNull(); expect(a.colunas).toHaveLength(12);
  });

  it('posição das barras: dentro, cortada e fora do período', () => {
    const e = montarEscala([], HOJE, 2026);
    const dentro = posicaoBarra(e, d('2026-01-01'), d('2026-12-31'))!;
    expect(dentro.esquerdaPct).toBeCloseTo(0, 5); expect(dentro.larguraPct).toBeCloseTo(100, 5); expect(dentro.cortadaEsq || dentro.cortadaDir).toBe(false);
    const cortada = posicaoBarra(e, d('2025-06-01'), d('2026-06-30'))!;
    expect(cortada.cortadaEsq).toBe(true); expect(cortada.cortadaDir).toBe(false); expect(cortada.esquerdaPct).toBe(0);
    expect(posicaoBarra(e, d('2027-01-10'), d('2027-03-01'))).toBeNull();
    expect(posicaoBarra(e, null, null)).toBeNull();
    expect(posicaoBarra(e, null, d('2026-05-05'))!.larguraPct).toBeGreaterThan(0); // só uma data: barra de 1 dia
    expect(posicaoMarco(e, d('2026-07-02'))).toBeGreaterThan(40); expect(posicaoMarco(e, d('2027-01-01'))).toBeNull();
  });
});

