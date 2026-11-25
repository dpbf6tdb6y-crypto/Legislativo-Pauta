// Fase B: projeto × contratos e despesa do portal (ligação, soma sem repetir empenho, alertas, auditoria).
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { atorDe, criarProjeto, mudarFase } from '@/lib/financas/projetos/acoes';
import { carteira, projetosDaSecretaria, sugestoesProjetos } from '@/lib/financas/projetos/dados';
import { alertasFinanceiros, nivelMaximo, somarExecucao, type EmpenhoFin, type FinanceiroProjeto } from '@/lib/financas/projetos/financeiro';
import { candidatosVinculo, carregarFinanceiro, desvincular, vincularAcao, vincularContrato } from '@/lib/financas/projetos/vinculos';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-24');
const R = (reais: number) => BigInt(Math.round(reais * 100));

// ---------------------------------------------------------------- regras puras
const emp = (id: number, valor: number, pago: number, o: Partial<EmpenhoFin> = {}): EmpenhoFin => ({ id, valor: R(valor), anulado: 0n, aLiquidar: 0n, pago: R(pago), ultimoPagamento: null, ...o });
const vazio = (o: Partial<FinanceiroProjeto> = {}): FinanceiroProjeto => ({ contratos: [], acoes: [], contratado: 0n, execucao: somarExecucao([]), ...o });
const contratoFin = (o: Record<string, unknown> = {}) => ({
  vinculoId: 1, id: 7, numero: '0252', ano: 2025, fornecedorNome: 'Construtora X', objeto: 'Obra', situacao: 'Vigente', fim: d('2027-12-31'), valorAtual: R(1000),
  certeza: 'alta' as const, execucao: somarExecucao([]), outrosProjetos: [], ...o,
});
const base = { fase: 'execucao', orcamento: R(1000), inicioPrevisto: d('2026-01-01'), fimPrevisto: d('2027-06-30'), inicioReal: d('2026-01-10'), avanco: 50 };
const cod = (as: { codigo: string }[]) => as.map((a) => a.codigo.split(':')[0]);

describe('soma do gasto', () => {
  it('conta cada empenho uma vez, mesmo que contrato e ação alcancem o mesmo', () => {
    const a = emp(1, 1000, 300, { aLiquidar: R(400) }), b = emp(2, 500, 500);
    const r = somarExecucao([a, b, a]);
    expect(r).toMatchObject({ empenhos: 2, empenhado: R(1500), liquidado: R(1100), pago: R(800) });
  });
  it('desconta o anulado do empenhado', () => {
    expect(somarExecucao([emp(1, 1000, 0, { anulado: R(200) })]).empenhado).toBe(R(800));
  });
  it('guarda a data do último pagamento', () => {
    expect(somarExecucao([emp(1, 10, 10, { ultimoPagamento: d('2026-05-01') }), emp(2, 10, 10, { ultimoPagamento: d('2026-09-01') })]).ultimoPagamento).toEqual(d('2026-09-01'));
  });
});

