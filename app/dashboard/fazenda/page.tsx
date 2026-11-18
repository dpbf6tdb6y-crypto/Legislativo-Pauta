import { redirect } from 'next/navigation';
import { sessaoAtual } from '@/lib/financas/auth';
import { telaInicial } from '@/lib/financas/menu';

// Entrada do Compliance: vai para a primeira tela do perfil. Quem ainda não tem perfil continua vendo o painel anterior.
export const dynamic = 'force-dynamic';

export default async function Compliance() {
  const s = await sessaoAtual();
  redirect(s ? telaInicial(s.perfil) : '/dashboard/fazenda/painel-anterior');
}
