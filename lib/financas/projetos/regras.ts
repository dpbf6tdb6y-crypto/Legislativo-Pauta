// Carteira de projetos: regras puras (sem banco), testáveis.
// O sistema não julga o mérito do projeto: calcula prazo, avanço e situação a partir do que as secretarias registram.

export const TIPOS: Record<string, string> = {
  obra: 'Obra', programa: 'Programa', servico: 'Serviço', aquisicao: 'Aquisição', tecnologia: 'Tecnologia', outro: 'Outro',
};
export const PRIORIDADES: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const FONTES: Record<string, string> = {
  propria: 'Recurso próprio', convenio_estadual: 'Convênio estadual', convenio_federal: 'Convênio federal',
  emenda: 'Emenda parlamentar', financiamento: 'Financiamento', outra: 'Outra',
};

export type Fase = 'ideia' | 'estudo' | 'aprovado' | 'execucao' | 'paralisado' | 'concluido' | 'cancelado';
export const FASES: Fase[] = ['ideia', 'estudo', 'aprovado', 'execucao', 'paralisado', 'concluido', 'cancelado'];
export const ROTULO_FASE: Record<Fase, string> = {
  ideia: 'Ideia', estudo: 'Em estudo', aprovado: 'Aprovado', execucao: 'Em execução',
  paralisado: 'Paralisado', concluido: 'Concluído', cancelado: 'Cancelado',
};
/** Fases em que o projeto tem prazo a cumprir (entram no semáforo). */
export const FASES_ATIVAS: Fase[] = ['aprovado', 'execucao'];
/** Fases que ainda contam como trabalho da secretaria (o resto é planejamento ou já encerrou). */
export const FASES_ABERTAS: Fase[] = ['ideia', 'estudo', 'aprovado', 'execucao', 'paralisado'];

const TRANSICOES: Record<Fase, Fase[]> = {
  ideia: ['estudo', 'aprovado', 'cancelado'],
  estudo: ['aprovado', 'ideia', 'cancelado'],
  aprovado: ['execucao', 'paralisado', 'cancelado'],
  execucao: ['concluido', 'paralisado', 'cancelado'],
  paralisado: ['execucao', 'cancelado'],
  concluido: [],
  cancelado: [],
};
/** Passos que a secretaria pode dar sozinha. Aprovar, concluir e cancelar são decisões do prefeito/controlador. */
const PASSOS_DA_SECRETARIA = new Set(['ideia>estudo', 'aprovado>execucao', 'execucao>paralisado', 'paralisado>execucao']);

export function transicoesPermitidas(fase: string, aprovador: boolean): Fase[] {
  const todas = TRANSICOES[fase as Fase] ?? [];
  return aprovador ? todas : todas.filter((p) => PASSOS_DA_SECRETARIA.has(`${fase}>${p}`));
}

export type StatusEtapa = 'pendente' | 'andamento' | 'concluida' | 'cancelada';
export const ROTULO_ETAPA: Record<StatusEtapa, string> = { pendente: 'a fazer', andamento: 'em andamento', concluida: 'concluída', cancelada: 'cancelada' };
const ABERTA = (e: { status: string }) => e.status === 'pendente' || e.status === 'andamento';

export interface EtapaBase { titulo: string; peso: number; status: string; inicioPrevisto: Date | null; fimPrevisto: Date | null; marco?: boolean }
export interface ProjetoBase {
  fase: string; inicioPrevisto: Date | null; fimPrevisto: Date | null; atualizadoEm: Date;
  orcamento: bigint | null;
}

const DIA = 86400000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const diasEntre = (a: Date, b: Date) => Math.round((inicioDoDia(b).getTime() - inicioDoDia(a).getTime()) / DIA);

/**
 * O que falta para o passo ser dado (null = pode). Só as exigências que dependem dos dados do projeto;
 * quem pode dar o passo e o motivo exigido em pausa/cancelamento são conferidos na ação.
 */
export function impedimentoDeFase(p: ProjetoBase, etapas: EtapaBase[], para: string): string | null {
  if (!TRANSICOES[p.fase as Fase]?.includes(para as Fase)) return `Não é possível ir de "${ROTULO_FASE[p.fase as Fase] ?? p.fase}" para "${ROTULO_FASE[para as Fase] ?? para}"`;
  if (para === 'aprovado') {
    if (p.orcamento === null) return 'Informe o orçamento estimado antes de aprovar';
    if (!p.inicioPrevisto || !p.fimPrevisto) return 'Informe o início e o fim previstos antes de aprovar';
  }
  if (para === 'concluido') {
    const abertas = etapas.filter(ABERTA);
    if (abertas.length) return `Ainda há ${abertas.length} etapa(s) em aberto: conclua ou cancele antes de encerrar o projeto`;
  }
  return null;
}

/** Avanço em % (0 a 100) pelo peso das etapas concluídas. null = projeto sem etapas (não dá para medir). */
export function avancoPct(fase: string, etapas: { peso: number; status: string }[]): number | null {
  if (fase === 'concluido') return 100;
  const validas = etapas.filter((e) => e.status !== 'cancelada');
  const total = validas.reduce((t, e) => t + e.peso, 0);
  if (!validas.length || total <= 0) return null;
  const feito = validas.filter((e) => e.status === 'concluida').reduce((t, e) => t + e.peso, 0);
  return Math.round((feito * 100) / total);
}

