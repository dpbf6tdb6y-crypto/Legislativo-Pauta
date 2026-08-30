'use client'
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, LineChart, Line,
} from 'recharts'

export type VereadorData    = { nome: string; total: number; ativo: boolean; vereadorId: string | null }
export type StatusData      = { status: string; total: number }
export type AnoData         = { ano: number; executivo: number; vereadores: number }
export type TipoData        = { tipo: string; total: number }
export type ProposicaoResumo = {
  id: string; tipo: string; numero: string; ano: number
  ementa: string; status: string
  autorNome: string | null; vereadorNome: string | null
  /** ids dos autores que casam com o cadastro de Configurações */
  autorIds: string[]
  isExec: boolean
}

const STATUS_COR: Record<string, string> = {
  'Aguardando':  '#f59e0b', // âmbar
  'Com Parecer': '#a855f7', // roxo (logo)
  'Em análise':  '#3b82f6', // azul (logo)
  'Aprovado':    '#22c55e', // verde (logo)
  'Sancionado':  '#06b6d4', // ciano
  'Promulgado':  '#10b981', // esmeralda
  'Rejeitado':   '#ef4444', // vermelho
  'Arquivado':   '#94a3b8', // slate
  'Retirado':    '#f97316', // laranja (logo)
}

const STATUS_CHIP: Record<string, string> = {
  'Aguardando':  'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Com Parecer': 'bg-purple-50 text-purple-700 border-purple-200',
  'Em análise':  'bg-blue-50 text-blue-700 border-blue-200',
  'Aprovado':    'bg-green-50 text-green-700 border-green-200',
  'Sancionado':  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Promulgado':  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Rejeitado':   'bg-red-50 text-red-700 border-red-200',
  'Arquivado':   'bg-gray-50 text-gray-600 border-gray-200',
  'Retirado':    'bg-orange-50 text-orange-700 border-orange-200',
}

const TIPO_COR: Record<string, string> = {
  PL: 'bg-blue-100 text-blue-800', PLC: 'bg-indigo-100 text-indigo-800',
  PDL: 'bg-violet-100 text-violet-800', REQ: 'bg-amber-100 text-amber-800',
  IND: 'bg-teal-100 text-teal-800', MOC: 'bg-pink-100 text-pink-800',
}

// Paleta baseada nas cores da logomarca: laranja → roxo → azul → verde
const VEREADOR_CORES = [
  '#f97316', // laranja (logo)
  '#a855f7', // roxo   (logo)
  '#3b82f6', // azul   (logo)
  '#22c55e', // verde  (logo)
  '#f59e0b', // âmbar
  '#7c3aed', // violeta
  '#0ea5e9', // céu
  '#10b981', // esmeralda
  '#ef4444', // vermelho
  '#6366f1', // índigo
  '#ec4899', // rosa
  '#14b8a6', // teal
  '#d946ef', // fúcsia
  '#84cc16', // lima
  '#0d9488', // ciano-escuro
  '#8b5cf6', // lilás
]

type Filtro = { tipo: 'vereador' | 'executivo'; valor: string; vereadorId?: string | null } | null

interface Props {
  porVereador:        VereadorData[]
  porStatusExecutivo: StatusData[]
  totalExecutivo:     number
  proposicoes:        ProposicaoResumo[]
  porAno:             AnoData[]
  porTipo:            TipoData[]
  filtroVereadorIds:  Set<string>
  onToggleVereador:   (id: string) => void
  filtroOrigem:       '' | 'executivo' | 'legislativo'
  onToggleOrigem:     (o: 'executivo' | 'legislativo') => void
  onSetStatus:        (s: string) => void
}

