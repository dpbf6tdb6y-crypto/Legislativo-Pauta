'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolverAutores } from '@/lib/vereador-match'

type Item = {
  id: string; numero: string; ano: number; tipo: string; descricao: string
  status: string; dataEnvio: string | null; autorNome: string | null
  fluxo: Record<string, { done: boolean; doneAt?: string; data?: any }> | null
  vereador: { id: string; nome: string; apelido?: string | null } | null
}
type Vereador = { id: string; nome: string; apelido?: string | null }

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
  const [itens, setItens] = useState<Item[]>([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [tipoLabel, setTipoLabel] = useState<Record<string, string>>(TIPO_LABEL_PADRAO)
  const [tiposExibidos, setTiposExibidos] = useState<string[]>(modo === 'apenas' ? tiposFiltro : [])
  const [vereadores, setVereadores] = useState<Vereador[]>([])

  const mostrarFiltroTipo = tiposExibidos.length > 1

  async function carregar(codigosExibidos: string[]) {
    const res = await fetch('/api/requerimentos')
    const todos: Item[] = await res.json()
    setItens(todos.filter(i => codigosExibidos.includes(i.tipo)))
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo').then(r => r.json()).then(setVereadores)
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

  function passaFiltrosBase(i: Item, exceto?: 'status' | 'tipo') {
    if (exceto !== 'tipo' && filtroTipo && i.tipo !== filtroTipo) return false
    if (exceto !== 'status' && filtroStatus && i.status !== filtroStatus) return false
    if (busca) {
      const alvo = `${i.tipo} ${i.numero} ${i.descricao} ${i.autorNome || ''}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    return true
  }

  const contagemPorStatus = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(i => { if (passaFiltrosBase(i, 'status')) mapa[i.status] = (mapa[i.status] || 0) + 1 })
    return mapa
  }, [itens, busca, filtroTipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => itens.filter(i => {
    if (filtroTipo && i.tipo !== filtroTipo) return false
    if (filtroStatus && i.status !== filtroStatus) return false
    if (busca) {
      const alvo = `${i.tipo} ${i.numero} ${i.descricao} ${i.autorNome || ''}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    return true
  }), [itens, busca, filtroTipo, filtroStatus])

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{titulo}</h1>
          <p className="text-sm text-gray-500">{subtitulo} — {itens.length} registro(s)</p>
        </div>
        <Link href={novoHref}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ background: corPrimaria }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2 items-center flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por número, descrição, autor..."
          className="flex-1 min-w-[220px] border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30" />
        {mostrarFiltroTipo && (
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30">
            <option value="">Todos os tipos</option>
            {tiposExibidos.map(t => <option key={t} value={t}>{tipoLabel[t] || t}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtrados.length} de {itens.length} item(s)</span>
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

            return (
              <div key={item.id}
                className="bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 transition">
                <div className="flex items-start gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => router.push(`${editarHrefBase}/${item.id}/editar`)}>
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
                            <span key={i} className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{a.label}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`${editarHrefBase}/${item.id}/editar`)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => excluir(item.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
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
    </div>
  )
}
