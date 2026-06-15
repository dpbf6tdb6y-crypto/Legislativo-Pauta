"use client"
import { Proposicao, ComissaoInfo, isCRF } from "./types"

const W = 44
const C = 14

type Step = { key: string; label: string }

function buildSteps(prop: Proposicao): Step[] {
  const steps: Step[] = [{ key: "protocolado", label: "Protoc." }]
  if (!prop.dispensaParecer && prop.comissoes?.length) {
    const regulares = prop.comissoes.filter(c => !isCRF(c))
    const crf = prop.comissoes.find(c => isCRF(c))
    regulares.forEach(c => steps.push({ key: `comissao${c.ordem}`, label: c.comissao.sigla || c.comissao.nome.slice(0, 3) }))
    if (regulares.length) steps.push({ key: "pronto_votar", label: "Ag. Pautar" })
    steps.push({ key: "primeira_votacao", label: "1ª Vot." })
    if ((prop.numVotacoes ?? 1) >= 2) steps.push({ key: "segunda_votacao", label: "2ª Vot." })
    if (crf) steps.push({ key: `comissao${crf.ordem}`, label: crf.comissao.sigla || "CRF" })
  } else {
    steps.push({ key: "primeira_votacao", label: "1ª Vot." })
    if ((prop.numVotacoes ?? 1) >= 2) steps.push({ key: "segunda_votacao", label: "2ª Vot." })
  }
  steps.push({
    key: prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
    label: prop.destinoFinal === "promulgacao" ? "Promulgar" : "Ag. Sanção",
  })
  return steps
}

function curIdx(etapa: string, steps: Step[]) {
  const i = steps.findIndex(s => s.key === etapa)
  return i >= 0 ? i : 0
}

function calcBracket(prop: Proposicao, resultado: string, secao?: string): {
  keys: Set<string>; type: "conjunto" | "dispensa" | null
} {
  const regulares = (prop.comissoes || []).filter(c => !isCRF(c))

  if (resultado === "parecer_conjunto") {
    const keys = new Set<string>()
    if (secao === "apresentacao") {
      regulares.forEach(c => keys.add(`comissao${c.ordem}`))
    } else {
      const atual = regulares.find(c => `comissao${c.ordem}` === prop.etapaAtual)
      const pendentes = atual ? regulares.filter(c => c.ordem >= atual.ordem) : regulares
      pendentes.forEach(c => keys.add(`comissao${c.ordem}`))
    }
    return { keys, type: "conjunto" }
  }

  if (resultado === "dispensa_parecer") {
    return {
      keys: new Set(regulares.map(c => `comissao${c.ordem}`)),
      type: "dispensa",
    }
  }

  const conjuntos = regulares.filter(c => c.parecerConjunto)
  if (conjuntos.length) {
    return {
      keys: new Set(conjuntos.map(c => `comissao${c.ordem}`)),
      type: "conjunto",
    }
  }

  return { keys: new Set(), type: null }
}

export default function MiniStepper({ prop, resultado, secao }: {
  prop: Proposicao
  resultado?: string
  secao?: string
}) {
  const steps = buildSteps(prop)
  let cur = curIdx(prop.etapaAtual, steps)

  // Avança o cursor visual baseado no resultado da sessão
  const resultadoParaEtapa: Record<string, string> = {
    dispensa_intersticio: "primeira_votacao",
    primeira_votacao:     "primeira_votacao",
    segunda_votacao:      "segunda_votacao",
    aprovado:   prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
    sancao:     "aguardando_sancao",
    promulgacao: "promulgada",
    reprovado:  prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
    arquivo:    prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
  }
  if (resultado && resultadoParaEtapa[resultado]) {
    const rIdx = steps.findIndex(s => s.key === resultadoParaEtapa[resultado])
    if (rIdx > cur) cur = rIdx
  }

  const { keys: bKeys, type: bType } = calcBracket(prop, resultado ?? "", secao)
  const bColor = bType === "dispensa" ? "#7c3aed" : "#4338ca"
  const bLabel = bType === "dispensa" ? "Disp. Parecer" : "Parecer Conjunto"

  const grupos: { start: number; end: number }[] = []
  let gStart = -1
  steps.forEach((s, i) => {
    if (bKeys.has(s.key)) { if (gStart === -1) gStart = i }
    else { if (gStart !== -1) { grupos.push({ start: gStart, end: i - 1 }); gStart = -1 } }
  })
  if (gStart !== -1) grupos.push({ start: gStart, end: steps.length - 1 })

  return (
    <div className="overflow-x-auto py-1">
      <div className="relative inline-flex flex-col" style={{ paddingTop: grupos.length ? 26 : 0 }}>

        {grupos.map((g, i) => {
          const left = g.start * (W + C)
          const width = (g.end - g.start) * (W + C) + W
          return (
            <div key={i} style={{ position: "absolute", top: 0, left, width, height: 24 }}>
              <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: 8, fontWeight: 700, color: bColor, whiteSpace: "nowrap" }}>
                {bLabel}
              </span>
              <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, height: 2, background: bColor, borderRadius: 1 }} />
              <div style={{ position: "absolute", bottom: 4, left: 4, width: 2, height: 7, background: bColor }} />
              <div style={{ position: "absolute", bottom: 4, right: 4, width: 2, height: 7, background: bColor }} />
            </div>
          )
        })}

        <div className="flex items-center">
          {steps.map((step, i) => {
            const done = i < cur
            const active = i === cur
            const inBracket = bKeys.has(step.key)
            const forceOrange = secao === "apresentacao" && inBracket

            const bg = forceOrange ? "#ea580c"
              : done ? "#16a34a"
              : inBracket ? "#ea580c"
              : active ? "#d4a017"
              : "#f3f4f6"
            const border = forceOrange ? "#ea580c"
              : done ? "#16a34a"
              : inBracket ? "#ea580c"
              : active ? "#d4a017"
              : "#d1d5db"
            const labelColor = forceOrange ? "#ea580c"
              : done ? "#16a34a"
              : inBracket ? "#ea580c"
              : active ? "#b5860f"
              : "#9ca3af"

            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center" style={{ minWidth: W }}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0"
                    style={{ background: bg, borderColor: border, color: "#fff" }}
                  >
                    {done && !forceOrange
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      : <span>{i + 1}</span>
                    }
                  </div>
                  <span
                    className="text-center mt-0.5 leading-tight"
                    style={{ fontSize: 9, maxWidth: W, color: labelColor, fontWeight: active || inBracket ? 700 : 400, wordBreak: "break-word" }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="h-0.5 flex-shrink-0" style={{ width: C, background: i < cur ? "#16a34a" : "#e5e7eb", marginBottom: 14 }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
