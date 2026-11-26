// Dependências entre etapas: estado, ciclos, ordem de execução, projeção e quem espera quem. Sem banco.
import { describe, expect, it } from 'vitest';
import { acessoDoMenu, menuDaRota } from '@/lib/acessos';
import {
  bloqueios, criaCiclo, dependentesDe, estadoEtapa, etapasPorSecretaria, impedimentoPorDependencia, niveis, projecaoPrazo, type EtapaRede,
} from '@/lib/financas/projetos/etapas';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-25');
const et = (id: number, o: Partial<EtapaRede> = {}): EtapaRede => ({
  id, ordem: id, titulo: `Etapa ${id}`, status: 'pendente', orgaoCod: '', dependeDe: [], inicioPrevisto: null, fimPrevisto: null, concluidaEm: null, ...o,
});

// exemplo: selecionar famílias (1) e licença (2) em paralelo; infraestrutura (3) depende da licença; entrega (4) depende de 1 e 3
const habitacional = () => [
  et(1, { orgaoCod: '20', status: 'andamento', inicioPrevisto: d('2025-10-01'), fimPrevisto: d('2027-01-29') }),
  et(2, { orgaoCod: '30', status: 'andamento', inicioPrevisto: d('2026-02-02'), fimPrevisto: d('2026-11-20') }),
  et(3, { orgaoCod: '15', dependeDe: [2], inicioPrevisto: d('2026-11-23'), fimPrevisto: d('2027-12-17') }),
  et(4, { orgaoCod: '20', dependeDe: [1, 3], inicioPrevisto: d('2028-01-10'), fimPrevisto: d('2028-09-30') }),
];

describe('estado das etapas', () => {
  it('separa quem está atrasada de quem está aguardando', () => {
    const es = habitacional();
    expect(es.map((e) => estadoEtapa(es, e, HOJE))).toEqual(['andamento', 'atrasada', 'aguardando', 'prevista']);
  });
  it('conclusão libera a etapa seguinte; anterior cancelada não segura', () => {
    const es = habitacional();
    es[1].status = 'concluida';
    expect(estadoEtapa(es, es[2], HOJE)).toBe('prevista');
    es[1].status = 'cancelada';
    expect(impedimentoPorDependencia(es, es[2])).toBeNull();
  });
  it('iniciar e concluir ficam impedidos enquanto houver anterior em aberto', () => {
    const es = habitacional();
    expect(impedimentoPorDependencia(es, es[2])).toMatch(/2\. Etapa 2/);
    expect(impedimentoPorDependencia(es, es[3])).toMatch(/1\. Etapa 1; 3\. Etapa 3/);
  });
  it('banco antigo, sem dependências gravadas (null), continua valendo', () => {
    const es = [et(1, { dependeDe: null, fimPrevisto: d('2026-11-01') })];
    expect(estadoEtapa(es, es[0], HOJE)).toBe('atrasada');
    expect(niveis(es).get(1)).toBe(1);
  });
});

describe('rede de etapas', () => {
  it('não deixa uma etapa depender dela mesma, direta ou indiretamente', () => {
    const es = habitacional();
    expect(dependentesDe(es, 2).map((e) => e.id)).toEqual([3, 4]);
    expect(criaCiclo(es, 2, [2])).toBe(true);
    expect(criaCiclo(es, 2, [4])).toBe(true);
    expect(criaCiclo(es, 2, [1])).toBe(false);
  });
  it('ordem de execução: as paralelas ficam no mesmo nível', () => {
    expect([...niveis(habitacional())].sort((a, b) => a[0] - b[0])).toEqual([[1, 1], [2, 1], [3, 2], [4, 3]]);
  });
  it('um ciclo já gravado não trava o cálculo', () => {
    const es = [et(1, { dependeDe: [2] }), et(2, { dependeDe: [1] })];
    expect(niveis(es).size).toBe(2);
    expect(projecaoPrazo(es, d('2027-01-01'), HOJE)).toBeNull();
  });
});

describe('prazo e bloqueios', () => {
  it('projeta o término mantendo as durações a partir de hoje', () => {
    const es = [
      et(1, { fimPrevisto: d('2026-11-15'), inicioPrevisto: d('2026-10-01') }),
      et(2, { dependeDe: [1], inicioPrevisto: d('2026-11-16'), fimPrevisto: d('2026-12-16') }),
    ];
    const p = projecaoPrazo(es, d('2026-12-16'), HOJE)!;
    expect(p.diasAlem).toBe(9);
    expect(p.termino.toLocaleDateString('pt-BR')).toBe('25/12/2026');
  });
  it('sem dependência ou sem data no caminho não há estimativa', () => {
    expect(projecaoPrazo([et(1, { fimPrevisto: d('2027-01-01') })], d('2027-01-01'), HOJE)).toBeNull();
    expect(projecaoPrazo([et(1), et(2, { dependeDe: [1], fimPrevisto: d('2027-01-01') })], d('2027-01-01'), HOJE)).toBeNull();
  });
  it('quem espera quem, e a contagem por secretaria; projeto encerrado fica de fora', () => {
    const projetos = [{ id: 7, titulo: 'Habitação', fase: 'execucao', etapas: habitacional() }, { id: 8, titulo: 'Encerrado', fase: 'cancelado', etapas: habitacional() }];
    const b = bloqueios(projetos, HOJE);
    expect(b.map((x) => [x.projetoId, x.etapa.orgaoCod, x.causa.orgaoCod, x.diasVencida, x.afetadas])).toEqual([[7, '15', '30', 5, 2]]);
    expect(etapasPorSecretaria(projetos, HOJE)).toEqual([
      { orgaoCod: '30', atrasadas: 1, retendo: 1, aguardando: 0 },
      { orgaoCod: '15', atrasadas: 0, retendo: 0, aguardando: 1 },
    ]);
  });
});

describe('acesso à aba Governança', () => {
  it('segue o mesmo acesso do menu Compliance', () => {
    expect(menuDaRota('/dashboard/governanca')).toBe('gestao');
    expect(menuDaRota('/dashboard/governanca/projetos/3')).toBe('gestao');
    const semCompliance = { perfil: 'operador', acessos: JSON.stringify({ gestao: { ver: false, cad: false } }) };
    expect(acessoDoMenu(semCompliance, menuDaRota('/dashboard/governanca')!).ver).toBe(false);
  });
});
