// Riscos do projeto: regras puras e operações com histórico. O sistema não adivinha risco: registra o que as pessoas apontam,
// calcula a gravidade (probabilidade × impacto) e avisa o que está sem resposta.
import type { DbPrefeitura } from '@/lib/financas/db';
import { curto, evento, fmt, lerDataOpcional, podeMexer, projetoVisivel, type Ator } from './acoes';
import type { Alerta } from './financeiro';
import { diasEntre } from './regras';

export const ROT_NIVEL3: Record<number, string> = { 1: 'baixa', 2: 'média', 3: 'alta' };
export const ROT_IMPACTO: Record<number, string> = { 1: 'baixo', 2: 'médio', 3: 'alto' };
export type StatusRisco = 'aberto' | 'mitigando' | 'ocorreu' | 'encerrado';
export const STATUS_RISCO: Record<StatusRisco, string> = { aberto: 'Aberto', mitigando: 'Em mitigação', ocorreu: 'Ocorreu', encerrado: 'Encerrado' };

export type Gravidade = 'alta' | 'media' | 'baixa';
/** probabilidade × impacto: 6 ou mais = alta, 3 ou 4 = média, o resto = baixa. */
export function gravidade(prob: number, impacto: number): Gravidade {
  const s = prob * impacto;
  return s >= 6 ? 'alta' : s >= 3 ? 'media' : 'baixa';
}
export const ROT_GRAVIDADE: Record<Gravidade, string> = { alta: 'alta', media: 'média', baixa: 'baixa' };

export interface RiscoBase { id: number; titulo: string; probabilidade: number; impacto: number; status: string; mitigacao: string; prazoMitigacao: Date | null }
export const riscoAtivo = (r: { status: string }) => r.status !== 'encerrado';

/** Alertas que vêm dos riscos: ocorreu (grave), alto sem plano e plano com prazo vencido (atenção). */
export function alertasRisco(riscos: RiscoBase[], hoje: Date): Alerta[] {
  const out: Alerta[] = [];
  for (const r of riscos.filter(riscoAtivo)) {
    if (r.status === 'ocorreu') out.push({ codigo: `risco_ocorreu:${r.id}`, nivel: 'alto', texto: `Risco que se concretizou: “${r.titulo}”` });
    else if (gravidade(r.probabilidade, r.impacto) === 'alta' && !r.mitigacao.trim()) out.push({ codigo: `risco_sem_plano:${r.id}`, nivel: 'medio', texto: `Risco alto sem plano de resposta: “${r.titulo}”` });
    if (r.prazoMitigacao && r.status !== 'ocorreu' && diasEntre(r.prazoMitigacao, hoje) > 0)
      out.push({ codigo: `risco_prazo:${r.id}`, nivel: 'medio', texto: `Plano de resposta ao risco “${r.titulo}” venceu há ${diasEntre(r.prazoMitigacao, hoje)} dia(s)` });
  }
  return out;
}

const nota = (v: unknown, campo: string) => {
  const n = Number(v);
  if (![1, 2, 3].includes(n)) throw new Error(`${campo}: escolha baixa, média ou alta`);
  return n;
};

function conferirAberto(fase: string) {
  if (fase === 'concluido' || fase === 'cancelado') throw new Error('Projeto encerrado não aceita novos riscos');
}

export interface DadosRisco { titulo: string; descricao?: string; probabilidade: unknown; impacto: unknown; mitigacao?: string; responsavel?: string; prazoMitigacao?: string }

export async function criarRisco(db: DbPrefeitura, a: Ator, projetoId: number, d: DadosRisco) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirAberto(p.fase);
  const titulo = curto(d.titulo, 200);
  if (!titulo) throw new Error('Descreva o risco em uma frase');
  const probabilidade = nota(d.probabilidade, 'Probabilidade'), impacto = nota(d.impacto, 'Impacto');
  const prazo = lerDataOpcional(d.prazoMitigacao, 'prazo do plano');
  const r = await db.riscoProjeto.create({
    data: { prefeituraId: '', projetoId, titulo, descricao: curto(d.descricao, 2000), probabilidade, impacto, mitigacao: curto(d.mitigacao, 2000), responsavel: curto(d.responsavel, 120), prazoMitigacao: prazo, criadoPor: a.nome },
  });
  await evento(db, projetoId, 'risco', a.nome, `Risco registrado: “${titulo}” (probabilidade ${ROT_NIVEL3[probabilidade]}, impacto ${ROT_IMPACTO[impacto]}, gravidade ${ROT_GRAVIDADE[gravidade(probabilidade, impacto)]})`);
  return r;
}

