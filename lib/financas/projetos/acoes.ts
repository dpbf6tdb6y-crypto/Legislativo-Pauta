// Operações da carteira de projetos, chamadas pelas telas (server actions) e pelos testes.
// Cada mudança grava um EventoProjeto: o histórico não se apaga nem se edita.
import type { DbPrefeitura } from '@/lib/financas/db';
import { centavos } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { lerData } from '@/lib/financas/auditoria/acoes';
import {
  FONTES, impedimentoDeFase, PRIORIDADES, ROTULO_FASE, TIPOS, transicoesPermitidas, type Fase,
} from './regras';

export interface Ator {
  nome: string;
  orgaoCod: string; // perfil secretaria: a secretaria do usuário
  verTodos: boolean; // vê toda a carteira
  gerir: boolean; // cadastra e edita qualquer projeto
  aprovar: boolean; // aprova, conclui e cancela
  secretaria: boolean; // só mexe nos projetos em que a sua secretaria participa
}

export function atorDe(u: { nome: string; perfil: string; orgaoCod: string; master?: boolean }): Ator {
  return {
    nome: u.nome, orgaoCod: u.orgaoCod,
    // o Master do SEGOV tem o acesso total a Projetos, qualquer que seja o perfil dele na Gestão
    verTodos: !!u.master || pode(u.perfil, 'projetos'), gerir: !!u.master || pode(u.perfil, 'projetos_gerir'),
    aprovar: !!u.master || pode(u.perfil, 'projetos_aprovar'), secretaria: pode(u.perfil, 'projetos_secretaria'),
  };
}

/** Filtro de leitura: quem não vê toda a carteira só enxerga os projetos em que a sua secretaria participa. */
export function filtroVisivel(a: Ator) {
  if (a.verTodos) return {};
  if (a.secretaria && a.orgaoCod) return { secretarias: { some: { orgaoCod: a.orgaoCod } } };
  return { id: -1 };
}

