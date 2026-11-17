// Fila de documentos para assinar: envio, conferência automática, parecer e decisão do prefeito.
// Princípio: o sistema confere e registra; quem diz "não assine" é uma pessoa (o parecer).
// Por isso o vermelho só aparece com parecer humano; a conferência automática chega no máximo ao amarelo.
import type { DbPrefeitura } from '@/lib/financas/db';
import { brl, centavos } from '@/lib/financas/dinheiro';
import { conferirDocumento, type Checagem } from '@/lib/financas/conferir';
import { descreverAnexos } from './anexos';

export const TIPOS_DOC: Record<string, string> = {
  empenho: 'Nota de empenho', pagamento: 'Ordem de pagamento', contrato_novo: 'Contrato novo',
  aditivo: 'Aditivo de contrato', nomeacao: 'Nomeação / contratação de pessoal', outro: 'Outro ato',
};
export const PARECERES: Record<string, string> = { pode_assinar: 'Pode assinar', com_ressalva: 'Assinar com ressalva', nao_assinar: 'Não assinar sem ajuste' };
export type StatusDoc = 'em_conferencia' | 'para_assinatura' | 'assinado' | 'devolvido' | 'cancelado';
export const ROTULO_STATUS_DOC: Record<StatusDoc, string> = {
  em_conferencia: 'em conferência', para_assinatura: 'pronto para assinar', assinado: 'assinado', devolvido: 'devolvido', cancelado: 'cancelado',
};

export type Cor = 'verde' | 'amarelo' | 'vermelho' | 'cinza';
export interface Semaforo { cor: Cor; frase: string }

export function semaforo(d: { parecer: string | null; checagens: Checagem[] }): Semaforo {
  const atencao = d.checagens.filter((c) => c.resultado === 'atencao').length;
  const pontos = atencao ? `${atencao} ponto(s) de atenção na conferência automática` : 'conferência automática sem pontos de atenção';
  if (!d.parecer) return { cor: 'cinza', frase: `Aguardando parecer do controlador ou do jurídico · ${pontos}.` };
  if (d.parecer === 'nao_assinar') return { cor: 'vermelho', frase: 'Parecer: não assinar sem ajuste.' };
  if (d.parecer === 'com_ressalva') return { cor: 'amarelo', frase: `Parecer: assinar com ressalva · ${pontos}.` };
  return atencao
    ? { cor: 'amarelo', frase: `Parecer favorável, mas a conferência automática tem ${atencao} ponto(s) de atenção.` }
    : { cor: 'verde', frase: 'Parecer favorável e conferência automática sem pontos de atenção.' };
}

export const lerChecagens = (s: string): Checagem[] => { try { return JSON.parse(s) as Checagem[]; } catch { return []; } };
const curto = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const dataBR = (d: Date) => d.toLocaleDateString('pt-BR');

