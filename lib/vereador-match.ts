export function normalizarNome(nome: string) {
  return nome.replace(/\(.*?\)/g, '').replace(/[–—-]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Casa um fragmento de texto (ex: "Thiago Felipe de Almeida" ou "Cláudio José de Deus – Claudinho Valle")
 * com um vereador cadastrado (ex: "Thiago Almeida") — exige mesmo primeiro nome e que o sobrenome
 * do cadastro apareça em algum lugar do fragmento (tolera apelido colado depois de travessão).
 */
export function buscarVereadorPorNome<T extends { nome: string }>(fragmento: string, lista: T[]): T | null {
  const tokens = normalizarNome(fragmento).split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  const primeiro = tokens[0]
  return lista.find(v => {
    const vTokens = normalizarNome(v.nome).split(/\s+/).filter(Boolean)
    if (vTokens[0] !== primeiro) return false
    const sobrenome = vTokens[vTokens.length - 1]
    return sobrenome === primeiro || tokens.includes(sobrenome)
  }) || null
}

/** Divide um texto de autores por vírgula ou " e ", em fragmentos de nome individuais. */
export function splitAutoresTexto(texto: string | null | undefined): string[] {
  if (!texto) return []
  return texto.split(/\s+e\s+|,\s+/).map(n => n.trim()).filter(Boolean)
}

export type AutorResolvido = { label: string; vereadorId: string | null; ativo: boolean }

/**
 * Resolve uma lista de fragmentos de autor (incluindo o vereador já vinculado, se houver)
 * em labels deduplicados, preferindo o apelido cadastrado do vereador.
 * Passe a lista de vereadores incluindo inativos (ex: /api/vereadores?ativo=false) para que
 * autores que já saíram do mandato sejam corretamente identificados e marcados como inativos.
 */
export function resolverAutores(
  vereadorPrincipal: { id: string; nome: string; apelido?: string | null; ativo?: boolean } | null | undefined,
  autorNomeTexto: string | null | undefined,
  vereadores: { id: string; nome: string; apelido?: string | null; ativo?: boolean }[]
): AutorResolvido[] {
  const fragmentos: string[] = []
  if (vereadorPrincipal?.nome) fragmentos.push(vereadorPrincipal.nome)
  fragmentos.push(...splitAutoresTexto(autorNomeTexto))

  const vistos = new Set<string>()
  const resolvidos: AutorResolvido[] = []
  fragmentos.forEach(f => {
    const v = buscarVereadorPorNome(f, vereadores)
    const chave = v ? v.id : normalizarNome(f)
    if (vistos.has(chave)) return
    vistos.add(chave)
    resolvidos.push({
      label: v ? (v.apelido || v.nome.split(/\s+/)[0]) : f.split(/\s+/)[0],
      vereadorId: v ? v.id : null,
      ativo: v ? v.ativo !== false : true,
    })
  })
  return resolvidos
}

/**
 * Situação de uma matéria para fins do filtro Ativos/Inativos/Todos: considera "ativos"
 * quando não há autores resolvidos (texto livre não vinculado) ou quando pelo menos um
 * dos autores resolvidos ainda está ativo; "inativos" só quando TODOS os autores resolvidos
 * já estão inativos.
 */
export function situacaoAutores(autores: AutorResolvido[]): 'ativos' | 'inativos' {
  if (autores.length === 0) return 'ativos'
  return autores.some(a => a.ativo) ? 'ativos' : 'inativos'
}
