// Carteira de projetos: leitura do banco já com avanço e situação calculados.
import type { Projeto, ProjetoSecretaria, EtapaProjeto } from '@prisma/client';
import type { DbPrefeitura } from '@/lib/financas/db';
import { avaliarProjeto, avancoPct, ordenarCarteira, type Avaliacao, type Saude, FASES_ABERTAS } from './regras';
import { filtroVisivel, type Ator } from './acoes';
import type { Sugestao } from '@/lib/financas/auditoria/regras';
import type { Alerta } from './financeiro';
import { carregarFinanceiro } from './vinculos';
import { alertasResultado } from './indicadores';
import { alertasRisco } from './riscos';

export type ProjetoCompleto = Projeto & { secretarias: ProjetoSecretaria[]; etapas: EtapaProjeto[] } & Avaliacao & { avanco: number | null };

export interface Filtros { q?: string; secretaria?: string; fase?: string; saude?: string; eixo?: string; bairro?: string }
/** valor do filtro para "projetos sem eixo / sem bairro" */
export const SEM_VALOR = '__sem';
const bate = (valor: string, filtro?: string) => !filtro || (filtro === SEM_VALOR ? valor.trim() === '' : valor.trim().toLowerCase() === filtro.trim().toLowerCase());

export async function carteira(db: DbPrefeitura, a: Ator, hoje: Date, f: Filtros = {}): Promise<ProjetoCompleto[]> {
  const ps = await db.projeto.findMany({ where: filtroVisivel(a), include: { secretarias: true, etapas: { orderBy: { ordem: 'asc' } } } });
  const q = (f.q ?? '').trim().toLowerCase();
  const todos = ps.map((p) => ({ ...p, ...avaliarProjeto(p, p.etapas, hoje), avanco: avancoPct(p.fase, p.etapas) }));
  const filtrados = todos.filter((p) =>
    (!q || `${p.titulo} ${p.objetivo} ${p.bairro} ${p.eixo}`.toLowerCase().includes(q))
    && (!f.secretaria || p.secretarias.some((s) => s.orgaoCod === f.secretaria))
    && (!f.fase || (f.fase === 'abertos' ? FASES_ABERTAS.includes(p.fase as never) : p.fase === f.fase))
    && (!f.saude || p.saude === f.saude)
    && bate(p.eixo, f.eixo) && bate(p.bairro, f.bairro));
  return ordenarCarteira(filtrados);
}

export interface Indicadores {
  emExecucao: number; atrasados: number; atencao: number; aguardandoAprovacao: number; concluidosNoAno: number;
  orcamentoAtivo: bigint; // soma dos projetos aprovados, em execução ou paralisados
  semOrcamentoAtivo: number;
}

export function indicadores(ps: ProjetoCompleto[], hoje: Date): Indicadores {
  const ativos = ps.filter((p) => ['aprovado', 'execucao', 'paralisado'].includes(p.fase));
  return {
    emExecucao: ps.filter((p) => p.fase === 'execucao').length,
    atrasados: ps.filter((p) => p.saude === 'atrasado').length,
    atencao: ps.filter((p) => p.saude === 'atencao').length,
    aguardandoAprovacao: ps.filter((p) => p.fase === 'ideia' || p.fase === 'estudo').length,
    concluidosNoAno: ps.filter((p) => p.fase === 'concluido' && p.fimReal && p.fimReal.getFullYear() === hoje.getFullYear()).length,
    orcamentoAtivo: ativos.reduce((t, p) => t + (p.orcamento ?? 0n), 0n),
    semOrcamentoAtivo: ativos.filter((p) => p.orcamento === null).length,
  };
}

export interface LinhaSecretariaProjetos { orgaoCod: string; orgaoNome: string; lidera: number; parceira: number; atrasados: number; atencao: number; orcamentoLiderado: bigint }

