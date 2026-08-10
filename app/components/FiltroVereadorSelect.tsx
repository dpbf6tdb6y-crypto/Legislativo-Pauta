'use client'

type Vereador = { id: string; nome: string; apelido?: string | null; ativo?: boolean }

/**
 * Select com os nomes reais dos vereadores (em vez de busca livre por texto), idêntico
 * em Proposições, Requerimentos e Moções.
 */
export default function FiltroVereadorSelect({
  vereadores, value, onChange, className = '',
}: {
  vereadores: Vereador[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  const ordenados = [...vereadores].sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome))
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white ${className}`}>
      <option value="">Todos os vereadores</option>
      {ordenados.map(v => (
        <option key={v.id} value={v.id}>{v.apelido || v.nome}{v.ativo === false ? ' (inativo)' : ''}</option>
      ))}
    </select>
  )
}
