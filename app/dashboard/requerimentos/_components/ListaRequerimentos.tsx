'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolverAutores, situacaoAutores, ehPoderExecutivo } from '@/lib/vereador-match'
import FiltroSituacaoAutor, { SituacaoAutor } from '@/app/components/FiltroSituacaoAutor'
import FiltroVereadorSelect from '@/app/components/FiltroVereadorSelect'
import FiltroPoder, { Poder } from '@/app/components/FiltroPoder'
import { usePermissao } from '@/lib/usePermissao'
import {
  exportarRequerimentosExcel, exportarRequerimentosPDF, COLUNAS_RELATORIO_REQ, type ColunasKeyReq,
} from '@/lib/requerimentos-export'

type Item = {
  id: string; numero: string; ano: number; tipo: string; descricao: string
  status: string; dataEnvio: string | null; autorNome: string | null
  fluxo: Record<string, { done: boolean; doneAt?: string; data?: any }> | null
  vereador: { id: string; nome: string; apelido?: string | null } | null
}
type Vereador = { id: string; nome: string; apelido?: string | null; ativo?: boolean }

const TIPO_LABEL_PADRAO: Record<string, string> = { REQ: 'Requerimento', MOC: 'Moção', IND: 'Indicação' }
const STATUS_LIST = ['Aguardando', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']
const STATUS_CHIP: Record<string, string> = {
  'Aguardando':  'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Em análise':  'bg-blue-50 text-blue-700 border-blue-200',
  'Aprovado':    'bg-green-50 text-green-700 border-green-200',
  'Rejeitado':   'bg-red-50 text-red-700 border-red-200',
  'Arquivado':   'bg-gray-50 text-gray-500 border-gray-200',
  'Retirado':    'bg-orange-50 text-orange-700 border-orange-200',
}
const STATUS_COR: Record<string, string> = {
  'Aguardando':  'bg-yellow-100 text-yellow-800',
  'Em análise':  'bg-blue-100 text-blue-800',
  'Aprovado':    'bg-green-100 text-green-800',
  'Rejeitado':   'bg-red-100 text-red-800',
  'Arquivado':   'bg-gray-100 text-gray-700',
  'Retirado':    'bg-orange-100 text-orange-800',
}

const FLUXO_DEF = [
  { key: 'protocolado', labelCurto: 'Prot.' },
  { key: 'pautado', labelCurto: 'Pautado' },
  { key: 'leituraVotacao', labelCurto: 'Leitura/Vot.' },
  { key: 'resultado', labelCurto: 'Resultado' },
]

function fmtNumero(n: string) {
  return n.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function fmtData(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

type Props = {
  titulo: string
  subtitulo: string
  /** Modo 'apenas': mostra só os tipos em tiposFiltro. Modo 'todos-exceto': mostra todos os tipos configurados, exceto os em tiposFiltro. */
  modo: 'apenas' | 'todos-exceto'
  tiposFiltro: string[]
  novoHref: string
  editarHrefBase: string
  corPrimaria?: string
}

export default function ListaRequerimentos({ titulo, subtitulo, modo, tiposFiltro, novoHref, editarHrefBase, corPrimaria = '#8B0000' }: Props) {
  const router = useRouter()
  const podeCriar = usePermissao('podeCriar')
  const podeEditar = usePermissao('podeEditar')
  const podeExcluir = usePermissao('podeExcluir')
  const podeExportar = usePermissao('podeExportar')
  const [itens, setItens] = useState<Item[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState(false)
  const [modalRelatorio, setModalRelatorio] = useState(false)
  const [formatoRelatorio, setFormatoRelatorio] = useState<'excel' | 'pdf'>('pdf')
  const [colunasSel, setColunasSel] = useState<Set<ColunasKeyReq>>(
    new Set(COLUNAS_RELATORIO_REQ.map(c => c.key))
  )
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroVereadorId, setFiltroVereadorId] = useState('')
  const [filtroAno, setFiltroAno] = useState('')
  const [filtroSituacaoAutor, setFiltroSituacaoAutor] = useState<SituacaoAutor>('ativos')
  const [filtroPoder, setFiltroPoder] = useState<Poder>('')
  const [loading, setLoading] = useState(true)
  const [tipoLabel, setTipoLabel] = useState<Record<string, string>>(TIPO_LABEL_PADRAO)
  const [tiposExibidos, setTiposExibidos] = useState<string[]>(modo === 'apenas' ? tiposFiltro : [])
  const [vereadores, setVereadores] = useState<Vereador[]>([])

  const vereadoresParaFiltro = useMemo(() => vereadores.filter(v =>
    filtroSituacaoAutor === 'todos' ? true : filtroSituacaoAutor === 'ativos' ? v.ativo !== false : v.ativo === false
  ), [vereadores, filtroSituacaoAutor])

  useEffect(() => {
    if (filtroVereadorId && !vereadoresParaFiltro.some(v => v.id === filtroVereadorId)) setFiltroVereadorId('')
  }, [vereadoresParaFiltro]) // eslint-disable-line react-hooks/exhaustive-deps

  const mostrarFiltroTipo = tiposExibidos.length > 1

  async function carregar(codigosExibidos: string[]) {
    const res = await fetch('/api/requerimentos')
    const todos: Item[] = await res.json()
    setItens(todos.filter(i => codigosExibidos.includes(i.tipo)))
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo&ativo=false').then(r => r.json()).then(setVereadores)
    fetch('/api/config-opcoes?tipo=tipo_requerimento').then(r => r.json()).then((opcoes: { nome: string; codigo: string | null }[]) => {
      const labels: Record<string, string> = {}
      const codigos: string[] = []
      opcoes.forEach(o => { if (o.codigo) { labels[o.codigo] = o.nome; codigos.push(o.codigo) } })
      setTipoLabel(prev => ({ ...prev, ...labels }))
      const exibidos = modo === 'apenas' ? tiposFiltro : codigos.filter(c => !tiposFiltro.includes(c))
      setTiposExibidos(exibidos)
      carregar(exibidos)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(id: string) {
    if (!confirm('Excluir este item?')) return
    await fetch(`/api/requerimentos/${id}`, { method: 'DELETE' })
    carregar(tiposExibidos)
  }

  function toggleItem(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(prev => {
        const next = new Set(prev)
        filtrados.forEach(i => next.delete(i.id))
        return next
      })
    } else {
      setSelecionados(prev => new Set([...Array.from(prev), ...filtrados.map(i => i.id)]))
    }
  }

  async function excluirSelecionados() {
    if (!confirm(`Excluir ${selecionados.size} item(s) selecionado(s)?`)) return
    setExcluindo(true)
    await Promise.all(Array.from(selecionados).map(id => fetch(`/api/requerimentos/${id}`, { method: 'DELETE' })))
    setExcluindo(false)
    setSelecionados(new Set())
    carregar(tiposExibidos)
  }

  function toggleColuna(key: ColunasKeyReq) {
    setColunasSel(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function exportar() {
    const itensParaExportar = selecionados.size > 0
      ? filtrados.filter(i => selecionados.has(i.id))
      : filtrados
    if (formatoRelatorio === 'excel') {
      const cols = COLUNAS_RELATORIO_REQ.map(c => c.key).filter(k => colunasSel.has(k))
      if (cols.length === 0) return
      exportarRequerimentosExcel(itensParaExportar, cols, `${titulo.toLowerCase()}.xlsx`)
    } else {
      exportarRequerimentosPDF(itensParaExportar, titulo, corPrimaria, `${titulo.toLowerCase()}.pdf`)
    }
    setModalRelatorio(false)
  }

  function passaFiltrosBase(i: Item, exceto?: 'status' | 'tipo') {
    if (exceto !== 'tipo' && filtroTipo && i.tipo !== filtroTipo) return false
    if (exceto !== 'status' && filtroStatus && i.status !== filtroStatus) return false
    if (busca) {
      const alvo = `${i.tipo} ${i.numero} ${i.descricao} ${i.autorNome || ''}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    if (filtroPoder) {
      const exec = ehPoderExecutivo(i)
      if (filtroPoder === 'executivo' && !exec) return false
      if (filtroPoder === 'legislativo' && exec) return false
    }
    if (filtroVereadorId || filtroSituacaoAutor !== 'todos') {
      const autores = resolverAutores(i.vereador, i.autorNome, vereadores)
      if (filtroVereadorId && !autores.some(a => a.vereadorId === filtroVereadorId)) return false
      if (filtroSituacaoAutor !== 'todos' && situacaoAutores(autores) !== filtroSituacaoAutor) return false
    }
    if (filtroAno && String(i.ano) !== filtroAno) return false
    return true
  }

  const anosDisponiveis = useMemo(
    () => Array.from(new Set(itens.map(i => i.ano))).sort((a, b) => b - a),
    [itens]
  )

  const contagemPorStatus = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(i => { if (passaFiltrosBase(i, 'status')) mapa[i.status] = (mapa[i.status] || 0) + 1 })
    return mapa
  }, [itens, busca, filtroTipo, filtroVereadorId, filtroAno, filtroSituacaoAutor, filtroPoder, vereadores]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => itens.filter(i => passaFiltrosBase(i)),
    [itens, busca, filtroTipo, filtroStatus, filtroVereadorId, filtroAno, filtroSituacaoAutor, filtroPoder, vereadores])

  const todosSelecionados = filtrados.length > 0 && filtrados.every(i => selecionados.has(i.id))
  const algunsSelecionados = filtrados.some(i => selecionados.has(i.id)) && !todosSelecionados

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{titulo}</h1>
          <p className="text-sm text-gray-500">{subtitulo} — {itens.length} registro(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {selecionados.size > 0 && podeExcluir && (
            <button onClick={excluirSelecionados} disabled={excluindo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-red-400 hover:bg-red-500 transition disabled:opacity-60">
              {excluindo
                ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              }
              Excluir {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
            </button>
          )}
          {podeExportar && (
            <button onClick={() => setModalRelatorio(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition">
              {selecionados.size > 0 ? `Relatório (${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''})` : 'Gerar Relatório'}
            </button>
          )}
          {podeCriar && (
            <Link href={novoHref}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
              style={{ background: corPrimaria }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-1.5 items-center flex-nowrap overflow-x-auto">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por número, descrição..."
          className="flex-1 min-w-[140px] border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30" />
        <FiltroPoder value={filtroPoder} onChange={setFiltroPoder} className="flex-shrink-0" />
        <FiltroVereadorSelect vereadores={vereadoresParaFiltro} value={filtroVereadorId} onChange={setFiltroVereadorId} className="w-32 flex-shrink-0" />
        <FiltroSituacaoAutor value={filtroSituacaoAutor} onChange={setFiltroSituacaoAutor} className="flex-shrink-0" />
        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-16 flex-shrink-0">
          <option value="">Ano</option>
          {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {mostrarFiltroTipo && (
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 flex-shrink-0">
            <option value="">Todos os tipos</option>
            {tiposExibidos.map(t => <option key={t} value={t}>{tipoLabel[t] || t}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          <input type="checkbox"
            checked={todosSelecionados}
            ref={el => { if (el) el.indeterminate = algunsSelecionados }}
            onChange={toggleTodos}
            className="w-4 h-4 cursor-pointer" style={{ accentColor: corPrimaria }} />
          <span className="text-xs text-gray-400">{filtrados.length} de {itens.length} item(s)</span>
          {selecionados.size > 0 && (
            <button onClick={() => setSelecionados(new Set())}
              className="text-xs font-medium hover:underline" style={{ color: corPrimaria }}>
              · {selecionados.size} selecionado(s) ✕
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex gap-1.5 items-center flex-wrap">
        <button onClick={() => setFiltroStatus('')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
            filtroStatus === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}>
          Todos ({Object.values(contagemPorStatus).reduce((a, b) => a + b, 0)})
        </button>
        {STATUS_LIST.map(s => {
          const ativo = filtroStatus === s
          const cor = STATUS_COR[s]
          return (
            <button key={s} onClick={() => setFiltroStatus(ativo ? '' : s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                ativo ? `${cor} border-transparent ring-2 ring-offset-1 ring-gray-300` : `${cor} border-transparent opacity-60 hover:opacity-100`
              }`}>
              {s} ({contagemPorStatus[s] || 0})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(item => {
            const fluxo = item.fluxo || {}
            const marcados = FLUXO_DEF.filter(d => fluxo[d.key]?.done)
            const resultado = fluxo['resultado']?.data?.resultado
            const corResultado = resultado === 'reprovado' ? 'vermelho' : resultado === 'aprovado' ? 'verde' : 'normal'
            const sel = selecionados.has(item.id)

            return (
              <div key={item.id}
                className={`bg-white rounded-xl border-2 transition ${sel ? 'border-blue-300' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-start gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => router.push(`${editarHrefBase}/${item.id}/editar`)}>
                  <input type="checkbox" checked={sel} onClick={e => e.stopPropagation()} onChange={() => toggleItem(item.id)}
                    className="w-4 h-4 mt-1 cursor-pointer flex-shrink-0" style={{ accentColor: corPrimaria }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {mostrarFiltroTipo && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 rounded px-1.5 py-0.5 font-medium">{item.tipo}</span>
                      )}
                      <span className="font-bold text-gray-800 text-sm">{fmtNumero(item.numero)}/{item.ano}</span>
                      <span className={`text-xs font-medium border px-2 py-0.5 rounded ${STATUS_CHIP[item.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{item.descricao}</p>
                    {(() => {
                      const autores = resolverAutores(item.vereador, item.autorNome, vereadores)
                      if (!autores.length) return null
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                          <span className="text-xs font-semibold text-gray-400">
                            {autores.length} autor{autores.length > 1 ? 'es' : ''}:
                          </span>
                          {autores.map((a, i) => (
                            <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded ${
                              a.ativo ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 bg-gray-100'
                            }`}>
                              {a.label}{!a.ativo && ' (inativo)'}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {podeEditar && (
                      <button onClick={() => router.push(`${editarHrefBase}/${item.id}/editar`)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {podeExcluir && (
                      <button onClick={() => excluir(item.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {marcados.length > 0 && (
                  <div className="border-t border-gray-100 px-5 pb-3 pt-2 flex gap-3 flex-wrap">
                    {marcados.map((d, idx) => (
                      <div key={d.key} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          corResultado === 'vermelho' ? 'bg-red-500' : corResultado === 'verde' ? 'bg-green-500' : 'bg-blue-400'
                        }`} />
                        <span className="text-xs text-gray-600">{d.labelCurto}</span>
                        <span className="text-xs text-gray-400">{fmtData(fluxo[d.key]?.doneAt)}</span>
                        {idx < marcados.length - 1 && <span className="text-gray-300">→</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de seleção de colunas para relatório */}
      {modalRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">Configurar Relatório</h2>
              <button onClick={() => setModalRelatorio(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formato</p>
                <div className="flex gap-3">
                  {(['excel', 'pdf'] as const).map(f => (
                    <button key={f} onClick={() => setFormatoRelatorio(f)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                        formatoRelatorio === f
                          ? 'text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                      style={formatoRelatorio === f ? { borderColor: corPrimaria, background: `${corPrimaria}15`, color: corPrimaria } : {}}>
                      {f === 'excel' ? '📊 Excel (.xlsx)' : '📄 PDF (layout do sistema)'}
                    </button>
                  ))}
                </div>
              </div>

              {formatoRelatorio === 'excel' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Colunas</p>
                    <div className="flex gap-3">
                      <button onClick={() => setColunasSel(new Set(COLUNAS_RELATORIO_REQ.map(c => c.key)))}
                        className="text-xs text-blue-600 hover:underline">Todas</button>
                      <button onClick={() => setColunasSel(new Set())}
                        className="text-xs text-gray-400 hover:underline">Limpar</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {COLUNAS_RELATORIO_REQ.map(col => (
                      <label key={col.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                        <input type="checkbox" checked={colunasSel.has(col.key)}
                          onChange={() => toggleColuna(col.key)}
                          className="w-4 h-4" style={{ accentColor: corPrimaria }} />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formatoRelatorio === 'pdf' && (
                <p className="text-xs text-gray-500">
                  O PDF reproduz o mesmo cartão exibido na tela (número, status, descrição, autores e fluxo de tramitação).
                </p>
              )}

              <p className="text-xs text-gray-400">
                {(selecionados.size > 0 ? selecionados.size : filtrados.length)} item(ns) serão exportados
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalRelatorio(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={exportar} disabled={formatoRelatorio === 'excel' && colunasSel.size === 0}
                className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: corPrimaria }}>
                Exportar {formatoRelatorio === 'excel' ? 'Excel' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
