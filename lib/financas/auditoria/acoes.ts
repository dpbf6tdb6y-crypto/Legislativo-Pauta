// Operações da auditoria por secretaria, chamadas pelas telas (server actions) e pelos testes.
// Tudo fica registrado em EventoAuditoria: o histórico não se apaga nem se edita.
import type { DbPrefeitura } from '@/lib/financas/db';
import { STATUS_PONTO, type StatusPonto } from './regras';

const curto = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

export function lerData(s: unknown): Date | null {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [a, m, d] = t.split('-').map(Number);
  const dt = new Date(a, m - 1, d, 12);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function orgaoValido(db: DbPrefeitura, orgaoCod: string) {
  const o = await db.despesaOrgaoMes.findFirst({ where: { orgaoCod, mes: 0 }, orderBy: { ano: 'desc' } });
  if (!o) throw new Error('Secretaria não encontrada');
  return o;
}

async function pontoDa(db: DbPrefeitura, id: number) {
  const p = await db.pontoAuditoria.findFirst({ where: { id } });
  if (!p) throw new Error('Ponto não encontrado');
  return p;
}

export async function criarPonto(db: DbPrefeitura, por: string, d: {
  orgaoCod: string; titulo: string; descricao?: string; baseLegal?: string; prazo?: Date | null;
  origem?: 'manual' | 'apontamento' | 'sugestao'; origemRef?: string;
}) {
  const o = await orgaoValido(db, d.orgaoCod);
  const titulo = curto(d.titulo, 200);
  if (!titulo) throw new Error('Informe o que está sendo cobrado');
  const origemRef = curto(d.origemRef, 120);
  if (origemRef) {
    const ja = await db.pontoAuditoria.findFirst({ where: { origemRef, orgaoCod: d.orgaoCod } });
    if (ja) return ja;
  }
  const p = await db.pontoAuditoria.create({
    data: {
      prefeituraId: '', orgaoCod: o.orgaoCod, orgaoNome: o.orgaoNome, titulo, descricao: curto(d.descricao, 3000),
      baseLegal: curto(d.baseLegal, 300), origem: d.origem ?? 'manual', origemRef, prazo: d.prazo ?? null, criadoPor: por,
    },
  });
  await db.eventoAuditoria.create({
    data: { prefeituraId: '', pontoId: p.id, tipo: 'criado', por, texto: d.prazo ? `Prazo: ${d.prazo.toLocaleDateString('pt-BR')}` : 'Sem prazo definido' },
  });
  return p;
}

/** resposta da secretaria | cobrança | nota. A resposta muda o ponto para "respondido". */
export async function registrarEvento(db: DbPrefeitura, por: string, d: { pontoId: number; tipo: 'resposta' | 'cobranca' | 'nota'; texto: string; emNomeDe?: string; novoPrazo?: Date | null }) {
  const p = await pontoDa(db, d.pontoId);
  if (!['resposta', 'cobranca', 'nota'].includes(d.tipo)) throw new Error('tipo inválido');
  const texto = curto(d.texto, 3000);
  if (d.tipo === 'resposta' && !texto) throw new Error('Escreva a resposta da secretaria');
  await db.eventoAuditoria.create({ data: { prefeituraId: '', pontoId: p.id, tipo: d.tipo, texto: texto || 'Cobrança feita.', por, emNomeDe: curto(d.emNomeDe, 120) } });
  const data: Record<string, unknown> = { atualizadoEm: new Date() };
  if (d.tipo === 'resposta' && p.status === 'aberto') data.status = 'respondido';
  if (d.tipo === 'cobranca' && p.status === 'respondido') data.status = 'aberto'; // resposta não aceita: volta a aguardar
  if (d.novoPrazo) {
    data.prazo = d.novoPrazo;
    await db.eventoAuditoria.create({ data: { prefeituraId: '', pontoId: p.id, tipo: 'prazo', por, texto: `Prazo: ${p.prazo?.toLocaleDateString('pt-BR') ?? 'sem prazo'} → ${d.novoPrazo.toLocaleDateString('pt-BR')}` } });
  }
  if (data.status && data.status !== p.status)
    await db.eventoAuditoria.create({ data: { prefeituraId: '', pontoId: p.id, tipo: 'status', por, texto: `${p.status} → ${data.status}` } });
  await db.pontoAuditoria.updateMany({ where: { id: p.id }, data });
}

/**
 * Resposta dada pela própria secretaria, no sistema. Só vale para ponto da secretaria do usuário
 * e só enquanto o ponto aguarda resposta ou validação; cobrar, mudar prazo e encerrar continuam com quem audita.
 */
export async function responderComoSecretaria(db: DbPrefeitura, u: { nome: string; orgaoCod: string }, pontoId: number, texto: string) {
  if (!u.orgaoCod) throw new Error('Usuário sem secretaria definida');
  const p = await db.pontoAuditoria.findFirst({ where: { id: pontoId, orgaoCod: u.orgaoCod } });
  if (!p) throw new Error('Ponto não encontrado');
  if (p.status !== 'aberto' && p.status !== 'respondido') throw new Error('Este ponto já foi encerrado');
  await registrarEvento(db, u.nome, { pontoId: p.id, tipo: 'resposta', texto, emNomeDe: `${u.nome} · pelo sistema` });
}

export async function mudarStatus(db: DbPrefeitura, por: string, pontoId: number, status: StatusPonto, motivo = '') {
  if (!STATUS_PONTO.includes(status)) throw new Error('status inválido');
  const p = await pontoDa(db, pontoId);
  if (p.status === status) return;
  if ((status === 'resolvido' || status === 'cancelado') && !curto(motivo, 1000))
    throw new Error(status === 'resolvido' ? 'Diga o que comprovou a solução' : 'Diga por que o ponto foi cancelado');
  await db.eventoAuditoria.create({ data: { prefeituraId: '', pontoId: p.id, tipo: 'status', por, texto: `${p.status} → ${status}${motivo ? `: ${curto(motivo, 1000)}` : ''}` } });
  await db.pontoAuditoria.updateMany({ where: { id: p.id }, data: { status, atualizadoEm: new Date() } });
}

export async function definirResponsavel(db: DbPrefeitura, por: string, orgaoCod: string, nome: string, cargo: string) {
  await orgaoValido(db, orgaoCod);
  const n = curto(nome, 120);
  if (!n) throw new Error('Informe o nome do responsável');
  const ja = await db.responsavelSecretaria.findFirst({ where: { orgaoCod } });
  if (ja) await db.responsavelSecretaria.updateMany({ where: { orgaoCod }, data: { nome: n, cargo: curto(cargo, 120), alteradoPor: por, alteradoEm: new Date() } });
  else await db.responsavelSecretaria.create({ data: { prefeituraId: '', orgaoCod, nome: n, cargo: curto(cargo, 120), alteradoPor: por } });
}

export async function registrarReuniao(db: DbPrefeitura, por: string, orgaoCod: string, participantes: string, notas: string) {
  await orgaoValido(db, orgaoCod);
  return db.reuniaoSecretaria.create({ data: { prefeituraId: '', orgaoCod, registradoPor: por, participantes: curto(participantes, 500), notas: curto(notas, 5000) } });
}
