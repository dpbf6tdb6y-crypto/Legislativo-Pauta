// Login dos módulos da Gestão $$$ em cima do login do SEGOV.
// Quem entra: usuário logado no SEGOV, ativo, com o menu "Gestão - $$$" liberado (conferido no cadastro)
// e com um perfil da Gestão (User.gestaoPerfil). Master/Admin sem perfil da Gestão entram como "administrador"
// (configurar chaves e ver o registro de acessos); para ver dados financeiros precisam de um perfil.
// Mesma interface do compliance.gavix (sessaoAtual, exigir, exigirAcaoUsuario, registrar), para as telas
// virem de lá sem mudança.
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { acessoDoMenu } from '@/lib/acessos';
import { dbDa, PREFEITURA_PADRAO } from './db';
import { PERFIS, pode, type Permissao } from './perfis';
import { chaveLigada } from './chaves';

export interface Sessao {
  usuarioId: string;
  prefeituraId: string;
  perfil: string; // perfil da Gestão (prefeito, controlador, ...)
  nome: string;
}

const CAMPOS = {
  id: true, nome: true, perfil: true, ativo: true, acessos: true, podeVerIndicacoes: true,
  podeCriar: true, podeEditar: true, podeExcluir: true, gestaoPerfil: true, gestaoOrgaoCod: true,
} as const;

type UsuarioSegov = { perfil: string; gestaoPerfil: string | null };

/** Perfil da Gestão do usuário do SEGOV (null = sem acesso aos módulos financeiros). */
export function perfilGestao(u: UsuarioSegov): string | null {
  if (u.gestaoPerfil && PERFIS[u.gestaoPerfil]) return u.gestaoPerfil;
  if (u.perfil === 'master' || u.perfil === 'admin') return 'administrador';
  return null;
}

async function usuarioSegov(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: CAMPOS });
  if (!u || !u.ativo || !acessoDoMenu(u as any, 'gestao').ver) return null;
  const perfil = perfilGestao(u);
  return perfil ? { ...u, perfilGestao: perfil } : null;
}

/** Sessão da Gestão, ou null (sem login, desativado, sem o menu Gestão ou sem perfil da Gestão). */
export async function sessaoAtual(): Promise<Sessao | null> {
  const s = await getServerSession(authOptions);
  const id = (s?.user as any)?.id as string | undefined;
  if (!id) return null;
  const u = await usuarioSegov(id);
  if (!u) return null;
  return { usuarioId: u.id, prefeituraId: PREFEITURA_PADRAO, perfil: u.perfilGestao, nome: u.nome };
}

/**
 * O cadastro vale mais que a sessão: perfil e secretaria vêm do banco a cada pedido.
 * null = desativado, apagado, sem acesso à Gestão ou com perfil diferente do da sessão.
 * (trocarSenha fica sempre false: a senha é a do SEGOV, que tem a própria troca.)
 */
export async function usuarioDaSessao(s: Sessao) {
  const u = await usuarioSegov(s.usuarioId);
  if (!u || u.perfilGestao !== s.perfil) return null;
  return { id: u.id, nome: u.nome, perfil: u.perfilGestao, ativo: u.ativo, orgaoCod: u.gestaoOrgaoCod, trocarSenha: false };
}

/**
 * Toda tela chama isto: exige login + acesso à Gestão + permissão do perfil + módulo ligado,
 * e REGISTRA quem consultou o quê.
 */
export async function exigir(permissao: Permissao | null, tela: string, opts: { detalhe?: string; acao?: string; modulo?: string; semTrocaSenha?: boolean } = {}) {
  const logado = await getServerSession(authOptions);
  if (!(logado?.user as any)?.id) redirect('/login');
  const s = await sessaoAtual();
  if (!s) redirect('/dashboard/fazenda/sem-permissao?motivo=perfil');
  if (permissao && !pode(s.perfil, permissao)) redirect('/dashboard/fazenda/sem-permissao');
  if (opts.modulo && !(await chaveLigada(s.prefeituraId, opts.modulo))) redirect(`/dashboard/fazenda/desligado?modulo=${opts.modulo}`);
  await registrar(s, opts.acao ?? 'ver', tela, opts.detalhe ?? '');
  return { s, db: dbDa(s.prefeituraId) };
}

/** Para server actions: login, cadastro ativo e permissão. */
export async function exigirAcaoUsuario(p: Permissao) {
  const s = await sessaoAtual();
  if (!s) throw new Error('Sem permissão');
  const u = await usuarioDaSessao(s);
  if (!u || !pode(s.perfil, p)) throw new Error('Sem permissão');
  return { s, u, db: dbDa(s.prefeituraId) };
}

export async function registrar(s: Sessao, acao: string, tela: string, detalhe = '') {
  await dbDa(s.prefeituraId).registroAcesso.create({
    data: { prefeituraId: s.prefeituraId, usuarioId: s.usuarioId, usuarioNome: s.nome, perfil: s.perfil, acao, tela, detalhe: detalhe.slice(0, 500) },
  });
}
