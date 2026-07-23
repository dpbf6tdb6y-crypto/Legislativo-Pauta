"use client"
import { useEffect, useState } from "react"

type Solicitacao = {
  id: string
  solicitanteNome: string
  createdAt: string
}

export default function AprovacaoRelatorioListener() {
  const [fila, setFila] = useState<Solicitacao[]>([])
  const [respondendo, setRespondendo] = useState(false)

  useEffect(() => {
    let ativo = true
    async function checar() {
      try {
        const res = await fetch("/api/indicacoes/solicitacoes/pendentes")
        if (!res.ok) return
        const dados = await res.json()
        if (ativo) setFila(dados)
      } catch {}
    }
    checar()
    const id = setInterval(checar, 5000)
    return () => { ativo = false; clearInterval(id) }
  }, [])

  async function responder(status: "aprovado" | "negado") {
    if (!fila[0]) return
    setRespondendo(true)
    try {
      await fetch(`/api/indicacoes/solicitacoes/${fila[0].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      setFila(prev => prev.slice(1))
    } finally {
      setRespondendo(false)
    }
  }

  const atual = fila[0]
  if (!atual) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="font-bold text-gray-800 mb-1">Solicitação de relatório sigiloso</h2>
        <p className="text-sm text-gray-600 mb-5">
          <span className="font-semibold">{atual.solicitanteNome}</span> pediu sua autorização para gerar um relatório de Indicações de Cargos.
        </p>
        <div className="flex gap-3">
          <button onClick={() => responder("negado")} disabled={respondendo}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
            Negar
          </button>
          <button onClick={() => responder("aprovado")} disabled={respondendo}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: "#8B0000" }}>
            Autorizar
          </button>
        </div>
        {fila.length > 1 && <p className="text-xs text-gray-400 mt-3">+{fila.length - 1} outra(s) solicitação(ões) na fila</p>}
      </div>
    </div>
  )
}