export type AcaoRisco = 'reavaliar' | 'plano' | 'status';

/** reavaliar = muda probabilidade/impacto; plano = escreve a resposta, responsável e prazo; status = aberto, mitigando, ocorreu ou encerrado (encerrar exige motivo). */
export async function atualizarRisco(db: DbPrefeitura, a: Ator, projetoId: number, riscoId: number, acao: AcaoRisco, d: Partial<DadosRisco> & { status?: string; motivo?: string }) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirAberto(p.fase);
  const r = await db.riscoProjeto.findFirst({ where: { id: riscoId, projetoId } });
  if (!r) throw new Error('Risco não encontrado');
  const rot = `Risco “${r.titulo}”`;
  const agora = new Date();
  if (acao === 'reavaliar') {
    if (r.status === 'encerrado') throw new Error('Risco encerrado: reabra antes de reavaliar');
    const prob = nota(d.probabilidade, 'Probabilidade'), imp = nota(d.impacto, 'Impacto');
    if (prob === r.probabilidade && imp === r.impacto) return;
    await db.riscoProjeto.updateMany({ where: { id: riscoId }, data: { probabilidade: prob, impacto: imp, atualizadoEm: agora } });
    await evento(db, projetoId, 'risco', a.nome, `${rot} reavaliado: probabilidade ${ROT_NIVEL3[r.probabilidade]} → ${ROT_NIVEL3[prob]}, impacto ${ROT_IMPACTO[r.impacto]} → ${ROT_IMPACTO[imp]}${d.motivo ? `. ${curto(d.motivo, 500)}` : ''}`);
  } else if (acao === 'plano') {
    if (r.status === 'encerrado') throw new Error('Risco encerrado: reabra antes de alterar o plano');
    const mitigacao = curto(d.mitigacao, 2000);
    if (!mitigacao) throw new Error('Escreva o que será feito para responder ao risco');
    const prazo = lerDataOpcional(d.prazoMitigacao, 'prazo do plano');
    await db.riscoProjeto.updateMany({ where: { id: riscoId }, data: { mitigacao, responsavel: curto(d.responsavel, 120), prazoMitigacao: prazo, atualizadoEm: agora, status: r.status === 'aberto' ? 'mitigando' : r.status } });
    await evento(db, projetoId, 'risco', a.nome, `${rot}: plano de resposta definido${prazo ? `, prazo ${fmt(prazo)}` : ''}${d.responsavel ? `, responsável ${curto(d.responsavel, 120)}` : ''}`);
  } else if (acao === 'status') {
    const novo = String(d.status ?? '');
    if (!(novo in STATUS_RISCO)) throw new Error('Situação inválida');
    if (novo === r.status) return;
    const motivo = curto(d.motivo, 1000);
    if ((novo === 'encerrado' || (r.status === 'encerrado' && novo !== 'encerrado') || novo === 'ocorreu') && !motivo)
      throw new Error(novo === 'encerrado' ? 'Diga por que o risco foi encerrado' : novo === 'ocorreu' ? 'Conte o que aconteceu' : 'Diga por que o risco foi reaberto');
    await db.riscoProjeto.updateMany({ where: { id: riscoId }, data: { status: novo, atualizadoEm: agora, motivoEncerra: novo === 'encerrado' ? motivo : '' } });
    await evento(db, projetoId, 'risco', a.nome, `${rot}: ${STATUS_RISCO[r.status as StatusRisco]} → ${STATUS_RISCO[novo as StatusRisco]}${motivo ? `: ${motivo}` : ''}`);
  } else throw new Error('Ação inválida');
}
