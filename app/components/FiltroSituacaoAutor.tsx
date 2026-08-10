'use client'

export type SituacaoAutor = 'ativos' | 'inativos' | 'todos'

const OPCOES: { value: SituacaoAutor; label: string }[] = [
  { value: 'ativos', label: 'Ativos' },
  { value: 'inativos', label: 'Inativos' },
  { value: 'todos', label: 'Todos' },
]

/**
 * Filtro padrão (idêntico em Dashboard, Proposições, Requerimentos e Moções) para mostrar
 * apenas matérias cujo(s) autor(es) estão ativos, inativos, ou todas — independente da autoria.
 */
export default function FiltroSituacaoAutor({
  value, onChange, className = '',
}: {
  value: SituacaoAutor
  onChange: (v: SituacaoAutor) => void
  className?: string
}) {
  return (
    <div className={`flex gap-1 bg-gray-100 rounded-md p-0.5 ${className}`}>
      {OPCOES.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          title="Filtra pela situação (ativo/inativo) do(s) autor(es) da matéria"
          className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
            value === o.value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