/** Quantos projetos abertos cada secretaria carrega (um projeto em conjunto conta para todas; o orçamento só para a líder, para não somar duas vezes). */
export function porSecretaria(ps: ProjetoCompleto[]): LinhaSecretariaProjetos[] {
  const m = new Map<string, LinhaSecretariaProjetos>();
  for (const p of ps) {
    if (!FASES_ABERTAS.includes(p.fase as never)) continue;
    for (const s of p.secretarias) {
      const l = m.get(s.orgaoCod) ?? { orgaoCod: s.orgaoCod, orgaoNome: s.orgaoNome, lidera: 0, parceira: 0, atrasados: 0, atencao: 0, orcamentoLiderado: 0n };
      if (s.papel === 'lider') { l.lidera++; l.orcamentoLiderado += p.orcamento ?? 0n; } else l.parceira++;
      if (p.saude === 'atrasado') l.atrasados++;
      if (p.saude === 'atencao') l.atencao++;
      m.set(s.orgaoCod, l);
    }
  }
  return [...m.values()].sort((x, y) => y.atrasados - x.atrasados || y.lidera + y.parceira - (x.lidera + x.parceira) || x.orgaoCod.localeCompare(y.orgaoCod));
}

export interface LinhaAgrupada { chave: string; rotulo: string; projetos: number; atrasados: number; orcamento: bigint; pago: bigint }

/**
 * Projetos em aberto agrupados por eixo (programa do PPA, texto livre) ou bairro. O orçamento soma cada projeto uma vez;
 * o pago usa o total já calculado de cada projeto (um empenho dividido entre dois projetos de grupos diferentes aparece nos dois).
 */
export function agruparPor(ps: ProjetoCompleto[], campo: 'eixo' | 'bairro', pagoPorProjeto: Map<number, bigint>): LinhaAgrupada[] {
  const m = new Map<string, LinhaAgrupada>();
  for (const p of ps) {
    if (!FASES_ABERTAS.includes(p.fase as never)) continue;
    const v = (p[campo] ?? '').trim();
    const chave = v ? v.toLowerCase() : SEM_VALOR;
    const l = m.get(chave) ?? { chave: v || SEM_VALOR, rotulo: v || (campo === 'eixo' ? '(sem eixo)' : '(sem bairro)'), projetos: 0, atrasados: 0, orcamento: 0n, pago: 0n };
    l.projetos++;
    if (p.saude === 'atrasado') l.atrasados++;
    l.orcamento += p.orcamento ?? 0n;
    l.pago += pagoPorProjeto.get(p.id) ?? 0n;
    m.set(chave, l);
  }
  return [...m.values()].sort((a, b) => (a.chave === SEM_VALOR ? 1 : 0) - (b.chave === SEM_VALOR ? 1 : 0) || b.projetos - a.projetos || a.rotulo.localeCompare(b.rotulo));
}

export async function fichaProjeto(db: DbPrefeitura, a: Ator, id: number, hoje: Date) {
  const p = await db.projeto.findFirst({
    where: { id, ...filtroVisivel(a) },
    include: { secretarias: { orderBy: { id: 'asc' } }, etapas: { orderBy: { ordem: 'asc' } }, eventos: { orderBy: { id: 'desc' } } },
  });
  if (!p) return null;
  return { ...p, ...avaliarProjeto(p, p.etapas, hoje), avanco: avancoPct(p.fase, p.etapas) };
}

// ------------------------------------------------------------------ gasto dos projetos (Fase B)

/** Carteira com o gasto de cada projeto e o total, sem contar duas vezes o empenho que dois projetos dividem. */
export async function carteiraComGasto(db: DbPrefeitura, a: Ator, ps: ProjetoCompleto[], hoje: Date) {
  return carregarFinanceiro(db, a, ps.map((p) => ({ id: p.id, fase: p.fase, orcamento: p.orcamento, inicioPrevisto: p.inicioPrevisto, fimPrevisto: p.fimPrevisto, inicioReal: p.inicioReal, avanco: p.avanco })), hoje);
}

// ------------------------------------------------------------------ riscos e resultados (Fase C)

