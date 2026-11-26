// Dependências entre etapas e participação das secretarias: regras puras (sem banco), testáveis.
// A secretaria de papel "lider" é a única coordenadora. Nada aqui muda o avanço nem o semáforo do projeto (regras.ts).

export const ATUACOES: Record<string, string> = { executora: 'Executora', parecer: 'Parecer ou aprovação', apoio: 'Apoio' };

export interface EtapaRede {
  id: number; ordem: number; titulo: string; status: string; orgaoCod: string;
  dependeDe: number[] | null; inicioPrevisto: Date | null; fimPrevisto: Date | null; concluidaEm: Date | null;
}

export type EstadoEtapa = 'concluida' | 'cancelada' | 'aguardando' | 'atrasada' | 'andamento' | 'prevista';
export const ROTULO_ESTADO: Record<EstadoEtapa, string> = {
  concluida: 'concluída', cancelada: 'cancelada', aguardando: 'aguardando', atrasada: 'atrasada', andamento: 'em andamento', prevista: 'prevista',
};

const DIA = 86400000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasDe = (a: Date, b: Date) => Math.round((inicioDoDia(b).getTime() - inicioDoDia(a).getTime()) / DIA);
const aberta = (e: { status: string }) => e.status === 'pendente' || e.status === 'andamento';

export const vencidaHa = (e: EtapaRede, hoje: Date) => (aberta(e) && e.fimPrevisto ? Math.max(0, diasDe(e.fimPrevisto, hoje)) : 0);

export function predecessoras<T extends EtapaRede>(etapas: T[], e: EtapaRede): T[] {
  const ids = new Set(e.dependeDe ?? []);
  return etapas.filter((x) => ids.has(x.id));
}
/** Anteriores que ainda seguram a etapa. Etapa cancelada não segura ninguém. */
export const pendentesDe = <T extends EtapaRede>(etapas: T[], e: EtapaRede): T[] => predecessoras(etapas, e).filter(aberta);

/**
 * "Aguardando" é a etapa de fato retida por outra: já deveria ter começado (ou está em andamento), ou uma anterior venceu.
 * Fica separada de "atrasada": o atraso é de quem ainda não entregou a etapa anterior.
 */
export function estadoEtapa(etapas: EtapaRede[], e: EtapaRede, hoje: Date): EstadoEtapa {
  if (e.status === 'concluida' || e.status === 'cancelada') return e.status;
  const pend = pendentesDe(etapas, e);
  const marcoInicial = e.inicioPrevisto ?? e.fimPrevisto;
  if (pend.length) {
    const devia = e.status === 'andamento' || (!!marcoInicial && diasDe(marcoInicial, hoje) >= 0) || pend.some((x) => vencidaHa(x, hoje) > 0);
    return devia ? 'aguardando' : 'prevista';
  }
  if (vencidaHa(e, hoje) > 0) return 'atrasada';
  return e.status === 'andamento' ? 'andamento' : 'prevista';
}

/** Todas as etapas que dependem desta, direta ou indiretamente. */
export function dependentesDe<T extends EtapaRede>(etapas: T[], id: number): T[] {
  const vistas = new Set<number>();
  const visitar = (x: number) => {
    for (const e of etapas) if ((e.dependeDe ?? []).includes(x) && !vistas.has(e.id)) { vistas.add(e.id); visitar(e.id); }
  };
  visitar(id);
  return etapas.filter((e) => vistas.has(e.id));
}

/** A etapa passaria a depender dela mesma, direta ou indiretamente? */
export function criaCiclo(etapas: EtapaRede[], id: number, dependeDe: number[]): boolean {
  const proibidas = new Set([id, ...dependentesDe(etapas, id).map((e) => e.id)]);
  return dependeDe.some((d) => proibidas.has(d));
}

/** Nível de execução de cada etapa (1, 2, 3...): as de mesmo nível não dependem uma da outra. */
export function niveis(etapas: EtapaRede[]): Map<number, number> {
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const m = new Map<number, number>();
  const nivel = (id: number, caminho: Set<number>): number => {
    const feito = m.get(id);
    if (feito) return feito;
    if (caminho.has(id)) return 0; // dado incoerente no banco: não entra em repetição sem fim
    caminho.add(id);
    const ante = (porId.get(id)?.dependeDe ?? []).filter((d) => porId.has(d));
    const n = 1 + Math.max(0, ...ante.map((d) => nivel(d, caminho)));
    caminho.delete(id);
    m.set(id, n);
    return n;
  };
  for (const e of etapas) nivel(e.id, new Set());
  return m;
}

/**
 * Término mais cedo possível de uma etapa, supondo que o que está vencido termine hoje e que as durações se mantenham.
 * null = falta data em alguma etapa do caminho, então não dá para estimar.
 */
