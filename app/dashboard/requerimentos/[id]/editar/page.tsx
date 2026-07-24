'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

const TIPOS = ['REQ', 'MOC', 'IND']
const TIPO_LABEL: Record<string, string> = { REQ: 'Requerimento', MOC: 'Moção', IND: 'Indicação' }
const STATUS_LIST = ['Aguardando', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

type StepData = { data?: string; resultado?: string }
type StepState = { done: boolean; doneAt?: string; data?: StepData }
type FluxoState = Record<string, StepState>
type StepTipo = 'simples' | 'data' | 'resultado'
type StepDef = { key: string; label: string; tipo: StepTipo }

const FLUXO_DEF: StepDef[] = [
  { key: 'protocolado', label: 'Protocolado', tipo: 'simples' },
  { key: 'pautado', label: 'Pautado', tipo: 'data' },
  { key: 'leituraVotacao', label: 'Leitura/Votação em Plenário', tipo: 'data' },
  { key: 'resultado', label: 'Resultado', tipo: 'resultado' },
]
const NEGATIVOS = new Set(['reprovado'])

function formatNumero(n: string) {
  return n.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function fmtData(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function EditarRequerimentoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [vereadores, setVereadores] = useState<any[]>([])
  const [form, setForm] = useState({
    numero: '', ano: String(new Date().getFullYear()), tipo: 'REQ',
    descricao: '', vereadorId: '', status: 'Aguardando', dataEnvio: '',
  })
  const [fluxo, setFluxo] = useState<FluxoState>({})
  const [pending, setPendingState] = useState<Record<string, StepData>>({})

  useEffect(() => {
    Promise.all([
      fetch(`/api/requerimentos/${id}`).then(r => r.json()),
      fetch('/api/vereadores?poder=legislativo').then(r => r.json()),
    ]).then(([item, vers]) => {
      setForm({
        numero: item.numero || '',
        ano: String(item.ano || new Date().getFullYear()),
        tipo: item.tipo || 'REQ',
        descricao: item.descricao || '',
        vereadorId: item.vereadorId || '',
        status: item.status || 'Aguardando',
        dataEnvio: item.dataEnvio ? item.dataEnvio.split('T')[0] : '',
      })
      if (item.fluxo && typeof item.fluxo === 'object') setFluxo(item.fluxo as FluxoState)
      setVereadores(vers)
      setCarregando(false)
    })
  }, [id])

  function set(field: string, value: string) { setForm(f => ({ ...f, [field]: value })) }
  function setPendingData(key: string, field: keyof StepData, value: string) {
    setPendingState(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  function marcar(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const p = pending[key] || {}
    let data: StepData = {}
    let doneAt = new Date().toISOString()
    if (def.tipo === 'data') {
      if (!p.data) { alert('Selecione a data antes de marcar.'); return }
      doneAt = p.data + 'T12:00:00.000Z'
    } else if (def.tipo === 'resultado') {
      data = { resultado: p.resultado || 'aprovado' }
    }
    setFluxo(prev => ({ ...prev, [key]: { done: true, doneAt, data } }))
    setPendingState(prev => { const n = { ...prev }; delete n[key]; return n })
  }
  function desmarcar(key: string) {
    setFluxo(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const res = await fetch(`/api/requerimentos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, fluxo }),
    })
    if (res.ok) router.push('/dashboard/requerimentos')
    else { alert('Erro ao salvar'); setSalvando(false) }
  }

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
  const inpSm = "w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400/60 bg-white"

  function renderStepCard(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const state = fluxo[def.key]
    const done = !!state?.done
    const p = pending[def.key] || {}
    const destaque = def.key === 'resultado'
    const cardClass = !done
      ? 'border-gray-200 bg-white'
      : destaque
        ? (NEGATIVOS.has(state?.data?.resultado || '') ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-100')
        : 'border-green-300 bg-green-50'

    const circle = (
      <button type="button"
        onClick={() => done ? desmarcar(def.key) : marcar(def.key)}
        title={done ? 'Clique para desmarcar' : 'Clique para marcar'}
        className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition ${
          done ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-white border border-gray-300 hover:border-green-400'
        }`}>
        {done && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </button>
    )

    const btnMarcar = done
      ? <button type="button" onClick={() => desmarcar(def.key)}
          className="text-[10px] text-red-400 hover:text-red-600 transition px-1 py-0.5 rounded border border-red-200 hover:border-red-300 hover:bg-red-50 flex-shrink-0">✕</button>
      : <button type="button" onClick={() => marcar(def.key)}
          className="text-[10px] px-2 py-0.5 rounded-md bg-green-500 text-white hover:bg-green-600 transition font-medium whitespace-nowrap flex-shrink-0">Marcar</button>

    return (
      <div key={def.key} className={`rounded-lg border shadow-sm transition-all p-2 ${cardClass}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <div className="mt-0.5">{circle}</div>
            <span className={`text-xs font-medium leading-tight ${done ? 'text-green-700' : 'text-gray-700'}`}>{def.label}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {done && <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtData(state.doneAt)}</span>}
            {btnMarcar}
          </div>
        </div>

        {!done && def.tipo === 'data' && (
          <input type="date" value={p.data || ''} onChange={e => setPendingData(def.key, 'data', e.target.value)} className={`mt-1.5 w-full ${inpSm}`} />
        )}
        {!done && def.tipo === 'resultado' && (
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {(['aprovado', 'reprovado'] as const).map(r => (
              <button key={r} type="button"
                onClick={() => setPendingData(def.key, 'resultado', r)}
                className={`text-[10px] px-2 py-0.5 rounded-md border transition font-medium ${
                  p.resultado === r
                    ? NEGATIVOS.has(r) ? 'border-red-400 bg-red-50 text-red-700' : 'border-green-400 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}>
                {r === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
              </button>
            ))}
          </div>
        )}
        {done && state.data?.resultado && (
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${NEGATIVOS.has(state.data.resultado) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {state.data.resultado === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (carregando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/requerimentos" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Editar</h1>
          <p className="text-sm text-gray-500">{TIPO_LABEL[form.tipo]} {formatNumero(form.numero)}/{form.ano}</p>
        </div>
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Número <span className="text-red-500">*</span></label>
            <input required value={formatNumero(form.numero)} onChange={e => set('numero', e.target.value.replace(/\./g, ''))} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ano</label>
            <input value={form.ano} onChange={e => set('ano', e.target.value)} className={inp} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo <span className="text-red-500">*</span></label>
            <select required value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição <span className="text-red-500">*</span></label>
          <textarea required rows={4} value={form.descricao} onChange={e => set('descricao', e.target.value)} className={`${inp} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vereador</label>
            <select value={form.vereadorId} onChange={e => set('vereadorId', e.target.value)} className={inp}>
              <option value="">— Selecione —</option>
              {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Envio</label>
            <input type="date" value={form.dataEnvio} onChange={e => set('dataEnvio', e.target.value)} className={inp} />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Fluxo de Tramitação</h3>
          <div className="grid grid-cols-2 gap-2">
            {FLUXO_DEF.map(d => renderStepCard(d.key))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/requerimentos"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="submit" disabled={salvando}
            className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: '#8B0000' }}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
