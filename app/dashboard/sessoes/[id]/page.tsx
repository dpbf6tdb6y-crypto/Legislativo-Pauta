"use client"
import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Sessao, PautaItem, Proposicao, TIPO_SESSAO, fmtData, isCRF } from "./components/types"
import ItemRow from "./components/ItemRow"

function SecaoHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function ItemFixo({ label }: { label: string }) {
  return (
    <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-50">
      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
      <p className="text-sm text-gray-400 italic">{label}</p>
    </div>
  )
}

function Vazio({ texto = "Nenhum item." }: { texto?: string }) {
  return <div className="px-5 py-3"><p className="text-xs text-gray-400 italic">{texto}</p></div>
}

function proximaComissao(prop: Proposicao): string | null {
  if (!prop.etapaAtual.startsWith("comissao")) return null
  const ordem = parseInt(prop.etapaAtual.replace("comissao", ""))
  if (isNaN(ordem)) return null
  const regulares = (prop.comissoes || []).filter(c => !isCRF(c)).sort((a, b) => a.ordem - b.ordem)
  const prox = regulares.find(c => c.ordem > ordem)
  return prox ? `comissao${prox.ordem}` : "pronto_votar"
}

export default function SessaoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const [sessao, setSessao] = useState<Sessao | null>(null)

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/sessoes/${id}`)
    setSessao(await res.json())
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  async function fecharSessao() {
    if (!confirm("Fechar esta sessão?")) return
    await fetch(`/api/sessoes/${id}/fechar`, { method: "POST" })
    carregar()
  }

  async function reabrirSessao() {
    await fetch(`/api/sessoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "agendada" }),
    })
    carregar()
  }

  async function salvarItens(itens: PautaItem[]) {
    await fetch(`/api/sessoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: itens.map(i => ({
          proposicaoId: i.proposicao.id,
          ordem: i.ordem,
          secao: i.secao,
          resultado: i.resultado,
        })),
      }),
    })
    carregar()
  }

  async function atualizarResultado(item: PautaItem, resultado: string) {
    if (!sessao) return
    let itens = sessao.itens.map(i => i.id === item.id ? { ...i, resultado } : i)

    if (resultado === "dispensa_intersticio") {
      const maxVotacao = Math.max(0, ...itens.filter(i => i.secao === "votacao").map(i => i.ordem))
      itens = itens.map(i => i.id === item.id ? { ...i, secao: "votacao", ordem: maxVotacao + 1 } : i)
    } else if (resultado === "") {
      itens = itens.filter(i => !(i.proposicao.id === item.proposicao.id && i.secao === "votacao" && !i.resultado))
    }

    await salvarItens(itens)
  }

  async function retirarDePauta(proposicaoId: string) {
    if (!confirm("Retirar esta proposição da pauta? Ela voltará para a lista disponível para ser pautada novamente.")) return
    await fetch("/api/pauta/remover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposicaoId, sessaoId: id }),
    })
    carregar()
  }

  async function moverEtapa(proposicaoId: string, etapa: string) {
    await fetch(`/api/proposicoes/${proposicaoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapaAtual: etapa }),
    })
    carregar()
  }

  if (!sessao) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Carregando sessão...</p>
      </div>
    )
  }

  const aberta = sessao.status === "agendada"
  const itens = sessao.itens

  const sec = (s: string) => itens.filter(i => i.secao === s)
  const votacao = itens.filter(i => i.secao === "votacao" || !i.secao)
  const propIdsEmVotacao = new Set(votacao.map(i => i.proposicao.id))

  return (
    <div className="p-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard/sessoes" className="text-gray-400 hover:text-gray-600 text-sm transition">
          ← Sessões
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-800">
          Sessão {TIPO_SESSAO[sessao.tipo] || sessao.tipo}
          {sessao.numero ? ` — Nº ${sessao.numero}` : ""}
        </h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${aberta ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {aberta ? "Em aberto" : "Encerrada"}
        </span>
      </div>

      {/* Info da sessão */}
      <div
        className="rounded-xl p-4 mb-4 border-2 flex items-center justify-between"
        style={aberta ? { background: "#f0fdf4", borderColor: "#86efac" } : { background: "#fff1f2", borderColor: "#fca5a5" }}
      >
        <div>
          <p className="text-sm text-gray-600 capitalize">{fmtData(sessao.data)}</p>
          {sessao.local && <p className="text-sm text-gray-500">{sessao.local}</p>}
          <p className="text-sm text-gray-500">{itens.length} item(s) na pauta</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
            🖨️ Imprimir
          </button>
          {aberta
            ? <button onClick={fecharSessao}
                className="text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                style={{ background: "#dc2626" }}>
                Fechar Sessão
              </button>
            : <button onClick={reabrirSessao}
                className="text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                style={{ background: "#16a34a" }}>
                Reabrir Sessão
              </button>
          }
        </div>
      </div>

      {/* Ordem do Dia */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200" style={{ background: "#8B0000" }}>
          <h2 className="font-bold text-white text-sm tracking-wide">ORDEM DO DIA</h2>
        </div>

        {/* I — PRIMEIRA PARTE */}
        <div className="border-b border-gray-200">
          <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">I — Primeira Parte</p>
          </div>
          <ItemFixo label="a) Leitura, discussão e votação da ata da reunião anterior" />
          <ItemFixo label="b) Leitura de correspondências" />

          <SecaoHeader label="c) Apresentação de proposições" />
          {sec("apresentacao").length === 0
            ? <Vazio texto="Nenhuma proposição para apresentação." />
            : sec("apresentacao").map(item => (
              <ItemRow key={item.id} item={item} aberta={aberta}
                onResultado={r => atualizarResultado(item, r)}
                onRetirar={() => retirarDePauta(item.proposicao.id)}
                propEmVotacao={propIdsEmVotacao.has(item.proposicao.id)}
              />
            ))
          }

          <SecaoHeader label="d) Leitura de Parecer" />
          {sec("parecer").length === 0
            ? <Vazio texto="Nenhum parecer para leitura." />
            : sec("parecer").map(item => {
              const next = proximaComissao(item.proposicao)
              return (
                <ItemRow key={item.id} item={item} aberta={aberta}
                  onResultado={r => atualizarResultado(item, r)}
                  onRetirar={() => retirarDePauta(item.proposicao.id)}
                  propEmVotacao={propIdsEmVotacao.has(item.proposicao.id)}
                  onProximaComissao={next ? () => moverEtapa(item.proposicao.id, next) : undefined}
                />
              )
            })
          }
        </div>

        {/* II — SEGUNDA PARTE */}
        <div className="border-b border-gray-200">
          <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">II — Segunda Parte</p>
          </div>
          <SecaoHeader label="a) Discussão e votação de projetos" />
          {votacao.length === 0
            ? <Vazio texto={aberta ? "Adicione proposições pela tela de Proposições → Enviar para Pauta." : "Nenhum item."} />
            : votacao.map(item => (
              <ItemRow key={item.id} item={item} aberta={aberta}
                onResultado={r => atualizarResultado(item, r)}
                onRetirar={() => retirarDePauta(item.proposicao.id)}
              />
            ))
          }
        </div>

        {/* III — TERCEIRA PARTE */}
        <div className="border-b border-gray-200">
          <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">III — Terceira Parte</p>
          </div>
          <SecaoHeader label="a) Discussão e votação de indicações, moções e requerimentos" />
          {sec("requerimento").length === 0
            ? <Vazio />
            : sec("requerimento").map(item => (
              <ItemRow key={item.id} item={item} aberta={aberta}
                onResultado={r => atualizarResultado(item, r)}
                onRetirar={() => retirarDePauta(item.proposicao.id)}
              />
            ))
          }
        </div>

        {/* Redação Final */}
        {sec("redacao_final").length > 0 && (
          <div className="border-b border-gray-200">
            <div className="px-5 py-2.5" style={{ background: "#f0fdf4" }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#166534" }}>
                Comissão de Redação Final
              </p>
            </div>
            {sec("redacao_final").map(item => (
              <ItemRow key={item.id} item={item} aberta={aberta}
                onResultado={r => atualizarResultado(item, r)}
                onRetirar={() => retirarDePauta(item.proposicao.id)}
              />
            ))}
          </div>
        )}

        {/* IV — QUARTA PARTE */}
        <div>
          <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">IV — Quarta Parte</p>
          </div>
          <ItemFixo label="a) Apresentação de oradores inscritos" />
        </div>
      </div>
    </div>
  )
}