function dataForm(s: unknown): Date | null {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [a, m, d] = t.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

export interface Remetente { id: string; nome: string; perfil: string; orgaoCod: string }

/** Quem pode ver o documento: quem tem a permissão geral vê tudo; secretaria vê os da sua secretaria; os demais, o que enviaram. */
export function filtroVisivel(u: Remetente, veTudo: boolean) {
  if (veTudo) return {};
  if (u.perfil === 'secretaria') return { orgaoCod: u.orgaoCod || '—' };
  return { enviadoPorId: u.id };
}

async function conferir(db: DbPrefeitura, d: { tipo: string; valor: bigint; credorDoc: string; orgaoCod: string; contrato: string; dataAto: Date }) {
  const v = d.valor;
  const r = await conferirDocumento(db, {
    tipo: d.tipo, valor: `${v / BigInt(100)},${String(v % BigInt(100)).padStart(2, '0')}`, credorDoc: d.credorDoc, orgaoCod: d.orgaoCod, contrato: d.contrato,
    data: `${d.dataAto.getFullYear()}-${String(d.dataAto.getMonth() + 1).padStart(2, '0')}-${String(d.dataAto.getDate()).padStart(2, '0')}`,
  });
  return r;
}

export async function enviarDocumento(db: DbPrefeitura, u: Remetente, f: {
  tipo: string; assunto: string; descricao?: string; valor: string; dataAto: string; credorDoc?: string; credorNome?: string;
  orgaoCod: string; contrato?: string; prazo?: string;
}) {
  if (!TIPOS_DOC[f.tipo]) throw new Error('Tipo de documento inválido');
  const assunto = curto(f.assunto, 200);
  if (!assunto) throw new Error('Informe o assunto do documento');
  let valor: bigint;
  try { valor = centavos(f.valor || '0'); } catch { throw new Error('Valor inválido'); }
  if (valor < BigInt(0)) throw new Error('Valor inválido');
  const dataAto = dataForm(f.dataAto);
  if (!dataAto) throw new Error('Informe a data do ato');
  // a secretaria só envia documento da própria secretaria (vem do cadastro, não do formulário)
  const orgaoCod = u.perfil === 'secretaria' ? u.orgaoCod : curto(f.orgaoCod, 10);
  const o = await db.despesaOrgaoMes.findFirst({ where: { orgaoCod, mes: 0 }, orderBy: { ano: 'desc' } });
  if (!o) throw new Error('Secretaria não encontrada');
  const contrato = curto(f.contrato, 20);
  if (contrato && !/^\d{1,5}\s*\/\s*\d{4}$/.test(contrato)) throw new Error('Contrato no formato número/ano, ex.: 252/2025');
  const credorDoc = curto(f.credorDoc, 20).replace(/\D/g, '');
  if (credorDoc && credorDoc.length !== 11 && credorDoc.length !== 14) throw new Error('CNPJ/CPF do credor com número de dígitos errado');

  const base = { tipo: f.tipo, valor, credorDoc, orgaoCod: o.orgaoCod, contrato, dataAto };
  const r = await conferir(db, base);
  const doc = await db.documentoAssinatura.create({
    data: {
      prefeituraId: '', ...base, assunto, descricao: curto(f.descricao, 4000), credorNome: curto(f.credorNome, 200), orgaoNome: o.orgaoNome,
      prazo: dataForm(f.prazo), checagens: JSON.stringify(r.checagens), dadosDe: r.dadosDe,
      enviadoPor: u.nome, enviadoPorId: u.id, enviadoPerfil: u.perfil,
    },
  });
  const at = r.checagens.filter((c) => c.resultado === 'atencao').length;
  await db.eventoDocumento.create({ data: { prefeituraId: '', documentoId: doc.id, tipo: 'enviado', por: u.nome, texto: `${TIPOS_DOC[f.tipo]} de ${brl(valor)} · conferência automática: ${at} ponto(s) de atenção` } });
  return doc;
}

async function docDa(db: DbPrefeitura, id: number) {
  const d = await db.documentoAssinatura.findFirst({ where: { id } });
  if (!d) throw new Error('Documento não encontrado');
  return d;
}
const aberto = (s: string) => s === 'em_conferencia' || s === 'para_assinatura';

/** Refaz a conferência automática com os dados da última coleta. */
export async function reconferir(db: DbPrefeitura, por: string, id: number) {
  const d = await docDa(db, id);
  if (!aberto(d.status)) throw new Error('Documento já encerrado');
  const r = await conferir(db, d);
  await db.documentoAssinatura.updateMany({ where: { id }, data: { checagens: JSON.stringify(r.checagens), checadoEm: new Date(), dadosDe: r.dadosDe } });
  const at = r.checagens.filter((c) => c.resultado === 'atencao').length;
  await db.eventoDocumento.create({ data: { prefeituraId: '', documentoId: id, tipo: 'conferido', por, texto: `Conferência refeita (${r.dadosDe}): ${at} ponto(s) de atenção` } });
}

export async function darParecer(db: DbPrefeitura, por: string, id: number, parecer: string, texto: string) {
  const d = await docDa(db, id);
  if (!aberto(d.status)) throw new Error('Documento já encerrado');
  if (!PARECERES[parecer]) throw new Error('Parecer inválido');
  const t = curto(texto, 4000);
  if (parecer !== 'pode_assinar' && !t) throw new Error('Explique a ressalva ou o ajuste necessário');
  await db.documentoAssinatura.updateMany({ where: { id }, data: { parecer, parecerTexto: t, parecerPor: por, parecerEm: new Date(), status: 'para_assinatura' } });
  await db.eventoDocumento.create({ data: { prefeituraId: '', documentoId: id, tipo: 'parecer', por, texto: `${PARECERES[parecer]}${t ? `: ${t}` : ''}` } });
}

/**
 * Decisão do prefeito. Grava a "ciência": o semáforo, o parecer e os pontos de atenção que estavam na tela.
 * Assinar sem parecer, contra parecer "não assinar" ou com ressalva exige justificativa escrita.
 */
export async function decidir(db: DbPrefeitura, por: string, id: number, decisao: 'assinado' | 'devolvido', texto: string) {
  const d = await docDa(db, id);
  if (!aberto(d.status)) throw new Error('Documento já encerrado');
  if (decisao !== 'assinado' && decisao !== 'devolvido') throw new Error('Decisão inválida');
  const ch = lerChecagens(d.checagens);
  const s = semaforo({ parecer: d.parecer, checagens: ch });
  const t = curto(texto, 4000);
  const anexos = await db.anexoDocumento.findMany({ where: { documentoId: id, removidoEm: null }, orderBy: { id: 'asc' } });
  if (decisao === 'devolvido' && !t) throw new Error('Diga à secretaria o que precisa ser ajustado');
  if (decisao === 'assinado' && s.cor !== 'verde' && !t)
    throw new Error(s.cor === 'cinza' ? 'Ainda não há parecer: justifique a assinatura (ex.: urgência)' : 'Há ressalva ou ponto de atenção: registre a justificativa da assinatura');
  if (decisao === 'assinado' && !anexos.length && !t) throw new Error('Não há PDF anexado: registre a justificativa para assinar sem ver o arquivo no sistema');
  const atencao = ch.filter((c) => c.resultado === 'atencao').map((c) => c.item);
  const ciencia = `Semáforo ${s.cor} (${s.frase})${atencao.length ? ` Pontos de atenção: ${atencao.join('; ')}.` : ''} Conferência de ${d.checadoEm.toLocaleString('pt-BR')}, ${d.dadosDe}. ${descreverAnexos(anexos)}`;
  await db.documentoAssinatura.updateMany({ where: { id }, data: { status: decisao, decisaoPor: por, decisaoEm: new Date(), decisaoTexto: t } });
  await db.eventoDocumento.create({ data: { prefeituraId: '', documentoId: id, tipo: decisao, por, texto: `${t ? `${/[.!?]$/.test(t) ? t : `${t}.`} ` : ''}Ciência registrada: ${ciencia}` } });
}

export async function cancelar(db: DbPrefeitura, por: string, id: number, motivo: string) {
  const d = await docDa(db, id);
  if (!aberto(d.status)) throw new Error('Documento já encerrado');
  const t = curto(motivo, 1000);
  if (!t) throw new Error('Diga por que o documento foi retirado');
  await db.documentoAssinatura.updateMany({ where: { id }, data: { status: 'cancelado' } });
  await db.eventoDocumento.create({ data: { prefeituraId: '', documentoId: id, tipo: 'cancelado', por, texto: t } });
}

/** Ordem da fila: prazo mais próximo primeiro; sem prazo, o mais antigo. */
export function ordenarFila<T extends { prazo: Date | null; enviadoEm: Date }>(ds: T[]): T[] {
  return [...ds].sort((a, b) => (a.prazo?.getTime() ?? Infinity) - (b.prazo?.getTime() ?? Infinity) || a.enviadoEm.getTime() - b.enviadoEm.getTime());
}

export function prazoTexto(prazo: Date | null, hoje: Date) {
  if (!prazo) return '';
  const dias = Math.round((new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate()).getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000);
  return dias < 0 ? `prazo vencido em ${dataBR(prazo)}` : dias === 0 ? 'assinar hoje' : `assinar até ${dataBR(prazo)}`;
}
