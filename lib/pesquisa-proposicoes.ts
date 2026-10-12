// Interpretador da pesquisa por pergunta da lista de proposições (texto ou voz): frase -> filtros da lista.
export type FiltrosPesquisa = {
  proposicao?: string
  ementa?: string
  vereadorId?: string
  status?: string[]
  tipo?: string
  ano?: number
  paradoDias?: number
  poder?: "executivo" | "legislativo"
}


function norm(s: string) {
  let t = (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  // 2.758 -> 2758 (ponto de milhar), e só depois tira a pontuação
  t = t.replace(/(\d)\.(\d)/g, "$1$2").replace(/[^a-z0-9%\/ ]+/g, " ")
  // o reconhecimento de voz soletra siglas: "p l 2758" -> "pl 2758"
  t = t.replace(/\bp l c\b/g, "plc").replace(/\bp l\b/g, "pl").replace(/\bp d l\b/g, "pdl").replace(/\bp r\b/g, "pr")
  return t.replace(/\s+/g, " ").trim()
}

const SINONIMOS_TIPO: Record<string, string> = {
  plc: "projeto de lei complementar", pl: "projeto de lei", pdl: "projeto de decreto legislativo",
  pr: "projeto de resolucao", plo: "projeto de lei organica", req: "requerimento", moc: "mocao", ind: "indicacao",
}

export function interpreta(texto: string, itens: any[], vereadores: any[], statusList: string[]) {
  const q = norm(texto)
  const f: FiltrosPesquisa = {}
  const partes: string[] = []
  const tipos = Array.from(new Set(itens.map(i => String(i.tipo)))).filter(Boolean)

  // 1) número da proposição: "PL 2.758/2026", "pl 2758 de 2026"
  for (const T of tipos) {
    const re = new RegExp("\\b" + norm(T) + "\\s*(?:n|no|numero)?\\s*(\\d[\\d.]*)\\s*(?:/|de)?\\s*(20\\d\\d)?")
    const m = q.match(re)
    if (m) {
      const num = m[1].replace(/\./g, "")
      const ano = m[2] ? Number(m[2]) : undefined
      const achado = itens.find(i => i.tipo === T && String(i.numero).replace(/\./g, "") === num && (!ano || i.ano === ano))
      f.proposicao = achado ? `${achado.tipo} ${achado.numero}/${achado.ano}`.toLowerCase() : `${T} ${num}`.toLowerCase() + (ano ? `/${ano}` : "")
      partes.push(`proposição ${T} ${num}${ano ? "/" + ano : ""}`)
      break
    }
  }

  // 2) tipo (se não for um número específico)
  if (!f.proposicao) {
    const ordenados = tipos.slice().sort((a, b) => (SINONIMOS_TIPO[norm(b)] || "").length - (SINONIMOS_TIPO[norm(a)] || "").length)
    for (const T of ordenados) {
      const sin = SINONIMOS_TIPO[norm(T)]
      if (new RegExp("\\b" + norm(T) + "s?\\b").test(q) || (sin && new RegExp("\\b" + sin.replace(/^projeto /, "projetos? ") + "s?\\b").test(q))) {
        // "projeto de lei" não pode casar dentro de "projeto de lei complementar"
        if (sin === "projeto de lei" && /projeto de lei (complementar|organica)/.test(q)) continue
        f.tipo = T; partes.push("tipo " + T); break
      }
    }
  }

  // 3) situação
  const sts: string[] = []
  for (const s of statusList) {
    const n = norm(s), radical = n.replace(/(o|a)$/, "")
    if (new RegExp("\\b" + n + "\\b").test(q) || (radical.length > 4 && new RegExp("\\b" + radical + "(o|a|os|as)\\b").test(q))) sts.push(s)
  }
  if (sts.length) { f.status = sts; partes.push("situação: " + sts.join(" ou ")) }

  // 4) vereador
  let melhor: { v: any; pts: number } | null = null
  let empate = false
  for (const v of vereadores) {
    const nome = norm(v.nome || ""), ap = norm(v.apelido || "")
    let pts = 0
    if (nome && q.includes(nome)) pts = 4
    else if (ap.length >= 3 && new RegExp("\\b" + ap + "\\b").test(q)) pts = 3
    else {
      const toks = nome.split(" ").filter(t => t.length >= 4 && !["silva", "souza", "filho", "junior", "santos"].includes(t))
      const achou = toks.filter(t => new RegExp("\\b" + t + "\\b").test(q))
      if (toks.length && achou.length === toks.length) pts = 2
      else if (achou.length >= 1) pts = 1
    }
    if (pts && (!melhor || pts > melhor.pts)) { melhor = { v, pts }; empate = false }
    else if (pts && melhor && pts === melhor.pts) empate = true
  }
  if (melhor && !(empate && melhor.pts < 3)) { f.vereadorId = melhor.v.id; partes.push("vereador " + (melhor.v.apelido || melhor.v.nome)) }

  // 5) ano
  const ma = q.match(/\b(20\d\d)\b/)
  if (!f.proposicao && ma) { f.ano = Number(ma[1]); partes.push("ano " + ma[1]) }
  else if (/(este|esse|neste|nesse) ano|ano atual/.test(q)) { f.ano = new Date().getFullYear(); partes.push("ano " + f.ano) }
  else if (/ano passado|ano anterior/.test(q)) { f.ano = new Date().getFullYear() - 1; partes.push("ano " + f.ano) }

  // 6) paradas há N dias
  const mp = q.match(/parad[oa]s? (?:ha|a) (?:mais de )?(\d+) dias|(?:mais de )?(\d+) dias parad[oa]s?|sem movimentacao (?:ha|a) (?:mais de )?(\d+) dias/)
  if (mp) { f.paradoDias = Number(mp[1] || mp[2] || mp[3]); partes.push(`sem movimentação há mais de ${f.paradoDias} dias`) }

  // 7) poder
  if (/\bexecutivo\b|prefeit/.test(q)) { f.poder = "executivo"; partes.push("do Executivo") }

  // 8) assunto livre: "sobre saúde", "a respeito de iluminação"
  const ms = texto.toLowerCase().match(/(?:sobre|a respeito d[eoa]s?|referentes? a|que tratam? d[eoa]s?)\s+([^?.,;]+)/)
  if (ms && ms[1].trim().length >= 3) { f.ementa = ms[1].trim(); partes.push("assunto “" + f.ementa + "”") }

  return { f, partes, entendeu: partes.length > 0 }
}

