'use server';
import { revalidatePath } from 'next/cache';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { responderComoSecretaria } from '@/lib/financas/auditoria/acoes';

export async function acaoResponderSecretaria(f: FormData) {
  // a secretaria vem do cadastro do usuário, nunca do formulário
  const { s, u, db } = await exigirAcaoUsuario('secretaria_responder');
  const pontoId = Number(f.get('pontoId'));
  await responderComoSecretaria(db, u, pontoId, String(f.get('texto') ?? ''));
  await registrar(s, 'alterar', 'Minha secretaria', `resposta ao ponto #${pontoId}`);
  revalidatePath('/dashboard/fazenda/minha-secretaria');
  revalidatePath('/dashboard/fazenda/auditoria');
  revalidatePath(`/dashboard/fazenda/auditoria/${u.orgaoCod}`);
  revalidatePath(`/dashboard/fazenda/reuniao/${u.orgaoCod}`);
}
