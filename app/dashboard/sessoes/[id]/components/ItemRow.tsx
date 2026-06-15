"use client"
import { ReactNode } from "react"
import { PautaItem, Proposicao, TIPO, isCRF } from "./types"
import MiniStepper from "./MiniStepper"

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

  // Label do que acontece nesta sessão
  const labelSessao: Record<string, string> = {
    apresentacao: "📋 Apresentação de proposição",
    parecer: "📄 Leitura de parecer de comissão",
    votacao: "🗳️ Discussão e votação",
    requerimento: "📌 Votação de requerimento / moção",
    redacao_final: "✏️ Redação Final (CRF)",
  }

  return (
    <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
      {/* Label do que ocorre nesta sessão */}
      <div className="mb-2">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
          {labelSessao[secao] || secao}
        </span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {item.ordem}. {TIPO[prop.tipo] || prop.tipo} {prop.numero}/{prop.ano}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{prop.ementa}</p>
          {/* Stepper — histórico completo da proposição */}
          <MiniStepper prop={prop} resultado={resultado} secao={secao} />
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
  const ultimaComissao = !regulares.find(c => c.ordem > etapaOrdem)
  const dispensaBloqueada = etapaOrdem > primeiraOrdem
  const comissoesPendentes = regulares.filter(c => c.ordem >= etapaOrdem).length
  const parecerConjuntoBloqueado = comissoesPendentes < 2

  const opts: { value: string; label: string; readOnly?: boolean; disabled?: boolean; hidden?: boolean }[] = [
    { value: "comissao", label: "Comissão", readOnly: true, hidden: ultimaComissao },
    { value: "parecer_conjunto", label: "Par. Conjunto", disabled: parecerConjuntoBloqueado, hidden: ultimaComissao },
    { value: "dispensa_parecer", label: "Disp. Parecer", disabled: dispensaBloqueada, hidden: ultimaComissao },
    { value: "dispensa_intersticio", label: "Disp. Interstício" },
  ]

  const selIdx = opts.findIndex(o => o.value === resultado)
  const isPermanent = resultado === "parecer_conjunto" || resultado === "dispensa_parecer"

  return (
    <>
      {opts.filter(opt => !opt.hidden).map((opt, i) => {
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

function BotoesVotacao({ resultado, onResultado, retirarBtn, numVotacoes }: {
  resultado: string; onResultado: (r: string) => void; retirarBtn: ReactNode
  numVotacoes: number
}) {
  const tog = (v: string) => onResultado(resultado === v ? "" : v)
  const side = (v: string) => resultado === v ? cls("active") : cls("idle")

  // Estados possíveis
  const antes1a = !["primeira_votacao", "aprovado_1a", "reprovado_1a", "segunda_votacao", "aprovado", "reprovado"].includes(resultado)
  const em1a = resultado === "primeira_votacao"
  const aprovado1a = resultado === "aprovado_1a"
  const reprovado1a = resultado === "reprovado_1a"
  const em2a = resultado === "segunda_votacao"
  const final = resultado === "aprovado" || resultado === "reprovado"

  // Emendas forçam 2ª votação (armazenado como "emenda" antes da 1ª votação)
  const temEmenda = resultado === "emenda"
  const precisa2a = numVotacoes >= 2 || temEmenda

  return (
    <>
      {/* Antes da 1ª votação: Vista, Adiamento, Emendas */}
      {(antes1a || temEmenda) && (
        <>
          <button onClick={() => tog("vista")} className={side("vista")}>Vista</button>
          <button onClick={() => tog("adiamento")} className={side("adiamento")}>Adiamento</button>
          <button onClick={() => tog("emenda")} className={side("emenda")}>Emendas</button>
          <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
          <button onClick={() => tog("primeira_votacao")} className={cls("idle")}>1ª Votação</button>
        </>
      )}

      {/* Durante 1ª votação */}
      {em1a && (
        <>
          <span className={cls("active")}>1ª Votação</span>
          <button onClick={() => tog(precisa2a ? "aprovado_1a" : "aprovado")} className={cls("idle")}>Aprovado</button>
          <button onClick={() => tog(precisa2a ? "reprovado_1a" : "reprovado")} className={cls("idle")}>Reprovado</button>
        </>
      )}

      {/* Aprovado na 1ª → aguardando 2ª */}
      {aprovado1a && (
        <>
          <span className={cls("done")}>✓ Aprovado 1ª</span>
          <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
          <button onClick={() => tog("segunda_votacao")} className={cls("idle")}>2ª Votação</button>
        </>
      )}

      {/* Reprovado na 1ª → final */}
      {reprovado1a && <span className={`${cls("done")} !bg-red-100 !text-red-700 !border-red-300`}>✗ Reprovado</span>}

      {/* Durante 2ª votação */}
      {em2a && (
        <>
          <span className={cls("active")}>2ª Votação</span>
          <button onClick={() => tog("aprovado")} className={cls("idle")}>Aprovado</button>
          <button onClick={() => tog("reprovado")} className={cls("idle")}>Reprovado</button>
        </>
      )}

      {/* Resultado final */}
      {resultado === "aprovado" && <span className={cls("done")}>✓ Aprovado</span>}
      {resultado === "reprovado" && <span className={`${cls("done")} !bg-red-100 !text-red-700 !border-red-300`}>✗ Reprovado</span>}

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
