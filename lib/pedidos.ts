// SRM — pedidos dos vereadores ao Poder Executivo (módulo Ind.)

export const STATUS_PEDIDO = ["Em andamento", "Concluído", "Não atendido", "Cancelado"] as const
export type StatusPedido = (typeof STATUS_PEDIDO)[number]

// status que encerram o pedido: a data de fechamento é gravada quando o pedido entra num deles
export const STATUS_FECHADOS: string[] = ["Concluído", "Não atendido", "Cancelado"]

// em andamento → amarelo · concluído → verde · não atendido → vermelho · cancelado → cinza
export const STATUS_COR: Record<string, string> = {
  "Em andamento": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Concluído": "bg-green-100 text-green-800 border-green-300",
  "Não atendido": "bg-red-100 text-red-800 border-red-300",
  "Cancelado": "bg-gray-100 text-gray-600 border-gray-300",
}

export const STATUS_BORDA: Record<string, string> = {
  "Em andamento": "border-l-yellow-400",
  "Concluído": "border-l-green-500",
  "Não atendido": "border-l-red-500",
  "Cancelado": "border-l-gray-400",
}

// referência interna: número de 1 a 5
export function referenciaValida(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

export type Andamento = {
  id: string
  pedidoId: string
  data: string
  descricao: string
  status: string | null
  createdAt: string
}

export type Pedido = {
  id: string
  vereadorId: string | null
  tipo: string
  descricao: string
  endereco: string | null
  dataPedido: string
  prazo: string | null
  status: string
  referencia: number | null
  dataFechamento: string | null
  createdAt: string
  updatedAt: string
  ultimaAtualizacao: string
  vereador: { id: string; nome: string; apelido: string | null } | null
  andamentos: Andamento[]
}

export function fmtData(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

// "2026-10-12" para input type=date
export function paraInputData(iso: string | null | undefined) {
  if (!iso) return ""
  return new Date(iso).toISOString().slice(0, 10)
}
