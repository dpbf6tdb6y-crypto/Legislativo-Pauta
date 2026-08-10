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

export type AutorResolvido = { label: string; vereadorId: string | null }

/**
 * Resolve uma lista de fragmentos de autor (incluindo o vereador já vinculado, se houver)
 * em labels deduplicados, preferindo o apelido cadastrado do vereador.
 */
export function resolverAutores(
  vereadorPrincipal: { id: string; nome: string; apelido?: string | null } | null | undefined,
  autorNomeTexto: string | null | undefined,
  vereadores: { id: string; nome: string; apelido?: string | null }[]
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
    })
  })
  return resolvidos
}
