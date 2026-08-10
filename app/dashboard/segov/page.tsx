'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { exportarSegovExcel, exportarSegovPDF, COLUNAS_RELATORIO, type ColunasKey } from '@/lib/segov-export'
import { useTopbar } from '@/contexts/topbar'

const FLUXO_DEF = [
  { key: 'protocolado',         labelCurto: 'Prot.'    },
  { key: 'pautado',             labelCurto: 'Pautado'  },
  { key: 'comissao1',           labelCurto: 'Com. 1'   },
  { key: 'comissao2',           labelCurto: 'Com. 2'   },
  { key: 'comissao3',           labelCurto: 'Com. 3'   },
  { key: 'comissaoEspecial',    labelCurto: 'C. Esp.'  },
  { key: 'comissaoConjunta',    labelCurto: 'C. Conj.' },
  { key: 'dispensaParecer',     labelCurto: 'D. Par.'  },
  { key: 'dispensaIntersticio', labelCurto: 'D. Int.'  },
  { key: 'pedidoVista',         labelCurto: 'P. Vista' },
  { key: 'pedidoAdiamento',     labelCurto: 'P. Adj.'  },
  { key: 'emenda',              labelCurto: 'Emenda'    },
  { key: 'emendaVotacao1',      labelCurto: '1ª V. Emd.' },
  { key: 'emendaVotacao2',      labelCurto: '2ª V. Emd.' },
  { key: 'emendaResultado',     labelCurto: 'Res. Emd.'  },
  { key: 'votacao1',            labelCurto: '1ª Vot.'   },
  { key: 'votacao2',            labelCurto: '2ª Vot.'   },
  { key: 'resultadoFinal',      labelCurto: 'Resultado'  },
  { key: 'sancaoVeto',          labelCurto: 'Sanção/Veto' },
  { key: 'vetoManutencao',      labelCurto: 'V. Veto'    },
  { key: 'promulgacao',         labelCurto: 'Promul.'    },
]

const NEGATIVOS = new Set(['reprovado', 'vetado'])
const OPCOES_POR_CHAVE: Record<string, { valores: [string, string]; labels: [string, string] }> = {
  sancaoVeto: { valores: ['sancionado', 'vetado'], labels: ['Sancionado', 'Vetado'] },
  vetoManutencao: { valores: ['aprovado', 'reprovado'], labels: ['Manter Veto', 'Derrubar Veto'] },
}
function labelResultadoCurto(key: string, valor?: string) {
  if (!valor) return ''
  const { valores, labels } = OPCOES_POR_CHAVE[key] || { valores: ['aprovado', 'reprovado'], labels: ['Aprov.', 'Reprov.'] }
  const i = valores.indexOf(valor)
  return i >= 0 ? labels[i] : valor
}

