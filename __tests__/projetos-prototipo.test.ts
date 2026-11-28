// Aba Projetos: quem pode abrir o protótipo e como a página é isolada do sistema.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const findUnique = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: () => findUnique() } } }));

import { GET } from '@/app/api/projetos-prototipo/route';
import { menuDaRota } from '@/lib/acessos';
import { HTML_PROTOTIPO } from '@/lib/projetosPrototipo/html';
import { injetarUsuario } from '@/lib/projetosPrototipo/usuario';

describe('aba Projetos (protótipo)', () => {
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ nome: 'Maria Souza', cargo: 'Prefeito', perfil: 'master', ativo: true });
  });

  it('usa o mesmo acesso do menu Compliance', () => {
    expect(menuDaRota('/dashboard/projetos')).toBe('gestao');
  });

  it('recusa quem não está logado', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('recusa usuário desativado, apagado ou sem o menu', async () => {
    for (const usuario of [null, { perfil: 'master', ativo: false }, { perfil: 'operador', ativo: true, acessos: JSON.stringify({ gestao: { ver: false, cad: false } }) }]) {
      findUnique.mockResolvedValue(usuario);
      const r = await GET();
      expect(r.status).toBe(403);
      expect(await r.text()).not.toContain('<html');
    }
  });

  it('entrega a página isolada do sistema', async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(injetarUsuario(HTML_PROTOTIPO, { nome: 'Maria Souza', cargo: 'Prefeito' }));
    const politica = r.headers.get('content-security-policy') ?? '';
    expect(politica).toMatch(/^sandbox /);
    expect(politica).not.toContain('allow-same-origin');
    expect(politica).toContain('allow-popups-to-escape-sandbox');
    expect(politica).toContain("connect-src 'none'");
    expect(r.headers.get('cache-control')).toContain('no-store');
  });

  it('ignora cargo que não está na lista', async () => {
    findUnique.mockResolvedValue({ nome: 'João', cargo: 'master', perfil: 'master', ativo: true });
    expect(await (await GET()).text()).toContain('window.__USUARIO__ = {"nome":"João","cargo":""};');
  });

  it('não carrega programa de nenhum site externo', () => {
    expect(HTML_PROTOTIPO).not.toMatch(/<script[^>]+src=/i);
    expect(HTML_PROTOTIPO).toContain('Protótipo com dados fictícios');
  });
});
