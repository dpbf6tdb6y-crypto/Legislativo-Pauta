'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/toast'

const TIPOS = ['PL', 'PLC', 'PDL', 'RES', 'PELO']
const STATUS_LIST = ['Aguardando', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

export default function NovoSeggovPage() {
  const router = useRouter()
  const toast = useToast()
  const [vereadores, setVereadores] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    numero: '', ano: String(new Date().getFullYear()), tipo: 'PL',
    ementa: '', vereadorId: '', status: 'Aguardando', dataEnvio: '', observacao: ''
  })

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo').then(r => r.json()).then(setVereadores)
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const res = await fetch('/api/segov', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) router.push('/dashboard/segov')
    else { toast.error('Erro ao salvar'); setSalvando(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/segov" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Nova Proposição</h1>
          <p className="text-sm text-gray-500">Cadastrar nova proposição</p>
        </div>
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Número <span className="text-red-500">*</span>
            </label>
            <input required value={form.numero} onChange={e => set('numero', e.target.value)}
              placeholder="Ex: 2592"
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
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
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
            Ementa <span className="text-red-500">*</span>
          </label>
          <textarea required rows={3} value={form.ementa} onChange={e => set('ementa', e.target.value)}
            placeholder="Descrição da proposição..."
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

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observação</label>
          <textarea rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)}
            placeholder="Observações adicionais..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 resize-none" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/segov"
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
