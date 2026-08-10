'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/toast'

const STATUS_LIST = ['Aguardando', 'Em andamento', 'Respondido', 'Arquivado']
type Opcao = { id: string; nome: string }

export default function EditarTagPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [referencia, setReferencia] = useState('')
  const [vereadores, setVereadores] = useState<Opcao[]>([])
  const [origens, setOrigens] = useState<Opcao[]>([])
  const [categorias, setCategorias] = useState<Opcao[]>([])
  const [secretarias, setSecretarias] = useState<Opcao[]>([])
  const [form, setForm] = useState({
    data: '', pedido: '', status: 'Aguardando', relevancia: '',
    vereadorId: '', origem: '', categoria: '', secretaria: '', dataConclusao: '', documentos: '',
  })

  useEffect(() => {
    Promise.all([
      fetch(`/api/tags/${id}`).then(r => r.json()),
      fetch('/api/vereadores?poder=legislativo').then(r => r.json()),
      fetch('/api/config-opcoes?tipo=origem').then(r => r.json()),
      fetch('/api/config-opcoes?tipo=categoria').then(r => r.json()),
      fetch('/api/config-opcoes?tipo=secretaria').then(r => r.json()),
    ]).then(([item, vers, ors, cats, secs]) => {
      setReferencia(item.referencia)
      setForm({
        data: item.data ? item.data.split('T')[0] : '',
        pedido: item.pedido || '',
        status: item.status || 'Aguardando',
        relevancia: item.relevancia || '',
        vereadorId: item.vereadorId || '',
        origem: item.origem || '',
        categoria: item.categoria || '',
        secretaria: item.secretaria || '',
        dataConclusao: item.dataConclusao ? item.dataConclusao.split('T')[0] : '',
        documentos: item.documentos || '',
      })
      setVereadores(vers); setOrigens(ors); setCategorias(cats); setSecretarias(secs)
      setCarregando(false)
    })
  }, [id])

  function set(field: string, value: string) { setForm(f => ({ ...f, [field]: value })) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const res = await fetch(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) router.push('/dashboard/tags')
    else { toast.error('Erro ao salvar'); setSalvando(false) }
  }

  if (carregando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/tags" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Editar TAG</h1>
          <p className="text-sm text-gray-500 font-mono">{referencia}</p>
        </div>
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Linha 1: AUTOR | STATUS | RELEVÂNCIA */}
        <div className="grid grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Autor (Vereador) <span className="text-red-500">*</span></label>
            <select required value={form.vereadorId} onChange={e => set('vereadorId', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              <option value="">Selecione...</option>
              {vereadores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status <span className="text-red-500">*</span></label>
            <select required value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Peso / Relevância</label>
            <div className="flex gap-2">
              {['Alto', 'Médio', 'Baixo'].map(r => (
                <button key={r} type="button" onClick={() => set('relevancia', form.relevancia === r ? '' : r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                    form.relevancia === r
                      ? r === 'Alto' ? 'border-red-500 bg-red-500 text-white' : r === 'Médio' ? 'border-orange-400 bg-orange-400 text-white' : 'border-green-500 bg-green-500 text-white'
                      : r === 'Alto' ? 'border-red-200 text-red-600 bg-white' : r === 'Médio' ? 'border-orange-200 text-orange-500 bg-white' : 'border-green-200 text-green-600 bg-white'
                  }`}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Linha 2: ORIGEM | CATEGORIA | SECRETARIA */}
        <div className="grid grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Origem</label>
            <select value={form.origem} onChange={e => set('origem', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              <option value="">Selecione...</option>
              {origens.map(o => <option key={o.id} value={o.nome}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoria</label>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              <option value="">Selecione...</option>
              {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Secretaria Responsável</label>
            <select value={form.secretaria} onChange={e => set('secretaria', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30">
              <option value="">Selecione...</option>
              {secretarias.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Linha 3: DATA | DATA CONCLUSÃO */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data <span className="text-red-500">*</span></label>
            <input required type="date" value={form.data} onChange={e => set('data', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Conclusão</label>
            <input type="date" value={form.dataConclusao} onChange={e => set('dataConclusao', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
            <p className="text-xs text-gray-400 mt-0.5">Ao preencher, o status muda para Respondido</p>
          </div>
        </div>

        {/* Linha 4: DOCUMENTOS */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Documento(s)</label>
          <input value={form.documentos} onChange={e => set('documentos', e.target.value)}
            placeholder="Nº de ofício, protocolo..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30" />
        </div>

        {/* Linha 5: PEDIDO */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pedido <span className="text-red-500">*</span></label>
          <textarea required rows={5} value={form.pedido} onChange={e => set('pedido', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 resize-none" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/tags"
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
