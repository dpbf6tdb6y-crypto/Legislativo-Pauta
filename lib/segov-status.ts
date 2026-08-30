export type FluxoLike = Record<string, { done?: boolean; data?: { resultado?: string } | null } | undefined | null> | null | undefined

const CHAVES_COMISSAO = ['comissao1', 'comissao2', 'comissao3']

/**
 * Deriva o status de uma proposição (Secretaria de Governo) a partir do
 * próprio fluxo de tramitação, em vez de depender de alguém escolher à mão.
 *
 * Regra (na ordem em que é avaliada):
 * - Arquivado/Retirado são decisões administrativas manuais, não vêm do
 *   fluxo — preservadas sem alteração.
 * - Promulgação = Promulgado          → "Promulgado"
 * - Sanção/Veto = Sancionado          → "Sancionado"
 * - Resultado Final = Aprovado        → "Aprovado"
 * - Resultado Final = Reprovado,
 *   1ª ou 2ª Votação = Reprovado,
 *   Sanção/Veto = Vetado, ou
 *   qualquer comissão reprovada       → "Rejeitado"
 * - Todas as comissões que o projeto realmente usa já aprovadas (aceita
 *   projetos que passam por só 1 ou 2 comissões, não exige as 3), ou
 *   Comissão Especial aprovada        → "Com Parecer"
 * - Pautado, mas comissões ainda não fecharam                → "Em análise"
 * - Só protocolado                    → "Aguardando"
 * - Nada disso ainda foi marcado      → mantém o status atual
 */
export function derivarStatusSegov(fluxo: FluxoLike, statusAtual: string): string {
  if (!fluxo) return statusAtual
  if (statusAtual === 'Arquivado' || statusAtual === 'Retirado') return statusAtual

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

  const comissoesMarcadas = CHAVES_COMISSAO.filter(k => fluxo[k]?.done)
  const todasComissoesMarcadasAprovadas =
    comissoesMarcadas.length > 0 && comissoesMarcadas.every(k => fluxo[k]?.data?.resultado === 'aprovado')
  const comissaoEspecial = fluxo['comissaoEspecial']
  const comissaoEspecialAprovada = !!comissaoEspecial?.done && comissaoEspecial.data?.resultado === 'aprovado'
  if (todasComissoesMarcadasAprovadas || comissaoEspecialAprovada) return 'Com Parecer'

  if (fluxo['pautado']?.done) return 'Em análise'
  if (fluxo['protocolado']?.done) return 'Aguardando'

  return statusAtual
}
