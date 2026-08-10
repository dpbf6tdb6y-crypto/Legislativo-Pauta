export const PERMISSOES = [
  { chave: 'podeCriar', label: 'Cadastrar', descricao: 'Criar proposições, requerimentos, moções, sessões, vereadores, etc.' },
  { chave: 'podeEditar', label: 'Editar', descricao: 'Editar dados e tramitação de matérias já cadastradas' },
  { chave: 'podeExcluir', label: 'Excluir', descricao: 'Excluir matérias e cadastros' },
  { chave: 'podeImportar', label: 'Importar', descricao: 'Importar pautas e planilhas' },
  { chave: 'podeExportar', label: 'Exportar', descricao: 'Gerar relatórios em Excel/PDF' },
  { chave: 'podeGerenciarVereadores', label: 'Gerenciar Vereadores', descricao: 'Cadastrar, editar e desativar vereadores e comissões' },
  { chave: 'podeVerAuditoria', label: 'Ver Auditoria', descricao: 'Acessar o histórico de alterações do sistema' },
] as const

export type ChavePermissao = typeof PERMISSOES[number]['chave']

export type UsuarioPermissoes = {
  perfil: string
  podeCriar?: boolean
  podeEditar?: boolean
  podeExcluir?: boolean
  podeImportar?: boolean
  podeExportar?: boolean
  podeGerenciarVereadores?: boolean
  podeVerAuditoria?: boolean
}

/**
 * Master e Admin sempre têm acesso total. Para os demais perfis (operador, leitor),
 * a permissão depende do flag específico do usuário.
 */
export function temPermissao(usuario: UsuarioPermissoes | null | undefined, chave: ChavePermissao): boolean {
  if (!usuario) return false
  if (usuario.perfil === 'master' || usuario.perfil === 'admin') return true
  return usuario[chave] === true
}
