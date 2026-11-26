'use server';
// Ações próprias da aba Governança. Iniciar, concluir, incluir etapa e incluir secretaria usam as ações do Compliance › Projetos.
import { revalidatePath } from 'next/cache';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { chaveLigada } from '@/lib/financas/chaves';
import { atorDe, definirEtapaCooperacao, definirParticipacao, type Ator } from '@/lib/financas/projetos/acoes';
import type { DbPrefeitura } from '@/lib/financas/db';

export type Resultado = { erro?: string } | null;
const txt = (f: FormData, k: string) => String(f.get(k) ?? '');

async function contexto() {
  const ctx = await exigirAcaoUsuario('projetos_gerir').catch(() => exigirAcaoUsuario('projetos_secretaria'));
  if (!(await chaveLigada(ctx.s.prefeituraId, 'projetos'))) throw new Error('O módulo Projetos está desligado');
  return { ...ctx, ator: atorDe({ nome: ctx.u.nome, perfil: ctx.s.perfil, orgaoCod: ctx.u.orgaoCod, master: ctx.s.master }) };
}

/** Erro de regra volta para a tela; erro de sessão ou permissão sobe como erro de verdade. */
async function executar(f: FormData, op: (db: DbPrefeitura, ator: Ator, id: number) => Promise<string>): Promise<Resultado> {
  const c = await contexto();
  const id = Number(f.get('id'));
  try {
    const resumo = await op(c.db, c.ator, id);
    await registrar(c.s, 'alterar', 'Governança', resumo);
  } catch (e) { return { erro: (e as Error).message }; }
  revalidatePath('/dashboard/governanca');
  revalidatePath(`/dashboard/governanca/projetos/${id}`);
  revalidatePath(`/dashboard/fazenda/projetos/${id}`);
  return null;
}

export async function acaoEtapaCooperacao(_: Resultado, f: FormData): Promise<Resultado> {
  return executar(f, async (db, ator, id) => {
    const etapaId = Number(f.get('etapaId'));
    await definirEtapaCooperacao(db, ator, id, etapaId, { orgaoCod: txt(f, 'orgaoCod'), dependeDe: f.getAll('dependeDe').map(String) });
    return `projeto #${id}: etapa #${etapaId} (responsável e dependências)`;
  });
}

export async function acaoParticipacao(_: Resultado, f: FormData): Promise<Resultado> {
  return executar(f, async (db, ator, id) => {
    const orgaoCod = txt(f, 'orgaoCod');
    await definirParticipacao(db, ator, id, orgaoCod, { atuacao: txt(f, 'atuacao'), atribuicao: txt(f, 'atribuicao'), aporte: f.has('aporte') ? txt(f, 'aporte') : undefined });
    return `projeto #${id}: participação da secretaria ${orgaoCod}`;
  });
}
