"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import IndicacoesGate from "../_components/IndicacoesGate"
import AbasIndicacoes from "../_components/AbasIndicacoes"
import { Pedido, STATUS_PEDIDO, STATUS_COR, STATUS_BORDA, fmtData } from "@/lib/pedidos"

export default function PainelPedidosPage() {
  return (
    <IndicacoesGate>
      <PainelConteudo />
    </IndicacoesGate>
  )
}

function PainelConteudo() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [vereadores, setVereadores] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  const [vereadorId, setVereadorId] = useState("")
  const [tipo, setTipo] = useState("")
  const [status, setStatus] = useState("")
  const [referencia, setReferencia] = useState("")
  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")
  const [fechDe, setFechDe] = useState("")
  const [fechAte, setFechAte] = useState("")
  const [busca, setBusca] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/indicacoes/pedidos").then(r => r.json()),
      fetch("/api/vereadores?poder=legislativo").then(r => r.json()),
    ]).then(([p, v]) => {
      setPedidos(Array.isArray(p) ? p : [])
      setVereadores(Array.isArray(v) ? v : [])
      setCarregando(false)
    })
  }, [])

  const tipos = useMemo(() => Array.from(new Set(pedidos.map(p => p.tipo))).sort((a, b) => a.localeCompare(b)), [pedidos])

  // filtros dinâmicos: aplicados na hora, sem nova ida ao servidor
  const filtrados = useMemo(() => pedidos.filter(p => {
    if (vereadorId && p.vereadorId !== vereadorId) return false
    if (tipo && p.tipo !== tipo) return false
    if (status && p.status !== status) return false
    if (referencia && String(p.referencia ?? "") !== referencia) return false
    const dp = p.dataPedido.slice(0, 10)
    if (de && dp < de) return false
    if (ate && dp > ate) return false
    const df = p.dataFechamento ? p.dataFechamento.slice(0, 10) : ""
    if ((fechDe || fechAte) && !df) return false
    if (fechDe && df < fechDe) return false
    if (fechAte && df > fechAte) return false
    if (busca) {
      const t = (p.descricao + " " + p.tipo + " " + (p.endereco || "") + " " + (p.vereador?.nome || "")).toLowerCase()
      if (!t.includes(busca.toLowerCase())) return false
    }
    return true
  }), [pedidos, vereadorId, tipo, status, referencia, de, ate, fechDe, fechAte, busca])

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    STATUS_PEDIDO.forEach(s => { c[s] = 0 })
    filtrados.forEach(p => { c[p.status] = (c[p.status] || 0) + 1 })
    return c
  }, [filtrados])

  const hoje = new Date().toISOString().slice(0, 10)
  const atrasados = filtrados.filter(p => p.status === "Em andamento" && p.prazo && p.prazo.slice(0, 10) < hoje).length

  function limpar() {
    setVereadorId(""); setTipo(""); setStatus(""); setReferencia("")
    setDe(""); setAte(""); setFechDe(""); setFechAte(""); setBusca("")
  }

  const campo = "border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30"

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🔒 Ind. · Pedidos dos vereadores</h1>
          <p className="text-sm text-gray-500">Solicitações dos vereadores ao Poder Executivo · informações sigilosas</p>
        </div>
        <Link href="/dashboard/indicacoes/pedidos/gestao?novo=1"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition" style={{ background: "#8B0000" }}>
          + Novo pedido
        </Link>
      </div>

      <AbasIndicacoes />

      {/* resumo por status */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total</p>
          <p className="text-2xl font-bold tabular-nums text-gray-700">{filtrados.length}</p>
          {atrasados > 0 && <p className="text-xs text-red-600 font-semibold">{atrasados} com prazo vencido</p>}
        </div>
        {STATUS_PEDIDO.map(s => (
          <button key={s} onClick={() => setStatus(status === s ? "" : s)}
            className={`text-left bg-white rounded-xl border p-3 transition ${status === s ? "ring-2 ring-red-800/30" : ""} border-gray-200 hover:border-gray-300`}>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{s}</p>
            <p className="text-2xl font-bold tabular-nums">
              <span className={`inline-block px-2 rounded ${STATUS_COR[s]}`}>{contagem[s] || 0}</span>
            </p>
          </button>
        ))}
      </div>

      {/* filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <select value={vereadorId} onChange={e => setVereadorId(e.target.value)} className={campo}>
            <option value="">Todos os vereadores</option>
            {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={campo}>
            <option value="">Todos os tipos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={campo}>
            <option value="">Todos os status</option>
            {STATUS_PEDIDO.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={referencia} onChange={e => setReferencia(e.target.value)} className={campo} title="Referência interna (1 a 5)">
            <option value="">Referência (1 a 5)</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={String(n)}>Referência {n}</option>)}
          </select>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar na descrição, endereço…" className={campo + " min-w-[200px]"} />
        </div>
        <div className="flex gap-2 items-center flex-wrap text-xs text-gray-500">
          <span>Data do pedido:</span>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className={campo} />
          <span>até</span>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className={campo} />
          <span className="ml-3">Fechamento:</span>
          <input type="date" value={fechDe} onChange={e => setFechDe(e.target.value)} className={campo} />
          <span>até</span>
          <input type="date" value={fechAte} onChange={e => setFechAte(e.target.value)} className={campo} />
          <button onClick={limpar} className="ml-2 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">Limpar filtros</button>
          <button
            disabled={!vereadorId}
            onClick={() => router.push(`/dashboard/indicacoes/pedidos/relatorio?vereadorId=${vereadorId}`)}
            title={vereadorId ? "Relatório completo do vereador selecionado" : "Selecione um vereador para gerar o relatório"}
            className="ml-auto px-3 py-1.5 rounded text-white font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Gerar relatório do vereador
          </button>
        </div>
      </div>

      {/* lista */}
      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          {pedidos.length ? "Nenhum pedido com esses filtros." : "Nenhum pedido cadastrado ainda. Use “+ Novo pedido”."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(p => {
            const vencido = p.status === "Em andamento" && p.prazo && p.prazo.slice(0, 10) < hoje
            return (
              <Link key={p.id} href={`/dashboard/indicacoes/pedidos/gestao?id=${p.id}`}
                className={`block rounded-xl border border-gray-200 border-l-4 ${STATUS_BORDA[p.status] || ""} bg-white p-4 hover:shadow-sm transition`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{p.vereador?.apelido || p.vereador?.nome || "Sem vereador"}</span>
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{p.tipo}</span>
                      {p.referencia && (
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold" title="Referência interna (1 a 5)">
                          Ref. {p.referencia}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{p.descricao}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      {p.endereco && <span>📍 {p.endereco}</span>}
                      <span>Pedido: {fmtData(p.dataPedido)}</span>
                      <span>Atualizado: {fmtData(p.ultimaAtualizacao)}</span>
                      {p.dataFechamento && <span>Fechado: {fmtData(p.dataFechamento)}</span>}
                      {p.prazo && <span className={vencido ? "text-red-600 font-semibold" : ""}>Prazo: {fmtData(p.prazo)}{vencido ? " (vencido)" : ""}</span>}
                      <span>{p.andamentos.length} andamento(s)</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border whitespace-nowrap ${STATUS_COR[p.status] || ""}`}>
                    {p.status}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
