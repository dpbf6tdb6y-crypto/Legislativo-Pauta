'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { gerarRelatorio } from '@/lib/financas/auditoria/relatorio';

/** Gera e guarda um relatório de auditoria interna. Prefeito e controlador. */
export async function acaoGerarRelatorio() {
  const { s, db } = await exigirAcaoUsuario('auditoria_gerir');
  const r = await gerarRelatorio(db, s.prefeituraId, s.nome);
  await registrar(s, 'alterar', 'Relatório de auditoria', `relatório #${r.id} gerado (SHA-256 ${r.sha256.slice(0, 12)}…)`);
  revalidatePath('/dashboard/fazenda/relatorio');
  redirect(`/dashboard/fazenda/relatorio/${r.id}`);
}
