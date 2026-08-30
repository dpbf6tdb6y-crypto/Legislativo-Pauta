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

  const estrito = lista.find(v => {
    const vTokens = normalizarNome(v.nome).split(/\s+/).filter(Boolean)
    if (vTokens[0] !== primeiro) return false
    const sobrenome = vTokens[vTokens.length - 1]
    return sobrenome === primeiro || tokens.includes(sobrenome)
  })
  if (estrito) return estrito

  // Autores gravados de forma abreviada ("Abner", "Viviane") não têm sobrenome
  // para confirmar. Nesse caso aceita o casamento só pelo primeiro nome, mas
  // apenas quando ele é único na lista — se houver dois "José", fica sem
  // casar (vira texto livre) em vez de escolher a pessoa errada.
  const mesmoPrimeiroNome = lista.filter(
    v => normalizarNome(v.nome).split(/\s+/).filter(Boolean)[0] === primeiro
  )
  return mesmoPrimeiroNome.length === 1 ? mesmoPrimeiroNome[0] : null
}

/** Divide um texto de autores por vírgula ou " e ", em fragmentos de nome individuais. */
export function splitAutoresTexto(texto: string | null | undefined): string[] {
  if (!texto) return []
  return texto.split(/\s+e\s+|,\s+/).map(n => n.trim()).filter(Boolean)
}

export type AutorResolvido = { label: string; vereadorId: string | null; ativo: boolean }

/**
 * Rótulo de exibição de um autor cadastrado: apelido/primeiro nome pro
 * Legislativo, "Poder Executivo - Nome" pro Executivo (prefeito/vice) — nome
 * completo, sem cortar no primeiro espaço, porque nomes como "João Marcelo"
 * e "Cissa Caroline" são compostos.
 */
function labelDeVereador(v: { nome: string; apelido?: string | null; poder?: string }): string {
  if (v.poder === 'executivo') return `Poder Executivo - ${v.apelido || v.nome}`
  return v.apelido || v.nome.split(/\s+/)[0]
}

/**
 * Resolve uma lista de fragmentos de autor (incluindo o vereador já vinculado, se houver)
 * em labels deduplicados, preferindo o apelido cadastrado do vereador.
 * Passe a lista de vereadores incluindo inativos (ex: /api/vereadores?ativo=false) para que
 * autores que já saíram do mandato sejam corretamente identificados e marcados como inativos.
 */
export function resolverAutores(
  vereadorPrincipal: { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string } | null | undefined,
  autorNomeTexto: string | null | undefined,
  vereadores: { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string }[]
): AutorResolvido[] {
  const vistos = new Set<string>()
  const resolvidos: AutorResolvido[] = []

  // O vereador já vinculado (vereadorId) vem com o registro completo — resolve
  // direto por ele, sem tentar recasar o nome contra a lista recebida (que às
  // vezes só tem o Legislativo, e nunca acharia o prefeito/vice ali).
  if (vereadorPrincipal?.id) {
    vistos.add(vereadorPrincipal.id)
    // O nome do vinculado normalmente também está repetido dentro do texto
    // livre (autorNome guarda todos os autores, incluindo o já vinculado) —
    // marca pelo nome também, senão o mesmo autor aparece duas vezes quando
    // o texto livre não casa com a lista recebida (ex.: Executivo numa lista
    // só de Legislativo) e cai no rótulo de "não achei ninguém".
    vistos.add(normalizarNome(vereadorPrincipal.nome))
    resolvidos.push({
      label: labelDeVereador(vereadorPrincipal),
      vereadorId: vereadorPrincipal.id,
      ativo: vereadorPrincipal.ativo !== false,
    })
  }

  splitAutoresTexto(autorNomeTexto).forEach(f => {
    if (vistos.has(normalizarNome(f))) return
    const v = buscarVereadorPorNome(f, vereadores)
    const chave = v ? v.id : normalizarNome(f)
    if (vistos.has(chave)) return
    vistos.add(chave)
    if (v) {
      resolvidos.push({ label: labelDeVereador(v), vereadorId: v.id, ativo: v.ativo !== false })
      return
    }
    // Texto livre sem vínculo — "Poder Executivo"/"Prefeitura"/"Prefeito"
    // digitado à mão vira o rótulo genérico, em vez de truncar no primeiro
    // espaço (o que dava "Poder" pra um autor "Poder Executivo").
    const generico = /executivo|prefeitura|prefeito/i.test(f)
    resolvidos.push({
      label: generico ? 'Poder Executivo' : f.split(/\s+/)[0],
      vereadorId: null,
      ativo: true,
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

/**
 * Identifica se uma matéria é de autoria do Poder Executivo (Prefeitura), usada de forma
 * idêntica em Dashboard, Proposições, Requerimentos e Moções para o filtro Executivo/Legislativo.
 */
export function ehPoderExecutivo(item: { autorNome?: string | null; vereador?: { poder?: string } | null }): boolean {
  if (item.vereador?.poder === 'executivo') return true
  const nome = (item.autorNome || '').toLowerCase()
  return nome.includes('executivo') || nome.includes('prefeitura') || nome.includes('prefeito')
}
