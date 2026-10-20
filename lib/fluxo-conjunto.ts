// Parecer conjunto: quais comissões participaram dele. O parecer pode ser conjunto de só 2 das comissões
// (a outra emite o parecer à parte). Sem a lista gravada (dados antigos), valem todas as comissões marcadas.
type Etapa = { done?: boolean; data?: any } | undefined

export const COMISSOES_SEQUENCIAIS = ["comissao1", "comissao2", "comissao3"] as const

export function chavesDoConjunto(fluxo: Record<string, Etapa> | null | undefined): string[] {
  if (!fluxo?.comissaoConjunta?.done) return []
  const marcadas = COMISSOES_SEQUENCIAIS.filter(k => fluxo[k]?.done)
  const escolhidas = fluxo.comissaoConjunta?.data?.comissoes
  const lista = Array.isArray(escolhidas) ? marcadas.filter(k => escolhidas.includes(k)) : [...marcadas]
  return lista.length >= 2 ? lista : []
}
