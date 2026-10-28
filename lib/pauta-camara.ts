import { buscarVereadorPorNome, normalizarNome, splitAutoresTexto } from "./vereador-match"

// Leitura da pauta da Câmara (Ordem do Dia) para o cadastro de proposições novas.
// Só a seção "c) Apresentação de proposições" vira cadastro; as demais seções são
// lidas apenas para avisar de numeração repetida.

export type SiglaTipo = "PL" | "PLC" | "PDL" | "RES" | "PELO" | "REQ" | "MOC" | "IND"

// Nome por extenso gravado no cadastro (mesmo texto que já existe na base e no filtro de tipos)
const NOME_TIPO: Record<SiglaTipo, string> = {
  PL: "Projeto de Lei Ordinária",
  PLC: "Projeto de Lei Complementar",
  PDL: "Projeto de Decreto Legislativo",
  RES: "Projeto de Resolução",
  PELO: "Proposta de Emenda a Lei Orgânica",
  REQ: "Requerimento",
  MOC: "Moção",
  IND: "Indicação",
}

// Hoje só entram no sistema estes tipos; os demais aparecem na revisão como "ignorados".
const TIPOS_ACEITOS: SiglaTipo[] = ["PL", "PLC", "PDL"]

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

const SIGLA_POR_TEXTO: Record<string, SiglaTipo> = {}
for (const [sigla, nome] of Object.entries(NOME_TIPO) as [SiglaTipo, string][]) {
  SIGLA_POR_TEXTO[semAcento(nome)] = sigla
  SIGLA_POR_TEXTO[sigla.toLowerCase()] = sigla
}
SIGLA_POR_TEXTO["projeto de lei"] = "PL"
SIGLA_POR_TEXTO["proposta de emenda a lei organica"] = "PELO"
SIGLA_POR_TEXTO["proposta de emenda a lei organica municipal"] = "PELO"

/** "PL", "Projeto de Lei" e "Projeto de Lei Ordinária" são o mesmo tipo. */
export function siglaDoTipo(texto: string | null | undefined): SiglaTipo | null {
  if (!texto) return null
  return SIGLA_POR_TEXTO[semAcento(texto)] ?? null
}

export function nomeDoTipo(sigla: SiglaTipo): string {
  return NOME_TIPO[sigla]
}

export function tipoAceito(sigla: SiglaTipo | null): boolean {
  return !!sigla && TIPOS_ACEITOS.includes(sigla)
}

function numeroNormalizado(numero: string | number): string {
  return String(numero).replace(/\D/g, "").replace(/^0+(?=\d)/, "")
}

/** Chave que identifica uma proposição, igual para "PL"/"Projeto de Lei Ordinária" e "2.769"/"02769". */
export function chaveProposicao(tipo: string, numero: string | number, ano: number): string {
  return `${siglaDoTipo(tipo) ?? semAcento(tipo)}|${numeroNormalizado(numero)}|${ano}`
}

export type SecaoPauta = "apresentacao" | "parecer" | "votacao" | "outra"

export type ItemPauta = {
  tipo: string // nome por extenso, como é gravado
  sigla: SiglaTipo
  numero: string
  ano: number
  ementa: string
  autorNome: string
  observacao?: string // comissão de destino
  dataEnvio?: string
}

export type ItemIgnorado = { tipo: string; numero: string; ano: number; autorNome?: string; motivo: string }

export type ReferenciaPauta = { sigla: SiglaTipo; numero: string; ano: number; autorNome: string; secao: SecaoPauta }

export type LeituraPauta = {
  dataSessao?: string
  itens: ItemPauta[]
  ignorados: ItemIgnorado[]
  referencias: ReferenciaPauta[]
  avisos: string[]
}

/** Tira número de página solto, espaços especiais e normaliza quebras de linha. */
export function limparTextoPauta(bruto: string): string {
  return bruto
    .replace(/\r/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .filter(l => !/^\s*\d{1,3}\s*$/.test(l))
    .join("\n")
}

const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
}