export default function DashboardCharts({
  porVereador, porStatusExecutivo, totalExecutivo, proposicoes, porAno, porTipo,
  filtroVereadorIds, onToggleVereador, filtroOrigem, onToggleOrigem, onSetStatus,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>(null)

  function toggle(tipo: 'vereador' | 'executivo', valor: string, vereadorId?: string | null) {
    setFiltro(prev => prev?.tipo === tipo && prev.valor === valor ? null : { tipo, valor, vereadorId })
  }

  function clicarVereador(entry: VereadorData) {
    toggle('vereador', entry.nome, entry.vereadorId)
    if (entry.vereadorId) onToggleVereador(entry.vereadorId)
  }

  function clicarExecutivo(status: string) {
    toggle('executivo', status)
    if (filtroOrigem !== 'executivo') onToggleOrigem('executivo')
    onSetStatus(status)
  }

  const detalhes = filtro === null ? [] : filtro.tipo === 'vereador'
    ? proposicoes.filter(p => !p.isExec && !!filtro.vereadorId && p.autorIds.includes(filtro.vereadorId))
    : proposicoes.filter(p => p.isExec && p.status === filtro.valor)

  const vChartH = Math.max(240, porVereador.length * 30 + 50)

  const tipoChartH = Math.max(180, porTipo.length * 26 + 40)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 items-start">

        {/* ── Tendência por Ano — Executivo vs Vereadores ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Matérias por Ano — Executivo x Vereadores
          </p>
          {porAno.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={porAno} margin={{ left: 8, right: 20, top: 26, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="ano" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} hide />
                <Tooltip
                  labelFormatter={(l) => `Ano ${l}`}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="vereadores" name="Vereadores" stroke="#3b82f6" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }}>
                  <LabelList dataKey="vereadores" position="top" offset={10}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#2563eb' }} />
                </Line>
                <Line type="monotone" dataKey="executivo" name="Executivo" stroke="#a855f7" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#a855f7' }} activeDot={{ r: 5 }}>
                  <LabelList dataKey="executivo" position="bottom" offset={10}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#9333ea' }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-4 justify-center mt-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Vereadores</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />Executivo</span>
          </div>
        </div>

        {/* ── Distribuição por Tipo ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Proposições por Tipo
          </p>
          {porTipo.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={tipoChartH}>
              <BarChart data={porTipo} layout="vertical" margin={{ left: 8, right: 44, top: 2, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="tipo" width={170} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} proposição(ões)`, 'Total']}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {porTipo.map((entry, i) => (
                    <Cell key={i} fill={VEREADOR_CORES[i % VEREADOR_CORES.length]} />
                  ))}
                  <LabelList dataKey="total" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-start">

        {/* ── Vereador ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Proposições por Vereador
              <span className="ml-1 normal-case font-normal text-gray-300">— clique para detalhar</span>
            </p>
          </div>
          {porVereador.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={vChartH}>
              <BarChart
                data={porVereador}
                layout="vertical"
                margin={{ left: 8, right: 44, top: 2, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category" dataKey="nome" width={148}
                  tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} proposição(ões)`, 'Total']}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar
                  dataKey="total"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  cursor="pointer"
                  onClick={(data) => clicarVereador(data)}
                >
                  {porVereador.map((entry, i) => {
                    const selecionado = entry.vereadorId ? filtroVereadorIds.has(entry.vereadorId) : filtro?.tipo === 'vereador' && filtro.valor === entry.nome
                    const algumSelecionado = filtroVereadorIds.size > 0 || (filtro?.tipo === 'vereador')
                    return (
                    <Cell
                      key={i}
                      fill={VEREADOR_CORES[i % VEREADOR_CORES.length]}
                      opacity={algumSelecionado && !selecionado ? 0.25 : 1}
                    />
                  )})}
                  <LabelList
                    dataKey="total"
                    position="right"
                    style={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Executivo ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-baseline gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Proposições do Poder Executivo
            </p>
            <span className="text-lg font-bold text-purple-700">{totalExecutivo}</span>
            <span className="ml-1 normal-case text-xs font-normal text-gray-300">— clique para detalhar</span>
          </div>
          {totalExecutivo === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Nenhuma proposição do Executivo</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={porStatusExecutivo}
                margin={{ left: 0, right: 16, top: 22, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} hide />
                <Tooltip
                  formatter={(v: number) => [`${v} proposição(ões)`, 'Total']}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar
                  dataKey="total"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={52}
                  cursor="pointer"
                  onClick={(data) => clicarExecutivo(data.status)}
                >
                  {porStatusExecutivo.map(entry => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COR[entry.status] || '#6b7280'}
                      opacity={filtro?.tipo === 'executivo' && filtro.valor !== entry.status ? 0.25 : 1}
                    />
                  ))}
                  <LabelList
                    dataKey="total"
                    position="top"
                    style={{ fontSize: 12, fontWeight: 700, fill: '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Painel lateral de detalhe (drawer) ── */}
      {filtro && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 transition-opacity"
            onClick={() => setFiltro(null)}
          />
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="font-semibold text-gray-800 text-sm">
                {filtro.tipo === 'vereador'
                  ? <><span className="text-gray-400 font-normal">Vereador: </span>{filtro.valor}</>
                  : <><span className="text-gray-400 font-normal">Executivo — Status: </span>{filtro.valor}</>}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({detalhes.length} {detalhes.length !== 1 ? 'proposições' : 'proposição'})
                </span>
              </p>
              <button
                onClick={() => setFiltro(null)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detalhes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Nenhuma proposição encontrada</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {detalhes.map(p => (
                    <div key={p.id} className="px-4 py-3 hover:bg-gray-50 transition">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${TIPO_COR[p.tipo] || 'bg-gray-100 text-gray-700'}`}>
                          {p.tipo}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">{p.numero}/{p.ano}</span>
                        <span className={`text-xs border px-2 py-0.5 rounded font-medium ml-auto ${STATUS_CHIP[p.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-3">{p.ementa || <em className="text-gray-300">sem ementa</em>}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