function terminoDaEtapa(etapas: EtapaRede[], e: EtapaRede, hoje: Date, memo: Map<number, Date | null>): Date | null {
  if (memo.has(e.id)) return memo.get(e.id)!;
  memo.set(e.id, null);
  let r: Date | null = null;
  if (e.status === 'concluida') r = e.concluidaEm ?? e.fimPrevisto;
  else if (e.fimPrevisto) {
    let fim = Math.max(inicioDoDia(e.fimPrevisto).getTime(), inicioDoDia(hoje).getTime());
    const duracao = e.inicioPrevisto ? Math.max(0, diasDe(e.inicioPrevisto, e.fimPrevisto)) * DIA : 0;
    let sabe = true;
    for (const x of pendentesDe(etapas, e)) {
      const t = terminoDaEtapa(etapas, x, hoje, memo);
      if (!t) { sabe = false; break; }
      fim = Math.max(fim, inicioDoDia(t).getTime() + duracao);
    }
    r = sabe ? new Date(fim) : null;
  }
  memo.set(e.id, r);
  return r;
}

export interface Projecao { termino: Date; diasAlem: number }
/** Só faz sentido quando há dependências cadastradas; null se não houver ou se faltar data. */
export function projecaoPrazo(etapas: EtapaRede[], fimDoProjeto: Date | null, hoje: Date): Projecao | null {
  const vivas = etapas.filter((e) => e.status !== 'cancelada');
  if (!fimDoProjeto || !vivas.some((e) => (e.dependeDe ?? []).length)) return null;
  const memo = new Map<number, Date | null>();
  const fins = vivas.map((e) => terminoDaEtapa(vivas, e, hoje, memo));
  if (fins.some((f) => !f)) return null;
  const termino = new Date(Math.max(...fins.map((f) => f!.getTime())));
  return { termino, diasAlem: Math.max(0, diasDe(fimDoProjeto, termino)) };
}

export interface ProjetoRede { id: number; titulo: string; fase: string; etapas: EtapaRede[] }
export interface Bloqueio { projetoId: number; titulo: string; etapa: EtapaRede; causa: EtapaRede; diasVencida: number; afetadas: number }

/** Quem está esperando por quem, em projetos ainda abertos. As causas vencidas há mais tempo vêm primeiro. */
export function bloqueios(projetos: ProjetoRede[], hoje: Date): Bloqueio[] {
  const out: Bloqueio[] = [];
  for (const p of projetos) {
    if (p.fase === 'concluido' || p.fase === 'cancelado') continue;
    for (const etapa of p.etapas) {
      if (estadoEtapa(p.etapas, etapa, hoje) !== 'aguardando') continue;
      const afetadas = 1 + dependentesDe(p.etapas, etapa.id).filter(aberta).length;
      for (const causa of pendentesDe(p.etapas, etapa)) out.push({ projetoId: p.id, titulo: p.titulo, etapa, causa, diasVencida: vencidaHa(causa, hoje), afetadas });
    }
  }
  return out.sort((a, b) => b.diasVencida - a.diasVencida || a.projetoId - b.projetoId || a.etapa.ordem - b.etapa.ordem);
}

export interface EtapasDaSecretaria { orgaoCod: string; atrasadas: number; retendo: number; aguardando: number }

export function etapasPorSecretaria(projetos: ProjetoRede[], hoje: Date): EtapasDaSecretaria[] {
  const m = new Map<string, EtapasDaSecretaria>();
  const linha = (orgaoCod: string) => {
    const l = m.get(orgaoCod) ?? { orgaoCod, atrasadas: 0, retendo: 0, aguardando: 0 };
    m.set(orgaoCod, l);
    return l;
  };
  const bl = bloqueios(projetos, hoje);
  for (const p of projetos) {
    if (p.fase === 'concluido' || p.fase === 'cancelado') continue;
    for (const e of p.etapas) {
      const k = estadoEtapa(p.etapas, e, hoje);
      if (k === 'atrasada') linha(e.orgaoCod).atrasadas++;
      if (k === 'aguardando') linha(e.orgaoCod).aguardando++;
    }
  }
  // uma etapa que segura várias conta uma vez só
  for (const c of new Map(bl.map((b) => [b.causa.id, b.causa])).values()) linha(c.orgaoCod).retendo++;
  return [...m.values()].sort((a, b) => b.retendo - a.retendo || b.atrasadas - a.atrasadas || b.aguardando - a.aguardando || a.orgaoCod.localeCompare(b.orgaoCod));
}

/** Frase que impede o passo, ou null. Usada ao iniciar e ao concluir. */
export function impedimentoPorDependencia(etapas: EtapaRede[], e: EtapaRede): string | null {
  const pend = pendentesDe(etapas, e);
  return pend.length ? `Esta etapa depende de outra ainda em aberto: ${pend.map((x) => `${x.ordem}. ${x.titulo}`).join('; ')}` : null;
}