describe('alertas de gasto', () => {
  it('projeto em execução sem ligação só recebe um aviso', () => {
    const a = alertasFinanceiros(base, vazio(), HOJE);
    expect(cod(a)).toEqual(['sem_ligacao']);
    expect(nivelMaximo(a)).toBe('info');
    expect(alertasFinanceiros({ ...base, fase: 'ideia' }, vazio(), HOJE)).toEqual([]);
  });

  it('estouro: empenhado acima do orçamento é grave; contratos acima do orçamento é atenção', () => {
    const c = contratoFin();
    const estouro = alertasFinanceiros(base, vazio({ contratos: [c], contratado: R(900), execucao: somarExecucao([emp(1, 1200, 100)]) }), HOJE);
    expect(estouro[0]).toMatchObject({ codigo: 'estouro', nivel: 'alto' });
    expect(estouro[0].texto).toMatch(/20% a mais/);
    const acima = alertasFinanceiros(base, vazio({ contratos: [c], contratado: R(1300), execucao: somarExecucao([emp(1, 900, 0)]) }), HOJE);
    expect(cod(acima)).toContain('contratado_acima');
    expect(cod(acima)).not.toContain('estouro');
  });

  it('pago bem à frente do avanço', () => {
    const f = vazio({ contratos: [contratoFin()], contratado: R(500), execucao: somarExecucao([emp(1, 800, 800)]) });
    expect(cod(alertasFinanceiros({ ...base, avanco: 30 }, f, HOJE))).toContain('pago_adiantado'); // 80% pago, 30% de avanço
    expect(cod(alertasFinanceiros({ ...base, avanco: 70 }, f, HOJE))).not.toContain('pago_adiantado');
    expect(cod(alertasFinanceiros({ ...base, avanco: null }, f, HOJE))).not.toContain('pago_adiantado'); // sem etapas não dá para comparar
  });

  it('em execução há mais de 60 dias sem nenhum empenho', () => {
    const f = vazio({ contratos: [contratoFin()] });
    expect(cod(alertasFinanceiros(base, f, HOJE))).toContain('sem_empenho');
    expect(cod(alertasFinanceiros({ ...base, inicioReal: d('2026-11-01') }, f, HOJE))).not.toContain('sem_empenho');
    expect(cod(alertasFinanceiros({ ...base, fase: 'aprovado' }, f, HOJE))).not.toContain('sem_empenho');
  });

  it('pagamento recente em projeto paralisado (atenção) ou cancelado (grave)', () => {
    const f = vazio({ acoes: [{ vinculoId: 1, programa: 'P', acao: 'A', orgaoEmpenho: 'O', desde: null, execucao: somarExecucao([]), outrosProjetos: [] }], execucao: somarExecucao([emp(1, 100, 100, { ultimoPagamento: d('2026-11-10') })]) });
    expect(alertasFinanceiros({ ...base, fase: 'paralisado' }, f, HOJE).find((a) => a.codigo === 'pagamento_parado')?.nivel).toBe('medio');
    expect(alertasFinanceiros({ ...base, fase: 'cancelado' }, f, HOJE).find((a) => a.codigo === 'pagamento_parado')?.nivel).toBe('alto');
    const antigo = vazio({ ...f, execucao: somarExecucao([emp(1, 100, 100, { ultimoPagamento: d('2026-08-10') })]) });
    expect(cod(alertasFinanceiros({ ...base, fase: 'paralisado' }, antigo, HOJE))).not.toContain('pagamento_parado');
  });

  it('contrato vencido com o projeto andando é grave; contrato que acaba antes do projeto é atenção; contrato cumprido não alerta', () => {
    const venceu = contratoFin({ fim: d('2026-10-01') });
    expect(alertasFinanceiros(base, vazio({ contratos: [venceu] }), HOJE).find((a) => a.codigo.startsWith('contrato_vencido'))?.nivel).toBe('alto');
    const curto = contratoFin({ fim: d('2027-01-31') });
    expect(alertasFinanceiros(base, vazio({ contratos: [curto] }), HOJE).find((a) => a.codigo.startsWith('contrato_curto'))?.nivel).toBe('medio');
    const cumprido = contratoFin({ fim: d('2026-10-01'), execucao: somarExecucao([emp(1, 1000, 1000)]) });
    expect(cod(alertasFinanceiros(base, vazio({ contratos: [cumprido] }), HOJE))).not.toContain('contrato_vencido');
    const longo = contratoFin({ fim: d('2028-01-01') });
    expect(cod(alertasFinanceiros(base, vazio({ contratos: [longo] }), HOJE))).not.toContain('contrato_curto');
  });

  it('avisos: ligação provável e contrato dividido com outro projeto; os graves vêm primeiro', () => {
    const f = vazio({ contratos: [contratoFin({ certeza: 'media', outrosProjetos: [{ id: 9, titulo: 'Escola B' }] })], execucao: somarExecucao([emp(1, 2000, 0)]) });
    const a = alertasFinanceiros(base, f, HOJE);
    expect(a.map((x) => x.nivel)).toEqual([...a.map((x) => x.nivel)].sort((x, y) => ['alto', 'medio', 'info'].indexOf(x) - ['alto', 'medio', 'info'].indexOf(y)));
    expect(cod(a)).toEqual(expect.arrayContaining(['estouro', 'ligacao_provavel', 'compartilhado']));
    expect(a.find((x) => x.codigo.startsWith('compartilhado'))?.texto).toMatch(/Escola B/);
  });
});

