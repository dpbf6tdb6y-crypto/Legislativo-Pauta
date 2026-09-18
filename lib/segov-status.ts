export type FluxoLike = Record<string, { done?: boolean; doneAt?: string; data?: { resultado?: string } | null } | undefined | null> | null | undefined

const CHAVES_COMISSAO = ['comissao1', 'comissao2', 'comissao3']
// Uma proposição pode ser pautada e retirada várias vezes seguidas — ver
// mesma lista em app/dashboard/segov/[id]/editar/page.tsx.
const CHAVES_RETIRADA = ['retiradoPauta', 'retiradoPauta2', 'retiradoPauta3', 'retiradoPauta4', 'retiradoPauta5']
const CHAVES_PAUTADO = ['pautado', 'pautado2', 'pautado3', 'pautado4', 'pautado5']

/**
 * "Retirado" só vale enquanto for o último fato da tramitação — se a
 * proposição foi pautada de novo depois da retirada mais recente, ela
 * voltou a tramitar e o status não pode continuar travado em "Retirado".
 */
function retiradaAindaValendo(fluxo: FluxoLike): boolean {
  const datasRetirada = CHAVES_RETIRADA.map(k => fluxo?.[k]?.done ? fluxo[k]?.doneAt : undefined).filter(Boolean) as string[]
  if (!datasRetirada.length) return false
  const ultimaRetirada = datasRetirada.reduce((a, b) => (b > a ? b : a))
  const pautadoDepois = CHAVES_PAUTADO.some(k => {
    const doneAt = fluxo?.[k]?.done ? fluxo[k]?.doneAt : undefined
    return !!doneAt && doneAt > ultimaRetirada
  })
  return !pautadoDepois
}

/**
 * Deriva o status de uma proposição (Secretaria de Governo) a partir do
 * próprio fluxo de tramitação, em vez de depender de alguém escolher à mão.
 *
 * Regra (na ordem em que é avaliada):
 * - Arquivado é decisão administrativa manual, não vem do fluxo — preservado
 *   sem alteração.
 * - Retirado de Pauta marcado          → "Retirado", mas só enquanto a
 *   retirada continuar sendo o último fato conhecido — se foi pautada de
 *   novo depois, o status volta a ser derivado normalmente pelo resto da
 *   tramitação (ver retiradaAindaValendo).
 * - Promulgação = Promulgado          → "Promulgado"
 * - Sanção/Veto = Sancionado          → "Sancionado"
 * - Resultado Final = Aprovado        → "Aprovado"
 * - Resultado Final = Reprovado,
 *   1ª ou 2ª Votação = Reprovado,
 *   Sanção/Veto = Vetado, ou
 *   qualquer comissão reprovada       → "Rejeitado"
 * - Pautado (comissões aprovadas ou não, resultado final ainda não saiu)
 *                                      → "Em análise" ("Com Parecer" foi
 *   removido do sistema — não existe mais como status separado)
 * - Só protocolado                    → "Aguardando"
 * - Nada disso ainda foi marcado      → mantém o status atual
 */
export function derivarStatusSegov(fluxo: FluxoLike, statusAtual: string): string {
  if (!fluxo) return statusAtual
  if (statusAtual === 'Arquivado') return statusAtual
  if (retiradaAindaValendo(fluxo)) return 'Retirado'

  const promulgacao = fluxo['promulgacao']
  if (promulgacao?.done && promulgacao.data?.resultado === 'promulgado') return 'Promulgado'

  const sancaoVeto = fluxo['sancaoVeto']
  if (sancaoVeto?.done && sancaoVeto.data?.resultado === 'sancionado') return 'Sancionado'

  const resultadoFinal = fluxo['resultadoFinal']
  if (resultadoFinal?.done) {
    return resultadoFinal.data?.resultado === 'aprovado' ? 'Aprovado' : 'Rejeitado'
  }

  if (sancaoVeto?.done && sancaoVeto.data?.resultado === 'vetado') return 'Rejeitado'

  if (fluxo['votacao1']?.data?.resultado === 'reprovado') return 'Rejeitado'
  if (fluxo['votacao2']?.data?.resultado === 'reprovado') return 'Rejeitado'

  const algumaComissaoReprovada = [...CHAVES_COMISSAO, 'comissaoEspecial'].some(
    k => fluxo[k]?.data?.resultado === 'reprovado'
  )
  if (algumaComissaoReprovada) return 'Rejeitado'

  if (fluxo['pautado']?.done) return 'Em análise'
  if (fluxo['protocolado']?.done) return 'Aguardando'

  return statusAtual
}
