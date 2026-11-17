import { redirect } from 'next/navigation';
import { sessaoAtual } from '@/lib/financas/auth';
import { telaInicial } from '@/lib/financas/menu';

// Entrada dos módulos da Gestão (link do menu lateral): vai para a primeira tela que o perfil pode abrir.
export default async function Modulos() {
  const s = await sessaoAtual();
  if (!s) redirect('/dashboard/fazenda/sem-permissao?motivo=perfil');
  redirect(telaInicial(s.perfil));
}
