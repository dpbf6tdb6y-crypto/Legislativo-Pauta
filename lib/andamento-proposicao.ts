// Resposta falada/escrita sobre o andamento de uma proposição: a última informação registrada no fluxo.
export type EtapaFluxo = { done?: boolean; doneAt?: string; data?: any }

const ROTULOS: Record<string, string> = {
  protocolado: "Protocolo",
  pautado: "Pautado em plenário",
  retiradoPauta: "Retirado de pauta",
  comissao1: "Parecer da 1ª comissão",
  comissao2: "Parecer da 2ª comissão",
  comissao3: "Parecer da 3ª comissão",
  comissaoEspecial: "Comissão Especial",
  comissaoConjunta: "Comissão conjunta",
  dispensaParecer: "Dispensa de parecer",
  dispensaIntersticio: "Dispensa de interstício",
  pedidoVista: "Pedido de vista",
  pedidoAdiamento: "Pedido de adiamento",
  emenda: "Emenda apresentada",
  emendaVotacao1: "1ª votação da emenda",
  emendaVotacao2: "2ª votação da emenda",
  emendaResultado: "Resultado da emenda",
  votacao1: "1ª votação em plenário",
  votacao2: "2ª votação em plenário",
  resultadoFinal: "Votado em plenário",
  sancaoVeto: "Sanção ou veto",
  vetoManutencao: "Votação do veto",
  promulgacao: "Promulgação",
}

// ordem do processo, para desempate quando duas etapas têm a mesma data
const ORDEM = [
  "protocolado", "pautado", "retiradoPauta", "pautado2", "retiradoPauta2", "pautado3", "retiradoPauta3", "pautado4", "retiradoPauta4",
  "pautado5", "retiradoPauta5", "comissao1", "comissao2", "comissao3", "comissaoEspecial", "comissaoConjunta", "dispensaParecer",
  "dispensaIntersticio", "pedidoVista", "pedidoAdiamento", "emenda", "emendaVotacao1", "emendaVotacao2", "emendaResultado",
  "votacao1", "votacao2", "resultadoFinal", "sancaoVeto", "vetoManutencao", "promulgacao",
]

const RESULTADOS: Record<string, string> = {
  aprovado: "aprovado", reprovado: "reprovado", sancionado: "sancionado", vetado: "vetado", promulgado: "promulgado",
}

function rotulo(chave: string, dados?: any) {
  const base = chave.replace(/\d$/, "")
  if (/^pautado\d?$/.test(chave)) return chave === "pautado" ? ROTULOS.pautado : "Pautado novamente em plenário"
  if (/^retiradoPauta\d?$/.test(chave)) return ROTULOS.retiradoPauta
  if (chave === "sancaoVeto") {
    const r = dados?.resultado
    return r === "sancionado" ? "Sancionado" : r === "vetado" ? "Vetado" : ROTULOS.sancaoVeto
  }
  return ROTULOS[chave] || ROTULOS[base] || chave
}

function dataBr(iso?: string) {
  if (!iso) return ""
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso)
}

