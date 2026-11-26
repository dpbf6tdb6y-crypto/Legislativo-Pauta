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
import { ATUACOES, criaCiclo, dependentesDe, impedimentoPorDependencia } from './etapas';

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

// ------------------------------------------------------------------ cada secretaria altera só a própria parte
// Gestão (prefeito, controlador, Master) altera tudo. Para o perfil Secretaria:
//  - o PLANO do projeto é só da gestão: dados, fase, etapas, dependências, secretarias, responsabilidades, riscos e resultados
//    (a secretaria ainda pode PROPOR um projeto novo, como ideia);
//  - CADA secretaria executa as próprias etapas, informa o próprio contato e liga os próprios contratos e despesas;
//  - etapa sem responsável definido (ou de quem já saiu do projeto) é executada pela coordenadora (papel "lider");
//  - registrar andamento continua aberto a toda secretaria participante.

type Participantes = { secretarias: { orgaoCod: string; papel: string }[] };

/** A própria parte: a secretaria do usuário (ou qualquer uma, para a gestão). */
export const ehParteDe = (a: Ator, orgaoCod: string) => a.gerir || (a.secretaria && !!a.orgaoCod && a.orgaoCod === orgaoCod);

export const coordena = (a: Ator, p: Participantes) => p.secretarias.some((s) => s.papel === 'lider' && ehParteDe(a, s.orgaoCod)) || a.gerir;

export function executaEtapa(a: Ator, p: Participantes, e: { orgaoCod?: string | null }): boolean {
  if (a.gerir) return true;
  const temDona = !!e.orgaoCod && p.secretarias.some((s) => s.orgaoCod === e.orgaoCod);
  return temDona ? ehParteDe(a, e.orgaoCod!) && p.secretarias.some((s) => s.orgaoCod === a.orgaoCod) : coordena(a, p);
}