export type Saude = 'no_prazo' | 'atencao' | 'atrasado' | 'paralisado' | 'planejamento' | 'concluido' | 'cancelado';
export const ROTULO_SAUDE: Record<Saude, string> = {
  no_prazo: 'no prazo', atencao: 'atenção', atrasado: 'atrasado', paralisado: 'paralisado',
  planejamento: 'em planejamento', concluido: 'concluído', cancelado: 'cancelado',
};
export interface Avaliacao { saude: Saude; motivos: string[]; diasAtraso: number }

const DIAS_SEM_ATUALIZAR = 30;
const FOLGA_DE_RITMO = 25; // pontos percentuais abaixo do esperado pelo calendário
const DIAS_PARA_ETAPA_NAO_INICIADA = 7;
const DIAS_INICIO_ATRASADO = 30;

/**
 * Situação do projeto, sempre com o porquê. Só projeto aprovado ou em execução tem semáforo:
 *  atrasado = prazo final vencido, etapa vencida ou início que passou há mais de 30 dias;
 *  atenção  = avanço bem abaixo do calendário, etapa a 7 dias do prazo sem começar, início já passado ou sem atualização há 30 dias.
 */
export function avaliarProjeto(p: ProjetoBase, etapas: EtapaBase[], hoje: Date): Avaliacao {
  const fixa: Partial<Record<string, Saude>> = { concluido: 'concluido', cancelado: 'cancelado', paralisado: 'paralisado', ideia: 'planejamento', estudo: 'planejamento' };
  if (fixa[p.fase]) return { saude: fixa[p.fase]!, motivos: [], diasAtraso: 0 };

  const atrasados: string[] = [];
  const atencao: string[] = [];
  let diasAtraso = 0;
  const h = inicioDoDia(hoje);

  if (p.fimPrevisto) {
    const d = diasEntre(p.fimPrevisto, h);
    if (d > 0) { atrasados.push(`Prazo final venceu há ${d} dia(s)`); diasAtraso = Math.max(diasAtraso, d); }
  }
  for (const e of etapas.filter(ABERTA)) {
    if (!e.fimPrevisto) continue;
    const d = diasEntre(e.fimPrevisto, h);
    if (d > 0) { atrasados.push(`${e.marco ? 'Marco' : 'Etapa'} "${e.titulo}" venceu há ${d} dia(s)`); diasAtraso = Math.max(diasAtraso, d); }
    else if (e.status === 'pendente' && -d <= DIAS_PARA_ETAPA_NAO_INICIADA && !e.marco)
      atencao.push(`Etapa "${e.titulo}" vence em ${-d} dia(s) e ainda não foi iniciada`);
  }
  if (p.fase === 'aprovado' && p.inicioPrevisto) {
    const d = diasEntre(p.inicioPrevisto, h);
    if (d > DIAS_INICIO_ATRASADO) { atrasados.push(`Deveria ter começado há ${d} dia(s)`); diasAtraso = Math.max(diasAtraso, d); }
    else if (d > 0) atencao.push(`Início previsto há ${d} dia(s) e o projeto ainda não começou`);
  }
  if (p.fase === 'execucao' && p.inicioPrevisto && p.fimPrevisto) {
    const av = avancoPct(p.fase, etapas);
    const duracao = diasEntre(p.inicioPrevisto, p.fimPrevisto);
    if (av !== null && duracao > 0) {
      const esperado = Math.max(0, Math.min(100, Math.round((diasEntre(p.inicioPrevisto, h) * 100) / duracao)));
      if (av < esperado - FOLGA_DE_RITMO) atencao.push(`Avanço de ${av}% está abaixo do esperado pelo calendário (${esperado}%)`);
    }
  }
  if (p.fase === 'execucao') {
    const d = diasEntre(p.atualizadoEm, h);
    if (d > DIAS_SEM_ATUALIZAR) atencao.push(`Sem atualização há ${d} dias`);
  }

  if (atrasados.length) return { saude: 'atrasado', motivos: [...atrasados, ...atencao], diasAtraso };
  if (atencao.length) return { saude: 'atencao', motivos: atencao, diasAtraso: 0 };
  return { saude: 'no_prazo', motivos: [], diasAtraso: 0 };
}

/** Ordem de apresentação: atrasados, atenção, no prazo, paralisados, planejamento, encerrados; dentro de cada grupo, prazo final mais próximo primeiro. */
export function ordenarCarteira<T extends { saude: Saude; fimPrevisto: Date | null; prioridade: string; diasAtraso: number }>(ps: T[]): T[] {
  const peso: Record<Saude, number> = { atrasado: 0, atencao: 1, no_prazo: 2, paralisado: 3, planejamento: 4, concluido: 5, cancelado: 6 };
  const prio: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  return [...ps].sort((a, b) =>
    peso[a.saude] - peso[b.saude]
    || (a.saude === 'atrasado' ? b.diasAtraso - a.diasAtraso : 0)
    || (prio[a.prioridade] ?? 1) - (prio[b.prioridade] ?? 1)
    || (a.fimPrevisto?.getTime() ?? Infinity) - (b.fimPrevisto?.getTime() ?? Infinity));
}