function paraIso(m: RegExpMatchArray | null): string | undefined {
  if (!m) return undefined
  const mes = MESES[semAcento(m[2])]
  if (!mes) return undefined
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}T12:00:00.000Z`
}

const DATA = String.raw`(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})`

/** Data da sessão: "realizada no dia 27 de outubro de 2026" (ou, na falta, "Dado e passado ... em ..."). */
export function extrairDataSessao(texto: string): string | undefined {
  const plano = texto.replace(/\s+/g, " ")
  return (
    paraIso(plano.match(new RegExp(String.raw`realizada\s+no\s+dia\s+${DATA}`, "i"))) ??
    paraIso(plano.match(new RegExp(String.raw`Dado\s+e\s+passado[^.]*?\bem\s+${DATA}`, "i")))
  )
}

const ASPAS = "“”\"«»'"
const reAspasInicio = new RegExp(`^[\\s${ASPAS}]+`)
const reAspasFim = new RegExp(`[\\s${ASPAS}.]+$`)

const TIPO_ITEM = String.raw`Projeto\s+de\s+Lei\s+Complementar|Projeto\s+de\s+Lei|Projeto\s+de\s+Decreto\s+Legislativo|Projeto\s+de\s+Resolu[çc][ãa]o|Proposta\s+de\s+Emenda\s+[àa]\s+Lei\s+Org[âa]nica|Requerimento|Indica[çc][ãa]o|Mo[çc][ãa]o`

function limparAutor(bruto: string): string {
  return bruto.replace(/^\s*Vereador(?:a|es|as)?\s+/i, "").replace(/\s+/g, " ").trim()
}

/** Localiza, no texto inteiro, todas as referências "Tipo nº N/AAAA, autoria X, que" e a seção de cada uma. */
function lerReferencias(plano: string, limites: { c: number; d: number; seg: number }): ReferenciaPauta[] {
  const re = new RegExp(`(${TIPO_ITEM})\\s+n[º°o]\\.?\\s*([\\d.]+)\\s*/\\s*(\\d{4})\\s*,\\s*autoria\\s+(.+?)\\s*,\\s*que\\b`, "gi")
  const refs: ReferenciaPauta[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(plano))) {
    const sigla = siglaDoTipo(m[1].replace(/\s+/g, " "))
    if (!sigla) continue
    const pos = m.index
    let secao: SecaoPauta = "outra"
    if (limites.seg >= 0 && pos >= limites.seg) secao = "votacao"
    else if (limites.d >= 0 && pos >= limites.d) secao = "parecer"
    else if (limites.c >= 0 && pos >= limites.c) secao = "apresentacao"
    refs.push({ sigla, numero: numeroNormalizado(m[2]), ano: parseInt(m[3]), autorNome: limparAutor(m[4]), secao })
  }
  return refs
}

function ultimoIndice(plano: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
  let ultimo = -1
  let m: RegExpExecArray | null
  while ((m = g.exec(plano))) ultimo = m.index
  return ultimo
}

export function lerPauta(textoBruto: string): LeituraPauta {
  const avisos: string[] = []
  const texto = limparTextoPauta(textoBruto)
  const plano = texto.replace(/\s+/g, " ")
  const dataSessao = extrairDataSessao(texto)
  if (!dataSessao) avisos.push("Não consegui identificar a data da sessão na pauta.")

  // Usa a última ocorrência para não confundir com um eventual sumário
  const iC = ultimoIndice(plano, /c\)\s*Apresenta[çc][ãa]o\s+de\s+proposi[çc][õo]es/i)
  const apos = (re: RegExp) => {
    if (iC < 0) return -1
    const m = plano.slice(iC + 1).match(re)
    return m && m.index !== undefined ? iC + 1 + m.index : -1
  }
  const iD = apos(/d\)\s*Leitura\s+de\s+Parecer/i)
  const iSeg = apos(/II\s*\S?\s*SEGUNDA\s+PARTE/i)
  const referencias = lerReferencias(plano, { c: iC, d: iD, seg: iSeg })

  if (iC < 0) {
    avisos.push('Não encontrei a seção "c) Apresentação de proposições" nesta pauta.')
    return { dataSessao, itens: [], ignorados: [], referencias, avisos }
  }

  const fim = [iD, iSeg].filter(i => i > iC).sort((a, b) => a - b)[0] ?? plano.length
  const secao = plano.slice(iC, fim)

  const blocos = secao
    .split(new RegExp(`\\s(?=\\d{1,3}\\)\\s+(?:${TIPO_ITEM}))`, "i"))
    .filter(b => /^\d{1,3}\)\s/.test(b))

  const itens: ItemPauta[] = []
  const ignorados: ItemIgnorado[] = []
  const reItem = new RegExp(`^\\d{1,3}\\)\\s+(${TIPO_ITEM})\\s+n[º°o]\\.?\\s*([\\d.]+)\\s*/\\s*(\\d{4})\\s*,?\\s*(.*)$`, "i")

  for (const bloco of blocos) {
    const m = bloco.match(reItem)
    if (!m) {
      avisos.push(`Item da seção c) que não consegui ler: "${bloco.slice(0, 80)}…"`)
      continue
    }
    const sigla = siglaDoTipo(m[1].replace(/\s+/g, " "))!
    const numero = numeroNormalizado(m[2])
    const ano = parseInt(m[3])
    const resto = m[4]
    const autorM = resto.match(/autoria\s+(.+?)\s*,\s*que\s+(.*)$/i)
    const autorNome = autorM ? limparAutor(autorM[1]) : ""

    if (!tipoAceito(sigla)) {
      ignorados.push({
        tipo: nomeDoTipo(sigla), numero, ano, autorNome: autorNome || undefined,
        motivo: sigla === "RES" ? "Projeto de Resolução não entra no sistema por enquanto" : "Tipo ainda não importado pela pauta",
      })
      continue
    }
    if (!autorM) {
      avisos.push(`${nomeDoTipo(sigla)} ${numero}/${ano}: não encontrei o autor no texto.`)
    }

    const corpo = autorM ? autorM[2] : resto
    const partes = corpo.split(/\s*[•·●▪]?\s*Encaminhar\s+[àa]\s+/i)
    const ementa = partes[0].replace(reAspasInicio, "").replace(reAspasFim, "").trim()
    const destino = partes[1]?.replace(/[\s.]+$/, "").trim()
    if (!ementa) avisos.push(`${nomeDoTipo(sigla)} ${numero}/${ano}: não encontrei a ementa.`)

    itens.push({
      tipo: nomeDoTipo(sigla), sigla, numero, ano, ementa, autorNome,
      observacao: destino || undefined, dataEnvio: dataSessao,
    })
  }

  if (itens.length === 0 && ignorados.length === 0) avisos.push('A seção "c) Apresentação de proposições" está vazia nesta pauta.')
  return { dataSessao, itens, ignorados, referencias, avisos }
}

export type VereadorBase = { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string }

/**
 * Liga os autores do texto ("A e B", "A, B e C") a vereadores cadastrados. O primeiro que casar vira o vereador
 * principal; o texto completo continua em autorNome (é assim que o sistema guarda mais de um autor).
 */
export function resolverAutoresPauta(autorNome: string, vereadores: VereadorBase[]) {
  const ligados: { fragmento: string; vereadorId: string | null; nome: string | null }[] = []
  for (const fragmento of splitAutoresTexto(autorNome)) {
    if (/executivo|prefeit/i.test(fragmento)) {
      ligados.push({ fragmento, vereadorId: null, nome: "Poder Executivo" })
      continue
    }
    const alvo = normalizarNome(fragmento)
    const porApelido = vereadores.find(v => v.apelido && normalizarNome(v.apelido) === alvo)
    const v = porApelido ?? buscarVereadorPorNome(fragmento, vereadores)
    ligados.push({ fragmento, vereadorId: v?.id ?? null, nome: v?.nome ?? null })
  }
  const vereadorId = ligados.find(l => l.vereadorId)?.vereadorId ?? null
  return { vereadorId, ligados }
}

export type ProposicaoExistente = {
  id: string; tipo: string; numero: string; ano: number
  autorNome: string | null; ementa: string; status: string
}

export type ItemAnalisado = ItemPauta & {
  vereadorId: string | null
  autoresSemVinculo: string[]
  jaExiste: { id: string; autorNome: string | null; ementa: string; status: string; quantidade: number } | null
  repetidoNaPauta: string[]
}

/** Cruza os itens lidos com o que já existe no sistema e com as outras seções da mesma pauta. */
export function analisarItens(
  leitura: LeituraPauta,
  existentes: ProposicaoExistente[],
  vereadores: VereadorBase[],
): ItemAnalisado[] {
  const porChave = new Map<string, ProposicaoExistente[]>()
  for (const e of existentes) {
    const k = chaveProposicao(e.tipo, e.numero, e.ano)
    porChave.set(k, [...(porChave.get(k) ?? []), e])
  }

  const rotuloSecao: Record<SecaoPauta, string> = {
    apresentacao: "apresentação de proposições", parecer: "leitura de pareceres",
    votacao: "discussão e votação", outra: "outra parte da pauta",
  }

  return leitura.itens.map(item => {
    const achados = porChave.get(chaveProposicao(item.tipo, item.numero, item.ano)) ?? []
    const { vereadorId, ligados } = resolverAutoresPauta(item.autorNome, vereadores)

    // Descarta a própria ocorrência do item na seção c); o que sobrar é repetição.
    const outras = [...leitura.referencias.filter(r => r.sigla === item.sigla && r.numero === item.numero && r.ano === item.ano)]
    const propria = outras.findIndex(r => r.secao === "apresentacao" && r.autorNome === item.autorNome)
    if (propria >= 0) outras.splice(propria, 1)

    return {
      ...item,
      vereadorId,
      autoresSemVinculo: ligados.filter(l => !l.vereadorId && !/executivo|prefeit/i.test(l.fragmento)).map(l => l.fragmento),
      jaExiste: achados.length
        ? { id: achados[0].id, autorNome: achados[0].autorNome, ementa: achados[0].ementa, status: achados[0].status, quantidade: achados.length }
        : null,
      repetidoNaPauta: outras.map(r => `${rotuloSecao[r.secao]} (autoria ${r.autorNome || "não informada"})`),
    }
  })
}
