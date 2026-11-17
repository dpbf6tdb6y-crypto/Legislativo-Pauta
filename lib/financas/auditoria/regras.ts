// Auditoria por secretaria: regras puras (sem banco), testáveis.
// Um "ponto" é uma cobrança registrada, não uma conclusão de irregularidade.

export type StatusPonto = 'aberto' | 'respondido' | 'resolvido' | 'cancelado';
export const STATUS_PONTO: StatusPonto[] = ['aberto', 'respondido', 'resolvido', 'cancelado'];
export const ROTULO_STATUS: Record<StatusPonto, string> = {
  aberto: 'aguardando a secretaria', respondido: 'respondido, falta validar', resolvido: 'resolvido', cancelado: 'cancelado',
};
export type SituacaoPrazo = 'atrasado' | 'vence_em_breve' | 'no_prazo' | 'sem_prazo' | 'encerrado';

const DIA = 86400000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Situação do prazo: só conta para pontos ainda em aberto (aguardando a secretaria). */
export function situacaoPrazo(p: { status: string; prazo: Date | null }, hoje: Date, diasAviso = 7): SituacaoPrazo {
  if (p.status !== 'aberto') return 'encerrado';
  if (!p.prazo) return 'sem_prazo';
  const dias = Math.round((inicioDoDia(p.prazo).getTime() - inicioDoDia(hoje).getTime()) / DIA);
  if (dias < 0) return 'atrasado';
  if (dias <= diasAviso) return 'vence_em_breve';
  return 'no_prazo';
}

export function diasDeAtraso(prazo: Date | null, hoje: Date) {
  if (!prazo) return 0;
  return Math.max(0, Math.round((inicioDoDia(hoje).getTime() - inicioDoDia(prazo).getTime()) / DIA));
}

export interface ResumoPontos { abertos: number; atrasados: number; venceEmBreve: number; respondidos: number; resolvidos: number }

export function resumoPontos(ps: { status: string; prazo: Date | null }[], hoje: Date): ResumoPontos {
  const r: ResumoPontos = { abertos: 0, atrasados: 0, venceEmBreve: 0, respondidos: 0, resolvidos: 0 };
  for (const p of ps) {
    if (p.status === 'aberto') {
      r.abertos++;
      const s = situacaoPrazo(p, hoje);
      if (s === 'atrasado') r.atrasados++;
      if (s === 'vence_em_breve') r.venceEmBreve++;
    }
    if (p.status === 'respondido') r.respondidos++;
    if (p.status === 'resolvido') r.resolvidos++;
  }
  return r;
}

/** Ordem de apresentação: atrasados primeiro (mais antigos antes), depois os que vencem, sem prazo, respondidos e encerrados. */
export function ordenarPontos<T extends { status: string; prazo: Date | null; criadoEm: Date }>(ps: T[], hoje: Date): T[] {
  const peso = (p: T) => {
    if (p.status === 'respondido') return 4;
    if (p.status !== 'aberto') return 9;
    return { atrasado: 0, vence_em_breve: 1, no_prazo: 2, sem_prazo: 3, encerrado: 9 }[situacaoPrazo(p, hoje)];
  };
  return [...ps].sort((a, b) => peso(a) - peso(b) || (a.prazo?.getTime() ?? Infinity) - (b.prazo?.getTime() ?? Infinity) || a.criadoEm.getTime() - b.criadoEm.getTime());
}

/** O que aconteceu depois da última reunião (eventos estritamente posteriores). */
export function mudancasDesde<T extends { quando: Date }>(eventos: T[], desde: Date | null): T[] {
  return eventos.filter((e) => !desde || e.quando > desde).sort((a, b) => a.quando.getTime() - b.quando.getTime());
}

// ---------------------------------------------------------------- órgão do empenho

function norm(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\bMUN\.?\b/g, 'MUNICIPAL').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const VAZIAS = new Set(['SECRETARIA', 'MUNICIPAL', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'GERAL', 'MUNICIPIO']);

/**
 * O empenho traz o nome do órgão por extenso (às vezes abreviado: "SECRETARIA MUN. DE DESENVOLVIMENTO ECONOMICO, TRAB. E RENDA"),
 * sem o código. Acha o órgão do cadastro de despesa: nome igual, ou o que tem mais palavras significativas em comum.
 * null quando a semelhança é fraca (quem encaminha escolhe).
 */
export function sugerirOrgao(nome: string, orgaos: { orgaoCod: string; orgaoNome: string }[]): string | null {
  const n = norm(nome);
  const igual = orgaos.find((o) => norm(o.orgaoNome) === n);
  if (igual) return igual.orgaoCod;
  const pal = new Set(n.split(' ').filter((w) => !VAZIAS.has(w) && w.length > 2));
  let melhor: { cod: string; pts: number } | null = null;
  for (const o of orgaos) {
    const po = norm(o.orgaoNome).split(' ').filter((w) => !VAZIAS.has(w) && w.length > 2);
    const pts = po.filter((w) => pal.has(w)).length / Math.max(po.length, 1);
    // pelo menos metade das palavras do nome do cadastro precisa aparecer no nome do empenho
    if (pts >= 0.5 && (!melhor || pts > melhor.pts)) melhor = { cod: o.orgaoCod, pts };
  }
  return melhor?.cod ?? null;
}

// ---------------------------------------------------------------- sugestões de ponto

export interface Sugestao { ref: string; titulo: string; descricao: string; baseLegal: string }

/**
 * Fatos da secretaria que merecem pergunta na reunião. Só o que tem base objetiva:
 * saldo de dotação negativo, contratos vencendo e apontamentos em aberto.
 * Quem decide se vira ponto de cobrança é uma pessoa.
 */
export function sugestoesSecretaria(f: {
  orgaoCod: string; ano: number;
  saldoDotacao: bigint | null; saldoTexto: string;
  contratosVencendo: { id: number; numero: string; ano: number; fornecedor: string; fim: Date; dias: number }[];
  apontamentos: { id: number; regraCodigo: string; titulo: string; resumo: string; baseLegal: string }[];
}): Sugestao[] {
  const out: Sugestao[] = [];
  if (f.saldoDotacao !== null && f.saldoDotacao < BigInt(0))
    out.push({
      ref: `sugestao:saldo:${f.orgaoCod}:${f.ano}`,
      titulo: 'Empenhado acima da dotação atualizada',
      descricao: `${f.saldoTexto} Pedir à secretaria a explicação e o crédito adicional que cobre a diferença.`,
      baseLegal: 'CF art. 167, II; Lei 4.320/1964, art. 59',
    });
  for (const c of f.contratosVencendo)
    out.push({
      ref: `sugestao:contrato:${c.id}:${c.fim.toISOString().slice(0, 10)}`,
      titulo: `Contrato ${c.numero}/${c.ano} vence em ${c.dias} dia(s)`,
      descricao: `${c.fornecedor} · vigência até ${c.fim.toLocaleDateString('pt-BR')}. Pedir à secretaria o plano: prorrogação, nova contratação ou encerramento.`,
      baseLegal: 'Lei 14.133/2021, arts. 105 a 107',
    });
  for (const a of f.apontamentos)
    out.push({
      ref: `apontamento:${a.id}`,
      titulo: `${a.regraCodigo} · ${a.titulo}`,
      descricao: a.resumo,
      baseLegal: a.baseLegal,
    });
  return out;
}