function dataFalada(iso?: string) {
  const m = String(iso || "").match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ""
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]}`
}

export type Andamento = {
  titulo: string
  linhas: [string, string][]
  fala: string
}

export function ehPerguntaDeAndamento(textoNormalizado: string) {
  return /andamento|situacao|em que pe|como esta|como anda|como ta\b|status|ultima (informacao|movimentacao|etapa|atualizacao)|onde esta|tramitacao|tramita|o que aconteceu|qual a fase|em que fase/.test(textoNormalizado)
}

const FASES: Record<string, string> = {
  protocolado: "Protocolo", pautado: "Protocolo",
  retiradoPauta: "Retirado de pauta", pautado2: "Retirado de pauta", retiradoPauta2: "Retirado de pauta", pautado3: "Retirado de pauta",
  retiradoPauta3: "Retirado de pauta", pautado4: "Retirado de pauta", retiradoPauta4: "Retirado de pauta", pautado5: "Retirado de pauta",
  retiradoPauta5: "Retirado de pauta",
  comissao1: "Comissões", comissao2: "Comissões", comissao3: "Comissões", comissaoEspecial: "Comissões", comissaoConjunta: "Comissões",
  dispensaParecer: "Comissões", dispensaIntersticio: "Situação especial", pedidoVista: "Situação especial", pedidoAdiamento: "Situação especial",
  emenda: "Emenda", emendaVotacao1: "Emenda", emendaVotacao2: "Emenda", emendaResultado: "Emenda",
  votacao1: "Votação em plenário", votacao2: "Votação em plenário", resultadoFinal: "Votação em plenário",
  sancaoVeto: "Sanção", vetoManutencao: "Sanção", promulgacao: "Promulgação",
}

const COMISSOES = new Set(["comissao1", "comissao2", "comissao3", "comissaoEspecial", "comissaoConjunta"])

// nome da comissão sem a sigla na frente ("CLJR — Comissão de Justiça" -> "Comissão de Justiça")
function nomeComissao(d: any) {
  const n = String(d?.comissaoNome || "")
  return n.includes(" — ") ? n.split(" — ").slice(1).join(" — ") : n
}

// descreve uma etapa como o fluxo detalhado: nome, comissão, número da emenda, resultado, autores
function descreveEtapa(chave: string, e: EtapaFluxo) {
  const d = e.data || {}
  const nome = rotulo(chave, d)
  const com = nomeComissao(d)
  const res = RESULTADOS[String(d.resultado || "").toLowerCase()]
  const num = d.numero ? `${d.emendaTipo ? d.emendaTipo + " " : ""}${d.numero}${d.ano ? "/" + d.ano : ""}` : ""
  const quem = [...(d.autores || []), ...(d.autoresComissoes || [])].filter(Boolean).join(" e ")
  const relator = !com && !num && chave !== "comissaoEspecial" && d.nome1 ? String(d.nome1) : ""
  return { nome, com, res, num, quem, relator }
}

export function andamentoDe(item: any): Andamento {
  const nome = `${item.tipo} ${item.numero}/${item.ano}`
  const fluxo = (item.fluxo || {}) as Record<string, EtapaFluxo>
  const feitas = Object.entries(fluxo)
    .filter(([, e]) => e?.done)
    .map(([k, e]) => ({ k, e, ix: ORDEM.indexOf(k) < 0 ? 999 : ORDEM.indexOf(k) }))
    .sort((a, b) => (a.e.doneAt || "").localeCompare(b.e.doneAt || "") || a.ix - b.ix)
  const ultima = feitas[feitas.length - 1]
  const status = item.status || "sem situação"
  const linhas: [string, string][] = [["Situação", String(status)]]

  let fala = `A proposição ${nome} está com a situação ${String(status).toLowerCase()}.`
  if (ultima) {
    const d = descreveEtapa(ultima.k, ultima.e)
    const ehSancao = /Sancionado|Vetado/.test(d.nome)
    const fase = FASES[ultima.k]
    linhas.push(["Fase", fase || "—"])
    linhas.push(["Última etapa", d.nome + (d.res && !ehSancao ? ` · ${d.res}` : "")])
    if (d.com) linhas.push(["Comissão", d.com])
    if (d.num) linhas.push(["Número", d.num])
    if (d.quem) linhas.push(["Responsável", d.quem])
    else if (d.relator) linhas.push(["Responsável", d.relator])
    if (ultima.e.doneAt) linhas.push(["Data", dataBr(ultima.e.doneAt)])

    // frase falada, na linguagem do fluxo detalhado
    if (COMISSOES.has(ultima.k) && d.com) {
      fala += ` A última informação do fluxo é: ${d.res === "aprovado" ? "aprovada" : d.res === "reprovado" ? "reprovada" : "em análise"} na ${d.com}`
    } else if (ultima.k === "comissaoEspecial" || ultima.k === "comissaoConjunta") {
      fala += ` A última informação do fluxo é: ${d.nome}${d.res ? ", " + d.res : ""}`
    } else {
      fala += ` A última informação do fluxo é: ${d.nome.toLowerCase()}${d.res && !ehSancao ? ", " + d.res : ""}`
      if (d.com) fala += `, na ${d.com}`
      if (d.num) fala += `, número ${d.num}`
    }
    if (ultima.e.doneAt) fala += `, em ${dataFalada(ultima.e.doneAt)}`
    const resp = d.quem || d.relator
    if (resp) fala += `, com ${resp}`
    fala += "."
  } else {
    linhas.push(["Última etapa", "nenhuma etapa registrada ainda"])
    fala += " Ainda não há etapas registradas no fluxo."
  }

  // o que falta, quando dá para saber
  const fez = (k: string) => !!fluxo[k]?.done
  const resFinal = String(fluxo.resultadoFinal?.data?.resultado || "").toLowerCase()
  if (fez("resultadoFinal") && resFinal === "aprovado" && !fez("sancaoVeto") && !fez("promulgacao")) {
    linhas.push(["Próxima etapa", "sanção ou veto"])
    fala += " Falta registrar a sanção ou o veto."
  } else if (!fez("resultadoFinal") && fez("protocolado")) {
    linhas.push(["Próxima etapa", "votação em plenário"])
    fala += " Ainda não foi votada em plenário."
  }

  // histórico completo, na ordem do fluxo detalhado
  if (feitas.length > 1) {
    linhas.push([
      "Histórico",
      feitas
        .map(x => {
          const d = descreveEtapa(x.k, x.e)
          return `${dataBr(x.e.doneAt).slice(0, 5)} ${d.nome}${d.com ? " (" + d.com + ")" : ""}${d.res ? " · " + d.res : ""}`
        })
        .join("  →  "),
    ])
  }
  if (item.ementa) linhas.push(["Ementa", String(item.ementa).length > 220 ? String(item.ementa).slice(0, 217) + "…" : String(item.ementa)])
  return { titulo: nome, linhas, fala }
}

// procura as proposições citadas ("pl 2681/2026", "pl 2681") entre os itens
export function achaProposicoes(f: { proposicao?: string }, itens: any[], textoNormalizado = "") {
  if (f.proposicao) {
    const alvo = f.proposicao.toLowerCase().trim()
    const r = itens.filter(i => {
      const nome = `${i.tipo} ${i.numero}/${i.ano}`.toLowerCase()
      return nome === alvo || nome.startsWith(alvo + "/")
    })
    if (r.length) return r
  }
  // sem o tipo na frase ("projeto 2681/2026", "proposição 2695"): procura só pelo número
  const m = textoNormalizado.match(/(?:projeto|proposicao|requerimento|mocao|indicacao|numero|n)\s*(?:de\s*lei\s*(?:ordinaria|complementar)?\s*)?(?:n\.?|no|numero)?\s*(\d{1,5})(?:\s*\/\s*(\d{4})|\s+de\s+(\d{4}))?/)
  if (!m) return []
  const num = m[1], ano = m[2] || m[3]
  return itens.filter(i => String(i.numero).replace(/\./g, "") === num && (!ano || String(i.ano) === ano))
}

// "quem pediu dispensa de interstício do PL 2681/2026?" -> qual etapa do fluxo está sendo perguntada
export function etapaPerguntada(textoNormalizado: string): string | null {
  const q = textoNormalizado
  if (/dispensa.*intersticio|intersticio/.test(q)) return "dispensaIntersticio"
  if (/dispensa.*parecer/.test(q)) return "dispensaParecer"
  if (/vista/.test(q)) return "pedidoVista"
  if (/adiamento|adiou|adiar/.test(q)) return "pedidoAdiamento"
  if (/emenda/.test(q) && /quem|autor|apresent/.test(q)) return "emenda"
  if (/retirad|retirou|retirar/.test(q)) return "retiradoPauta"
  if (/(quem|qual).*(relator|relatou)|relator/.test(q)) return "comissaoRelator"
  return null
}

export function respondeEtapa(item: any, chave: string): Andamento {
  const nome = `${item.tipo} ${item.numero}/${item.ano}`
  const fluxo = (item.fluxo || {}) as Record<string, EtapaFluxo>
  const chaves = chave === "retiradoPauta"
    ? Object.keys(fluxo).filter(k => /^retiradoPauta\d?$/.test(k))
    : chave === "comissaoRelator"
      ? ["comissao1", "comissao2", "comissao3", "comissaoEspecial", "comissaoConjunta"].filter(k => fluxo[k])
      : [chave]
  const feitas = chaves.filter(k => fluxo[k]?.done)
  const rot = chave === "comissaoRelator" ? "o parecer das comissões" : rotulo(chave).toLowerCase()
  if (!feitas.length) {
    return {
      titulo: nome,
      linhas: [["Etapa", rotulo(chave === "comissaoRelator" ? "comissao1" : chave)], ["Registro", "não há registro dessa etapa neste projeto"]],
      fala: `Não encontrei registro de ${rot} na proposição ${nome}.`,
    }
  }
  const linhas: [string, string][] = []
  const falas: string[] = []
  feitas.forEach(k => {
    const e = fluxo[k]
    const d = descreveEtapa(k, e)
    const quem = d.quem || d.relator
    const onde = d.com ? ` na ${d.com}` : ""
    linhas.push([d.nome + (d.com ? ` · ${d.com}` : ""), `${quem || "responsável não informado"}${e.doneAt ? " · " + dataBr(e.doneAt) : ""}`])
    falas.push(
      quem
        ? `${d.nome}${onde}: ${quem}${e.doneAt ? ", em " + dataFalada(e.doneAt) : ""}`
        : `${d.nome}${onde}: o nome do responsável não está informado${e.doneAt ? ", registrado em " + dataFalada(e.doneAt) : ""}`
    )
  })
  return { titulo: nome, linhas, fala: `Na proposição ${nome}, ${falas.join(". ")}.` }
}
