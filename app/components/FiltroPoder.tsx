'use client'

export type Poder = '' | 'legislativo' | 'executivo'

const OPCOES: { value: Poder; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'legislativo', label: 'Legislativo' },
  { value: 'executivo', label: 'Executivo' },
]

/**
 * Filtro Executivo/Legislativo, idêntico em Dashboard, Proposições, Requerimentos e Moções.
 */
export default function FiltroPoder({
  value, onChange, className = '',
}: {
  value: Poder
  onChange: (v: Poder) => void
  className?: string
}) {
  return (
    <div className={`flex gap-1 bg-gray-100 rounded-md p-0.5 ${className}`}>
      {OPCOES.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          title="Filtra pelo Poder de origem da matéria (Executivo ou Legislativo)"
          className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
            value === o.value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
