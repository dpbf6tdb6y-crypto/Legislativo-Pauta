// Perfis de acesso (PLANO §15, Q3). Cada tela exige uma permissão.
export type Permissao =
  | 'orcamento' | 'contratos' | 'conferir' | 'folha' | 'folha_exportar'
  | 'folha_nomes' // ver o nome do servidor na folha (só com a chave folha_nomes ligada); sem ela aparece "Servidor 0001"
  | 'apontamentos' | 'apontamentos_classificar' | 'regras_aprovar'
  | 'acessos' | 'usuarios' | 'chaves'
  | 'auditoria' | 'auditoria_gerir' // auditoria por secretaria: ver / registrar cobrança, resposta, prazo, reunião
  | 'secretaria_responder' // perfil secretaria: vê e responde só os pontos da própria secretaria
  | 'documentos' | 'documentos_enviar' | 'documentos_parecer' | 'documentos_decidir' // fila de documentos para assinar
  | 'projetos' // carteira de projetos: ver todos
  | 'projetos_gerir' // cadastrar para qualquer secretaria, editar, mudar a fase (menos aprovar)
  | 'projetos_aprovar' // aprovar, concluir e cancelar projeto
  | 'projetos_secretaria'; // perfil secretaria: propõe e atualiza só os projetos em que a sua secretaria participa

export const PERFIS: Record<string, { nome: string; pode: Permissao[] }> = {
  prefeito: { nome: 'Prefeito', pode: ['orcamento', 'contratos', 'conferir', 'folha', 'folha_nomes', 'apontamentos', 'auditoria', 'auditoria_gerir', 'documentos', 'documentos_enviar', 'documentos_decidir', 'projetos', 'projetos_gerir', 'projetos_aprovar'] },
  controlador: { nome: 'Controlador', pode: ['orcamento', 'contratos', 'conferir', 'folha', 'folha_nomes', 'apontamentos', 'apontamentos_classificar', 'regras_aprovar', 'auditoria', 'auditoria_gerir', 'documentos', 'documentos_enviar', 'documentos_parecer', 'projetos', 'projetos_gerir', 'projetos_aprovar'] },
  financeiro: { nome: 'Financeiro', pode: ['orcamento', 'contratos', 'conferir', 'apontamentos', 'auditoria', 'documentos', 'documentos_enviar', 'projetos'] },
  rh: { nome: 'Recursos Humanos', pode: ['folha', 'folha_nomes', 'documentos_enviar'] }, // envia nomeações; vê só o que enviou
  juridico: { nome: 'Jurídico', pode: ['contratos', 'conferir', 'apontamentos', 'apontamentos_classificar', 'auditoria', 'documentos', 'documentos_parecer', 'projetos'] },
  auditor: { nome: 'Auditor', pode: ['orcamento', 'contratos', 'folha', 'folha_nomes', 'apontamentos', 'acessos', 'auditoria', 'documentos', 'projetos'] },
  administrador: { nome: 'Administrador', pode: ['usuarios', 'chaves', 'acessos'] }, // NÃO vê folha individual
  secretaria: { nome: 'Secretaria', pode: ['secretaria_responder', 'documentos_enviar', 'projetos_secretaria'] }, // presa a uma secretaria (Usuario.orgaoCod): envia e vê só os documentos dela
};

/** Permissões que o Master do SEGOV tem sempre, além das do perfil dele na Gestão (por ora, só Projetos). */
export const PODE_DO_MASTER: Permissao[] = ['projetos', 'projetos_gerir', 'projetos_aprovar'];

export function pode(perfil: string | undefined, p: Permissao) {
  return !!perfil && !!PERFIS[perfil]?.pode.includes(p);
}

/** Perfis que podem ser escolhidos no cadastro de usuários do SEGOV (campo "perfil na Gestão"). */
export const PERFIS_GESTAO = ['prefeito', 'controlador', 'financeiro', 'rh', 'juridico', 'auditor', 'administrador', 'secretaria'] as const;

/**
 * Valida o que veio do cadastro de usuários. Perfil desconhecido vira null (sem acesso aos módulos);
 * a secretaria (código do órgão, só dígitos) só vale para o perfil "secretaria" e é obrigatória nele.
 */
export function normalizaPerfilGestao(perfil: unknown, orgaoCod: unknown): { gestaoPerfil: string | null; gestaoOrgaoCod: string } | { erro: string } {
  const p = typeof perfil === 'string' && (PERFIS_GESTAO as readonly string[]).includes(perfil) ? perfil : null;
  const o = String(orgaoCod ?? '').trim();
  if (p !== 'secretaria') return { gestaoPerfil: p, gestaoOrgaoCod: '' };
  if (!/^\d{1,6}$/.test(o)) return { erro: 'Perfil Secretaria no Compliance: informe o código da secretaria (só números, ex.: 09).' };
  return { gestaoPerfil: p, gestaoOrgaoCod: o };
}
