'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePermissao } from '@/lib/usePermissao'

type Item = {
  id: string; referencia: string; data: string; pedido: string
  status: string; relevancia: string | null; origem: string | null
  categoria: string | null; secretaria: string | null
  dataConclusao: string | null; documentos: string | null
  createdAt: string; vereador: { id: string; nome: string } | null
}

const STATUS_CHIP: Record<string, string> = {
  'Aguardando':   'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Em andamento': 'bg-blue-50 text-blue-700 border-blue-200',
  'Respondido':   'bg-green-50 text-green-700 border-green-200',
  'Arquivado':    'bg-gray-50 text-gray-500 border-gray-200',
}
const REL_CHIP: Record<string, string> = {
  'Alto':  'bg-red-50 text-red-700 border-red-200',
  'Médio': 'bg-orange-50 text-orange-700 border-orange-200',
  'Baixo': 'bg-green-50 text-green-700 border-green-200',
}

export default function TagsPage() {
  const podeEditarTag = usePermissao('podeEditar')
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  async function carregar() {
    const res = await fetch('/api/tags')
    setItens(await res.json())
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function excluir(id: string) {
    if (!confirm('Excluir esta TAG?')) return
    await fetch(`/api/tags/${id}`, { method: 'DELETE' })
    carregar()
  }

  const filtrados = itens.filter(i =>
    i.referencia.toLowerCase().includes(busca.toLowerCase()) ||
    i.pedido.toLowerCase().includes(busca.toLowerCase()) ||
    (i.origem || '').toLowerCase().includes(busca.toLowerCase()) ||
    (i.secretaria || '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">TAG</h1>
          <p className="text-sm text-gray-500">{itens.length} registro(s) cadastrado(s)</p>
        </div>
        <Link href="/dashboard/tags/novo"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ background: '#8B0000' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova TAG
        </Link>
      </div>

      {/* Busca */}
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por referência, pedido, origem..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-800/20 bg-white" />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400">Nenhuma TAG encontrada.</p>
          <Link href="/dashboard/tags/novo"
            className="mt-3 inline-block text-sm font-medium text-red-800 hover:underline">
            Cadastrar a primeira
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(item => (
            <div key={item.id}
              className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-start gap-4 hover:shadow-sm transition">
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                item.relevancia === 'Alto' ? 'bg-red-500' :
                item.relevancia === 'Médio' ? 'bg-orange-400' :
                item.relevancia === 'Baixo' ? 'bg-green-500' : 'bg-gray-200'
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-800 text-sm">{item.referencia}</span>
                  <span className={`text-xs font-medium border px-2 py-0.5 rounded ${STATUS_CHIP[item.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {item.status}
                  </span>
                  {item.relevancia && (
                    <span className={`text-xs font-medium border px-2 py-0.5 rounded ${REL_CHIP[item.relevancia] || ''}`}>
                      {item.relevancia}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(item.data).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mt-1 line-clamp-2">{item.pedido}</p>

                <div className="flex gap-3 mt-1.5 flex-wrap">
                  {item.vereador && (
                    <span className="text-xs font-medium border px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border-indigo-200">
                      {item.vereador.nome}
                    </span>
                  )}
                  {item.origem && <span className="text-xs text-gray-400">Origem: <span className="text-gray-600">{item.origem}</span></span>}
                  {item.categoria && <span className="text-xs text-gray-400">Categoria: <span className="text-gray-600">{item.categoria}</span></span>}
                  {item.secretaria && <span className="text-xs text-gray-400">Secretaria: <span className="text-gray-600">{item.secretaria}</span></span>}
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => { if (podeEditarTag) router.push(`/dashboard/tags/${item.id}/editar`) }}
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
          ))}
        </div>
      )}
    </div>
  )
}
