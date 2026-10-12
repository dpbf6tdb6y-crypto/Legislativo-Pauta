import { MENUS } from "./acessos"

// aceita só as chaves de menu conhecidas e normaliza para { ver, cad } (cadastrar implica visualizar)
export function normalizaAcessos(bruto: unknown): Record<string, { ver: boolean; cad: boolean }> | null {
  if (!bruto || typeof bruto !== "object") return null
  const o = bruto as Record<string, any>
  const saida: Record<string, { ver: boolean; cad: boolean }> = {}
  for (const m of MENUS) {
    const a = o[m.chave]
    if (!a || typeof a !== "object") continue
    const cad = !!a.cad
    saida[m.chave] = { ver: cad || !!a.ver, cad }
  }
  return Object.keys(saida).length ? saida : null
}
