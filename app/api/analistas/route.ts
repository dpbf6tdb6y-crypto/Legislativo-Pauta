import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await prisma.analista.findMany({
    orderBy: { nome: "asc" },
    include: { comissao: true },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const data = await prisma.analista.create({ data: body });
  return NextResponse.json(data);
}
