'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

const TIPOS = ['PL', 'PLC', 'PDL', 'REQ', 'IND', 'MOC']
const STATUS_LIST = ['Aguardando', 'Com Parecer', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

type Autor = { id?: string; nome: string; isPE: boolean }

type StepData = {
  comissaoId?: string
  comissaoNome?: string
  nome1?: string
  nome2?: string
  nome3?: string
  data?: string
  resultado?: string
  numero?: string
  ano?: string
  emendaTipo?: string
}
type StepState = { done: boolean; doneAt?: string; data?: StepData }
type FluxoState = Record<string, StepState>
type StepTipo = 'simples' | 'comissao' | 'comissao3nomes' | 'nome1' | 'data' | 'resultado' | 'emendaInfo'
type StepDef = { key: string; label: string; labelCurto: string; tipo: StepTipo }

const FLUXO_DEF: StepDef[] = [
  { key: 'protocolado',        label: 'Protocolado',                    labelCurto: 'Prot.',      tipo: 'simples' },
  { key: 'pautado',            label: 'Pautado',                        labelCurto: 'Pautado',    tipo: 'data' },
  { key: 'comissao1',          label: 'Comissão 1',                     labelCurto: 'Com. 1',     tipo: 'comissao' },
  { key: 'comissao2',          label: 'Comissão 2',                     labelCurto: 'Com. 2',     tipo: 'comissao' },
  { key: 'comissao3',          label: 'Comissão 3',                     labelCurto: 'Com. 3',     tipo: 'comissao' },
  { key: 'comissaoEspecial',   label: 'Comissão Especial',              labelCurto: 'C. Esp.',    tipo: 'comissao3nomes' },
  { key: 'comissaoConjunta',   label: 'Comissão Conjunta',              labelCurto: 'C. Conj.',   tipo: 'simples' },
  { key: 'dispensaParecer',    label: 'Dispensa de Parecer',            labelCurto: 'D. Par.',    tipo: 'simples' },
  { key: 'dispensaIntersticio',label: 'Dispensa de Interstício',        labelCurto: 'D. Int.',    tipo: 'simples' },
  { key: 'pedidoVista',        label: 'Pedido de Vista',                labelCurto: 'P. Vista',   tipo: 'nome1' },
  { key: 'pedidoAdiamento',    label: 'Pedido de Adiamento de Votação', labelCurto: 'P. Adj.',    tipo: 'nome1' },
  { key: 'emenda',             label: 'Emenda(s)',                      labelCurto: 'Emenda',     tipo: 'resultado' },
  { key: 'emendaNumero',       label: 'Identificação da Emenda',        labelCurto: 'Id. Emenda', tipo: 'emendaInfo' },
  { key: 'emendaVotacao1',     label: '1ª Votação da Emenda',           labelCurto: '1ª V. Emd.', tipo: 'resultado' },
  { key: 'emendaVotacao2',     label: '2ª Votação da Emenda',           labelCurto: '2ª V. Emd.', tipo: 'resultado' },
  { key: 'emendaResultado',    label: 'Resultado da Emenda',            labelCurto: 'Res. Emd.',  tipo: 'resultado' },
  { key: 'votacao1',           label: '1ª Votação do Projeto de Lei',   labelCurto: '1ª Vot.',    tipo: 'resultado' },
  { key: 'votacao2',           label: '2ª Votação do Projeto de Lei',   labelCurto: '2ª Vot.',    tipo: 'resultado' },
  { key: 'resultadoFinal',     label: 'Resultado Final do Projeto',     labelCurto: 'Resultado',  tipo: 'resultado' },
]

function formatNumero(n: string) {
  return n.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtData(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function EditarSeggovPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [vereadores, setVereadores] = useState<any[]>([])
  const [comissoes, setComissoes] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [form, setForm] = useState({
    numero: '', ano: String(new Date().getFullYear()), tipo: 'PL',
    ementa: '', status: 'Aguardando', dataEnvio: '',
    observacao: '', parecerComissao: '', proxComissao: '',
  })
  const [autores, setAutores] = useState<Autor[]>([])
  const [fluxo, setFluxo] = useState<FluxoState>({})
  const [pending, setPendingState] = useState<Record<string, StepData>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/vereadores?poder=legislativo').then(r => r.json()),
      fetch('/api/segov').then(r => r.json()),
      fetch('/api/comissoes').then(r => r.json()),
    ]).then(([vers, todos, coms]) => {
      setVereadores(vers)
      setComissoes(coms)
      const item = todos.find((i: any) => i.id === id)
      if (item) {
        setUpdatedAt(item.updatedAt || '')
        setForm({
          numero: item.numero,
          ano: String(item.ano),
          tipo: item.tipo,
          ementa: item.ementa,
          status: item.status,
          dataEnvio: item.dataEnvio ? item.dataEnvio.split('T')[0] : '',
          observacao: item.observacao || '',
          parecerComissao: item.parecerComissao || '',
          proxComissao: item.proxComissao || '',
        })
        if (item.fluxo && typeof item.fluxo === 'object') {
          setFluxo(item.fluxo as FluxoState)
        }
        const lista: Autor[] = []
        const nomeRaw: string = item.autorNome || ''
        if (item.vereadorId) {
          const v = vers.find((v: any) => v.id === item.vereadorId)
          if (v) lista.push({ id: v.id, nome: v.nome, isPE: false })
        }
        if (nomeRaw) {
          nomeRaw.split(/\s+e\s+|,\s+/).map((n: string) => n.trim()).filter(Boolean).forEach((nome: string) => {
            const lower = nome.toLowerCase()
            if (lower.includes('executivo') || lower.includes('prefeitura')) {
              if (!lista.some(a => a.isPE)) lista.push({ nome: 'Poder Executivo', isPE: true })
            } else {
              const matched = vers.find((v: any) =>
                nome.toLowerCase().split(/\s+/).filter((p: string) => p.length > 2).some((p: string) => v.nome.toLowerCase().includes(p))
              )
              if (matched && !lista.some(a => a.id === matched.id))
                lista.push({ id: matched.id, nome: matched.nome, isPE: false })
              else if (!matched && !lista.some(a => a.nome === nome))
                lista.push({ nome, isPE: false })
            }
          })
        }
        setAutores(lista)
      }
      setCarregando(false)
    })
  }, [id])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function adicionarAutor(valor: string) {
    if (!valor) return
    if (valor === 'executivo') {
      if (!autores.some(a => a.isPE))
        setAutores(prev => [...prev, { nome: 'Poder Executivo', isPE: true }])
      return
    }
    const v = vereadores.find((v: any) => v.id === valor)
    if (v && !autores.some(a => a.id === v.id))
      setAutores(prev => [...prev, { id: v.id, nome: v.nome, isPE: false }])
  }

  function removerAutor(idx: number) {
    setAutores(prev => prev.filter((_, i) => i !== idx))
  }

  function setPendingData(key: string, field: keyof StepData, value: string) {
    setPendingState(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  function marcar(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const p = pending[key] || {}
    let data: StepData = {}
    let doneAt = new Date().toISOString()

    if (def.tipo === 'comissao') {
      if (!p.comissaoId) { alert('Selecione uma comissão antes de marcar.'); return }
      const com = comissoes.find((c: any) => c.id === p.comissaoId)
      data = { comissaoId: p.comissaoId, comissaoNome: com?.sigla || com?.nome }
    } else if (def.tipo === 'comissao3nomes') {
      data = { nome1: p.nome1 || '', nome2: p.nome2 || '', nome3: p.nome3 || '' }
    } else if (def.tipo === 'nome1') {
      data = { nome1: p.nome1 || '' }
    } else if (def.tipo === 'resultado') {
      data = { resultado: p.resultado || 'aprovado' }
    } else if (def.tipo === 'emendaInfo') {
      data = { emendaTipo: p.emendaTipo || 'PL', numero: p.numero || '', ano: p.ano || '' }
    } else if (def.tipo === 'data') {
      if (!p.data) { alert('Selecione a data antes de marcar.'); return }
      doneAt = p.data + 'T12:00:00.000Z'
    }

    setFluxo(prev => {
      const next = { ...prev, [key]: { done: true, doneAt, data } }
      if (key === 'pautado' && !prev['protocolado']?.done) {
        next['protocolado'] = { done: true, doneAt, data: {} }
      }
      return next
    })
    setPendingState(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function desmarcar(key: string) {
    setFluxo(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const marcados = useMemo(() =>
    FLUXO_DEF
      .filter(d => fluxo[d.key]?.done)
      .map(d => ({ ...d, ...(fluxo[d.key] || {}) })),
    [fluxo]
  )

  const graficoCor: 'verde' | 'vermelho' | 'normal' =
    fluxo['resultadoFinal']?.done
      ? fluxo['resultadoFinal'].data?.resultado === 'aprovado' ? 'verde' : 'vermelho'
      : 'normal'

  const diasEmAberto = useMemo(() => {
    const st = fluxo['pautado']
    if (!st?.done || !st.doneAt) return null
    return Math.floor((Date.now() - new Date(st.doneAt).getTime()) / 86400000)
  }, [fluxo])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const autorNome = autores.map(a => a.nome).join(' e ') || null
    const vereadorId = autores.find(a => !a.isPE && a.id)?.id || null
    const res = await fetch(`/api/segov/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, autorNome, vereadorId, fluxo }),
    })
    if (res.ok) { router.refresh(); router.push('/dashboard/segov') }
    else { alert('Erro ao salvar'); setSalvando(false) }
  }

  if (carregando) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
  const inpSm = "w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400/60 bg-white"

  function renderStepCard(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const idx = FLUXO_DEF.indexOf(def)
    const state = fluxo[def.key]
    const done = !!state?.done
    const p = pending[def.key] || {}
    const inline = def.tipo === 'data' || def.tipo === 'comissao3nomes' || def.tipo === 'resultado' || def.tipo === 'emendaInfo'

    const cardClass = !done
      ? 'border-gray-200 bg-white'
      : (def.key === 'resultadoFinal' || def.key === 'emendaResultado')
        ? (state?.data?.resultado === 'reprovado' ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-100')
        : 'border-green-300 bg-green-50'

    const circle = (
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        done ? 'bg-green-500 text-white shadow-sm shadow-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
      }`}>
        {done
          ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          : <span className="text-xs font-bold">{idx + 1}</span>}
      </div>
    )

    const btnMarcar = done
      ? <button type="button" onClick={() => desmarcar(def.key)}
          className="text-xs text-red-400 hover:text-red-600 transition px-1.5 py-0.5 rounded border border-red-200 hover:border-red-300 hover:bg-red-50 flex-shrink-0">✕</button>
      : <button type="button" onClick={() => marcar(def.key)}
          className="text-xs px-2.5 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition font-medium shadow-sm whitespace-nowrap flex-shrink-0">Marcar</button>

    return (
      <div key={def.key} className={`rounded-xl border-2 shadow-sm transition-all ${cardClass}`}>
        {inline ? (
          <div className="flex items-center gap-3 p-3 flex-wrap">
            {circle}
            <span className={`text-sm font-medium flex-shrink-0 ${done ? 'text-green-700' : 'text-gray-700'}`}>{def.label}</span>
            {!done && def.tipo === 'data' && (
              <input type="date" value={p.data || ''} onChange={e => setPendingData(def.key, 'data', e.target.value)} className={`flex-1 ${inpSm}`} />
            )}
            {!done && def.tipo === 'comissao3nomes' && (
              <>
                <input placeholder="Membro 1" value={p.nome1 || ''} onChange={e => setPendingData(def.key, 'nome1', e.target.value)} className={`flex-1 ${inpSm}`} />
                <input placeholder="Membro 2" value={p.nome2 || ''} onChange={e => setPendingData(def.key, 'nome2', e.target.value)} className={`flex-1 ${inpSm}`} />
                <input placeholder="Membro 3" value={p.nome3 || ''} onChange={e => setPendingData(def.key, 'nome3', e.target.value)} className={`flex-1 ${inpSm}`} />
              </>
            )}
            {!done && def.tipo === 'resultado' && (
              <div className="flex gap-1.5 flex-shrink-0">
                {(['aprovado', 'reprovado'] as const).map(r => (
                  <button key={r} type="button"
                    onClick={() => setPendingData(def.key, 'resultado', r)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition font-medium ${
                      p.resultado === r
                        ? r === 'aprovado' ? 'border-green-400 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}>
                    {r === 'aprovado' ? 'Aprovado' : 'Reprovado'}
                  </button>
                ))}
              </div>
            )}
            {!done && def.tipo === 'emendaInfo' && (
              <>
                <select value={p.emendaTipo || 'PL'} onChange={e => setPendingData(def.key, 'emendaTipo', e.target.value)} className={`w-20 flex-shrink-0 ${inpSm}`}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Número" value={p.numero || ''} onChange={e => setPendingData(def.key, 'numero', e.target.value)} className={`flex-1 ${inpSm}`} />
                <input placeholder="Ano" value={p.ano || ''} onChange={e => setPendingData(def.key, 'ano', e.target.value)} className={`w-20 flex-shrink-0 ${inpSm}`} />
              </>
            )}
            {done && (
              <div className="flex-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-400">{fmtData(state.doneAt)}</span>
                {state.data?.resultado && (
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${state.data.resultado === 'aprovado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {state.data.resultado === 'aprovado' ? 'Aprovado' : 'Reprovado'}
                  </span>
                )}
                {state.data?.numero && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {state.data.emendaTipo ? `${state.data.emendaTipo} ` : ''}{state.data.numero}{state.data.ano ? `/${state.data.ano}` : ''}
                  </span>
                )}
                {[state.data?.nome1, state.data?.nome2, state.data?.nome3].filter(Boolean).map((n, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{n}</span>
                ))}
              </div>
            )}
            {btnMarcar}
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5">{circle}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-medium leading-tight ${done ? 'text-green-700' : 'text-gray-700'}`}>{def.label}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {done && <span className="text-xs text-gray-400 whitespace-nowrap">{fmtData(state.doneAt)}</span>}
                  {btnMarcar}
                </div>
              </div>
              {done && state.data && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {state.data.comissaoNome && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">{state.data.comissaoNome}</span>}
                  {[state.data.nome1, state.data.nome2, state.data.nome3].filter(Boolean).map((n, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{n}</span>
                  ))}
                </div>
              )}
              {!done && def.tipo === 'comissao' && (
                <select value={p.comissaoId || ''} onChange={e => setPendingData(def.key, 'comissaoId', e.target.value)} className={`mt-2 ${inpSm}`}>
                  <option value="">— Selecionar comissão —</option>
                  {comissoes.map((c: any) => <option key={c.id} value={c.id}>{c.sigla ? `${c.sigla} — ${c.nome}` : c.nome}</option>)}
                </select>
              )}
              {!done && def.tipo === 'nome1' && (
                <input placeholder="Nome do solicitante" value={p.nome1 || ''} onChange={e => setPendingData(def.key, 'nome1', e.target.value)} className={`mt-2 ${inpSm}`} />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
      <div className="flex items-center">
        <Link href="/dashboard/segov"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition w-24">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-gray-800">Editar</h1>
          <p className="text-sm text-gray-500">{form.tipo} {formatNumero(form.numero)}/{form.ano}</p>
        </div>
        <div className="w-24" />
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        <div className="flex gap-3 items-end">
          <div className="w-24 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Número</label>
            <input required value={formatNumero(form.numero)}
              onChange={e => set('numero', e.target.value.replace(/\./g, ''))}
              className={inp} />
          </div>
          <div className="w-20 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ano</label>
            <input value={form.ano} onChange={e => set('ano', e.target.value)} className={inp} />
          </div>
          <div className="w-24 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
            <select required value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="w-44 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Autor</label>
            <select onChange={e => { adicionarAutor(e.target.value); e.target.value = '' }} className={inp}>
              <option value="">— Selecionar —</option>
              <option value="executivo">⚡ Executivo</option>
              <optgroup label="Vereadores">
                {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="w-36 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="w-52 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dias em Aberto</label>
            {diasEmAberto !== null ? (
              <div className="rounded-lg border px-3 py-2 bg-blue-50 border-blue-200">
                <p className="text-2xl font-bold tabular-nums leading-none text-blue-600">
                  {diasEmAberto} <span className="text-sm font-normal">dias</span></p>
                <p className="text-xs text-gray-400 mt-1">desde {fmtData(fluxo['pautado']?.doneAt)}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Pautado não marcado
              </div>
            )}
          </div>
        </div>

        {autores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {autores.map((a, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                a.isPE ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
                {a.isPE && <span>⚡</span>}
                {a.nome}
                <button type="button" onClick={() => removerAutor(i)} className="text-gray-400 hover:text-red-500 transition">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {updatedAt && (
          <div className="text-xs text-gray-400">
            Última movimentação: <span className="font-medium text-gray-600">{fmtData(updatedAt)}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ementa</label>
          <textarea required rows={6} value={form.ementa} onChange={e => set('ementa', e.target.value)}
            className={`${inp} resize-none`} />
        </div>

        {/* ─── FLUXO DE TRAMITAÇÃO ─── */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Fluxo de Tramitação
          </h3>

          {marcados.length > 0 && (
            <div className="mb-6 bg-gray-50 rounded-xl border border-gray-200 p-4 overflow-x-auto">
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
                      <p className="text-xs text-gray-400 text-center mt-0.5">{fmtData(step.doneAt)}</p>
                      {step.data?.comissaoNome && (
                        <span className="mt-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium text-center">{step.data.comissaoNome}</span>
                      )}
                      {step.data?.resultado && (
                        <span className={`mt-1 text-xs px-1.5 py-0.5 rounded font-semibold text-center ${step.data.resultado === 'aprovado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {step.data.resultado === 'aprovado' ? 'Aprov.' : 'Reprov.'}
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

          {marcados.length === 0 && (
            <div className="mb-5 text-xs text-gray-400 italic bg-gray-50 rounded-lg border border-dashed border-gray-200 p-3 text-center">
              Nenhuma etapa marcada ainda. Marque as etapas abaixo para construir o fluxo.
            </div>
          )}

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 items-start">
              {renderStepCard('protocolado')}
              {renderStepCard('pautado')}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Comissões</h4>
                {renderStepCard('comissao1')}
                {renderStepCard('comissao2')}
                {renderStepCard('comissao3')}
                {renderStepCard('comissaoConjunta')}
                {renderStepCard('comissaoEspecial')}
              </div>

              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Dispensas e Pedidos</h4>
                {renderStepCard('dispensaParecer')}
                {renderStepCard('dispensaIntersticio')}
                {renderStepCard('pedidoVista')}
                {renderStepCard('pedidoAdiamento')}
              </div>

              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Emenda</h4>
                {renderStepCard('emenda')}
                {renderStepCard('emendaNumero')}
                <div className="grid grid-cols-2 gap-4">
                  {renderStepCard('emendaVotacao1')}
                  {renderStepCard('emendaVotacao2')}
                </div>
                {renderStepCard('emendaResultado')}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Projeto de Lei</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {renderStepCard('votacao1')}
                  {renderStepCard('votacao2')}
                </div>
                {renderStepCard('resultadoFinal')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/segov"
            className="px-5 py-2.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
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
