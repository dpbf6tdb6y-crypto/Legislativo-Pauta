import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PUT, DELETE } from "./route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { vereador: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));

function mockSession(perfil: string | null) {
  if (perfil === null) {
    (getServerSession as any).mockResolvedValue(null);
  } else {
    (getServerSession as any).mockResolvedValue({ user: { id: "1", name: "Fulano", perfil } });
  }
}

const ctx = { params: { id: "abc" } };

function putReq(body: any) {
  return new Request("http://localhost/api/vereadores/abc", { method: "PUT", body: JSON.stringify(body) }) as any;
}

function delReq(hard = false) {
  return new Request(`http://localhost/api/vereadores/abc${hard ? "?hard=true" : ""}`, { method: "DELETE" }) as any;
}

describe("/api/vereadores/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUT retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await PUT(putReq({ nome: "Novo Nome" }), ctx);
    expect(res.status).toBe(401);
    expect(prisma.vereador.update).not.toHaveBeenCalled();
  });

  it("DELETE (inativação) retorna 401 sem sessão", async () => {
    mockSession(null);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(401);
    expect(prisma.vereador.update).not.toHaveBeenCalled();
  });

  it("DELETE (inativação) retorna 403 para quem não é admin", async () => {
    mockSession("operador");
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(403);
    expect(prisma.vereador.update).not.toHaveBeenCalled();
  });

  it("DELETE (inativação) funciona para admin", async () => {
    mockSession("admin");
    (prisma.vereador.findUnique as any).mockResolvedValue({ id: "abc", nome: "Fulano", ativo: true });
    (prisma.vereador.update as any).mockResolvedValue({ id: "abc", nome: "Fulano", ativo: false });
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(200);
    expect(prisma.vereador.update).toHaveBeenCalledWith({ where: { id: "abc" }, data: { ativo: false } });
  });

  it("DELETE ?hard=true exclui de vez quando não há vínculos", async () => {
    mockSession("admin");
    (prisma.vereador.findUnique as any).mockResolvedValue({ id: "abc", nome: "Fulano" });
    (prisma.vereador.delete as any).mockResolvedValue({ id: "abc" });
    const res = await DELETE(delReq(true), ctx);
    expect(res.status).toBe(200);
    expect(prisma.vereador.delete).toHaveBeenCalledWith({ where: { id: "abc" } });
  });

  it("DELETE ?hard=true retorna 409 quando há registros vinculados", async () => {
    mockSession("admin");
    (prisma.vereador.findUnique as any).mockResolvedValue({ id: "abc", nome: "Fulano" });
    (prisma.vereador.delete as any).mockRejectedValue(new Error("FK constraint"));
    const res = await DELETE(delReq(true), ctx);
    expect(res.status).toBe(409);
  });
});
