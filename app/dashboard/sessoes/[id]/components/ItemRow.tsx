"use client"
import { ReactNode } from "react"
import { PautaItem, Proposicao, TIPO, isCRF } from "./types"

const B = "px-1.5 py-0.5 rounded-full text-xs border transition whitespace-nowrap"

function cls(state: "done" | "active" | "idle" | "off") {
  if (state === "done") return `${B} bg-green-100 text-green-700 border-green-400`
  if (state === "active") return `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold`
  if (state === "off") return `${B} bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-50`
  return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`
}

function seqCls(i: number, sel: number) {
  if (i < sel) return cls("done")
  if (i === sel) return cls("active")
  return cls("idle")
}

type Props = {
  item: PautaItem
  aberta: boolean
  onResultado: (r: string) => void
  onRetirar: () => void
  propEmVotacao?: boolean
  onProximaComissao?: () => void
}

export default function ItemRow({ item, aberta, onResultado, onRetirar, propEmVotacao, onProximaComissao }: Props) {
  const { secao, proposicao: prop } = item
  const resultado = item.resultado ?? ""
  const locked = (secao === "apresentacao" || secao === "parecer") && !!propEmVotacao

  const retirarBtn = (
    <button onClick={onRetirar} className={`${B} font-medium bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100`}>
      ↩ Retirar
    </button>
  )

  return (
    <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {item.ordem}. {TIPO[prop.tipo] || prop.tipo} {prop.numero}/{prop.ano}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{prop.ementa}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          {aberta && (
            <div className="flex flex-wrap items-center gap-1 justify-end" style={{ maxWidth: 520 }}>
              {(secao === "apresentacao" || secao === "parecer") && (
                <BotoesComissao prop={prop} secao={secao} resultado={resultado} locked={locked}
                  onResultado={onResultado} retirarBtn={retirarBtn} onProximaComissao={onProximaComissao} />
              )}
              {secao === "votacao" && (
                <BotoesVotacao resultado={resultado} onResultado={onResultado} retirarBtn={retirarBtn}
                  numVotacoes={prop.numVotacoes ?? 1} destinoFinal={prop.destinoFinal ?? "sancao"} />
              )}
              {(secao === "redacao_final" || secao === "requerimento") && (
                <BotoesSimples secao={secao} resultado={resultado} onResultado={onResultado} retirarBtn={retirarBtn} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Apresentação e Leitura de Parecer ─────────────────────────────────────────

function BotoesComissao({ prop, secao, resultado, locked, onResultado, retirarBtn, onProximaComissao }: {
  prop: Proposicao; secao: string; resultado: string; locked: boolean
  onResultado: (r: string) => void; retirarBtn: ReactNode; onProximaComissao?: () => void
}) {
  const regulares = (prop.comissoes || []).filter(c => !isCRF(c)).sort((a, b) => a.ordem - b.ordem)
  const primeiraOrdem = regulares[0]?.ordem ?? 0
  const etapaOrdem = prop.etapaAtual.startsWith("comissao")
    ? parseInt(prop.etapaAtual.replace("comissao", "")) : 0
  const dispensaBloqueada = etapaOrdem > primeiraOrdem
  const comissoesPendentes = regulares.filter(c => c.ordem >= etapaOrdem).length
  const parecerConjuntoBloqueado = comissoesPendentes < 2

  const opts: { value: string; label: string; readOnly?: boolean; disabled?: boolean }[] = [
    { value: "comissao", label: "Comissão", readOnly: true },
    { value: "parecer_conjunto", label: "Par. Conjunto", disabled: parecerConjuntoBloqueado },
    { value: "dispensa_parecer", label: "Disp. Parecer", disabled: dispensaBloqueada },
    { value: "dispensa_intersticio", label: "Disp. Interstício" },
  ]

  const selIdx = opts.findIndex(o => o.value === resultado)
  const isPermanent = resultado === "parecer_conjunto" || resultado === "dispensa_parecer"

  return (
    <>
      {opts.map((opt, i) => {
        const canClick = !opt.readOnly && !opt.disabled && !locked && !(isPermanent && i <= selIdx)
        const btnClass = !canClick ? cls("off")
          : selIdx < 0 && i === 0 ? `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold cursor-default`
          : seqCls(i, selIdx)
        return (
          <button key={opt.value} disabled={!canClick}
            onClick={() => canClick && onResultado(resultado === opt.value ? "" : opt.value)}
            className={btnClass}>
            {opt.label}
          </button>
        )
      })}
      {!locked && secao === "parecer" && onProximaComissao && (
        <button onClick={onProximaComissao}
          className={`${B} font-semibold bg-blue-600 text-white border-blue-600 hover:bg-blue-700`}>
          Próxima Comissão →
        </button>
      )}
      {!locked && retirarBtn}
    </>
  )
}

// ── Segunda Parte: Votação ─────────────────────────────────────────────────────

function BotoesVotacao({ resultado, onResultado, retirarBtn, numVotacoes, destinoFinal }: {
  resultado: string; onResultado: (r: string) => void; retirarBtn: ReactNode
  numVotacoes: number; destinoFinal: string
}) {
  const emVotacao = resultado === "primeira_votacao" || resultado === "segunda_votacao"
  const beforeVotacao = !["primeira_votacao","segunda_votacao","aprovado","sancao","promulgacao","reprovado","arquivo"].includes(resultado)

  const main: { v: string; l: string }[] = [{ v: "primeira_votacao", l: "1ª Votação" }]
  if (numVotacoes >= 2) main.push({ v: "segunda_votacao", l: "2ª Votação" })
  main.push({ v: "aprovado", l: "Aprovado" })
  if (resultado === "aprovado")
    main.push(destinoFinal === "promulgacao" ? { v: "promulgacao", l: "Promulgação" } : { v: "sancao", l: "Sanção" })
  main.push({ v: "reprovado", l: "Reprovado" })
  if (resultado === "reprovado") main.push({ v: "arquivo", l: "Arquivo" })

  const selIdx = main.findIndex(o => o.v === resultado)
  const tog = (v: string) => onResultado(resultado === v ? "" : v)
  const side = (v: string) => resultado === v ? cls("active") : cls("idle")

  return (
    <>
      <button onClick={() => tog("vista")} className={side("vista")}>Vista</button>
      <button onClick={() => tog("adiamento")} className={side("adiamento")}>Adiamento</button>
      {beforeVotacao && <button onClick={() => tog("emenda")} className={side("emenda")}>Emendas</button>}
      {emVotacao && <button onClick={() => tog("dispensa_votacao")} className={side("dispensa_votacao")}>Disp. Votação</button>}
      <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
      {main.map((opt, i) => (
        <button key={opt.v} onClick={() => tog(opt.v)} className={seqCls(i, selIdx)}>{opt.l}</button>
      ))}
      {retirarBtn}
    </>
  )
}

// ── Redação Final e Requerimento ──────────────────────────────────────────────

function BotoesSimples({ secao, resultado, onResultado, retirarBtn }: {
  secao: string; resultado: string; onResultado: (r: string) => void; retirarBtn: ReactNode
}) {
  const opts = secao === "redacao_final"
    ? [{ v: "em_revisao", l: "Em Revisão" }, { v: "revisado", l: "Revisado" }]
    : [{ v: "aprovado", l: "Aprovado" }, { v: "reprovado", l: "Reprovado" }]
  const selIdx = opts.findIndex(o => o.v === resultado)
  return (
    <>
      {opts.map((opt, i) => (
        <button key={opt.v} onClick={() => onResultado(resultado === opt.v ? "" : opt.v)} className={seqCls(i, selIdx)}>
          {opt.l}
        </button>
      ))}
      {retirarBtn}
    </>
  )
}
