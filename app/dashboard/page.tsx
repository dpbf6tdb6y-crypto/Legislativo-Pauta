'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardCharts from './DashboardCharts'
import FiltroSituacaoAutor, { SituacaoAutor } from '@/app/components/FiltroSituacaoAutor'
import FiltroPoder from '@/app/components/FiltroPoder'
import { resolverAutores, situacaoAutores, ehPoderExecutivo } from '@/lib/vereador-match'

const STATUS_LIST = [
  'Aguardando', 'Em análise', 'Aprovado', 'Sancionado', 'Promulgado', 'Rejeitado', 'Arquivado', 'Retirado',
] as const

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Aguardando':  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200'  },
  'Em análise':  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  'Aprovado':    { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200'   },
  'Sancionado':  { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200'    },
  'Promulgado':  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Rejeitado':   { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  'Arquivado':   { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200'    },
  'Retirado':    { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
}

const ANO_ATUAL = new Date().getFullYear()

type Item = {
  id: string; tipo: string; numero: string; ano: number; ementa?: string | null
  status: string; vereadorId: string | null; autorNome: string | null
  vereador: { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string } | null
}
type Vereador = { id: string; nome: string; apelido?: string | null; ativo: boolean; poder: string }
type TipoOpcao = { id: string; nome: string }

const isExec = ehPoderExecutivo

function resultadoDe(status: string): 'aprovado' | 'rejeitado' | 'tramitando' {
  if (status === 'Aprovado' || status === 'Sancionado' || status === 'Promulgado') return 'aprovado'
  if (status === 'Rejeitado') return 'rejeitado'
  return 'tramitando'
}

export default function DashboardPage() {
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [requerimentos, setRequerimentos] = useState<Item[]>([])
  const [vereadoresTodos, setVereadoresTodos] = useState<Vereador[]>([])
  const [tiposProposicao, setTiposProposicao] = useState<TipoOpcao[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroAno, setFiltroAno] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroVereadorIds, setFiltroVereadorIds] = useState<Set<string>>(new Set())
  const [filtroMateria, setFiltroMateria] = useState<'' | 'proposicao' | 'requerimento' | 'mocao'>('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<'' | 'executivo' | 'legislativo'>('')
  const [painelVereadorAberto, setPainelVereadorAberto] = useState(false)
  const [filtroSituacaoAutor, setFiltroSituacaoAutor] = useState<SituacaoAutor>('ativos')
  const [nomesVereadores, setNomesVereadores] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/segov').then(r => r.json()),
      fetch('/api/requerimentos').then(r => r.json()),
      fetch('/api/vereadores?ativo=false').then(r => r.json()),
      fetch('/api/config-opcoes?tipo=tipo_proposicao').then(r => r.json()),
    ]).then(([segov, req, vers, tipos]) => {
      setItens(segov)
      setRequerimentos(req)
      const legislativo = vers.filter((v: Vereador) => v.poder === 'legislativo' && !v.nome.startsWith('[Mesclado em '))
      setVereadoresTodos(legislativo)
      const nomes: Record<string, string> = {}
      legislativo.forEach((v: Vereador) => { nomes[v.id] = v.apelido || v.nome })
      setNomesVereadores(nomes)
      setTiposProposicao(tipos)
      setLoading(false)
    })
  }, [])

  const vereadoresAtivos = useMemo(() => vereadoresTodos.filter(v => v.ativo).length, [vereadoresTodos])

  const mapaVereadores = useMemo(
    () => new Map(vereadoresTodos.map(v => [v.id, v])),
    [vereadoresTodos])

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>()
    itens.forEach(i => { if (i.ano >= 2000 && i.ano <= ANO_ATUAL + 1) set.add(i.ano) })
    requerimentos.forEach(i => { if (i.ano >= 2000 && i.ano <= ANO_ATUAL + 1) set.add(i.ano) })
    return [...set].sort((a, b) => b - a)
  }, [itens, requerimentos])

  const vereadoresListados = useMemo(() => vereadoresTodos
    .filter(v => filtroSituacaoAutor === 'todos' ? true : filtroSituacaoAutor === 'ativos' ? v.ativo : !v.ativo)
    .sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome)),
    [vereadoresTodos, filtroSituacaoAutor])

  function toggleVereador(id: string) {
    setFiltroVereadorIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function passaSituacaoAutor(i: Item) {
    if (filtroSituacaoAutor === 'todos') return true
    const autores = resolverAutores(i.vereador, i.autorNome, vereadoresTodos)
    return situacaoAutores(autores) === filtroSituacaoAutor
  }

  // Autores de uma matéria que casam com alguém cadastrado em Configurações →
  // Vereadores/Executivo. Nome solto no texto (grafia antiga, vereador de
  // mandato anterior já excluído, "Mesa Diretora") não entra.
  function autoresIds(i: Item): string[] {
    return resolverAutores(i.vereador, i.autorNome, vereadoresTodos)
      .map(a => a.vereadorId)
      .filter((id): id is string => !!id)
  }

  const passaVereador = (i: Item) =>
    filtroVereadorIds.size === 0 || autoresIds(i).some(id => filtroVereadorIds.has(id))

  const itensFiltrados = useMemo(() => itens.filter(i => {
    if (filtroMateria === 'requerimento' || filtroMateria === 'mocao') return false
    if (filtroAno && String(i.ano) !== filtroAno) return false
    if (filtroTipo && i.tipo !== filtroTipo) return false
    if (filtroStatus && i.status !== filtroStatus) return false
    if (filtroOrigem === 'executivo' && !isExec(i)) return false
    if (filtroOrigem === 'legislativo' && isExec(i)) return false
    if (!passaVereador(i)) return false
    if (!passaSituacaoAutor(i)) return false
    return true
  }), [itens, filtroAno, filtroTipo, filtroStatus, filtroOrigem, filtroMateria, filtroVereadorIds, filtroSituacaoAutor, vereadoresTodos])

  const requerimentosFiltrados = useMemo(() => requerimentos.filter(i => {
    if (filtroMateria === 'proposicao') return false
    if (filtroMateria === 'requerimento' && i.tipo !== 'REQ') return false
    if (filtroMateria === 'mocao' && i.tipo !== 'MOC') return false
    if (filtroAno && String(i.ano) !== filtroAno) return false
    if (filtroStatus && i.status !== filtroStatus) return false
    if (filtroOrigem === 'executivo' && !isExec(i)) return false
    if (filtroOrigem === 'legislativo' && isExec(i)) return false
    if (!passaVereador(i)) return false
    if (!passaSituacaoAutor(i)) return false
    return true
  }), [requerimentos, filtroAno, filtroStatus, filtroOrigem, filtroMateria, filtroVereadorIds, filtroSituacaoAutor, vereadoresTodos])

  const stats = useMemo(() => {
    const total = itensFiltrados.length
    const totalReq = requerimentosFiltrados.filter(r => r.tipo === 'REQ').length
    const totalMoc = requerimentosFiltrados.filter(r => r.tipo === 'MOC').length
    const totalGeral = total + requerimentosFiltrados.length

    const porStatus: Record<string, number> = {}
    STATUS_LIST.forEach(s => { porStatus[s] = 0 })
    itensFiltrados.forEach(item => { porStatus[item.status] = (porStatus[item.status] || 0) + 1 })

    const porStatusReq: Record<string, number> = {}
    STATUS_LIST.forEach(s => { porStatusReq[s] = 0 })
    requerimentosFiltrados.forEach(item => { porStatusReq[item.status] = (porStatusReq[item.status] || 0) + 1 })

    let aprovadoFinal = 0, rejeitadoFinal = 0, tramitando = 0
    ;[...itensFiltrados, ...requerimentosFiltrados].forEach(item => {
      const r = resultadoDe(item.status)
      if (r === 'aprovado') aprovadoFinal++
      else if (r === 'rejeitado') rejeitadoFinal++
      else tramitando++
    })
    const decididas = aprovadoFinal + rejeitadoFinal
    const taxaAprovacao = decididas > 0 ? Math.round((aprovadoFinal / decididas) * 100) : null

    const executivoItens = itensFiltrados.filter(isExec)
    const totalExecutivo = executivoItens.length

    const porVereadorMap: Record<string, { total: number; ativo: boolean; nome: string }> = {}
    function contarAutoria(item: Item) {
      if (isExec(item)) return
      autoresIds(item).forEach(id => {
        const v = mapaVereadores.get(id)
        if (!v) return
        if (!porVereadorMap[id]) porVereadorMap[id] = { total: 0, ativo: v.ativo, nome: v.apelido || v.nome }
        porVereadorMap[id].total++
      })
    }
    itensFiltrados.forEach(contarAutoria)
    requerimentosFiltrados.forEach(contarAutoria)

    const porVereador = Object.entries(porVereadorMap)
      .map(([vereadorId, v]) => ({ nome: v.nome, total: v.total, ativo: v.ativo, vereadorId }))
      .sort((a, b) => b.total - a.total)

    const execStatus: Record<string, number> = {}
    executivoItens.forEach(item => { execStatus[item.status] = (execStatus[item.status] || 0) + 1 })
    const porStatusExecutivo = Object.entries(execStatus)
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total)

    const porTipoMap: Record<string, number> = {}
    itensFiltrados.forEach(item => { porTipoMap[item.tipo] = (porTipoMap[item.tipo] || 0) + 1 })
    const porTipo = Object.entries(porTipoMap)
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total)

    // Tendência por ano, separando Executivo de Vereadores
    const porAnoMap: Record<number, { executivo: number; vereadores: number }> = {}
    function contarAno(item: Item) {
      if (item.ano < 2000 || item.ano > ANO_ATUAL + 1) return
      if (!porAnoMap[item.ano]) porAnoMap[item.ano] = { executivo: 0, vereadores: 0 }
      if (isExec(item)) porAnoMap[item.ano].executivo++
      else porAnoMap[item.ano].vereadores++
    }
    itensFiltrados.forEach(contarAno)
    requerimentosFiltrados.forEach(contarAno)
    const porAno = Object.entries(porAnoMap)
      .map(([ano, v]) => ({ ano: Number(ano), executivo: v.executivo, vereadores: v.vereadores }))
      .sort((a, b) => a.ano - b.ano)

    const proposicoes = itensFiltrados.map(item => ({
      id: item.id,
      tipo: item.tipo,
      numero: item.numero,
      ano: item.ano,
      ementa: item.ementa || '',
      status: item.status,
      autorNome: item.autorNome || null,
      vereadorNome: item.vereador ? (item.vereador.apelido || item.vereador.nome) : null,
      autorIds: autoresIds(item),
      isExec: isExec(item),
    }))

    return {
      total, totalReq, totalMoc, totalGeral, porStatus, porStatusReq,
      aprovadoFinal, rejeitadoFinal, tramitando, taxaAprovacao,
      totalExecutivo, porVereador, porStatusExecutivo, porTipo, porAno, proposicoes,
      totalRequerimentos: requerimentosFiltrados.length,
    }
  }, [itensFiltrados, requerimentosFiltrados, vereadoresTodos, mapaVereadores])

  const filtrosAtivos = !!(filtroAno || filtroTipo || filtroVereadorIds.size > 0 || filtroMateria || filtroStatus || filtroOrigem || filtroSituacaoAutor !== 'ativos')

  function limparFiltros() {
    setFiltroAno(''); setFiltroTipo(''); setFiltroVereadorIds(new Set())
    setFiltroMateria(''); setFiltroStatus(''); setFiltroOrigem(''); setFiltroSituacaoAutor('ativos')
  }

  function toggleOrigem(o: typeof filtroOrigem) {
    setFiltroOrigem(prev => prev === o ? '' : o)
  }

  const MATERIA_LABEL: Record<string, string> = { proposicao: 'Proposições', requerimento: 'Requerimentos', mocao: 'Moções' }
  const ORIGEM_LABEL: Record<string, string> = { executivo: 'Executivo', legislativo: 'Legislativo' }

  type Chip = { label: string; onRemover: () => void }
  const chips: Chip[] = []
  if (filtroAno) chips.push({ label: `Ano: ${filtroAno}`, onRemover: () => setFiltroAno('') })
  if (filtroTipo) chips.push({ label: `Tipo: ${filtroTipo}`, onRemover: () => setFiltroTipo('') })
  if (filtroMateria) chips.push({ label: `Matéria: ${MATERIA_LABEL[filtroMateria]}`, onRemover: () => setFiltroMateria('') })
  if (filtroStatus) chips.push({ label: `Status: ${filtroStatus}`, onRemover: () => setFiltroStatus('') })
  if (filtroOrigem) chips.push({ label: `Origem: ${ORIGEM_LABEL[filtroOrigem]}`, onRemover: () => setFiltroOrigem('') })
  if (filtroVereadorIds.size > 0) {
    const nomes = [...filtroVereadorIds].map(id => nomesVereadores[id] || '?').join(', ')
    chips.push({ label: `Vereador: ${nomes}`, onRemover: () => setFiltroVereadorIds(new Set()) })
  }
  if (filtroSituacaoAutor !== 'ativos') {
    chips.push({ label: `Autores: ${filtroSituacaoAutor === 'inativos' ? 'Inativos' : 'Todos'}`, onRemover: () => setFiltroSituacaoAutor('ativos') })
  }

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
        <span className="text-gray-400 text-sm">— Visão geral do sistema legislativo</span>
      </div>

      {/* Breadcrumb de filtros ativos */}
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs font-medium bg-gray-800 text-white pl-2 pr-1 py-1 rounded-full">
              {c.label}
              <button onClick={c.onRemover} className="hover:bg-white/20 rounded-full p-0.5 transition">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button onClick={limparFiltros} className="text-xs text-gray-500 hover:text-red-600 font-medium underline transition">
            Limpar tudo
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm px-3 py-2 flex items-center gap-2 flex-wrap">
        {filtrosAtivos && (
          <button onClick={limparFiltros} title="Limpar filtros" className="text-gray-400 hover:text-red-600 transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400">
          <option value="">Todos os anos</option>
          {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400">
          <option value="">Todos os tipos de proposição</option>
          {tiposProposicao.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
        </select>

        <FiltroPoder value={filtroOrigem} onChange={setFiltroOrigem} />

        {/* Filtro de vereador — multi-seleção com checkbox (respeita o filtro Ativos/Inativos/Todos do topo) */}
        <div className="relative">
          <button onClick={() => setPainelVereadorAberto(v => !v)}
            className={`border rounded px-2 py-1.5 text-xs flex items-center gap-1.5 transition ${
              filtroVereadorIds.size > 0 ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            Vereador{filtroVereadorIds.size > 0 ? ` (${filtroVereadorIds.size})` : ''}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {painelVereadorAberto && (
            <div className="absolute z-20 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {vereadoresListados.map(v => (
                  <label key={v.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs">
                    <input type="checkbox" checked={filtroVereadorIds.has(v.id)} onChange={() => toggleVereador(v.id)}
                      className="w-3.5 h-3.5 accent-gray-800" />
                    <span className={v.ativo ? 'text-gray-700' : 'text-gray-400'}>{v.apelido || v.nome}{!v.ativo && ' (inativo)'}</span>
                  </label>
                ))}
                {vereadoresListados.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhum vereador</p>}
              </div>
              {filtroVereadorIds.size > 0 && (
                <button onClick={() => setFiltroVereadorIds(new Set())}
                  className="w-full mt-2 text-xs text-red-600 font-medium hover:underline">
                  Limpar seleção ({filtroVereadorIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        <FiltroSituacaoAutor value={filtroSituacaoAutor} onChange={setFiltroSituacaoAutor} />

        {loading && <span className="text-xs text-gray-400 ml-auto">Carregando...</span>}
      </div>

      {/* Stat cards — visão geral */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard
          label="Total de Matérias" value={stats.totalGeral} color="#111827"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          ativo={filtroMateria === ''} onClick={() => setFiltroMateria('')}
        />
        <StatCard
          label="Proposições" value={stats.total} color="#8B0000"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          onClick={() => router.push('/dashboard/segov')}
        />
        <StatCard
          label="Requerimentos" value={stats.totalReq} color="#0e7490"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          onClick={() => router.push('/dashboard/requerimentos')}
        />
        <StatCard
          label="Moções" value={stats.totalMoc} color="#6d28d9"
          icon="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z"
          onClick={() => router.push('/dashboard/mocoes')}
        />
        <StatCard
          label="Vereadores Ativos" value={vereadoresAtivos} color="#1d4ed8"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <StatCard
          label="Taxa de Aprovação"
          value={stats.taxaAprovacao !== null ? `${stats.taxaAprovacao}%` : '—'}
          color="#15803d"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      {/* Status + Resultado Final — Proposições */}
      <div className="flex gap-3">
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Proposições por Status <span className="normal-case font-normal text-gray-300">— clique para filtrar</span></p>
          <div className="grid grid-cols-5 gap-2">
            {STATUS_LIST.map(s => {
              const c = STATUS_STYLE[s]
              const ativo = filtroStatus === s
              return (
                <button key={s} onClick={() => setFiltroStatus(prev => prev === s ? '' : s)}
                  className={`rounded-lg border p-2 text-center transition ${c.bg} ${c.border} ${
                    ativo ? 'ring-2 ring-offset-1 ring-gray-800' : filtroStatus ? 'opacity-40 hover:opacity-70' : 'hover:opacity-80'
                  }`}>
                  <p className={`text-xl font-bold ${c.text}`}>{stats.porStatus[s] || 0}</p>
                  <p className={`text-xs mt-0.5 ${c.text} font-medium leading-tight`}>{s}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resultado Final (todas as matérias)</p>
          <div className="flex gap-2 h-[calc(100%-28px)] items-center">
            <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-green-700">{stats.aprovadoFinal}</p>
              <p className="text-xs mt-0.5 text-green-600 font-medium">Aprovadas</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-red-700">{stats.rejeitadoFinal}</p>
              <p className="text-xs mt-0.5 text-red-600 font-medium">Reprovadas</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-gray-500">{stats.tramitando}</p>
              <p className="text-xs mt-0.5 text-gray-500 font-medium">Tramitando</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status — Requerimentos, Moções e Indicações */}
      <div className="bg-white rounded-xl shadow-sm px-4 py-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Requerimentos, Moções e Indicações por Status
          <span className="ml-1 normal-case font-normal text-gray-300">— {stats.totalRequerimentos} registro(s)</span>
        </p>
        <div className="grid grid-cols-6 gap-2">
          {STATUS_LIST.filter(s => !['Sancionado', 'Promulgado'].includes(s)).map(s => {
            const c = STATUS_STYLE[s]
            return (
              <div key={s} className={`rounded-lg border p-2 text-center ${c.bg} ${c.border}`}>
                <p className={`text-xl font-bold ${c.text}`}>{stats.porStatusReq[s] || 0}</p>
                <p className={`text-xs mt-0.5 ${c.text} font-medium leading-tight`}>{s}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gráficos */}
      <DashboardCharts
        porVereador={stats.porVereador}
        porStatusExecutivo={stats.porStatusExecutivo}
        totalExecutivo={stats.totalExecutivo}
        proposicoes={stats.proposicoes}
        porAno={stats.porAno}
        porTipo={stats.porTipo}
        filtroVereadorIds={filtroVereadorIds}
        onToggleVereador={toggleVereador}
        filtroOrigem={filtroOrigem}
        onToggleOrigem={toggleOrigem}
        onSetStatus={setFiltroStatus}
      />
    </div>
  )
}

function StatCard({
  label, value, color, icon, ativo = true, onClick,
}: {
  label: string; value: string | number; color: string; icon: string; ativo?: boolean; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`bg-white rounded-xl shadow-sm px-3 py-3 flex items-center gap-2.5 border-l-4 text-left w-full transition ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${!ativo ? 'opacity-40 hover:opacity-70' : ''}`}
      style={{ borderLeftColor: color }}>
      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: color }}>
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-gray-500 text-xs leading-tight truncate">{label}</p>
      </div>
    </Tag>
  )
}
