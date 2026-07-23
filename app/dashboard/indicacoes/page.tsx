"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import IndicacoesGate from "./_components/IndicacoesGate"

type Indicacao = {
  id: string
  indicado: string
  cargo: string
  salario: number | null
  status: string
  dataInicio: string | null
  dataFim: string | null
  createdAt: string
  vereador: { id: string; nome: string } | null
  empresa: { id: string; nome: string } | null
}

const STATUS_LIST = ["Aguardando", "Aceito", "Não aceito"]
const STATUS_COR: Record<string, string> = {
  "Aguardando": "bg-yellow-100 text-yellow-800",
  "Aceito": "bg-green-100 text-green-800",
  "Não aceito": "bg-red-100 text-red-800",
}

function fmtMoeda(v: number | null) {
  if (v == null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function fmtData(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

export default function IndicacoesPage() {
  return (
    <IndicacoesGate>
      <IndicacoesConteudo />
    </IndicacoesGate>
  )
}

function IndicacoesConteudo() {
  const [itens, setItens] = useState<Indicacao[]>([])
  const [vereadores, setVereadores] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  const [filtroVereador, setFiltroVereador] = useState("")
  const [filtroEmpresa, setFiltroEmpresa] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")

  const [modalRelatorio, setModalRelatorio] = useState(false)

  async function carregar() {
    setCarregando(true)
    const [i, v, e] = await Promise.all([
      fetch("/api/indicacoes").then(r => r.json()),
      fetch("/api/vereadores?poder=legislativo").then(r => r.json()),
      fetch("/api/empresas").then(r => r.json()),
    ])
    setItens(i); setVereadores(v); setEmpresas(e)
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  async function excluir(id: string) {
    if (!confirm("Excluir esta indicação?")) return
    await fetch(`/api/indicacoes/${id}`, { method: "DELETE" })
    carregar()
  }

  const itensFiltrados = useMemo(() => itens.filter(i => {
    if (filtroVereador && i.vereador?.id !== filtroVereador) return false
    if (filtroEmpresa && i.empresa?.id !== filtroEmpresa) return false
    if (filtroStatus && i.status !== filtroStatus) return false
    return true
  }), [itens, filtroVereador, filtroEmpresa, filtroStatus])

  const stats = useMemo(() => {
    const aceitos = itens.filter(i => i.status === "Aceito")
    const naoAceitos = itens.filter(i => i.status === "Não aceito")
    const aguardando = itens.filter(i => i.status === "Aguardando")
    const ativos = aceitos.filter(i => !i.dataFim)
    const folhaAtiva = ativos.reduce((s, i) => s + (i.salario || 0), 0)
    return { total: itens.length, aceitos: aceitos.length, naoAceitos: naoAceitos.length, aguardando: aguardando.length, ativos: ativos.length, folhaAtiva }
  }, [itens])

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">🔒 Indicações de Cargos</h1>
          <p className="text-sm text-gray-500">Informações sigilosas — acesso restrito</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/indicacoes/empresas"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Empresas
          </Link>
          <button onClick={() => setModalRelatorio(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition">
            Gerar Relatório
          </button>
          <Link href="/dashboard/indicacoes/novo"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
            style={{ background: "#8B0000" }}>
            + Nova Indicação
          </Link>
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" valor={stats.total} cor="text-gray-700" />
        <StatCard label="Aguardando" valor={stats.aguardando} cor="text-yellow-600" />
        <StatCard label="Aceitos" valor={stats.aceitos} cor="text-green-600" />
        <StatCard label="Não aceitos" valor={stats.naoAceitos} cor="text-red-600" />
        <StatCard label="Em atividade" valor={stats.ativos} cor="text-blue-600" sub={fmtMoeda(stats.folhaAtiva) + "/mês"} />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2 items-center flex-wrap">
        <select value={filtroVereador} onChange={e => setFiltroVereador(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30">
          <option value="">Todos os vereadores</option>
          {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
        <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30">
          <option value="">Todas as empresas</option>
          {empresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30">
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{itensFiltrados.length} de {itens.length} item(s)</span>
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          Nenhuma indicação encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {itensFiltrados.map(item => (
            <div key={item.id} className="rounded-xl border-2 border-gray-200 bg-white p-4 hover:border-gray-300 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{item.indicado}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COR[item.status] || "bg-gray-100 text-gray-700"}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{item.cargo} · {fmtMoeda(item.salario)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-gray-500">
                    {item.vereador && <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">Indicação: {item.vereador.nome}</span>}
                    {item.empresa && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.empresa.nome}</span>}
                    <span>Início: {fmtData(item.dataInicio)}</span>
                    <span>Fim: {fmtData(item.dataFim)}</span>
                  </div>
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <Link href={`/dashboard/indicacoes/${item.id}/editar`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Editar</Link>
                  <button onClick={() => excluir(item.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">Excluir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalRelatorio && (
        <ModalRelatorio itens={itensFiltrados} onClose={() => setModalRelatorio(false)} />
      )}
    </div>
  )
}

function StatCard({ label, valor, cor, sub }: { label: string; valor: number; cor: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function ModalRelatorio({ itens, onClose }: { itens: Indicacao[]; onClose: () => void }) {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [aprovadorId, setAprovadorId] = useState("")
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "aguardando" | "aprovado" | "negado">("idle")
  const [erro, setErro] = useState("")

  useEffect(() => {
    fetch("/api/indicacoes/usuarios-autorizados").then(r => r.json()).then(setUsuarios)
  }, [])

  useEffect(() => {
    if (status !== "aguardando" || !solicitacaoId) return
    const id = setInterval(async () => {
      const res = await fetch(`/api/indicacoes/solicitacoes/${solicitacaoId}`)
      if (!res.ok) return
      const d = await res.json()
      if (d.status === "aprovado") { setStatus("aprovado"); clearInterval(id) }
      if (d.status === "negado") { setStatus("negado"); clearInterval(id) }
    }, 3000)
    return () => clearInterval(id)
  }, [status, solicitacaoId])

  async function solicitar() {
    setErro("")
    if (!aprovadorId) { setErro("Selecione quem deve autorizar."); return }
    const res = await fetch("/api/indicacoes/solicitacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aprovadorId }),
    })
    const d = await res.json()
    if (!res.ok) { setErro(d.error || "Erro ao solicitar"); return }
    setSolicitacaoId(d.id)
    setStatus("aguardando")
  }

  if (status === "aprovado") {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Relatório — Indicações de Cargos</h2>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                🖨️ Imprimir
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">
                Fechar
              </button>
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
                <th className="py-2 pr-2">Indicado</th>
                <th className="py-2 pr-2">Vereador</th>
                <th className="py-2 pr-2">Empresa</th>
                <th className="py-2 pr-2">Cargo</th>
                <th className="py-2 pr-2">Salário</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Início</th>
                <th className="py-2 pr-2">Fim</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2">{i.indicado}</td>
                  <td className="py-1.5 pr-2">{i.vereador?.nome || "—"}</td>
                  <td className="py-1.5 pr-2">{i.empresa?.nome || "—"}</td>
                  <td className="py-1.5 pr-2">{i.cargo}</td>
                  <td className="py-1.5 pr-2">{fmtMoeda(i.salario)}</td>
                  <td className="py-1.5 pr-2">{i.status}</td>
                  <td className="py-1.5 pr-2">{fmtData(i.dataInicio)}</td>
                  <td className="py-1.5 pr-2">{fmtData(i.dataFim)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Gerar Relatório</h2>
        <p className="text-xs text-gray-500 mb-4">Dados sigilosos — outra pessoa autorizada precisa aprovar esta geração.</p>

        {status === "idle" && (
          <div className="space-y-3">
            <select value={aprovadorId} onChange={e => setAprovadorId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Quem deve autorizar? —</option>
              {usuarios.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={solicitar} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#8B0000" }}>Solicitar</button>
            </div>
          </div>
        )}

        {status === "aguardando" && (
          <div className="text-center py-4">
            <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">Aguardando autorização...</p>
            <button onClick={onClose} className="mt-4 text-xs text-gray-400 hover:underline">Cancelar</button>
          </div>
        )}

        {status === "negado" && (
          <div className="text-center py-4">
            <p className="text-sm text-red-600 mb-4">Solicitação negada.</p>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
