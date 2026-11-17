'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { dbDa } from '@/lib/financas/db';
import { pode, type Permissao } from '@/lib/financas/perfis';
import { mudarChave } from '@/lib/financas/chaves';
import { REGRAS, executarRegras } from '@/lib/financas/regras/motor';

async function exigirAcao(p: Permissao) {
  const { s, db } = await exigirAcaoUsuario(p);
  return { s, db };
}

/** Aprovar / desligar regra e ajustar parâmetros. Só controlador. */
export async function decidirRegra(form: FormData) {
  const { s, db } = await exigirAcao('regras_aprovar');
  const codigo = String(form.get('codigo'));
  const estado = String(form.get('estado'));
  if (!['aprovada', 'desligada', 'proposta'].includes(estado)) throw new Error('estado inválido');
  const def = REGRAS.find((r) => r.codigo === codigo);
  if (!def) throw new Error('regra desconhecida');
  const reg = await db.regra.findFirst({ where: { codigo } });
  const params = JSON.parse(reg?.parametros ?? '{}');
  for (const k of Object.keys(def.parametrosPadrao)) {
    const v = form.get(`p_${k}`);
    if (v !== null) params[k] = String(v).trim() === '' ? null : Number(v);
  }
  if (estado === 'aprovada' && def.exigeParametro?.some((k) => params[k] === null || params[k] === undefined || Number.isNaN(params[k])))
    throw new Error(`Informe ${def.exigeParametro.join(', ')} antes de aprovar`);
  await db.regra.updateMany({ where: { codigo }, data: { estado, parametros: JSON.stringify(params), decididoPor: s.nome, decididoEm: new Date() } });
  await registrar(s, 'alterar', 'Regras', `${codigo}: ${reg?.estado} → ${estado}; parâmetros ${JSON.stringify(params)}`);
  if (estado === 'aprovada') await executarRegras(s.prefeituraId);
  revalidatePath('/dashboard/fazenda/regras');
}

/** Classificar apontamento. Controlador ou jurídico. */
export async function classificarApontamento(form: FormData) {
  const { s, db } = await exigirAcao('apontamentos_classificar');
  const id = Number(form.get('id'));
  const status = String(form.get('status'));
  if (!['procedente', 'improcedente', 'para_analise'].includes(status)) throw new Error('status inválido');
  const nota = String(form.get('nota') ?? '').slice(0, 1000);
  const r = await db.apontamento.updateMany({ where: { id }, data: { status, nota, analisadoPor: s.nome, analisadoEm: new Date() } });
  if (r.count !== 1) throw new Error('apontamento não encontrado');
  await registrar(s, 'alterar', 'Apontamentos', `#${id} → ${status}`);
  revalidatePath('/dashboard/fazenda/apontamentos');
}

/** Liga/desliga módulo. Administrador. */
export async function alternarChave(form: FormData) {
  const { s } = await exigirAcao('chaves');
  const nome = String(form.get('nome'));
  const ligada = String(form.get('ligada')) === 'true';
  await mudarChave(s.prefeituraId, nome, ligada, s.nome);
  await registrar(s, 'alterar', 'Administração', `chave ${nome} → ${ligada ? 'ligada' : 'desligada'}`);
  revalidatePath('/dashboard/fazenda/admin');
}
