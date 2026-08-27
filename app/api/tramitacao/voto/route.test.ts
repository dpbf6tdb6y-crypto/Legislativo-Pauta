import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { votoParecerVereador: { upsert: vi.fn() } },
}));

function mockSession(perfil: string | null, permissoes: Record<string, boolean> = {}) {
  if (perfil === null) {
    (getServerSession as any).mockResolvedValue(null);
  } else {
    (getServerSession as any).mockResolvedValue({ user: { id: "1", name: "Fulano", perfil, ...permissoes } });
  }
}

function postReq(body: any) {
  return new Request("http://localhost/api/tramitacao/voto", { method: "POST", body: JSON.stringify(body) }) as any;
}

describe("/api/tramitacao/voto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await POST(postReq({ proposicaoComissaoId: "1", vereadorId: "2", aprovado: true }));
    expect(res.status).toBe(401);
    expect(prisma.votoParecerVereador.upsert).not.toHaveBeenCalled();
  });

  it("retorna 403 para operador sem a permissão podeEditar", async () => {
    mockSession("operador");
    const res = await POST(postReq({ proposicaoComissaoId: "1", vereadorId: "2", aprovado: true }));
    expect(res.status).toBe(403);
    expect(prisma.votoParecerVereador.upsert).not.toHaveBeenCalled();
  });

  it("funciona para operador com a permissão podeEditar (não precisa ser admin)", async () => {
    mockSession("operador", { podeEditar: true });
    (prisma.votoParecerVereador.upsert as any).mockResolvedValue({});
    const res = await POST(postReq({ proposicaoComissaoId: "1", vereadorId: "2", aprovado: true }));
    expect(res.status).toBe(200);
    expect(prisma.votoParecerVereador.upsert).toHaveBeenCalled();
  });
});
