'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { pode, type Permissao } from '@/lib/financas/perfis';
import * as F from '@/lib/financas/documentos/fluxo';
import { guardarAnexo, MAX_ANEXOS, retirarAnexo, validarPdf } from '@/lib/financas/documentos/anexos';

export type Resultado = { erro?: string } | null;
const txt = (f: FormData, k: string) => String(f.get(k) ?? '');

/** Permissão + o documento precisa estar entre os que o usuário pode ver. */
async function comDocumento(p: Permissao, f: FormData) {
  const ctx = await exigirAcaoUsuario(p);
  const id = Number(f.get('id'));
  const visivel = await ctx.db.documentoAssinatura.findFirst({
    where: { id, ...F.filtroVisivel({ id: ctx.u.id, nome: ctx.u.nome, perfil: ctx.u.perfil, orgaoCod: ctx.u.orgaoCod }, pode(ctx.s.perfil, 'documentos')) },
    select: { id: true, enviadoPorId: true },
  });
  if (!visivel) throw new Error('Documento não encontrado');
  return { ...ctx, id, doc: visivel };
}
function atualizar(id?: number) {
  revalidatePath('/dashboard/fazenda/documentos');
  if (id) revalidatePath(`/dashboard/fazenda/documentos/${id}`);
  revalidatePath('/dashboard/fazenda/resumo');
}
const erro = (e: unknown): Resultado => ({ erro: (e as Error).message });

/** Lê os PDFs do formulário e valida todos antes de gravar qualquer coisa. */
async function lerPdfs(f: FormData) {
  const arqs = f.getAll('anexos').filter((x): x is File => typeof x === 'object' && x !== null && 'arrayBuffer' in x && (x as File).size > 0);
  if (arqs.length > MAX_ANEXOS) throw new Error(`No máximo ${MAX_ANEXOS} anexos por documento`);
  const out: { nome: string; buf: Buffer }[] = [];
  for (const a of arqs) {
    const buf = Buffer.from(await a.arrayBuffer());
    validarPdf(buf, a.name || 'arquivo');
    out.push({ nome: a.name || 'documento.pdf', buf });
  }
  return out;
}

export async function acaoEnviar(_: Resultado, f: FormData): Promise<Resultado> {
  const { s, u, db } = await exigirAcaoUsuario('documentos_enviar');
  let id: number;
  try {
    const pdfs = await lerPdfs(f);
    const d = await F.enviarDocumento(db, { id: u.id, nome: u.nome, perfil: u.perfil, orgaoCod: u.orgaoCod }, {
      tipo: txt(f, 'tipo'), assunto: txt(f, 'assunto'), descricao: txt(f, 'descricao'), valor: txt(f, 'valor'), dataAto: txt(f, 'dataAto'),
      credorDoc: txt(f, 'credorDoc'), credorNome: txt(f, 'credorNome'), orgaoCod: txt(f, 'orgaoCod'), contrato: txt(f, 'contrato'), prazo: txt(f, 'prazo'),
    });
    id = d.id;
    for (const p of pdfs) await guardarAnexo(db, s.prefeituraId, s.nome, id, p.nome, p.buf);
  } catch (e) { return erro(e); }
  await registrar(s, 'alterar', 'Documentos', `documento #${id} enviado para assinatura`);
  atualizar(id);
  redirect(`/dashboard/fazenda/documentos/${id}`);
}

export async function acaoReconferir(_: Resultado, f: FormData): Promise<Resultado> {
  const { s, db, id } = await comDocumento('documentos_enviar', f).catch(async () => comDocumento('documentos_parecer', f));
  try { await F.reconferir(db, s.nome, id); } catch (e) { return erro(e); }
  await registrar(s, 'alterar', 'Documentos', `documento #${id} reconferido`);
  atualizar(id);
  return null;
}

export async function acaoParecer(_: Resultado, f: FormData): Promise<Resultado> {
  const { s, db, id } = await comDocumento('documentos_parecer', f);
  try { await F.darParecer(db, s.nome, id, txt(f, 'parecer'), txt(f, 'texto')); } catch (e) { return erro(e); }
  await registrar(s, 'alterar', 'Documentos', `parecer no documento #${id}: ${txt(f, 'parecer')}`);
  atualizar(id);
  return null;
}

export async function acaoDecidir(_: Resultado, f: FormData): Promise<Resultado> {
  const { s, db, id } = await comDocumento('documentos_decidir', f);
  const decisao = txt(f, 'decisao') as 'assinado' | 'devolvido';
  try { await F.decidir(db, s.nome, id, decisao, txt(f, 'texto')); } catch (e) { return erro(e); }
  await registrar(s, 'alterar', 'Documentos', `documento #${id}: ${decisao}`);
  atualizar(id);
  return null;
}

export async function acaoCancelar(_: Resultado, f: FormData): Promise<Resultado> {
  const ctx = await comDocumento('documentos_enviar', f).catch(async () => comDocumento('documentos_parecer', f));
  // retira o documento quem enviou ou quem dá parecer
  if (ctx.doc.enviadoPorId !== ctx.u.id && !pode(ctx.s.perfil, 'documentos_parecer')) return { erro: 'Só quem enviou ou o controlador pode retirar o documento' };
  try { await F.cancelar(ctx.db, ctx.s.nome, ctx.id, txt(f, 'motivo')); } catch (e) { return erro(e); }
  await registrar(ctx.s, 'alterar', 'Documentos', `documento #${ctx.id} retirado`);
  atualizar(ctx.id);
  return null;
}

export async function acaoAnexar(_: Resultado, f: FormData): Promise<Resultado> {
  const { s, db, id } = await comDocumento('documentos_enviar', f).catch(async () => comDocumento('documentos_parecer', f));
  try {
    const pdfs = await lerPdfs(f);
    if (!pdfs.length) return { erro: 'Escolha um arquivo PDF' };
    for (const p of pdfs) await guardarAnexo(db, s.prefeituraId, s.nome, id, p.nome, p.buf);
  } catch (e) { return erro(e); }
  await registrar(s, 'alterar', 'Documentos', `anexo(s) no documento #${id}`);
  atualizar(id);
  return null;
}

export async function acaoRetirarAnexo(_: Resultado, f: FormData): Promise<Resultado> {
  const ctx = await comDocumento('documentos_enviar', f).catch(async () => comDocumento('documentos_parecer', f));
  if (ctx.doc.enviadoPorId !== ctx.u.id && !pode(ctx.s.perfil, 'documentos_parecer')) return { erro: 'Só quem enviou ou o controlador pode retirar anexo' };
  const anexoId = Number(f.get('anexoId'));
  const a = await ctx.db.anexoDocumento.findFirst({ where: { id: anexoId, documentoId: ctx.id } });
  if (!a) return { erro: 'Anexo não encontrado' };
  try { await retirarAnexo(ctx.db, ctx.s.nome, anexoId); } catch (e) { return erro(e); }
  await registrar(ctx.s, 'alterar', 'Documentos', `anexo #${anexoId} retirado do documento #${ctx.id}`);
  atualizar(ctx.id);
  return null;
}
