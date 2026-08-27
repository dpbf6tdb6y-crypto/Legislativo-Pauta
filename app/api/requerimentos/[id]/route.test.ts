import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, PATCH, DELETE } from "./route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    requerimento: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

function mockSession(perfil: string | null, permissoes: Record<string, boolean> = {}) {
  if (perfil === null) {
    (getServerSession as any).mockResolvedValue(null);
  } else {
    (getServerSession as any).mockResolvedValue({ user: { id: "1", name: "Fulano", perfil, ...permissoes } });
  }
}

const ctx = { params: { id: "abc" } };

function patchReq(body: any) {
  return new Request("http://localhost/api/requerimentos/abc", { method: "PATCH", body: JSON.stringify(body) }) as any;
}

describe("/api/requerimentos/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(401);
  });

  it("PATCH retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await PATCH(patchReq({ descricao: "novo" }), ctx);
    expect(res.status).toBe(401);
    expect(prisma.requerimento.update).not.toHaveBeenCalled();
  });

  it("PATCH retorna 403 para operador sem a permissão podeEditar", async () => {
    mockSession("operador");
    const res = await PATCH(patchReq({ descricao: "novo" }), ctx);
    expect(res.status).toBe(403);
    expect(prisma.requerimento.update).not.toHaveBeenCalled();
  });

  it("PATCH funciona para operador com a permissão podeEditar (não precisa ser admin)", async () => {
    mockSession("operador", { podeEditar: true });
    (prisma.requerimento.update as any).mockResolvedValue({ id: "abc" });
    const res = await PATCH(patchReq({ descricao: "novo" }), ctx);
    expect(res.status).toBe(200);
  });

  it("DELETE retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(401);
    expect(prisma.requerimento.delete).not.toHaveBeenCalled();
  });

  it("DELETE retorna 403 para quem não é admin", async () => {
    mockSession("operador");
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(403);
    expect(prisma.requerimento.delete).not.toHaveBeenCalled();
  });

  it("DELETE funciona para admin", async () => {
    mockSession("admin");
    (prisma.requerimento.delete as any).mockResolvedValue({ id: "abc" });
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(200);
    expect(prisma.requerimento.delete).toHaveBeenCalledWith({ where: { id: "abc" } });
  });
});
