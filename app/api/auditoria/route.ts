import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "master"].includes((session.user as any).perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const pagina = Math.max(1, parseInt(searchParams.get("pagina") ?? "1"));
  const porPagina = Math.min(50, parseInt(searchParams.get("por_pagina") ?? "20"));
  const acao = searchParams.get("acao") ?? "";
  const usuario = searchParams.get("usuario") ?? "";
  const referencia = searchParams.get("referencia") ?? "";

  const where: any = {};
  if (acao) where.acao = acao;
  if (usuario) where.usuarioNome = { contains: usuario, mode: "insensitive" };
  if (referencia) where.referencia = { contains: referencia, mode: "insensitive" };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total });
}
