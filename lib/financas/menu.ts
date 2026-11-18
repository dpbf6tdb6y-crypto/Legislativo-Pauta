// Menu do Compliance: seis áreas e a Administração. Cada perfil vê só o que pode abrir.
import { pode, type Permissao } from './perfis';

const B = '/dashboard/fazenda';
type Regra = Permissao | Permissao[] | null;

export interface ItemMenu { href: string; rotulo: string; p: Regra; /** outras rotas que acendem este item */ rotas?: string[] }
export interface GrupoMenu { rotulo: string; itens: ItemMenu[] }

export const GRUPOS: GrupoMenu[] = [
  { rotulo: 'Painel', itens: [{ href: `${B}/resumo`, rotulo: 'Painel', p: ['orcamento', 'contratos', 'apontamentos', 'folha', 'documentos', 'chaves', 'acessos'] }] },
  {
    rotulo: 'Finanças',
    itens: [
      { href: `${B}/orcamento`, rotulo: 'Orçamento e metas', p: 'orcamento' },
      { href: `${B}/receita`, rotulo: 'Receita', p: 'orcamento' },
      { href: `${B}/despesas`, rotulo: 'Despesas', p: 'orcamento' },
      { href: `${B}/limites`, rotulo: 'Limites legais', p: 'orcamento' },
    ],
  },
  { rotulo: 'Contratos', itens: [{ href: `${B}/contratos`, rotulo: 'Contratos', p: 'contratos' }] },
  { rotulo: 'Pessoal', itens: [{ href: `${B}/pessoal`, rotulo: 'Pessoal', p: 'folha' }] },
  {
    rotulo: 'Documentos',
    itens: [
      { href: `${B}/documentos`, rotulo: 'Para assinar', p: ['documentos', 'documentos_enviar'] },
      { href: `${B}/conferir`, rotulo: 'Conferir antes de assinar', p: 'conferir' },
    ],
  },
  {
    rotulo: 'Auditoria',
    itens: [
      { href: `${B}/apontamentos`, rotulo: 'Auditoria interna', p: 'apontamentos', rotas: [`${B}/regras`] },
      { href: `${B}/auditoria`, rotulo: 'Auditoria por secretaria', p: 'auditoria', rotas: [`${B}/reuniao`] },
      { href: `${B}/relatorio`, rotulo: 'Relatório de auditoria', p: 'apontamentos' },
      { href: `${B}/minha-secretaria`, rotulo: 'Minha secretaria', p: 'secretaria_responder' },
    ],
  },
  {
    rotulo: 'Administração',
    itens: [
      { href: `${B}/coleta`, rotulo: 'Situação da coleta', p: ['orcamento', 'chaves', 'acessos'] },
      { href: `${B}/acessos`, rotulo: 'Registro de acessos', p: 'acessos' },
      { href: `${B}/admin`, rotulo: 'Chaves e perfis', p: 'chaves' },
      { href: `${B}/painel-anterior`, rotulo: 'Painel anterior', p: ['orcamento', 'contratos', 'folha', 'chaves'] },
    ],
  },
];

export const MENU: ItemMenu[] = GRUPOS.flatMap((g) => g.itens);

const permite = (perfil: string, p: Regra) => !p || (Array.isArray(p) ? p.some((x) => pode(perfil, x)) : pode(perfil, p));

export function menuDoPerfil(perfil: string) {
  return MENU.filter((m) => permite(perfil, m.p));
}

/** Áreas que o perfil enxerga, só com os itens que ele pode abrir. */
export function gruposDoPerfil(perfil: string): GrupoMenu[] {
  return GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => permite(perfil, i.p)) })).filter((g) => g.itens.length > 0);
}

/** Primeira tela que o perfil pode abrir. */
export function telaInicial(perfil: string) {
  return menuDoPerfil(perfil)[0]?.href ?? `${B}/sem-permissao`;
}
