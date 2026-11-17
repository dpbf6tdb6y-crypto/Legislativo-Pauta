// Rota da situação da coleta (Gestão $$$): mesmas regras de acesso do painel.
import { beforeEach, describe, expect, it, vi } from "vitest"

const sessao = vi.fn()
const achaUsuario = vi.fn()
const situacao = vi.fn()

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessao(...a) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => achaUsuario(...a) } } }))
vi.mock("@/lib/financas/situacao", () => ({ situacaoColeta: (...a: unknown[]) => situacao(...a) }))

import { GET } from "./route"

const usuario = (extra: object = {}) => ({ perfil: "leitor", ativo: true, acessos: JSON.stringify({ gestao: { ver: true } }), ...extra })

beforeEach(() => {
  sessao.mockReset(); achaUsuario.mockReset(); situacao.mockReset()
  situacao.mockResolvedValue({ ano: 2026, coletas: [], fontes: [], totais: {}, conferencia: null, interrompidas: 0 })
})

describe("GET /api/fazenda/coleta", () => {
  it("sem login: 401 e o banco financeiro não é lido", async () => {
    sessao.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect(situacao).not.toHaveBeenCalled()
  })

  it("usuário desativado ou apagado: 403", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ ativo: false }))
    expect((await GET()).status).toBe(403)
    achaUsuario.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
    expect(situacao).not.toHaveBeenCalled()
  })

  it("sem o menu Gestão liberado no cadastro: 403, mesmo que a sessão diga master", async () => {
    sessao.mockResolvedValue({ user: { id: "u1", perfil: "master" } })
    achaUsuario.mockResolvedValue(usuario({ acessos: JSON.stringify({ gestao: { ver: false } }) }))
    expect((await GET()).status).toBe(403)
    expect(situacao).not.toHaveBeenCalled()
  })

  it("com o menu liberado: 200, sem cache", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario())
    const r = await GET()
    expect(r.status).toBe(200)
    expect(r.headers.get("Cache-Control")).toBe("private, no-store")
    expect((await r.json()).ano).toBe(2026)
  })

  it("erro ao ler o banco: 500 com a mensagem, sem derrubar a tela", async () => {
    sessao.mockResolvedValue({ user: { id: "u1" } })
    achaUsuario.mockResolvedValue(usuario({ perfil: "admin" }))
    situacao.mockRejectedValue(new Error("banco fora"))
    const r = await GET()
    expect(r.status).toBe(500)
    expect((await r.json()).error).toMatch(/banco fora/)
  })
})
