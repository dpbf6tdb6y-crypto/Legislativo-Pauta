// Rota do painel Gestão - $$$: só entrega o HTML (que pode conter dados de folha) a quem está logado, ativo e com o menu liberado.
import { beforeEach, describe, expect, it, vi } from "vitest"

const sessao = vi.fn()
const achaUsuario = vi.fn()
const lerArquivo = vi.fn()

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessao(...a) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => achaUsuario(...a) } } }))
vi.mock("fs/promises", () => ({ readFile: (...a: unknown[]) => lerArquivo(...a), default: { readFile: (...a: unknown[]) => lerArquivo(...a) } }))

import { GET } from "./route"

const HTML = "<!DOCTYPE html><h1>painel</h1>"
const usuario = (extra: object = {}) => ({ perfil: "leitor", ativo: true, acessos: JSON.stringify({ gestao: { ver: true } }), podeUsarMicrofone: true, ...extra })

beforeEach(() => {
  sessao.mockReset(); achaUsuario.mockReset(); lerArquivo.mockReset()
  lerArquivo.mockResolvedValue(HTML)
})

describe("GET /api/fazenda/painel", () => {
  it("sem login: 401 e nada do arquivo é lido", async () => {
    sessao.mockResolvedValue(null)
    const r = await GET()
    expect(r.status).toBe(401)
    expect(lerArquivo).not.toHaveBeenCalled()
  })

  it("usuário desativado no cadastro perde o acesso mesmo com a sessão ainda válida", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ ativo: false }))
    const r = await GET()
    expect(r.status).toBe(403)
    expect(lerArquivo).not.toHaveBeenCalled()
  })

  it("usuário apagado do cadastro: 403", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
  })

  it("sem o menu Gestão liberado: 403 (a conferência vem do cadastro, não da sessão)", async () => {
    sessao.mockResolvedValue({ user: { id: "u1", perfil: "master" } }) // o que a sessão diz não vale
    achaUsuario.mockResolvedValue(usuario({ acessos: JSON.stringify({ gestao: { ver: false } }) }))
    const r = await GET()
    expect(r.status).toBe(403)
    expect(lerArquivo).not.toHaveBeenCalled()
  })

  it("com o menu liberado: 200, HTML, sem cache e lido de private/ (nunca de public/)", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario())
    const r = await GET()
    expect(r.status).toBe(200)
    expect(r.headers.get("Cache-Control")).toBe("private, no-store")
    expect(r.headers.get("Content-Type")).toMatch(/text\/html/)
    expect(await r.text()).toContain("<h1>painel</h1>")
    const caminho = String(lerArquivo.mock.calls[0][0]).replace(/\\/g, "/")
    expect(caminho).toMatch(/\/private\/fazenda\/painel\.html$/)
    expect(caminho).not.toMatch(/\/public\//)
  })

  it("quem não pode usar a pesquisa por voz recebe o painel com a pesquisa desligada", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ podeUsarMicrofone: false }))
    const corpo = await (await GET()).text()
    expect(corpo.startsWith("<script>window.__SEM_PESQUISA=1</script>")).toBe(true)
  })

  it("master e admin sempre usam a pesquisa", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ perfil: "admin", podeUsarMicrofone: false }))
    expect(await (await GET()).text()).toBe(HTML)
  })

  const COM_FOLHA = '<script>\nconst DATA = {"rc":[1],"rh":[["Servidor 0001","CARGO X","Efetivo","Ativo","SECRETARIA",1000,1500,1200]],"pessoal_hist":[{"mes":9}]};\nconst LOGO_SRC = "";</script>'

  it("sem a permissão de folha: a lista por servidor não sai do servidor, os totais continuam", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ gestaoPerfil: "financeiro" }))
    lerArquivo.mockResolvedValue(COM_FOLHA)
    const corpo = await (await GET()).text()
    expect(corpo).not.toContain("CARGO X")
    expect(corpo).toContain('"rh":[]')
    expect(corpo).toContain('"pessoal_hist":[{"mes":9}]')
  })

  it("master sem perfil no Compliance também não recebe a lista por servidor", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ perfil: "master" }))
    lerArquivo.mockResolvedValue(COM_FOLHA)
    expect(await (await GET()).text()).not.toContain("CARGO X")
  })

  it("com a permissão de folha: recebe o painel completo", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ gestaoPerfil: "controlador" }))
    lerArquivo.mockResolvedValue(COM_FOLHA)
    expect(await (await GET()).text()).toContain("CARGO X")
  })

  it("arquivo que não dá para limpar não é entregue", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ gestaoPerfil: "financeiro" }))
    lerArquivo.mockResolvedValue('const DATA = {"rh":[["CARGO X"]]')
    const r = await GET()
    expect(r.status).toBe(403)
    expect(await r.text()).not.toContain("CARGO X")
  })

  it("perfil Secretaria não abre o painel anterior", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ gestaoPerfil: "secretaria" }))
    expect((await GET()).status).toBe(403)
    expect(lerArquivo).not.toHaveBeenCalled()
  })

  it("painel ainda não gerado: 404 com mensagem, sem vazar caminho nem erro", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario())
    lerArquivo.mockRejectedValue(new Error("ENOENT: /app/private/fazenda/painel.html"))
    const r = await GET()
    expect(r.status).toBe(404)
    expect(await r.text()).not.toContain("ENOENT")
  })
})