export function exigirGestao(a: Ator, oQue: string) {
  if (!a.gerir) throw new Error(`Só o prefeito ou o controlador ${oQue}`);
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
  exigirGestao(a, 'altera os dados do projeto');
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
  exigirGestao(a, 'muda a fase do projeto');
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
  exigirGestao(a, 'inclui etapas');
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
  if (!executaEtapa(a, p, et)) throw new Error(
    p.secretarias.some((s) => s.orgaoCod === et.orgaoCod)
      ? 'Só a secretaria responsável por esta etapa, o prefeito ou o controlador pode alterá-la'
      : 'Etapa sem responsável: só a secretaria coordenadora, o prefeito ou o controlador pode alterá-la');
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const rot = `${et.marco ? 'Marco' : 'Etapa'} "${et.titulo}"`;
  const motivo = curto(d.motivo, 1000);
  const agora = new Date();

  if (acao === 'iniciar') {
    if (et.status !== 'pendente') throw new Error('Só uma etapa a fazer pode ser iniciada');
    const presa = impedimentoPorDependencia(p.etapas, et);
    if (presa) throw new Error(presa);
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'andamento' } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} iniciada`);
  } else if (acao === 'concluir') {
    if (et.status === 'concluida' || et.status === 'cancelada') throw new Error('Esta etapa já foi encerrada');
    const presa = impedimentoPorDependencia(p.etapas, et);
    if (presa) throw new Error(presa);
    await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { status: 'concluida', concluidaEm: agora } });
    await evento(db, p.id, 'etapa', a.nome, `${rot} concluída${et.fimPrevisto && agora > et.fimPrevisto ? ` (prazo era ${fmt(et.fimPrevisto)})` : ''}`);
  } else if (acao === 'reabrir') {
    if (et.status !== 'concluida' && et.status !== 'cancelada') throw new Error('Só etapa concluída ou cancelada pode ser reaberta');
    if (!motivo) throw new Error('Diga por que a etapa foi reaberta');
    const feitas = dependentesDe(p.etapas, etapaId).filter((x) => x.status === 'concluida');
    if (feitas.length) throw new Error(`Reabra antes as etapas concluídas que dependem desta: ${feitas.map((x) => `${x.ordem}. ${x.titulo}`).join('; ')}`);
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
  exigirGestao(a, 'inclui secretarias no projeto');
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
  if (!ehParteDe(a, orgaoCod)) throw new Error('Cada secretaria informa o próprio contato');
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
  exigirGestao(a, 'retira secretarias do projeto');
  if (!curto(motivo, 1000)) throw new Error('Diga por que a secretaria deixa o projeto');
  const comEtapa = p.etapas.filter((e) => e.orgaoCod === orgaoCod && (e.status === 'pendente' || e.status === 'andamento'));
  if (comEtapa.length) throw new Error(`Passe antes a outra secretaria as etapas em aberto desta: ${comEtapa.map((e) => `${e.ordem}. ${e.titulo}`).join('; ')}`);
  await db.projetoSecretaria.deleteMany({ where: { id: s.id } });
  await evento(db, id, 'parceria', a.nome, `${s.orgaoNome} deixou o projeto: ${curto(motivo, 1000)}`);
}

// ------------------------------------------------------------------ responsabilidades e dependências

/** Secretaria responsável pela etapa e etapas de que ela depende. */
export async function definirEtapaCooperacao(db: DbPrefeitura, a: Ator, projetoId: number, etapaId: number, d: { orgaoCod?: string; dependeDe?: (string | number)[] }) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  exigirGestao(a, 'define responsáveis e dependências');
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const et = p.etapas.find((e) => e.id === etapaId);
  if (!et) throw new Error('Etapa não encontrada');

  const orgaoCod = curto(d.orgaoCod, 20);
  const responsavel = p.secretarias.find((s) => s.orgaoCod === orgaoCod);
  if (orgaoCod && !responsavel) throw new Error('A secretaria responsável precisa participar do projeto');
  if (responsavel && responsavel.papel !== 'lider' && responsavel.atuacao === 'apoio') throw new Error('Secretaria em papel de apoio não fica responsável por etapa');

  const dependeDe = [...new Set((d.dependeDe ?? []).map(Number))].sort((x, y) => x - y);
  const outras = new Map(p.etapas.map((e) => [e.id, e]));
  for (const id of dependeDe) {
    const x = outras.get(id);
    if (!x) throw new Error('A dependência precisa ser uma etapa deste projeto');
    if (x.status === 'cancelada') throw new Error(`A etapa "${x.titulo}" está cancelada e não pode ser dependência`);
    if (et.status === 'concluida' && x.status !== 'concluida') throw new Error('Etapa concluída não pode passar a depender de uma etapa em aberto: reabra-a antes');
  }
  if (criaCiclo(p.etapas, etapaId, dependeDe)) throw new Error('Essa escolha cria um ciclo: a etapa passaria a depender dela mesma');

  const antes = [...(et.dependeDe ?? [])].sort((x, y) => x - y);
  const mudouResp = orgaoCod !== et.orgaoCod;
  const mudouDep = antes.join(',') !== dependeDe.join(',');
  if (!mudouResp && !mudouDep) return;
  await db.etapaProjeto.updateMany({ where: { id: etapaId }, data: { orgaoCod, dependeDe } });

  const nomeSec = (c: string) => (c ? p.secretarias.find((s) => s.orgaoCod === c)?.orgaoNome ?? c : '(não definida)');
  const nomeDeps = (ids: number[]) => (ids.length ? ids.map((i) => `"${outras.get(i)?.titulo ?? i}"`).join(', ') : 'nenhuma');
  const partes: string[] = [];
  if (mudouResp) partes.push(`responsável: ${nomeSec(et.orgaoCod)} → ${nomeSec(orgaoCod)}`);
  if (mudouDep) partes.push(`depende de: ${nomeDeps(antes)} → ${nomeDeps(dependeDe)}`);
  await evento(db, p.id, 'etapa', a.nome, `${et.marco ? 'Marco' : 'Etapa'} "${et.titulo}": ${partes.join('; ')}`);
  await tocar(db, p.id);
}

/** Papel, atribuição e aporte de uma secretaria no projeto. O aporte só é informado por quem faz a gestão da carteira. */
export async function definirParticipacao(db: DbPrefeitura, a: Ator, id: number, orgaoCod: string, d: { atuacao?: string; atribuicao?: string; aporte?: string }) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, id);
  exigirGestao(a, 'define o papel e o que cada secretaria deve fazer');
  if (p.fase === 'concluido' || p.fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
  const s = p.secretarias.find((x) => x.orgaoCod === orgaoCod);
  if (!s) throw new Error('Esta secretaria não participa do projeto');
  const lider = s.papel === 'lider';

  const atuacao = lider ? '' : curto(d.atuacao, 20);
  if (atuacao && !ATUACOES[atuacao]) throw new Error('Papel inválido');
  if (atuacao === 'apoio' && p.etapas.some((e) => e.orgaoCod === orgaoCod && (e.status === 'pendente' || e.status === 'andamento')))
    throw new Error('Esta secretaria responde por etapas em aberto: passe-as a outra antes de mudar o papel para apoio');
  const atribuicao = curto(d.atribuicao, 500);

  // aporte ausente (formulário de quem não faz a gestão) = mantém o que está gravado
  let aporte = s.aporte;
  if (!lider && d.aporte !== undefined && a.gerir) {
    aporte = lerOrcamento(d.aporte);
    const outros = p.secretarias.filter((x) => x.id !== s.id).reduce((total, x) => total + (x.aporte ?? 0n), 0n);
    if (aporte !== null && p.orcamento !== null && outros + aporte > p.orcamento) throw new Error(`A soma dos aportes passa do orçamento do projeto (${brl(p.orcamento)})`);
  }

  const mudancas: string[] = [];
  if (atuacao !== s.atuacao) mudancas.push(`papel: ${ATUACOES[s.atuacao] ?? '(não informado)'} → ${ATUACOES[atuacao] ?? '(não informado)'}`);
  if (atribuicao !== s.atribuicao) mudancas.push(`o que deve fazer: ${atribuicao || '(vazio)'}`);
  if (aporte !== s.aporte) mudancas.push(`aporte: ${brl(s.aporte)} → ${brl(aporte)}`);
  if (!mudancas.length) return;
  await db.projetoSecretaria.updateMany({ where: { id: s.id }, data: { atuacao, atribuicao, aporte } });
  await evento(db, id, 'parceria', a.nome, `${s.orgaoNome}: ${mudancas.join('; ')}`);
  await tocar(db, id);
}
