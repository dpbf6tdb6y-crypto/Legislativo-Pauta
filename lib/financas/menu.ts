// Submenu dos módulos da Gestão $$$ e a primeira tela de cada perfil.
import { pode, type Permissao } from './perfis';

const B = '/dashboard/fazenda';
export const MENU: { href: string; rotulo: string; p: Permissao | Permissao[] | null }[] = [
  { href: `${B}/resumo`, rotulo: 'Resumo', p: ['orcamento', 'contratos', 'apontamentos'] },
  { href: B, rotulo: 'Painel', p: null },
  { href: `${B}/orcamento`, rotulo: 'Orçamento e metas', p: 'orcamento' },
  { href: `${B}/contratos`, rotulo: 'Contratos', p: 'contratos' },
  { href: `${B}/documentos`, rotulo: 'Documentos para assinar', p: ['documentos', 'documentos_enviar'] },
  { href: `${B}/conferir`, rotulo: 'Conferir antes de assinar', p: 'conferir' },
  { href: `${B}/pessoal`, rotulo: 'Pessoal', p: 'folha' },
  { href: `${B}/apontamentos`, rotulo: 'Apontamentos', p: 'apontamentos' },
  { href: `${B}/relatorio`, rotulo: 'Relatório de auditoria', p: 'apontamentos' },
  { href: `${B}/auditoria`, rotulo: 'Auditoria por secretaria', p: 'auditoria' },
  { href: `${B}/minha-secretaria`, rotulo: 'Minha secretaria', p: 'secretaria_responder' },
  { href: `${B}/regras`, rotulo: 'Regras', p: 'apontamentos' },
  { href: `${B}/coleta`, rotulo: 'Situação da coleta', p: null },
  { href: `${B}/acessos`, rotulo: 'Registro de acessos', p: 'acessos' },
  { href: `${B}/admin`, rotulo: 'Chaves e perfis', p: 'chaves' },
];

export function menuDoPerfil(perfil: string) {
  return MENU.filter((m) => !m.p || (Array.isArray(m.p) ? m.p.some((x) => pode(perfil, x)) : pode(perfil, m.p)));
}

/** Primeira tela de módulo que o perfil pode abrir (o "Painel" é o HTML antigo e fica de fora). */
export function telaInicial(perfil: string) {
  return menuDoPerfil(perfil).find((m) => m.href !== B)?.href ?? `${B}/coleta`;
}
