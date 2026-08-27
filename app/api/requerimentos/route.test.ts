import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    requerimento: { findMany: vi.fn(), create: vi.fn() },
  },
}));

function mockSession(perfil: string | null, permissoes: Record<string, boolean> = {}) {
  if (perfil === null) {
    (getServerSession as any).mockResolvedValue(null);
  } else {
    (getServerSession as any).mockResolvedValue({ user: { id: "1", name: "Fulano", perfil, ...permissoes } });
  }
}

function getReq() {
  return new Request("http://localhost/api/requerimentos") as any;
}

function postReq(body: any) {
  return new Request("http://localhost/api/requerimentos", { method: "POST", body: JSON.stringify(body) }) as any;
}

describe("/api/requerimentos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(prisma.requerimento.findMany).not.toHaveBeenCalled();
  });

  it("GET retorna 200 com sessão de operador", async () => {
    mockSession("operador");
    (prisma.requerimento.findMany as any).mockResolvedValue([]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });

  it("POST retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await POST(postReq({ numero: "1", ano: "2026", tipo: "REQ", descricao: "teste" }));
    expect(res.status).toBe(401);
    expect(prisma.requerimento.create).not.toHaveBeenCalled();
  });

  it("POST retorna 403 para operador sem a permissão podeCriar", async () => {
    mockSession("operador");
    const res = await POST(postReq({ numero: "1", ano: "2026", tipo: "REQ", descricao: "teste" }));
    expect(res.status).toBe(403);
    expect(prisma.requerimento.create).not.toHaveBeenCalled();
  });

  it("POST cria normalmente para operador com a permissão podeCriar (não precisa ser admin)", async () => {
    mockSession("operador", { podeCriar: true });
    (prisma.requerimento.create as any).mockResolvedValue({ id: "1" });
    const res = await POST(postReq({ numero: "1", ano: "2026", tipo: "REQ", descricao: "teste" }));
    expect(res.status).toBe(201);
    expect(prisma.requerimento.create).toHaveBeenCalled();
  });
});
