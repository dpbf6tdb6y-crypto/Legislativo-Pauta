import { describe, it, expect } from "vitest"
import { acessoDoMenu, menuDaRota, rotaDeCadastro } from "./acessos"
import { temPermissao } from "./permissoes"

describe("acesso por menu", () => {
  it("master e admin têm acesso total", () => {
    expect(acessoDoMenu({ perfil: "master" }, "gestao")).toEqual({ ver: true, cad: true })
    expect(acessoDoMenu({ perfil: "admin" }, "tags")).toEqual({ ver: true, cad: true })
  })

  it("usa a configuração por menu quando existe", () => {
    const u = { perfil: "operador", acessos: JSON.stringify({ tags: { ver: true, cad: false }, mocoes: { ver: false, cad: true } }) }
    expect(acessoDoMenu(u, "tags")).toEqual({ ver: true, cad: false })
    // cadastrar implica visualizar
    expect(acessoDoMenu(u, "mocoes")).toEqual({ ver: true, cad: true })
  })

  it("sem configuração mantém a regra antiga", () => {
    expect(acessoDoMenu({ perfil: "operador", podeCriar: true }, "requerimentos")).toEqual({ ver: true, cad: true })
    expect(acessoDoMenu({ perfil: "leitor", podeCriar: true }, "requerimentos").cad).toBe(false)
    expect(acessoDoMenu({ perfil: "operador", podeVerIndicacoes: false }, "indicacoes").ver).toBe(false)
  })

  it("quem só visualiza não cria nem edita naquele menu (servidor)", () => {
    const u = { perfil: "operador", podeCriar: true, podeEditar: true, acessos: JSON.stringify({ tags: { ver: true, cad: false } }) }
    expect(temPermissao(u, "podeCriar", "tags")).toBe(false)
    expect(temPermissao(u, "podeEditar", "tags")).toBe(false)
    expect(temPermissao(u, "podeExportar", "tags")).toBe(false) // flag global ausente
    expect(temPermissao(u, "podeCriar", "requerimentos")).toBe(true) // outro menu, regra antiga
  })

  it("identifica o menu e as rotas de cadastro", () => {
    expect(menuDaRota("/dashboard")).toBe("dashboard")
    expect(menuDaRota("/dashboard/segov/abc/editar")).toBe("proposicoes")
    expect(menuDaRota("/dashboard/indicacoes/pedidos")).toBe("indicacoes")
    expect(menuDaRota("/dashboard/configuracoes")).toBeNull()
    expect(rotaDeCadastro("/dashboard/tags/novo")).toBe(true)
    expect(rotaDeCadastro("/dashboard/tags")).toBe(false)
  })
})
