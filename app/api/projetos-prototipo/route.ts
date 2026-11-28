// Entrega o protótipo "Projetos" (demonstração com dados fictícios) só para quem está logado e tem o menu Compliance.
// A página é isolada do SEGOV (CSP sandbox, sem allow-same-origin): o programa dela não enxerga o login nem os dados do sistema.
// A única informação que o servidor escreve nela é o nome e o cargo de quem está logado.
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { acessoDoMenu } from '@/lib/acessos';
import { HTML_PROTOTIPO } from '@/lib/projetosPrototipo/html';
import { injetarUsuario } from '@/lib/projetosPrototipo/usuario';
import { normalizaCargo } from '@/lib/cargos';

export const dynamic = 'force-dynamic';

const POLITICA = [
  // allow-forms: os formulários da demonstração funcionam na própria tela; form-action 'none' impede qualquer envio
  // allow-popups-to-escape-sandbox: a janela que a página abre (WhatsApp) funciona normalmente; a página continua isolada
  'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

const recusar = (status: number, texto: string) =>
  new Response(texto, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET() {
  const sessao = await getServerSession(authOptions);
  const id = (sessao?.user as { id?: string } | undefined)?.id;
  if (!id) return recusar(401, 'Entre no sistema para ver esta tela.');

  // o cadastro vale mais que a sessão: usuário desativado ou sem o menu não entra
  const usuario = await prisma.user.findUnique({
    where: { id },
    select: { nome: true, cargo: true, perfil: true, ativo: true, acessos: true, podeVerIndicacoes: true, podeCriar: true, podeEditar: true, podeExcluir: true },
  });
  if (!usuario?.ativo || !acessoDoMenu(usuario as any, 'gestao').ver) return recusar(403, 'Seu usuário não tem permissão para esta área.');

  const pagina = injetarUsuario(HTML_PROTOTIPO, { nome: usuario.nome ?? '', cargo: normalizaCargo(usuario.cargo) ?? '' });

  return new Response(pagina, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': POLITICA,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
