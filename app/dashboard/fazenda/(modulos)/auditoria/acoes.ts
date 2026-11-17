'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import * as A from '@/lib/financas/auditoria/acoes';
import type { StatusPonto } from '@/lib/financas/auditoria/regras';

async function exigirGestao() {
  const { s, db } = await exigirAcaoUsuario('auditoria_gerir');
  return { s, db };
}
const txt = (f: FormData, k: string) => String(f.get(k) ?? '');
/** só caminhos internos do próprio sistema */
const caminhoInterno = (s: string) => (/^\/dashboard\/fazenda\/(auditoria|reuniao)(\/[\w-]*)?(\?[\w=&%-]*)?$/.test(s) ? s : '');
function atualizar(orgaoCod: string) {
  revalidatePath('/dashboard/fazenda/auditoria');
  revalidatePath(`/dashboard/fazenda/auditoria/${orgaoCod}`);
  revalidatePath(`/dashboard/fazenda/reuniao/${orgaoCod}`);
  revalidatePath('/dashboard/fazenda/resumo');
}

export async function acaoCriarPonto(f: FormData) {
  const { s, db } = await exigirGestao();
  const orgaoCod = txt(f, 'orgaoCod');
  const origemRef = txt(f, 'origemRef');
  const p = await A.criarPonto(db, s.nome, {
    orgaoCod, titulo: txt(f, 'titulo'), descricao: txt(f, 'descricao'), baseLegal: txt(f, 'baseLegal'), prazo: A.lerData(f.get('prazo')),
    origem: origemRef.startsWith('apontamento:') ? 'apontamento' : origemRef ? 'sugestao' : 'manual', origemRef,
  });
  await registrar(s, 'alterar', 'Auditoria', `ponto #${p.id} na secretaria ${orgaoCod}: ${p.titulo}`);
  atualizar(orgaoCod);
  const volta = caminhoInterno(txt(f, 'volta'));
  if (volta) redirect(volta);
}

export async function acaoEvento(f: FormData) {
  const { s, db } = await exigirGestao();
  const pontoId = Number(f.get('pontoId'));
  const tipo = txt(f, 'tipo') as 'resposta' | 'cobranca' | 'nota';
  await A.registrarEvento(db, s.nome, { pontoId, tipo, texto: txt(f, 'texto'), emNomeDe: txt(f, 'emNomeDe'), novoPrazo: A.lerData(f.get('novoPrazo')) });
  await registrar(s, 'alterar', 'Auditoria', `ponto #${pontoId}: ${tipo}`);
  atualizar(txt(f, 'orgaoCod'));
}

export async function acaoStatus(f: FormData) {
  const { s, db } = await exigirGestao();
  const pontoId = Number(f.get('pontoId'));
  const status = txt(f, 'status') as StatusPonto;
  await A.mudarStatus(db, s.nome, pontoId, status, txt(f, 'motivo'));
  await registrar(s, 'alterar', 'Auditoria', `ponto #${pontoId} → ${status}`);
  atualizar(txt(f, 'orgaoCod'));
}

export async function acaoResponsavel(f: FormData) {
  const { s, db } = await exigirGestao();
  const orgaoCod = txt(f, 'orgaoCod');
  await A.definirResponsavel(db, s.nome, orgaoCod, txt(f, 'nome'), txt(f, 'cargo'));
  await registrar(s, 'alterar', 'Auditoria', `responsável da secretaria ${orgaoCod}`);
  atualizar(orgaoCod);
}

export async function acaoReuniao(f: FormData) {
  const { s, db } = await exigirGestao();
  const orgaoCod = txt(f, 'orgaoCod');
  await A.registrarReuniao(db, s.nome, orgaoCod, txt(f, 'participantes'), txt(f, 'notas'));
  await registrar(s, 'alterar', 'Auditoria', `reunião registrada com a secretaria ${orgaoCod}`);
  atualizar(orgaoCod);
  const prox = caminhoInterno(txt(f, 'proxima'));
  if (prox) redirect(prox);
}