/** Riscos e indicadores (com leituras) de vários projetos, em duas consultas. */
export async function acompanhamento(db: DbPrefeitura, ids: number[]) {
  const [riscos, indicadores] = ids.length
    ? await Promise.all([
      db.riscoProjeto.findMany({ where: { projetoId: { in: ids } }, orderBy: { id: 'asc' } }),
      db.indicadorProjeto.findMany({ where: { projetoId: { in: ids } }, include: { leituras: { orderBy: [{ data: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'asc' } }),
    ])
    : [[], []];
  return {
    riscosDe: (id: number) => riscos.filter((r) => r.projetoId === id),
    indicadoresDe: (id: number) => indicadores.filter((i) => i.projetoId === id),
  };
}

/** Alertas de riscos e metas de cada projeto (somam-se aos de gasto na carteira, na ficha e na auditoria). */
export async function alertasDeAcompanhamento(db: DbPrefeitura, ps: { id: number; fase: string }[], hoje: Date) {
  const ac = await acompanhamento(db, ps.map((p) => p.id));
  const m = new Map<number, Alerta[]>();
  for (const p of ps) m.set(p.id, [...alertasRisco(ac.riscosDe(p.id), hoje), ...alertasResultado(p.fase, ac.indicadoresDe(p.id), hoje)]);
  return m;
}

const NIVEL = { alto: 0, medio: 1, info: 2 } as const;
export const juntarAlertas = (...listas: Alerta[][]) => listas.flat().sort((a, b) => NIVEL[a.nivel] - NIVEL[b.nivel]);

export interface ProjetoDaSecretaria {
  id: number; titulo: string; fase: string; papel: string; saude: Saude; motivos: string[]; diasAtraso: number; avanco: number | null;
  fimPrevisto: Date | null; alertas: Alerta[]; parceiras: string[];
}

const ATOR_LEITURA: Ator = { nome: 'sistema', orgaoCod: '', verTodos: true, gerir: false, aprovar: false, secretaria: false };

/** Projetos em andamento de uma secretaria (para a ficha de auditoria e o modo reunião). Quem chama confere a permissão de ver projetos. */
export async function projetosDaSecretaria(db: DbPrefeitura, orgaoCod: string, hoje: Date): Promise<ProjetoDaSecretaria[]> {
  const ps = await carteira(db, ATOR_LEITURA, hoje, { secretaria: orgaoCod, fase: 'abertos' });
  const ativos = ps.filter((p) => ['aprovado', 'execucao', 'paralisado'].includes(p.fase));
  const { porProjeto } = await carregarFinanceiro(db, ATOR_LEITURA, ativos.map((p) => ({ id: p.id, fase: p.fase, orcamento: p.orcamento, inicioPrevisto: p.inicioPrevisto, fimPrevisto: p.fimPrevisto, inicioReal: p.inicioReal, avanco: p.avanco })), hoje);
  const extras = await alertasDeAcompanhamento(db, ativos, hoje);
  return ativos.map((p) => ({
    id: p.id, titulo: p.titulo, fase: p.fase, papel: p.secretarias.find((s) => s.orgaoCod === orgaoCod)?.papel ?? 'parceira', saude: p.saude, motivos: p.motivos,
    diasAtraso: p.diasAtraso, avanco: p.avanco, fimPrevisto: p.fimPrevisto, alertas: juntarAlertas(porProjeto.get(p.id)?.alertas ?? [], extras.get(p.id) ?? []),
    parceiras: p.secretarias.filter((s) => s.orgaoCod !== orgaoCod).map((s) => s.orgaoNome),
  }));
}

/** Assuntos para cobrar da secretaria que vêm dos projetos. Cobra-se a secretaria líder: a parceira só aparece no quadro. */
export function sugestoesProjetos(ps: ProjetoDaSecretaria[]): Sugestao[] {
  const out: Sugestao[] = [];
  for (const p of ps) {
    if (p.papel !== 'lider') continue;
    if (p.saude === 'atrasado')
      out.push({
        ref: `sugestao:projeto:${p.id}:atraso:${p.fimPrevisto ? p.fimPrevisto.toISOString().slice(0, 10) : 'sem-prazo'}`,
        titulo: `Projeto “${p.titulo}” atrasado há ${p.diasAtraso} dia(s)`,
        descricao: `${p.motivos.join('; ')}. Pedir o novo cronograma e o que está travando.`,
        baseLegal: '',
      });
    for (const a of p.alertas.filter((x) => x.nivel === 'alto'))
      out.push({ ref: `sugestao:projeto:${p.id}:fin:${a.codigo}`, titulo: `Projeto “${p.titulo}”: alerta de gasto`, descricao: `${a.texto}. Pedir a explicação à secretaria.`, baseLegal: '' });
  }
  return out;
}

export type { Saude };