function fmtFluxoData(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function normalizarNome(nome: string) {
  return nome.replace(/\(.*?\)/g, '').replace(/[–—-]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Casa um fragmento de texto (ex: "Thiago Felipe de Almeida" ou "Cláudio José de Deus – Claudinho Valle")
// com um vereador cadastrado (ex: "Thiago Almeida") — exige mesmo primeiro nome e que o sobrenome
// do cadastro apareça em algum lugar do fragmento (tolera apelido colado depois de travessão)
function buscarVereadorPorNome(fragmento: string, lista: any[]) {
  const tokens = normalizarNome(fragmento).split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  const primeiro = tokens[0]
  return lista.find(v => {
    const vTokens = normalizarNome(v.nome).split(/\s+/).filter(Boolean)
    if (vTokens[0] !== primeiro) return false
    const sobrenome = vTokens[vTokens.length - 1]
    return sobrenome === primeiro || tokens.includes(sobrenome)
  }) || null
}

const STATUS_LIST = ['Aguardando', 'Com Parecer', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

const STATUS_COR: Record<string, string> = {
  'Aguardando':   'bg-yellow-100 text-yellow-800',
  'Com Parecer':  'bg-purple-100 text-purple-800',
  'Em análise':   'bg-blue-100 text-blue-800',
  'Aprovado':     'bg-green-100 text-green-800',
  'Rejeitado':    'bg-red-100 text-red-800',
  'Arquivado':    'bg-gray-100 text-gray-700',
  'Retirado':     'bg-orange-100 text-orange-800',
}

export default function SeggovPage() {
  const { setLeftContent, setRightContent } = useTopbar()
  const router = useRouter()
  const [itens, setItens] = useState<any[]>([])
  const [vereadores, setVereadores] = useState<any[]>([])
  const [tiposProposicao, setTiposProposicao] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState(false)
  const [menuRelatorios, setMenuRelatorios] = useState(false)
  const [modalRelatorio, setModalRelatorio] = useState(false)
  const [formatoRelatorio, setFormatoRelatorio] = useState<'excel' | 'pdf'>('excel')
  const [colunasSel, setColunasSel] = useState<Set<ColunasKey>>(
    new Set(COLUNAS_RELATORIO.map(c => c.key))
  )

  // Filtros por coluna (busca livre, aplicados sobre os itens já carregados)
  const [colProposicao, setColProposicao] = useState('')
  const [colEmenta, setColEmenta] = useState('')
  const [colVereador, setColVereador] = useState('')
  const [colStatus, setColStatus] = useState('')
  const [colTipo, setColTipo] = useState('')

  async function carregar() {
    setLoading(true)
    setSelecionados(new Set())
    const res = await fetch('/api/segov')
    setItens(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo').then(r => r.json()).then(setVereadores)
    fetch('/api/config-opcoes?tipo=tipo_proposicao').then(r => r.json()).then(setTiposProposicao)
    carregar()
  }, [])

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
        itensExibidos.forEach(i => next.delete(i.id))
        return next
      })
    } else {
      setSelecionados(prev => new Set([...Array.from(prev), ...itensExibidos.map(i => i.id)]))
    }
  }

  async function excluirSelecionados() {
    if (!confirm(`Excluir ${selecionados.size} item(s) selecionado(s)?`)) return
    setExcluindo(true)
    await Promise.all(Array.from(selecionados).map(id => fetch(`/api/segov/${id}`, { method: 'DELETE' })))
    setExcluindo(false)
    carregar()
  }

  function passaFiltrosBase(item: any, exceto?: 'status' | 'tipo') {
    if (colProposicao) {
      const ref = `${item.tipo} ${item.numero}/${item.ano}`.toLowerCase()
      if (!ref.includes(colProposicao.toLowerCase())) return false
    }
    if (colEmenta && !(item.ementa || '').toLowerCase().includes(colEmenta.toLowerCase())) return false
    if (colVereador) {
      const nome = (item.vereador?.nome || item.autorNome || '').toLowerCase()
      if (!nome.includes(colVereador.toLowerCase())) return false
    }
    if (exceto !== 'status' && colStatus && item.status !== colStatus) return false
    if (exceto !== 'tipo' && colTipo && item.tipo !== colTipo) return false
    return true
  }

  const itensExibidos = useMemo(() => itens.filter(item => passaFiltrosBase(item)),
    [itens, colProposicao, colEmenta, colVereador, colStatus, colTipo])

  const contagemPorStatus = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(item => { if (passaFiltrosBase(item, 'status')) mapa[item.status] = (mapa[item.status] || 0) + 1 })
    return mapa
  }, [itens, colProposicao, colEmenta, colVereador, colTipo])

  const contagemPorTipo = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(item => { if (passaFiltrosBase(item, 'tipo')) mapa[item.tipo] = (mapa[item.tipo] || 0) + 1 })
    return mapa
  }, [itens, colProposicao, colEmenta, colVereador, colStatus])

  const filtrosColunaAtivos = colProposicao || colEmenta || colVereador || colStatus || colTipo

  function limparFiltrosColuna() {
    setColProposicao(''); setColEmenta(''); setColVereador(''); setColStatus(''); setColTipo('')
  }

  const todosSelecionados = itensExibidos.length > 0 && itensExibidos.every(i => selecionados.has(i.id))
  const algunsSelecionados = itensExibidos.some(i => selecionados.has(i.id)) && !todosSelecionados

  const itensParaExportar = selecionados.size > 0
    ? itensExibidos.filter(i => selecionados.has(i.id))
    : itensExibidos

  // Injeta título + botões no topbar global
  useEffect(() => {
    const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-normal leading-5 transition"
    setLeftContent(
      <div className="flex items-center justify-between w-full pr-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Secretaria de Governo</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/segov/novo"
            className={`${btn} text-white`}
            style={{ background: '#8B0000' }}>
            + Nova Proposição
          </Link>
          <Link href="/dashboard/segov/importar"
            className={`${btn} text-white bg-green-600 hover:bg-green-700`}>
            Importar Pauta
          </Link>
          <button onClick={() => setModalRelatorio(true)}
            className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>
            {selecionados.size > 0 ? `Relatório (${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''})` : 'Relatórios'}
          </button>
        </div>
      </div>
    )
    return () => setLeftContent(null)
  }, [itensExibidos, selecionados])

  // Botão Excluir no lado direito do topbar (antes do Atualizar)
  useEffect(() => {
    if (selecionados.size === 0) {
      setRightContent(null)
      return
    }
    setRightContent(
      <button onClick={excluirSelecionados} disabled={excluindo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-normal leading-5 text-white bg-red-400 hover:bg-red-500 transition disabled:opacity-60">
        {excluindo
          ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        }
        Excluir {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
      </button>
    )
    return () => setRightContent(null)
  }, [selecionados, excluindo])

  function toggleColuna(key: ColunasKey) {
    setColunasSel(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function exportar() {
    const cols = COLUNAS_RELATORIO.map(c => c.key).filter(k => colunasSel.has(k))
    if (cols.length === 0) return
    if (formatoRelatorio === 'excel') exportarSegovExcel(itensParaExportar, cols, 'segov.xlsx')
    else exportarSegovPDF(itensParaExportar, cols, 'segov.pdf')
    setModalRelatorio(false)
  }

  return (
    <div className="space-y-2">

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2 items-center flex-wrap sticky top-0 z-10">
        {filtrosColunaAtivos && (
          <button onClick={limparFiltrosColuna} title="Limpar filtros"
            className="text-gray-400 hover:text-red-600 transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <input value={colProposicao} onChange={e => setColProposicao(e.target.value)}
          placeholder="Buscar nº..."
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-28" />
        <input value={colEmenta} onChange={e => setColEmenta(e.target.value)}
          placeholder="Buscar palavra na ementa..."
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 flex-1 min-w-[180px]" />
        <input value={colVereador} onChange={e => setColVereador(e.target.value)}
          placeholder="Buscar vereador..."
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-36" />
        <select value={colTipo} onChange={e => setColTipo(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-48">
          <option value="">Todos os tipos ({Object.values(contagemPorTipo).reduce((a, b) => a + b, 0)})</option>
          {tiposProposicao.map(t => <option key={t.id} value={t.nome}>{t.nome} ({contagemPorTipo[t.nome] || 0})</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <input type="checkbox"
            checked={todosSelecionados}
            ref={el => { if (el) el.indeterminate = algunsSelecionados }}
            onChange={toggleTodos}
            className="w-4 h-4 accent-red-800 cursor-pointer" />
          <span className="text-xs text-gray-500">
            {!loading && `${itensExibidos.length}${filtrosColunaAtivos && itensExibidos.length !== itens.length ? ` de ${itens.length}` : ''} item(s)`}
          </span>
          {selecionados.size > 0 && (
            <button onClick={() => setSelecionados(new Set())}
              className="text-xs text-red-600 font-medium hover:underline">
              · {selecionados.size} selecionado(s) ✕
            </button>
          )}
        </div>
      </div>

      {/* Facetas de status */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex gap-1.5 items-center flex-wrap">
        <button onClick={() => setColStatus('')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
            colStatus === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}>
          Todos ({Object.values(contagemPorStatus).reduce((a, b) => a + b, 0)})
        </button>
        {STATUS_LIST.map(s => {
          const ativo = colStatus === s
          const cor = STATUS_COR[s]
          return (
            <button key={s} onClick={() => setColStatus(ativo ? '' : s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                ativo ? `${cor} border-transparent ring-2 ring-offset-1 ring-gray-300` : `${cor} border-transparent opacity-60 hover:opacity-100`
              }`}>
              {s} ({contagemPorStatus[s] || 0})
            </button>
          )
        })}
      </div>

      {/* Lista de cards */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : itens.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">Nenhum item encontrado</p>
          <p className="text-sm mt-1">Cadastre um novo item ou ajuste os filtros</p>
        </div>
      ) : itensExibidos.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200 text-sm">
          Nenhum item corresponde aos filtros.{' '}
          <button onClick={limparFiltrosColuna} className="text-red-700 hover:underline">Limpar filtros</button>
        </div>
      ) : (
        <div className="space-y-2">
          {itensExibidos.map((item: any) => {
            const sel = selecionados.has(item.id)
            const fluxo = (item.fluxo || {}) as Record<string, { done: boolean; doneAt?: string; data?: any }>
            const marcados = FLUXO_DEF
              .filter(d => fluxo[d.key]?.done)
              .map(d => ({ ...d, doneAt: fluxo[d.key]?.doneAt, data: fluxo[d.key]?.data }))
            const graficoCor: 'verde' | 'vermelho' | 'normal' =
              fluxo['resultadoFinal']?.done
                ? fluxo['resultadoFinal'].data?.resultado === 'aprovado' ? 'verde' : 'vermelho'
                : 'normal'
            const pautadoDoneAt = fluxo['pautado']?.doneAt
            const diasAberto = pautadoDoneAt
              ? Math.floor((Date.now() - new Date(pautadoDoneAt).getTime()) / 86400000)
              : null

            return (
              <div key={item.id}
                className={`rounded-xl border-2 transition-all ${sel ? 'border-green-400 bg-green-50' : 'border-green-200 bg-white hover:border-green-300'}`}>
                {/* Cabeçalho do card */}
                <div className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => router.push(`/dashboard/segov/${item.id}/editar`)}>
                  <div onClick={e => e.stopPropagation()} className="mt-0.5 flex-shrink-0">
                    <input type="checkbox" checked={sel} onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 accent-red-800 cursor-pointer" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo, número, status, datas */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-red-100 text-red-800 rounded px-1.5 py-0.5 font-medium">{item.tipo}</span>
                      <span className="font-bold text-gray-800">{item.numero}/{item.ano}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COR[item.status] || 'bg-gray-100 text-gray-700'}`}>
                        {item.status}
                      </span>
                      {pautadoDoneAt && (
                        <span className="text-xs text-gray-400">Pautado: {new Date(pautadoDoneAt).toLocaleDateString('pt-BR')}</span>
                      )}
                      {diasAberto !== null && (
                        <span className={`text-xs font-bold ${diasAberto > 30 ? 'text-red-600' : diasAberto > 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {diasAberto} dias em aberto
                        </span>
                      )}
                    </div>
                    {/* Ementa */}
                    <p className="text-sm text-gray-600 mt-1.5 leading-snug">{item.ementa}</p>
                    {/* Autores */}
                    {(() => {
                      const fragmentos: string[] = []
                      if (item.vereador?.nome) fragmentos.push(item.vereador.nome)
                      if (item.autorNome) {
                        ;(item.autorNome as string).split(/\s+e\s+|,\s+/).forEach((n: string) => {
                          const t = n.trim()
                          if (t) fragmentos.push(t)
                        })
                      }
                      // Casa cada fragmento com o cadastro de vereador e mostra o apelido
                      // (evita duplicar quem aparece com nome completo e nome curto na mesma proposição)
                      const vistos = new Set<string>()
                      const labels: string[] = []
                      fragmentos.forEach(f => {
                        const v = buscarVereadorPorNome(f, vereadores)
                        const chave = v ? v.id : normalizarNome(f)
                        if (vistos.has(chave)) return
                        vistos.add(chave)
                        labels.push(v ? (v.apelido || v.nome.split(/\s+/)[0]) : f.split(/\s+/)[0])
                      })
                      if (!labels.length) return null
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {labels.map((nome, i) => (
                            <span key={i} className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{nome}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Gráfico de tramitação — idêntico à tela de edição */}
                {marcados.length > 0 && (
                  <div className="border-t border-green-100 px-4 pb-4 pt-3 overflow-x-auto cursor-pointer"
                    onClick={() => router.push(`/dashboard/segov/${item.id}/editar`)}>
                    <div className="flex items-start" style={{ gap: 0 }}>
                      {marcados.map((step, idx) => {
                        const isLast = idx === marcados.length - 1
                        return (
                        <div key={step.key} className="flex items-start flex-shrink-0">
                          <div className="flex flex-col items-center" style={{ minWidth: '56px' }}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
                              graficoCor === 'vermelho' ? 'bg-red-500' :
                              (graficoCor === 'normal' && isLast) ? 'bg-blue-500' :
                              'bg-green-500'
                            }`}>
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <p className={`text-xs font-semibold mt-1 text-center leading-tight px-1 ${
                              graficoCor === 'vermelho' ? 'text-red-700' :
                              (graficoCor === 'normal' && isLast) ? 'text-blue-600' :
                              'text-gray-700'
                            }`}>{step.labelCurto}</p>
                            <p className="text-xs text-gray-400 text-center mt-0.5">{fmtFluxoData(step.doneAt)}</p>
                            {step.data?.comissaoNome && (
                              <span className="mt-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium text-center">{step.data.comissaoNome}</span>
                            )}
                            {step.data?.resultado && (
                              <span className={`mt-1 text-xs px-1.5 py-0.5 rounded font-semibold text-center ${NEGATIVOS.has(step.data.resultado) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {labelResultadoCurto(step.key, step.data.resultado)}
                              </span>
                            )}
                            {step.data?.numero && (
                              <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center">
                                {step.data.emendaTipo ? `${step.data.emendaTipo} ` : ''}{step.data.numero}{step.data.ano ? `/${step.data.ano}` : ''}
                              </span>
                            )}
                            {step.data?.nome1 && !step.data?.comissaoNome && !step.data?.resultado && !step.data?.numero && (
                              <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center truncate max-w-[56px]">{step.data.nome1}</span>
                            )}
                          </div>
                          {idx < marcados.length - 1 && (
                            <div className="flex-shrink-0 mt-2.5">
                              <div className={`h-0.5 w-4 ${graficoCor === 'vermelho' ? 'bg-red-400' : 'bg-green-400'}`} />
                              <div className={`w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] -mt-[2.5px] ml-4 ${graficoCor === 'vermelho' ? 'border-l-red-400' : 'border-l-green-400'}`} />
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
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
              {/* Formato */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formato</p>
                <div className="flex gap-3">
                  {(['excel', 'pdf'] as const).map(f => (
                    <button key={f} onClick={() => setFormatoRelatorio(f)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                        formatoRelatorio === f
                          ? 'border-red-800 bg-red-50 text-red-800'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {f === 'excel' ? '📊 Excel (.xlsx)' : '📄 PDF'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colunas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Colunas</p>
                  <div className="flex gap-3">
                    <button onClick={() => setColunasSel(new Set(COLUNAS_RELATORIO.map(c => c.key)))}
                      className="text-xs text-blue-600 hover:underline">Todas</button>
                    <button onClick={() => setColunasSel(new Set())}
                      className="text-xs text-gray-400 hover:underline">Limpar</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {COLUNAS_RELATORIO.map(col => (
                    <label key={col.key}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                      <input type="checkbox" checked={colunasSel.has(col.key)}
                        onChange={() => toggleColuna(col.key)}
                        className="w-4 h-4 accent-red-800" />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                {itensExibidos.length} item(ns) serão exportados
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalRelatorio(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={exportar} disabled={colunasSel.size === 0}
                className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: '#8B0000' }}>
                Exportar {formatoRelatorio === 'excel' ? 'Excel' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
