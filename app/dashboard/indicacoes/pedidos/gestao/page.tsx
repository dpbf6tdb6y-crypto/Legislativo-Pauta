"use client"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { acessoDoMenu } from "@/lib/acessos"
import IndicacoesGate from "../../_components/IndicacoesGate"
import AbasIndicacoes from "../../_components/AbasIndicacoes"
import { Pedido, STATUS_PEDIDO, STATUS_COR, STATUS_BORDA, fmtData, paraInputData } from "@/lib/pedidos"

export default function GestaoPedidosPage() {
  return (
    <IndicacoesGate>
      <GestaoConteudo />
    </IndicacoesGate>
  )
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

const FORM_VAZIO = {
  vereadorId: "", tipo: "", descricao: "", endereco: "",
  dataPedido: hojeISO(), prazo: "", status: "Em andamento", referencia: "",
}

function GestaoConteudo() {
  const { data: sessao } = useSession()
  const podeCadastrar = acessoDoMenu(sessao?.user as any, "indicacoes").cad
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [vereadores, setVereadores] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<string | null>(null) // null = novo pedido
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [erro, setErro] = useState("")
  const [msg, setMsg] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")

  const [andData, setAndData] = useState(hojeISO())
  const [andDesc, setAndDesc] = useState("")
  const [andStatus, setAndStatus] = useState("")
  const [andErro, setAndErro] = useState("")

  async function carregar(manter?: string | null) {
    const [p, v] = await Promise.all([
      fetch("/api/indicacoes/pedidos").then(r => r.json()),
      vereadores.length ? Promise.resolve(vereadores) : fetch("/api/vereadores?poder=legislativo").then(r => r.json()),
    ])
    const lista: Pedido[] = Array.isArray(p) ? p : []
    setPedidos(lista)
    if (!vereadores.length) setVereadores(Array.isArray(v) ? v : [])
    setCarregando(false)
    return lista
  }

  function abrir(p: Pedido | null) {
    setErro(""); setMsg(""); setAndErro("")
    if (!p) {
      setSelecionado(null)
      setForm({ ...FORM_VAZIO, dataPedido: hojeISO() })
    } else {
      setSelecionado(p.id)
      setForm({
        vereadorId: p.vereadorId || "", tipo: p.tipo, descricao: p.descricao, endereco: p.endereco || "",
        dataPedido: paraInputData(p.dataPedido), prazo: paraInputData(p.prazo), status: p.status,
        referencia: p.referencia ? String(p.referencia) : "",
      })
    }
    setAndData(hojeISO()); setAndDesc(""); setAndStatus("")
  }

  useEffect(() => {
    carregar().then(lista => {
      const q = new URLSearchParams(window.location.search)
      const id = q.get("id")
      if (id) {
        const p = lista.find(x => x.id === id)
        if (p) abrir(p)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })
  }, [])

  const atual = useMemo(() => pedidos.find(p => p.id === selecionado) || null, [pedidos, selecionado])
  const tipos = useMemo(() => Array.from(new Set(pedidos.map(p => p.tipo))).sort((a, b) => a.localeCompare(b)), [pedidos])
  const filtrados = useMemo(() => pedidos.filter(p => {
    if (filtroStatus && p.status !== filtroStatus) return false
    if (busca) {
      const t = (p.descricao + " " + p.tipo + " " + (p.endereco || "") + " " + (p.vereador?.nome || "")).toLowerCase()
      if (!t.includes(busca.toLowerCase())) return false
    }
    return true
  }), [pedidos, busca, filtroStatus])

  function set(campo: string, valor: string) { setForm(f => ({ ...f, [campo]: valor })) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(""); setMsg("")
    if (!form.tipo.trim() || !form.descricao.trim() || !form.dataPedido) {
      setErro("Preencha o tipo, a descrição e a data do pedido."); return
    }
    setSalvando(true)
    try {
      const res = await fetch(selecionado ? `/api/indicacoes/pedidos/${selecionado}` : "/api/indicacoes/pedidos", {
        method: selecionado ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setErro(d.error || "Não foi possível salvar."); return }
      const lista = await carregar()
      const salvo = lista.find(x => x.id === d.id)
      if (salvo) { setSelecionado(salvo.id) }
      setMsg(selecionado ? "Pedido atualizado." : "Pedido criado. Já pode lançar andamentos.")
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!selecionado || !atual) return
    if (!confirm(`Excluir este pedido e seus ${atual.andamentos.length} andamento(s)? Essa ação não pode ser desfeita.`)) return
    const res = await fetch(`/api/indicacoes/pedidos/${selecionado}`, { method: "DELETE" })
    if (!res.ok) { setErro("Não foi possível excluir."); return }
    await carregar()
    abrir(null)
    setMsg("Pedido excluído.")
  }

  async function lancarAndamento(e: React.FormEvent) {
    e.preventDefault()
    setAndErro("")
    if (!selecionado) return
    if (!andDesc.trim()) { setAndErro("Descreva o andamento."); return }
    const res = await fetch(`/api/indicacoes/pedidos/${selecionado}/andamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: andData, descricao: andDesc, status: andStatus }),
    })
    const d = await res.json()
    if (!res.ok) { setAndErro(d.error || "Não foi possível lançar o andamento."); return }
    const lista = await carregar()
    const p = lista.find(x => x.id === selecionado)
    if (p) setForm(f => ({ ...f, status: p.status }))
    setAndDesc(""); setAndStatus(""); setAndData(hojeISO())
    setMsg("Andamento registrado.")
  }

  async function excluirAndamento(aid: string) {
    if (!selecionado || !confirm("Excluir este andamento?")) return
    await fetch(`/api/indicacoes/pedidos/${selecionado}/andamentos/${aid}`, { method: "DELETE" })
    await carregar()
  }

  const campo = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
  const rotulo = "block text-xs font-semibold text-gray-600 mb-1"

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-10">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🔒 Ind. · Cadastro e gestão dos pedidos</h1>
        <p className="text-sm text-gray-500">Registre os pedidos dos vereadores, lance os andamentos e acompanhe o histórico</p>
      </div>

      <AbasIndicacoes />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* lista */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-3 space-y-2 self-start">
          <div className="flex gap-2">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pedido…"
              className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30" />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1.5 text-xs">
              <option value="">Todos</option>
              {STATUS_PEDIDO.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={() => abrir(null)}
            className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#8B0000" }}>
            + Novo pedido
          </button>
          <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
            {carregando ? <p className="text-xs text-gray-400 py-6 text-center">Carregando…</p>
              : filtrados.length === 0 ? <p className="text-xs text-gray-400 py-6 text-center">Nenhum pedido.</p>
              : filtrados.map(p => (
                <button key={p.id} onClick={() => abrir(p)}
                  className={`w-full text-left rounded-lg border border-l-4 ${STATUS_BORDA[p.status] || ""} p-2.5 transition ${
                    selecionado === p.id ? "bg-red-50 border-red-200" : "bg-white border-gray-200 hover:bg-gray-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{p.vereador?.apelido || p.vereador?.nome || "Sem vereador"}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${STATUS_COR[p.status] || ""}`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-gray-600 truncate">{p.tipo}{p.referencia ? ` · Ref. ${p.referencia}` : ""}</p>
                  <p className="text-[11px] text-gray-400">Pedido {fmtData(p.dataPedido)} · atualizado {fmtData(p.ultimaAtualizacao)}</p>
                </button>
              ))}
          </div>
        </div>

        {/* editor */}
        <div className="lg:col-span-3 space-y-4">
          <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <fieldset disabled={!podeCadastrar} className="min-w-0 border-0 p-0 m-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{selecionado ? "Editar pedido" : "Novo pedido"}</h2>
              {atual && <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${STATUS_COR[atual.status] || ""}`}>{atual.status}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Vereador</label>
                <SeletorVereador vereadores={vereadores} valor={form.vereadorId}
                  onChange={id => set("vereadorId", id)} className={campo} />
              </div>
              <div>
                <label className={rotulo}>Tipo de pedido</label>
                <input list="tipos-pedido" value={form.tipo} onChange={e => set("tipo", e.target.value)}
                  placeholder="Ex.: caçamba, asfalto, explicações sobre obra" className={campo} />
                <datalist id="tipos-pedido">{tipos.map(t => <option key={t} value={t} />)}</datalist>
              </div>
            </div>

            <div>
              <label className={rotulo}>Descrição detalhada</label>
              <textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} rows={4} className={campo} />
            </div>

            <div>
              <label className={rotulo}>Endereço ou local relacionado</label>
              <input value={form.endereco} onChange={e => set("endereco", e.target.value)} className={campo} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={rotulo}>Data do pedido</label>
                <input type="date" value={form.dataPedido} onChange={e => set("dataPedido", e.target.value)} className={campo} />
              </div>
              <div>
                <label className={rotulo}>Prazo (opcional)</label>
                <input type="date" value={form.prazo} onChange={e => set("prazo", e.target.value)} className={campo} />
              </div>
              <div>
                <label className={rotulo}>Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={campo}>
                  {STATUS_PEDIDO.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={rotulo} title="Número de 1 a 5, para referência interna">Referência interna (1 a 5)</label>
                <select value={form.referencia} onChange={e => set("referencia", e.target.value)} className={campo}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={String(n)}>{n}</option>)}
                </select>
              </div>
            </div>

            {atual?.dataFechamento && <p className="text-xs text-gray-500">Fechado em {fmtData(atual.dataFechamento)}</p>}
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={salvando}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#8B0000" }}>
                {salvando ? "Salvando…" : selecionado ? "Salvar alterações" : "Criar pedido"}
              </button>
              {selecionado && (
                <button type="button" onClick={excluir}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-300 text-red-700 hover:bg-red-50">
                  Excluir pedido
                </button>
              )}
            </div>
            </fieldset>
          </form>

          {/* andamentos */}
          {selecionado && atual && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h2 className="font-bold text-gray-800">Andamentos</h2>
              {podeCadastrar && <form onSubmit={lancarAndamento} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end bg-gray-50 rounded-lg p-3">
                <div className="sm:col-span-1">
                  <label className={rotulo}>Data</label>
                  <input type="date" value={andData} onChange={e => setAndData(e.target.value)} className={campo} />
                </div>
                <div className="sm:col-span-3">
                  <label className={rotulo}>Descrição do andamento</label>
                  <input value={andDesc} onChange={e => setAndDesc(e.target.value)} className={campo} placeholder="O que foi feito ou respondido" />
                </div>
                <div className="sm:col-span-1">
                  <label className={rotulo}>Novo status</label>
                  <select value={andStatus} onChange={e => setAndStatus(e.target.value)} className={campo}>
                    <option value="">sem mudança</option>
                    {STATUS_PEDIDO.filter(s => s !== atual.status).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button type="submit" className="sm:col-span-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700">
                  Lançar
                </button>
              </form>}
              {andErro && <p className="text-sm text-red-600">{andErro}</p>}

              {atual.andamentos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum andamento lançado.</p>
              ) : (
                <ol className="space-y-2">
                  {/* ordem decrescente: o mais recente primeiro */}
                  {atual.andamentos.map(a => (
                    <li key={a.id} className="flex items-start justify-between gap-3 border border-gray-200 rounded-lg p-2.5">
                      <div>
                        <p className="text-xs text-gray-500">
                          <b className="text-gray-700">{fmtData(a.data)}</b>
                          {a.status && <span className={`ml-2 px-2 py-0.5 rounded-full font-semibold border ${STATUS_COR[a.status] || ""}`}>→ {a.status}</span>}
                        </p>
                        <p className="text-sm text-gray-800 mt-0.5">{a.descricao}</p>
                      </div>
                      {podeCadastrar && <button onClick={() => excluirAndamento(a.id)} className="text-xs text-red-600 hover:text-red-800 font-semibold">Excluir</button>}
                    </li>
                  ))}
                  <li className="text-xs text-gray-400 px-1">
                    Pedido registrado em {fmtData(atual.dataPedido)}
                  </li>
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// semelhante a um <select>, mas deixa digitar para filtrar o nome (os vereadores já estão cadastrados)
function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function SeletorVereador({ vereadores, valor, onChange, className }: {
  vereadores: any[]; valor: string; onChange: (id: string) => void; className: string
}) {
  const [texto, setTexto] = useState("")
  const [aberto, setAberto] = useState(false)
  const selecionado = vereadores.find(v => v.id === valor)

  // mostra o nome do vereador escolhido quando o campo não está sendo editado
  useEffect(() => { if (!aberto) setTexto(selecionado?.nome || "") }, [valor, aberto, selecionado])

  const q = semAcento(texto)
  const opcoes = vereadores.filter(v => !q || (selecionado && texto === selecionado.nome) || semAcento(v.nome + " " + (v.apelido || "")).includes(q))

  return (
    <div className="relative">
      <input
        value={texto}
        placeholder="Digite o nome para filtrar…"
        className={className}
        onFocus={e => { setAberto(true); e.currentTarget.select() }}
        onChange={e => { setTexto(e.target.value); setAberto(true); if (valor) onChange("") }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
      />
      {aberto && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
          {opcoes.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Nenhum vereador encontrado</li>
          ) : opcoes.map(v => (
            <li key={v.id}>
              <button type="button"
                onMouseDown={e => { e.preventDefault(); onChange(v.id); setTexto(v.nome); setAberto(false) }}
                className={`w-full text-left px-3 py-1.5 hover:bg-red-50 ${v.id === valor ? "bg-red-50 font-semibold" : ""}`}>
                {v.nome}{v.apelido ? <span className="text-xs text-gray-400"> · {v.apelido}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