export const curto = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
export const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString('pt-BR') : 'sem data');
const brl = (c: bigint | null) => (c === null ? 'não informado' : `R$ ${(Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

function lerOrcamento(v: unknown): bigint | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  let c: bigint;
  try { c = centavos(t); } catch { throw new Error('Orçamento inválido: use números, como 1.500.000,00'); }
  if (c < 0n) throw new Error('O orçamento não pode ser negativo');
  return c;
}
export function lerDataOpcional(v: unknown, campo: string): Date | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const d = lerData(t);
  if (!d) throw new Error(`Data inválida em "${campo}"`);
  return d;
}
function conferirPeriodo(ini: Date | null, fim: Date | null, rotulo = 'projeto') {
  if (ini && fim && fim.getTime() < ini.getTime()) throw new Error(`O fim previsto do ${rotulo} não pode ser antes do início`);
}

export interface DadosProjeto {
  titulo: string; objetivo?: string; tipo: string; prioridade?: string; eixo?: string; bairro?: string; fonteRecurso?: string;
  orcamento?: string; inicioPrevisto?: string; fimPrevisto?: string;
}

function validarDados(d: DadosProjeto) {
  const titulo = curto(d.titulo, 200);
  if (!titulo) throw new Error('Informe o nome do projeto');
  if (!TIPOS[d.tipo]) throw new Error('Escolha o tipo do projeto');
  const prioridade = d.prioridade || 'media';
  if (!PRIORIDADES[prioridade]) throw new Error('Prioridade inválida');
  const fonteRecurso = curto(d.fonteRecurso, 40);
  if (fonteRecurso && !FONTES[fonteRecurso]) throw new Error('Fonte de recurso inválida');
  const inicioPrevisto = lerDataOpcional(d.inicioPrevisto, 'início previsto');
  const fimPrevisto = lerDataOpcional(d.fimPrevisto, 'fim previsto');
  conferirPeriodo(inicioPrevisto, fimPrevisto);
  return {
    titulo, objetivo: curto(d.objetivo, 3000), tipo: d.tipo, prioridade, eixo: curto(d.eixo, 200), bairro: curto(d.bairro, 200),
    fonteRecurso, orcamento: lerOrcamento(d.orcamento), inicioPrevisto, fimPrevisto,
  };
}

async function orgaosValidos(db: DbPrefeitura) {
  const { orgaos } = await orgaosExecutivo(db, new Date());
  return new Map(orgaos.map((o) => [o.orgaoCod, o.orgaoNome]));
}

export async function evento(db: DbPrefeitura, projetoId: number, tipo: string, por: string, texto: string) {
  await db.eventoProjeto.create({ data: { prefeituraId: '', projetoId, tipo, texto: texto.slice(0, 3000), por } });
}
const tocar = (db: DbPrefeitura, id: number) => db.projeto.updateMany({ where: { id }, data: { atualizadoEm: new Date() } });

/** Projeto que o ator pode ver (e portanto mexer, se tiver a permissão da operação). */
export async function projetoVisivel(db: DbPrefeitura, a: Ator, id: number) {
  const p = await db.projeto.findFirst({ where: { id, ...filtroVisivel(a) }, include: { secretarias: true, etapas: { orderBy: { ordem: 'asc' } } } });
  if (!p) throw new Error('Projeto não encontrado');
  return p;
}
export function podeMexer(a: Ator) {
  if (!a.gerir && !a.secretaria) throw new Error('Sem permissão para alterar projetos');
}

export async function criarProjeto(db: DbPrefeitura, a: Ator, d: DadosProjeto & { secretariaLider?: string; responsavel?: string; parceiras?: string[] }) {
  podeMexer(a);
  const dados = validarDados(d);
  const orgaos = await orgaosValidos(db);
  // a secretaria só cadastra para si; quem gere escolhe a líder
  const lider = a.gerir ? curto(d.secretariaLider, 20) : a.orgaoCod;
  if (!lider || !orgaos.has(lider)) throw new Error(a.gerir ? 'Escolha a secretaria líder' : 'Seu usuário não está ligado a uma secretaria');
  const parceiras = [...new Set((d.parceiras ?? []).map((x) => curto(x, 20)).filter(Boolean))].filter((c) => c !== lider);
  for (const c of parceiras) if (!orgaos.has(c)) throw new Error('Secretaria parceira não encontrada');

  const p = await db.projeto.create({ data: { prefeituraId: '', ...dados, criadoPor: a.nome, criadoPorPerfil: a.gerir ? 'gestao' : 'secretaria' } });
  await db.projetoSecretaria.create({ data: { prefeituraId: '', projetoId: p.id, orgaoCod: lider, orgaoNome: orgaos.get(lider)!, papel: 'lider', responsavel: curto(d.responsavel, 120) } });
  for (const c of parceiras) await db.projetoSecretaria.create({ data: { prefeituraId: '', projetoId: p.id, orgaoCod: c, orgaoNome: orgaos.get(c)!, papel: 'parceira' } });
  await evento(db, p.id, 'criado', a.nome, `Projeto cadastrado como ideia. Secretaria líder: ${orgaos.get(lider)}${parceiras.length ? `; em conjunto com ${parceiras.map((c) => orgaos.get(c)).join(', ')}` : ''}.`);
  return p;
}

const ROT_CAMPO: Record<string, string> = {
  titulo: 'Nome', objetivo: 'Objetivo', tipo: 'Tipo', prioridade: 'Prioridade', eixo: 'Eixo', bairro: 'Bairro', fonteRecurso: 'Fonte do recurso',
  orcamento: 'Orçamento', inicioPrevisto: 'Início previsto', fimPrevisto: 'Fim previsto',
};

/** Edita os dados do projeto. Depois de aprovado, só o aprovador mexe no orçamento e qualquer mudança de data exige o motivo. */
export async function editarProjeto(db: DbPrefeitura, a: Ator, id: number, d: DadosProjeto, motivo = '') {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const novo = validarDados(d);
  const aprovado = !['ideia', 'estudo'].includes(p.fase);
  if (aprovado && !a.aprovar && novo.orcamento !== p.orcamento) throw new Error('Depois de aprovado, só o prefeito ou o controlador altera o orçamento');
  if (aprovado && p.orcamento !== null && novo.orcamento === null) throw new Error('Projeto aprovado precisa manter o orçamento');
  if (aprovado && (!novo.inicioPrevisto || !novo.fimPrevisto)) throw new Error('Projeto aprovado precisa manter início e fim previstos');
  const mudouData = (x: Date | null, y: Date | null) => (x?.getTime() ?? null) !== (y?.getTime() ?? null);
  const datas = mudouData(novo.inicioPrevisto, p.inicioPrevisto) || mudouData(novo.fimPrevisto, p.fimPrevisto);
  if (aprovado && datas && !curto(motivo, 1000)) throw new Error('Explique o motivo da mudança de data');

  const mudancas: string[] = [];
  for (const k of Object.keys(ROT_CAMPO) as (keyof typeof novo)[]) {
    const a0 = (p as Record<string, unknown>)[k], b0 = novo[k];
    const igual = a0 instanceof Date || b0 instanceof Date ? (a0 as Date | null)?.getTime() === (b0 as Date | null)?.getTime() : a0 === b0;
    if (igual) continue;
    const mostra = (v: unknown) => (v instanceof Date ? fmt(v) : typeof v === 'bigint' ? brl(v) : v === null || v === '' ? '(vazio)' : k === 'tipo' ? TIPOS[String(v)] : k === 'prioridade' ? PRIORIDADES[String(v)] : k === 'fonteRecurso' ? FONTES[String(v)] ?? String(v) : curto(v, 120));
    mudancas.push(`${ROT_CAMPO[k]}: ${mostra(a0)} → ${mostra(b0)}`);
  }
  if (!mudancas.length) return p;
  await db.projeto.updateMany({ where: { id }, data: { ...novo, atualizadoEm: new Date() } });
  await evento(db, id, datas ? 'prazo' : 'dados', a.nome, `${mudancas.join('; ')}${motivo ? `. Motivo: ${curto(motivo, 1000)}` : ''}`);
  return p;
}

/** Muda a fase. A aprovação fixa o fim previsto original (base para mostrar o replanejamento depois). */
export async function mudarFase(db: DbPrefeitura, a: Ator, id: number, para: string, motivo = '') {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  // 1) o passo existe, 2) quem pede pode dar o passo, 3) os dados do projeto permitem o passo
  if (!transicoesPermitidas(p.fase, true).includes(para as Fase)) throw new Error(impedimentoDeFase(p, p.etapas, para) ?? 'Passo inválido');
  if (!transicoesPermitidas(p.fase, a.aprovar).includes(para as Fase))
    throw new Error(`Só o prefeito ou o controlador pode mover o projeto para "${ROTULO_FASE[para as Fase] ?? para}"`);
  const imp = impedimentoDeFase(p, p.etapas, para);
  if (imp) throw new Error(imp);
  const m = curto(motivo, 1000);
  if ((para === 'paralisado' || para === 'cancelado') && !m) throw new Error(para === 'paralisado' ? 'Diga por que o projeto foi paralisado' : 'Diga por que o projeto foi cancelado');

  const agora = new Date();
  const data: Record<string, unknown> = { fase: para, atualizadoEm: agora, motivoFase: para === 'paralisado' || para === 'cancelado' ? m : '' };
  if (para === 'aprovado') { data.aprovadoPor = a.nome; data.aprovadoEm = agora; data.fimPrevistoOriginal = p.fimPrevisto; }
  if (para === 'execucao' && !p.inicioReal) data.inicioReal = agora;
  if (para === 'concluido') data.fimReal = agora;
  await db.projeto.updateMany({ where: { id }, data });
  await evento(db, id, 'fase', a.nome, `${ROTULO_FASE[p.fase as Fase]} → ${ROTULO_FASE[para as Fase]}${m ? `: ${m}` : ''}`);
}

// ------------------------------------------------------------------ etapas

export async function adicionarEtapa(db: DbPrefeitura, a: Ator, id: number, d: { titulo: string; marco?: boolean; peso?: number; inicioPrevisto?: string; fimPrevisto?: string }) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não aceita novas etapas');
  const titulo = curto(d.titulo, 200);
  if (!titulo) throw new Error('Informe o nome da etapa');
  const peso = d.marco ? 1 : Math.round(Number(d.peso ?? 1));
  if (!(peso >= 1 && peso <= 100)) throw new Error('O peso da etapa vai de 1 a 100');
  let ini = lerDataOpcional(d.inicioPrevisto, 'início da etapa');
  const fim = lerDataOpcional(d.fimPrevisto, 'prazo da etapa');
  if (d.marco) ini = null;
  conferirPeriodo(ini, fim, 'etapa');
  if (p.fase !== 'ideia' && p.fase !== 'estudo' && !fim) throw new Error('Informe o prazo da etapa');
  const ordem = (p.etapas.at(-1)?.ordem ?? 0) + 1;
  // o marco é uma entrega pontual (sem início) e conta no avanço como uma etapa de peso 1
  const e = await db.etapaProjeto.create({ data: { prefeituraId: '', projetoId: id, ordem, titulo, marco: !!d.marco, peso, inicioPrevisto: ini, fimPrevisto: fim } });
  await tocar(db, id);
  await evento(db, id, 'etapa', a.nome, `${d.marco ? 'Marco' : 'Etapa'} incluído: "${titulo}"${fim ? `, prazo ${fmt(fim)}` : ''}`);
  return e;
}

export type AcaoEtapa = 'iniciar' | 'concluir' | 'reabrir' | 'cancelar' | 'datas';

export async function atualizarEtapa(db: DbPrefeitura, a: Ator, etapaId: number, acao: AcaoEtapa, d: { inicioPrevisto?: string; fimPrevisto?: string; motivo?: string } = {}) {
  podeMexer(a);
  const et = await db.etapaProjeto.findFirst({ where: { id: etapaId } });
  if (!et) throw new Error('Etapa não encontrada');
  const p = await projetoVisivel(db, a, et.projetoId);
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const rot = `${et.marco ? 'Marco' : 'Etapa'} "${et.titulo}"`;
  const motivo = curto(d.motivo, 1000);
  const agora = new Date();

  if (acao === 'iniciar') {
    if (et.status !== 'pendente') throw new Error('Só uma etapa a fazer pode ser iniciada');
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'andamento' } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} iniciada`);
  } else if (acao === 'concluir') {
    if (et.status === 'concluida' || et.status === 'cancelada') throw new Error('Esta etapa já foi encerrada');
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'concluida', concluidaEm: agora } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} concluída${et.fimPrevisto && agora > et.fimPrevisto ? ` (prazo era ${fmt(et.fimPrevisto)})` : ''}`);
  } else if (acao === 'reabrir') {
    if (et.status !== 'concluida' && et.status !== 'cancelada') throw new Error('Só etapa concluída ou cancelada pode ser reaberta');
    if (!motivo) throw new Error('Diga por que a etapa foi reaberta');
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'pendente', concluidaEm: null } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} reaberta: ${motivo}`);
  } else if (acao === 'cancelar') {
    if (et.status === 'concluida' || et.status === 'cancelada') throw new Error('Esta etapa já foi encerrada');
    if (!motivo) throw new Error('Diga por que a etapa foi cancelada');
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'cancelada' } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} cancelada: ${motivo}`);
  } else if (acao === 'datas') {
    const ini = et.marco ? null : lerDataOpcional(d.inicioPrevisto, 'início da etapa');
    const fim = lerDataOpcional(d.fimPrevisto, 'prazo da etapa');
    conferirPeriodo(ini, fim, 'etapa');
    if (!fim && p.fase !== 'ideia' && p.fase !== 'estudo') throw new Error('Informe o prazo da etapa');
    const igual = (x: Date | null, y: Date | null) => (x?.getTime() ?? null) === (y?.getTime() ?? null);
    if (igual(ini, et.inicioPrevisto) && igual(fim, et.fimPrevisto)) return;
    if (!['ideia', 'estudo'].includes(p.fase) && !motivo) throw new Error('Explique o motivo da mudança de data');
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { inicioPrevisto: ini, fimPrevisto: fim } });
    await evento(db, p.id, 'prazo', a.nome, `${rot}: ${et.marco ? '' : `início ${fmt(et.inicioPrevisto)} → ${fmt(ini)}; `}prazo ${fmt(et.fimPrevisto)} → ${fmt(fim)}${motivo ? `. Motivo: ${motivo}` : ''}`);
  } else throw new Error('Ação inválida');
  await tocar(db, p.id);
}

// ------------------------------------------------------------------ andamento e secretarias

export async function registrarAtualizacao(db: DbPrefeitura, a: Ator, id: number, texto: string) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  const t = curto(texto, 3000);
  if (!t) throw new Error('Escreva a atualização');
  await evento(db, p.id, 'atualizacao', a.nome, t);
  await tocar(db, p.id);
}

export async function adicionarParceira(db: DbPrefeitura, a: Ator, id: number, orgaoCod: string, responsavel = '') {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const orgaos = await orgaosValidos(db);
  if (!orgaos.has(orgaoCod)) throw new Error('Secretaria não encontrada');
  if (p.secretarias.some((s) => s.orgaoCod === orgaoCod)) throw new Error('Esta secretaria já participa do projeto');
  await db.projetoSecretaria.create({ data: { prefeituraId: '', projetoId: id, orgaoCod, orgaoNome: orgaos.get(orgaoCod)!, papel: 'parceira', responsavel: curto(responsavel, 120) } });
  await evento(db, id, 'parceria', a.nome, `${orgaos.get(orgaoCod)} passou a participar do projeto${responsavel ? ` (responsável: ${curto(responsavel, 120)})` : ''}`);
}

export async function definirResponsavelProjeto(db: DbPrefeitura, a: Ator, id: number, orgaoCod: string, responsavel: string) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  const s = p.secretarias.find((x) => x.orgaoCod === orgaoCod);
  if (!s) throw new Error('Esta secretaria não participa do projeto');
  const nome = curto(responsavel, 120);
  await db.projetoSecretaria.updateMany({ where: { id: s.id }, data: { responsavel: nome } });
  await evento(db, id, 'parceria', a.nome, `Responsável de ${s.orgaoNome}: ${s.responsavel || '(ninguém)'} → ${nome || '(ninguém)'}`);
}

export async function removerParceira(db: DbPrefeitura, a: Ator, id: number, orgaoCod: string, motivo: string) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  const s = p.secretarias.find((x) => x.orgaoCod === orgaoCod);
  if (!s) throw new Error('Esta secretaria não participa do projeto');
  if (s.papel === 'lider') throw new Error('A secretaria líder não pode ser retirada');
  if (!a.gerir && a.orgaoCod === orgaoCod) throw new Error('A própria secretaria não pode se retirar sozinha: peça ao prefeito ou ao controlador');
  if (!curto(motivo, 1000)) throw new Error('Diga por que a secretaria deixa o projeto');
  await db.projetoSecretaria.deleteMany({ where: { id: s.id } });
  await evento(db, id, 'parceria', a.nome, `${s.orgaoNome} deixou o projeto: ${curto(motivo, 1000)}`);
}
