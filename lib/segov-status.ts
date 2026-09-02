export type FluxoLike = Record<string, { done?: boolean; data?: { resultado?: string } | null } | undefined | null> | null | undefined

const CHAVES_COMISSAO = ['comissao1', 'comissao2', 'comissao3']

/**
 * Deriva o status de uma proposição (Secretaria de Governo) a partir do
 * próprio fluxo de tramitação, em vez de depender de alguém escolher à mão.
 *
 * Regra (na ordem em que é avaliada):
 * - Arquivado é decisão administrativa manual, não vem do fluxo — preservado
 *   sem alteração.
 * - Retirado de Pauta marcado          → "Retirado" (tem prioridade sobre
 *   qualquer outra etapa já preenchida — uma vez retirado, é esse o status,
 *   não importa até onde a tramitação tinha ido antes)
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
  if (fluxo['retiradoPauta']?.done) return 'Retirado'

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
