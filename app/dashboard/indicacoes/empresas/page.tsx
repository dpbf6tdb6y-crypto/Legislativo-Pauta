"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import IndicacoesGate from "../_components/IndicacoesGate"

type Empresa = { id: string; nome: string; ativo: boolean }

export default function EmpresasPage() {
  return (
    <IndicacoesGate>
      <EmpresasConteudo />
    </IndicacoesGate>
  )
}

function EmpresasConteudo() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novoNome, setNovoNome] = useState("")
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const r = await fetch("/api/empresas")
    setEmpresas(await r.json())
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    setErro("")
    if (!novoNome.trim()) return
    setSalvando(true)
    const r = await fetch("/api/empresas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoNome.trim() }),
    })
    const d = await r.json()
    setSalvando(false)
    if (!r.ok) { setErro(d.error || "Erro ao adicionar"); return }
    setNovoNome("")
    carregar()
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta empresa?")) return
    const r = await fetch(`/api/empresas/${id}`, { method: "DELETE" })
    const d = await r.json()
    if (!r.ok) { alert(d.error || "Erro ao excluir"); return }
    carregar()
  }

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-10">
      <div className="flex items-center">
        <Link href="/dashboard/indicacoes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-800">🔒 Empresas</h1>

      <form onSubmit={adicionar} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-2">
        <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome da empresa"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
        <button type="submit" disabled={salvando}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
          style={{ background: "#8B0000" }}>
          Adicionar
        </button>
      </form>
      {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{erro}</p>}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {carregando ? (
          <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Nenhuma empresa cadastrada.</div>
        ) : empresas.map(e => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700">{e.nome}</span>
            <button onClick={() => excluir(e.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">Excluir</button>
          </div>
        ))}
      </div>
    </div>
  )
}
