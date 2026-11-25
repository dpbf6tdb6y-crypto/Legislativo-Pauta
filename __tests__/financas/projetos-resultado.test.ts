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
describe('gravidade do risco', () => {
  it('probabilidade × impacto: 6 ou mais é alta, 3 e 4 média, o resto baixa', () => {
    expect(gravidade(3, 3)).toBe('alta'); expect(gravidade(2, 3)).toBe('alta'); expect(gravidade(3, 2)).toBe('alta');
    expect(gravidade(2, 2)).toBe('media'); expect(gravidade(1, 3)).toBe('media'); expect(gravidade(3, 1)).toBe('media');
    expect(gravidade(1, 1)).toBe('baixa'); expect(gravidade(2, 1)).toBe('baixa');
  });
});

describe('alertas de risco', () => {
  const r = (o = {}) => ({ id: 1, titulo: 'Licitação deserta', probabilidade: 3, impacto: 3, status: 'aberto', mitigacao: '', prazoMitigacao: null as Date | null, ...o });
  it('risco que ocorreu é grave; risco alto sem plano é atenção; encerrado não alerta', () => {
    expect(alertasRisco([r({ status: 'ocorreu', mitigacao: 'x' })], HOJE)[0]).toMatchObject({ nivel: 'alto', codigo: 'risco_ocorreu:1' });
    expect(alertasRisco([r()], HOJE)[0]).toMatchObject({ nivel: 'medio', codigo: 'risco_sem_plano:1' });
    expect(alertasRisco([r({ mitigacao: 'Plano B' })], HOJE)).toEqual([]);
    expect(alertasRisco([r({ probabilidade: 1, impacto: 1 })], HOJE)).toEqual([]);
    expect(alertasRisco([r({ status: 'encerrado' })], HOJE)).toEqual([]);
  });
  it('plano com prazo vencido alerta', () => {
    const a = alertasRisco([r({ mitigacao: 'x', prazoMitigacao: d('2026-11-14') })], HOJE);
    expect(a).toHaveLength(1);
    expect(a[0].texto).toMatch(/venceu há 10 dia/);
    expect(alertasRisco([r({ mitigacao: 'x', prazoMitigacao: d('2026-12-14') })], HOJE)).toEqual([]);
  });
});

const ind = (o: Partial<IndicadorBase> = {}): IndicadorBase => ({ id: 1, nome: 'Alunos atendidos', unidade: 'alunos', linhaBase: 200, meta: 600, prazoMeta: null, criadoEm: d('2026-01-01'), leituras: [], ...o });

describe('indicadores de resultado', () => {
  it('progresso é o caminho percorrido entre a linha de base e a meta, nos dois sentidos', () => {
    expect(progresso(ind(), 400)).toBe(50);
    expect(progresso(ind(), 600)).toBe(100);
    expect(progresso(ind(), 700)).toBe(125);
    expect(progresso(ind(), 150)).toBe(-12); // piorou (−12,5 arredonda para −12)
    expect(progresso(ind({ linhaBase: 45, meta: 15, unidade: 'dias' }), 30)).toBe(50); // menor é melhor (tempo de espera)
    expect(progresso(ind(), null)).toBeNull();
    expect(progresso(ind({ meta: 200 }), 100)).toBeNull();
  });
  it('lê números em formato brasileiro e recusa lixo', () => {
    expect(lerNumero('1.250', 'x')).toBe(1250);
    expect(lerNumero('12,5', 'x')).toBe(12.5);
    expect(lerNumero('1.250,75', 'x')).toBe(1250.75);
    expect(lerNumero('-3', 'x')).toBe(-3);
    expect(lerNumero('12.5', 'x')).toBe(12.5);
    expect(lerNumero('1.250.000', 'x')).toBe(1250000);
    expect(() => lerNumero('abc', 'o valor')).toThrow(/números/);
    expect(() => lerNumero('', 'o valor')).toThrow(/Informe/);
    expect(fmtNum(1250.5, 'alunos')).toBe('1.250,5 alunos');
  });
  it('a última leitura é a de data mais recente; na mesma data, a lançada por último', () => {
    const ls = [{ valor: 1, data: d('2026-03-01') }, { valor: 3, data: d('2026-05-01') }, { valor: 2, data: d('2026-05-01') }, { valor: 0, data: d('2026-01-01') }];
    expect(ultimaLeitura(ls)!.valor).toBe(2);
    expect(ultimaLeitura([])).toBeNull();
  });
  it('projeto concluído sem a meta é atenção; meta vencida também; sem leitura há 90 dias é aviso', () => {
    const lido = ind({ leituras: [{ valor: 360, data: d('2026-11-01') }] }); // 40%
    expect(alertasResultado('concluido', [lido], HOJE).find((a) => a.codigo.startsWith('meta_nao_atingida'))).toMatchObject({ nivel: 'medio' });
    expect(alertasResultado('execucao', [lido], HOJE)).toEqual([]); // ainda andando e sem prazo de meta
    const vencida = ind({ prazoMeta: d('2026-10-01'), leituras: [{ valor: 360, data: d('2026-11-01') }] });
    expect(alertasResultado('execucao', [vencida], HOJE)[0]).toMatchObject({ codigo: 'meta_vencida:1' });
    const velho = ind({ leituras: [{ valor: 300, data: d('2026-06-01') }] });
    expect(alertasResultado('execucao', [velho], HOJE)[0]).toMatchObject({ nivel: 'info', codigo: 'indicador_sem_leitura:1' });
    expect(alertasResultado('execucao', [ind()], HOJE)[0].texto).toMatch(/ainda sem nenhuma leitura/);
    const atingida = ind({ leituras: [{ valor: 650, data: d('2026-06-01') }] });
    expect(alertasResultado('concluido', [atingida], HOJE)).toEqual([]);
    expect(alertasResultado('cancelado', [lido], HOJE)).toEqual([]);
    expect(alertasResultado('estudo', [ind()], HOJE)).toEqual([]);
  });
});

describe('agrupamento por eixo e bairro', () => {
  it('conta só projetos em aberto, junta eixos iguais sem olhar maiúsculas e deixa "sem eixo" por último', () => {
    const p = (id: number, eixo: string, fase: string, o: Record<string, unknown> = {}) => ({ id, eixo, bairro: '', fase, saude: 'no_prazo', orcamento: 100n, ...o }) as never;
    const l = agruparPor([p(1, 'Saúde', 'execucao'), p(2, 'saúde', 'aprovado', { saude: 'atrasado' }), p(3, '', 'ideia'), p(4, 'Educação', 'concluido'), p(5, 'Obras', 'execucao')], 'eixo', new Map([[1, 40n], [2, 10n]]));
    expect(l.map((x) => [x.rotulo, x.projetos, x.atrasados, x.orcamento, x.pago])).toEqual([['Saúde', 2, 1, 200n, 50n], ['Obras', 1, 0, 100n, 0n], ['(sem eixo)', 1, 0, 100n, 0n]]);
    expect(l.at(-1)!.chave).toBe(SEM_VALOR);
  });
});

