"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import IndicacoesGate from "../../_components/IndicacoesGate"

const STATUS_LIST = ["Aguardando", "Aceito", "Não aceito"]

export default function EditarIndicacaoPage() {
  return (
    <IndicacoesGate>
      <EditarIndicacaoConteudo />
    </IndicacoesGate>
  )
}

function EditarIndicacaoConteudo() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [vereadores, setVereadores] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  const [form, setForm] = useState({
    vereadorId: "", indicado: "", empresaId: "", cargo: "", salario: "",
    status: "Aguardando", dataInicio: "", dataFim: "",
  })

  useEffect(() => {
    Promise.all([
      fetch("/api/vereadores?poder=legislativo").then(r => r.json()),
      fetch("/api/empresas").then(r => r.json()),
      fetch(`/api/indicacoes/${id}`).then(r => r.json()),
    ]).then(([v, e, item]) => {
      setVereadores(v); setEmpresas(e)
      setForm({
        vereadorId: item.vereadorId || "",
        indicado: item.indicado || "",
        empresaId: item.empresaId || "",
        cargo: item.cargo || "",
        salario: item.salario != null ? String(item.salario) : "",
        status: item.status || "Aguardando",
        dataInicio: item.dataInicio ? item.dataInicio.split("T")[0] : "",
        dataFim: item.dataFim ? item.dataFim.split("T")[0] : "",
      })
      setCarregando(false)
    })
  }, [id])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro("")
    setSalvando(true)
    const res = await fetch(`/api/indicacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) { router.push("/dashboard/indicacoes") }
    else { const d = await res.json(); setErro(d.error || "Erro ao salvar"); setSalvando(false) }
  }

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"

  if (carregando) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center">
        <Link href="/dashboard/indicacoes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-800">🔒 Editar Indicação de Cargo</h1>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vereador (indicação de)</label>
          <select value={form.vereadorId} onChange={e => set("vereadorId", e.target.value)} className={inp}>
            <option value="">— Selecionar —</option>
            {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do Indicado *</label>
          <input required value={form.indicado} onChange={e => set("indicado", e.target.value)} className={inp} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Empresa</label>
          <div className="flex gap-2">
            <select value={form.empresaId} onChange={e => set("empresaId", e.target.value)} className={inp}>
              <option value="">— Selecionar —</option>
              {empresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <Link href="/dashboard/indicacoes/empresas"
              className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap">
              + Empresa
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cargo *</label>
            <input required value={form.cargo} onChange={e => set("cargo", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Salário (R$)</label>
            <input type="number" step="0.01" min="0" value={form.salario} onChange={e => set("salario", e.target.value)} className={inp} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select value={form.status} onChange={e => set("status", e.target.value)} className={inp}>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Início</label>
            <input type="date" value={form.dataInicio} onChange={e => set("dataInicio", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Encerramento</label>
            <input type="date" value={form.dataFim} onChange={e => set("dataFim", e.target.value)} className={inp} />
          </div>
        </div>

        {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{erro}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/indicacoes" className="px-5 py-2.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="submit" disabled={salvando}
            className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: "#8B0000" }}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  )
}
