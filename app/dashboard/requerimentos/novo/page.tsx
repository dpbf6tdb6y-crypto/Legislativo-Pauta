'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const TIPOS_PADRAO = ['REQ', 'MOC', 'IND']
const TIPO_LABEL_PADRAO: Record<string, string> = { REQ: 'Requerimento', MOC: 'Moção', IND: 'Indicação' }
const STATUS_LIST = ['Aguardando', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

export default function NovoRequerimentoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipoParam = searchParams.get('tipo') || 'REQ'
  const voltarHref = tipoParam === 'MOC' ? '/dashboard/mocoes' : '/dashboard/requerimentos'
  const [vereadores, setVereadores] = useState<any[]>([])
  const [tipos, setTipos] = useState<string[]>(TIPOS_PADRAO)
  const [tipoLabel, setTipoLabel] = useState<Record<string, string>>(TIPO_LABEL_PADRAO)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    numero: '', ano: String(new Date().getFullYear()), tipo: tipoParam,
    descricao: '', vereadorId: '', status: 'Aguardando', dataEnvio: '',
  })

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo').then(r => r.json()).then(setVereadores)
    fetch('/api/config-opcoes?tipo=tipo_requerimento').then(r => r.json()).then((opcoes: { nome: string; codigo: string | null }[]) => {
      const labels: Record<string, string> = {}
      const codigos: string[] = []
      opcoes.forEach(o => { if (o.codigo) { labels[o.codigo] = o.nome; codigos.push(o.codigo) } })
      if (codigos.length) { setTipos(codigos); setTipoLabel(labels) }
    })
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const res = await fetch('/api/requerimentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) router.push(voltarHref)
    else { alert('Erro ao salvar'); setSalvando(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href={voltarHref} className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Novo Requerimento</h1>
          <p className="text-sm text-gray-500">Requerimento, Moção ou Indicação</p>
        </div>
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Número <span className="text-red-500">*</span>
            </label>
            <input required value={form.numero} onChange={e => set('numero', e.target.value)}
              placeholder="Ex: 123"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ano</label>
            <input value={form.ano} onChange={e => set('ano', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Tipo <span className="text-red-500">*</span>
            </label>
            <select required value={form.tipo} onChange={e => set('tipo', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              {tipos.map(t => <option key={t} value={t}>{tipoLabel[t] || t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Descrição <span className="text-red-500">*</span>
          </label>
          <textarea required rows={4} value={form.descricao} onChange={e => set('descricao', e.target.value)}
            placeholder="Breve relato do pedido..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vereador</label>
            <select value={form.vereadorId} onChange={e => set('vereadorId', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              <option value="">— Selecione —</option>
              {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Envio</label>
            <input type="date" value={form.dataEnvio} onChange={e => set('dataEnvio', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href={voltarHref}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="submit" disabled={salvando}
            className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: '#8B0000' }}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
