// Entrada comum das telas de projetos: login, módulo ligado, permissão (ver tudo ou só a própria secretaria) e o ator.
import { redirect } from 'next/navigation';
import { exigir, sessaoAtual, usuarioDaSessao } from '@/lib/financas/auth';
import { pode } from '@/lib/financas/perfis';
import { atorDe } from '@/lib/financas/projetos/acoes';

export async function acessoProjetos(tela: string, opts: { detalhe?: string; acao?: string } = {}) {
  const s0 = await sessaoAtual();
  if (!s0) redirect('/login');
  const permissao = pode(s0.perfil, 'projetos') ? 'projetos' : 'projetos_secretaria';
  const { s, db } = await exigir(permissao, tela, { ...opts, modulo: 'projetos' });
  const u = (await usuarioDaSessao(s))!;
  return { s, db, ator: atorDe({ nome: u.nome, perfil: u.perfil, orgaoCod: u.orgaoCod }), verContratos: pode(s.perfil, 'contratos') };
}
