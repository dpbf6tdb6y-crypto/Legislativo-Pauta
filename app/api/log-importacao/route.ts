import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const logs = await prisma.logImportacao.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(logs);
}
