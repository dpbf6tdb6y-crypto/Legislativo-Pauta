// Acesso por menu: cada usuário pode ter, para cada item do menu lateral, "visualizar" e "cadastrar".
// Master e Administrador têm acesso total. Usuários antigos (sem configuração) mantêm o comportamento
// anterior, derivado das permissões globais — nada deixa de funcionar até o Master configurar.

export const MENUS = [
  { chave: "dashboard", label: "Dashboard", rota: "/dashboard" },
  { chave: "proposicoes", label: "Proposições", rota: "/dashboard/segov" },
  { chave: "requerimentos", label: "Requerimentos", rota: "/dashboard/requerimentos" },
  { chave: "mocoes", label: "Moções", rota: "/dashboard/mocoes" },
  { chave: "tags", label: "TAG", rota: "/dashboard/tags" },
  { chave: "sessoes", label: "Sessões & Pautas", rota: "/dashboard/sessoes" },
  { chave: "indicacoes", label: "Ind.", rota: "/dashboard/indicacoes" },
  { chave: "gestao", label: "Controles da Gestão", rota: "/dashboard/fazenda" },
] as const

export type ChaveMenu = (typeof MENUS)[number]["chave"]
export type Acesso = { ver: boolean; cad: boolean }
export type MapaAcessos = Partial<Record<ChaveMenu, Partial<Acesso>>>

type UsuarioAcessos = {
  perfil?: string
  acessos?: string | null
  podeVerIndicacoes?: boolean
  podeCriar?: boolean
  podeEditar?: boolean
  podeExcluir?: boolean
}

export function lerAcessos(bruto: string | null | undefined): MapaAcessos | null {
  if (!bruto) return null
  try {
    const o = JSON.parse(bruto)
    return o && typeof o === "object" ? (o as MapaAcessos) : null
  } catch {
    return null
  }
}

export function acessoDoMenu(usuario: UsuarioAcessos | null | undefined, chave: ChaveMenu): Acesso {
  if (!usuario) return { ver: false, cad: false }
  if (usuario.perfil === "master" || usuario.perfil === "admin") return { ver: true, cad: true }

  const mapa = lerAcessos(usuario.acessos)
  const cfg = mapa?.[chave]
  if (cfg) {
    const cad = !!cfg.cad
    return { ver: cad || !!cfg.ver, cad }
  }

  // sem configuração para este menu: regra anterior
  if (chave === "indicacoes") {
    const ver = !!usuario.podeVerIndicacoes
    return { ver, cad: ver && !!(usuario.podeCriar || usuario.podeEditar) }
  }
  const cad = usuario.perfil !== "leitor" && !!(usuario.podeCriar || usuario.podeEditar || usuario.podeExcluir)
  return { ver: true, cad }
}

// menu a que uma rota pertence (null = rota fora do menu principal, como Configurações)
export function menuDaRota(pathname: string): ChaveMenu | null {
  if (pathname === "/dashboard") return "dashboard"
  let melhor: ChaveMenu | null = null
  let tam = 0
  for (const m of MENUS) {
    if (m.rota === "/dashboard") continue
    if ((pathname === m.rota || pathname.startsWith(m.rota + "/")) && m.rota.length > tam) {
      melhor = m.chave
      tam = m.rota.length
    }
  }
  return melhor
}

export function rotaDeCadastro(pathname: string): boolean {
  return /\/(novo|importar)(\/|$)/.test(pathname)
}

export function rotaDeEdicao(pathname: string): boolean {
  return /\/editar(\/|$)/.test(pathname)
}
