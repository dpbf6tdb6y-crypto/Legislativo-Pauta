// Anexos (PDF) dos documentos para assinar.
// - O arquivo vai para FIN_DADOS_DIR/<prefeitura>/anexos/<sha256>.pdf, separado por prefeitura.
// - O nome no disco é o hash do conteúdo: não há como o nome enviado pelo usuário escolher a pasta.
// - Ao abrir, o hash é conferido de novo: se o arquivo mudou no disco, o sistema não entrega.
// - Retirar só esconde; o arquivo e o registro ficam, porque o hash pode estar na ciência de uma decisão.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DbPrefeitura } from '@/lib/financas/db';

export const LIMITE_BYTES = 15 * 1024 * 1024;
export const MAX_ANEXOS = 10;
// mesma pasta da coleta (no servidor: dados-financas/, montada no contêiner do app)
const dadosDir = () => process.env.FIN_DADOS_DIR || path.resolve('dados-financas');

/** Confere se é um PDF inteiro: assinatura "%PDF-" no começo e "%%EOF" no fim, dentro do limite de tamanho. */
export function validarPdf(buf: Buffer, nome: string) {
  if (!buf.length) throw new Error(`${nome}: arquivo vazio`);
  if (buf.length > LIMITE_BYTES) throw new Error(`${nome}: maior que ${LIMITE_BYTES / 1024 / 1024} MB`);
  if (buf.subarray(0, 1024).indexOf('%PDF-') < 0) throw new Error(`${nome}: não é um PDF`);
  if (buf.subarray(Math.max(0, buf.length - 2048)).indexOf('%%EOF') < 0) throw new Error(`${nome}: PDF incompleto ou corrompido`);
}

export const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

function caminho(prefeituraId: string, hash: string) {
  if (!/^[a-z0-9-]+$/.test(prefeituraId) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('caminho inválido');
  return path.join(dadosDir(), prefeituraId, 'anexos', `${hash}.pdf`);
}

const nomeSeguro = (n: string) => (n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'documento.pdf');

async function docAberto(db: DbPrefeitura, documentoId: number) {
  const d = await db.documentoAssinatura.findFirst({ where: { id: documentoId } });
  if (!d) throw new Error('Documento não encontrado');
  if (d.status !== 'em_conferencia' && d.status !== 'para_assinatura') throw new Error('Documento já encerrado: não aceita anexo');
  return d;
}

export async function guardarAnexo(db: DbPrefeitura, prefeituraId: string, por: string, documentoId: number, nome: string, buf: Buffer) {
  await docAberto(db, documentoId);
  validarPdf(buf, nome);
  const ativos = await db.anexoDocumento.count({ where: { documentoId, removidoEm: null } });
  if (ativos >= MAX_ANEXOS) throw new Error(`No máximo ${MAX_ANEXOS} anexos por documento`);
  const hash = sha256(buf);
  const arq = caminho(prefeituraId, hash);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  // mesmo conteúdo já guardado: reaproveita; se o arquivo no disco não confere com o nome (corrompido), regrava
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, buf, { flag: 'wx' });
  else if (sha256(fs.readFileSync(arq)) !== hash) fs.writeFileSync(arq, buf);
  const a = await db.anexoDocumento.create({ data: { prefeituraId, documentoId, nome: nomeSeguro(nome), bytes: buf.length, sha256: hash, enviadoPor: por } });
  await db.eventoDocumento.create({ data: { prefeituraId, documentoId, tipo: 'anexo', por, texto: `Anexado ${a.nome} (${(buf.length / 1024).toFixed(0)} KB, SHA-256 ${hash.slice(0, 12)}…)` } });
  return a;
}

export async function retirarAnexo(db: DbPrefeitura, por: string, anexoId: number) {
  const a = await db.anexoDocumento.findFirst({ where: { id: anexoId, removidoEm: null } });
  if (!a) throw new Error('Anexo não encontrado');
  await docAberto(db, a.documentoId);
  await db.anexoDocumento.updateMany({ where: { id: a.id }, data: { removidoPor: por, removidoEm: new Date() } });
  await db.eventoDocumento.create({ data: { prefeituraId: a.prefeituraId, documentoId: a.documentoId, tipo: 'anexo', por, texto: `Retirado ${a.nome} (SHA-256 ${a.sha256.slice(0, 12)}…). O arquivo continua guardado.` } });
}

/** Lê o arquivo e confere o hash; o registro do anexo já deve ter sido buscado pelo cliente da prefeitura. */
export function lerAnexo(prefeituraId: string, a: { sha256: string }) {
  const buf = fs.readFileSync(caminho(prefeituraId, a.sha256));
  if (sha256(buf) !== a.sha256) throw new Error('Arquivo alterado no disco: não confere com o registro');
  return buf;
}

/** Linha da ciência: quais arquivos estavam anexados no momento da decisão. */
export const descreverAnexos = (as: { nome: string; sha256: string }[]) =>
  as.length ? `Anexos: ${as.map((a) => `${a.nome} (SHA-256 ${a.sha256})`).join('; ')}.` : 'Sem anexo.';
